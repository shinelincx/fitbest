import importlib.util
import json
import os
import subprocess
import sys
import tarfile
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from unittest.mock import patch


REMOTE = Path(__file__).with_name("github-actions-remote.sh")
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("relay", REMOTE.with_name("pull-ghcr-images.py"))
relay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(relay)


class DeploymentTest(unittest.TestCase):
    def test_first_deployment_requires_existing_configuration(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            (path / ".env").write_text("POSTGRES_PASSWORD=original\n")
            archive = path / "upload.tar"
            env = path / "new.env"
            env.write_text("POSTGRES_PASSWORD=different\n")
            with tarfile.open(archive, "w") as tar:
                tar.add(env, arcname=".env")
            result = subprocess.run(
                ["bash", str(REMOTE), str(path), str(archive), "server", "ghcr.io/example/test", "sha-test", "1", "1"],
                capture_output=True, text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("requires FITBEST_PRODUCTION_ENV to match", result.stderr)
            self.assertEqual((path / ".env").read_text(), "POSTGRES_PASSWORD=original\n")
            self.assertFalse((path / ".fitbest-current").exists())
            self.assertFalse(archive.exists())

    def test_success_and_failed_health_check(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            bin_dir = path / "bin"
            bin_dir.mkdir()
            for name, content in {
                "docker": "#!/bin/sh\necho \"$*\" >> \"$DOCKER_LOG\"\ncase \"$*\" in *' port fitbest-server 8080') echo 0.0.0.0:9090;; esac\n",
                "curl": "#!/bin/sh\nexit ${FAIL_CURL:-0}\n",
                "python3": "#!/bin/sh\necho \"pull $*\" >> \"$DOCKER_LOG\"\nexit ${FAIL_PULL:-0}\n",
            }.items():
                executable = bin_dir / name
                executable.write_text(content)
                executable.chmod(0o755)
            env = dict(os.environ, PATH=f"{bin_dir}:{os.environ['PATH']}", DOCKER_LOG=str(path / "docker.log"))
            config = path / ".env"
            config.write_text("POSTGRES_PASSWORD=original\n")
            for run, fail in (("1", False), ("2", True)):
                archive = path / f"upload-{run}.tar"
                with tarfile.open(archive, "w") as tar:
                    tar.add(config, arcname=".env")
                result = subprocess.run(
                    ["bash", str(REMOTE), str(path), str(archive), "server", "ghcr.io/example/test", "sha-test", run, "1"],
                    env=dict(env, FAIL_CURL="1" if fail else "0"), capture_output=True, text=True,
                )
                self.assertEqual(result.returncode == 0, not fail, result.stderr)
                self.assertEqual((path / ".fitbest-current").resolve(), path / ".fitbest-releases/1-1")
                self.assertFalse(archive.exists())
            docker_calls = (path / "docker.log").read_text()
            self.assertIn("image inspect ghcr.io/example/test-server:sha-test ghcr.io/example/test-web:sha-test", docker_calls)
            self.assertIn("up --no-build --pull never", docker_calls)
            archive = path / "upload-3.tar"
            with tarfile.open(archive, "w") as tar:
                tar.add(config, arcname=".env")
            result = subprocess.run(
                ["bash", str(REMOTE), str(path), str(archive), "server", "ghcr.io/example/test",
                 "sha-test", "3", "1", "sha256:server", "sha256:web"],
                env=dict(env, FAIL_PULL="1"), capture_output=True, text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            pull_calls = (path / "docker.log").read_text()[len(docker_calls):]
            self.assertIn("pull ", pull_calls)
            self.assertIn("sha256:server sha256:web", pull_calls)
            self.assertNotIn("up --no-build", pull_calls)
            self.assertEqual((path / ".fitbest-current").resolve(), path / ".fitbest-releases/1-1")

            config.write_text("POSTGRES_PASSWORD=changed\n")
            archive = path / "upload-4.tar"
            with tarfile.open(archive, "w") as tar:
                tar.add(config, arcname=".env")
            result = subprocess.run(
                ["bash", str(REMOTE), str(path), str(archive), "server", "ghcr.io/example/test", "sha-test", "4", "1"],
                env=env, capture_output=True, text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("separate database password migration", result.stderr)
            self.assertEqual((path / ".fitbest-current").resolve(), path / ".fitbest-releases/1-1")


class ImageRelayTest(unittest.TestCase):
    def test_manifest_index_selects_and_verifies_platform_manifest(self):
        manifest = json.dumps({
            "mediaType": "application/vnd.oci.image.manifest.v1+json",
            "config": {"digest": relay.sha256(b"config"), "size": 6},
            "layers": [],
        }).encode()
        digest = relay.sha256(manifest)
        index = json.dumps({"manifests": [
            {"digest": relay.sha256(b"attestation"), "platform": {"os": "unknown", "architecture": "unknown"}},
            {"digest": digest, "platform": {"os": "linux", "architecture": "amd64"}},
        ]}).encode()
        with patch.object(relay, "curl", side_effect=[b'{"token":"public"}', index, manifest]):
            image = relay.Image("example/test-server", relay.sha256(index), ["linux", "amd64"])
        self.assertEqual(image.digest, digest)
        with patch.object(relay, "curl", side_effect=[b'{"token":"public"}', index, b"tampered"]):
            with self.assertRaisesRegex(RuntimeError, "Manifest digest mismatch"):
                relay.Image("example/test-server", relay.sha256(index), ["linux", "amd64"])

    def test_ranges_are_combined_and_corrupt_blobs_are_rejected(self):
        body = bytes(range(256)) * 20_000
        requests = []

        class Source(BaseHTTPRequestHandler):
            def do_GET(self):
                requested = self.headers["Range"]
                requests.append(requested)
                first, last = map(int, requested.split("=")[1].split("-"))
                content = body[first:last + 1]
                self.send_response(206)
                self.send_header("Content-Range", "bytes {}-{}/{}".format(first, last, len(body)))
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)

            def log_message(self, *_args):
                pass

        with relay.Registry(("127.0.0.1", 0), Source) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                url = "http://127.0.0.1:{}/blob".format(server.server_port)
                with tempfile.TemporaryDirectory() as tmp, ThreadPoolExecutor(max_workers=3) as pool:
                    target = Path(tmp) / "blob"
                    relay.download_blob(url, relay.sha256(body), len(body), target, pool, ())
                    self.assertEqual(target.read_bytes(), body)
                    self.assertCountEqual(requests, ["bytes=0-2097151", "bytes=2097152-4194303", "bytes=4194304-5119999"])
                    corrupt = Path(tmp) / "bad"
                    with self.assertRaisesRegex(RuntimeError, "Blob digest or length mismatch"):
                        relay.download_blob(url, relay.sha256(b"bad"), len(body), corrupt, pool, ())
                    self.assertFalse(corrupt.exists())
            finally:
                server.shutdown()
                thread.join()


if __name__ == "__main__":
    unittest.main()
