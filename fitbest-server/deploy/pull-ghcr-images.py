#!/usr/bin/env python3
"""Let Docker reuse local layers while fetching missing GHCR blobs in parallel ranges."""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, wait
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from socketserver import ThreadingMixIn
from urllib.parse import urlencode


GHCR = "https://ghcr.io"
CHUNK_SIZE = 2 * 1024 * 1024
DIGEST = re.compile(r"sha256:[a-f0-9]{64}")
MANIFEST_TYPES = ", ".join((
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.docker.distribution.manifest.v2+json",
))


def sha256(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


def curl(url, options=(), headers=()):
    args = ["curl", "--fail", "--silent", "--show-error", "--location",
            "--connect-timeout", "10", "--max-time", "120",
            "--retry", "2", "--retry-max-time", "180", "--proto", "=http,https",
            "--proto-redir", "=https"]
    for header in headers:
        args.extend(("--header", header))
    result = subprocess.run(args + list(options) + [url], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError("Registry download failed (curl exit {})".format(result.returncode))
    return result.stdout


def download_blob(url, digest, size, target, workers, headers):
    start = time.monotonic()
    print("Fetching {} ({} bytes)".format(digest[:19], size), flush=True)
    partial = target.with_suffix(".partial")

    def fetch_range(offset):
        length = min(CHUNK_SIZE, size - offset)
        part = target.with_suffix(".part-{}".format(offset))
        if part.is_file():
            return part
        incoming = part.with_name(part.name + ".download")
        try:
            code = curl(url, ("--range", "{}-{}".format(offset, offset + length - 1),
                              "--output", str(incoming), "--write-out", "%{http_code}"), headers)
            if code != b"206" or incoming.stat().st_size != length:
                raise RuntimeError("Invalid HTTP range response for " + digest)
            os.replace(str(incoming), str(part))
        finally:
            if incoming.exists():
                incoming.unlink()
        return part

    parts = []
    if size > CHUNK_SIZE:
        downloads = [workers.submit(fetch_range, offset) for offset in range(0, size, CHUNK_SIZE)]
        wait(downloads)
        parts = [result.result() for result in downloads]
        with partial.open("wb") as output:
            for part in parts:
                with part.open("rb") as source:
                    shutil.copyfileobj(source, output)
    else:
        curl(url, ("--output", str(partial)), headers)

    checksum = hashlib.sha256()
    with partial.open("rb") as source:
        for block in iter(lambda: source.read(CHUNK_SIZE), b""):
            checksum.update(block)
    for part in parts:
        part.unlink()
    if checksum.hexdigest() != digest[7:] or partial.stat().st_size != size:
        raise RuntimeError("Blob digest or length mismatch for " + digest)
    os.replace(str(partial), str(target))
    print("Fetched {} ({} bytes) in {:.1f}s".format(digest[:19], size, time.monotonic() - start), flush=True)


class Image:
    def __init__(self, repository, digest, platform):
        self.url = GHCR + "/v2/" + repository
        params = urlencode({"service": "ghcr.io", "scope": "repository:" + repository + ":pull"})
        token = json.loads(curl(GHCR + "/token?" + params))["token"]
        self.headers = ("Authorization: Bearer " + token,)
        body = self.fetch_manifest(digest)
        manifest = json.loads(body)
        if "manifests" in manifest:
            matches = [entry["digest"] for entry in manifest["manifests"]
                       if entry.get("platform", {}).get("os") == platform[0]
                       and entry["platform"].get("architecture") == platform[1]]
            if len(matches) != 1:
                raise RuntimeError("Expected one {} manifest for {}".format("/".join(platform), repository))
            digest = matches[0]
            body = self.fetch_manifest(digest)
            manifest = json.loads(body)
        self.digest = digest
        self.manifest = body
        self.manifest_type = manifest["mediaType"]
        self.sizes = {item["digest"]: item["size"] for item in [manifest["config"], *manifest["layers"]]}

    def fetch_manifest(self, digest):
        if not DIGEST.fullmatch(digest):
            raise RuntimeError("Invalid manifest digest")
        body = curl(self.url + "/manifests/" + digest, headers=self.headers + ("Accept: " + MANIFEST_TYPES,))
        if sha256(body) != digest:
            raise RuntimeError("Manifest digest mismatch for " + digest)
        return body


class Registry(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class RegistryHandler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        self.respond(False)

    def do_GET(self):
        self.respond(True)

    def log_message(self, *_args):
        pass

    def respond(self, send_body):
        if self.path == "/v2/":
            return self.send_data(b"{}", "application/json", None, send_body)
        match = re.fullmatch(r"/v2/(server|web)/(manifests|blobs)/(sha256:[a-f0-9]{64})", self.path)
        if not match:
            return self.send_error(404)
        name, resource, digest = match.groups()
        image = self.server.images[name]
        if resource == "manifests" and digest == image.digest:
            return self.send_data(image.manifest, image.manifest_type, digest, send_body)
        if resource != "blobs" or digest not in image.sizes:
            return self.send_error(404)
        size = image.sizes[digest]
        self.send_headers("application/octet-stream", digest, size)
        if not send_body:
            return
        target = self.server.cache / digest[7:]
        try:
            with self.server.locks[digest]:
                if not target.is_file():
                    download_blob(image.url + "/blobs/" + digest, digest, size, target,
                                  self.server.workers, image.headers)
        except (RuntimeError, OSError) as error:
            print("Blob {} unavailable: {}".format(digest, error), file=sys.stderr, flush=True)
            return  # Docker receives a truncated response and can retry the blob.
        with target.open("rb") as source:
            shutil.copyfileobj(source, self.wfile)

    def send_data(self, data, media_type, digest, send_body):
        self.send_headers(media_type, digest, len(data))
        if send_body:
            self.wfile.write(data)

    def send_headers(self, media_type, digest, size):
        self.send_response(200)
        self.send_header("Docker-Distribution-Api-Version", "registry/2.0")
        self.send_header("Content-Type", media_type)
        self.send_header("Content-Length", str(size))
        if digest:
            self.send_header("Docker-Content-Digest", digest)
        self.end_headers()


def pull(namespace, tag, server_digest, web_digest):
    if not re.fullmatch(r"ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+", namespace):
        raise RuntimeError("Invalid GHCR namespace")
    if not re.fullmatch(r"sha-[a-f0-9]{40}", tag):
        raise RuntimeError("Invalid release tag")
    platform = subprocess.check_output(
        ["docker", "version", "--format", "{{.Server.Os}}/{{.Server.Arch}}"], universal_newlines=True,
    ).strip().split("/")
    repositories = {name: namespace[8:] + "-" + name for name in ("server", "web")}
    images = {name: Image(repositories[name], digest, platform)
              for name, digest in (("server", server_digest), ("web", web_digest))}

    with tempfile.TemporaryDirectory(prefix="fitbest-image-") as cache, ThreadPoolExecutor(max_workers=8) as workers:
        with Registry(("127.0.0.1", 0), RegistryHandler) as registry:
            registry.images = images
            registry.cache = Path(cache)
            registry.workers = workers
            registry.locks = {digest: threading.Lock() for image in images.values() for digest in image.sizes}
            thread = threading.Thread(target=registry.serve_forever, daemon=True)
            thread.start()
            references = {name: "127.0.0.1:{}/{}@{}".format(registry.server_port, name, image.digest)
                          for name, image in images.items()}

            def import_image(name):
                reference = references[name]
                # Leave time for Compose health checks within the 20-minute deploy job.
                subprocess.run(["docker", "pull", reference], check=True, timeout=840)
                revision = subprocess.check_output(
                    ["docker", "image", "inspect", "--format",
                     '{{index .Config.Labels "org.opencontainers.image.revision"}}', reference],
                    universal_newlines=True,
                ).strip()
                if revision != tag[4:]:
                    raise RuntimeError("Image revision mismatch for " + name)

            try:
                with ThreadPoolExecutor(max_workers=2) as imports:
                    list(imports.map(import_image, images))
                for name, reference in references.items():
                    subprocess.run(["docker", "tag", reference, namespace + "-" + name + ":" + tag], check=True)
            finally:
                registry.shutdown()
                thread.join()
                for reference in references.values():
                    subprocess.run(["docker", "image", "rm", reference],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == "__main__":
    pull(*sys.argv[1:])
