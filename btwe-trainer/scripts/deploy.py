#!/usr/bin/env python3
"""Deploy dist/ to demo.thinkfit.cn/btwe over SSH via the local HTTP proxy tunnel.

默认部署到 /btwe/ 主入口（手机版）。
HD=1 时部署到 /btwe/HD/（平板 HD 横屏版，居中底部图标栏）。
"""
import os
import socket
import sys

import paramiko

HOST = "118.31.227.210"
USER = "root"
PASSWORD = (
    os.environ.get("BTWE_SSH_PASSWORD")
    or os.environ.get("HYROX_SSH_PASSWORD")
    or os.environ.get("FITBEST_SSH_PASSWORD", "")
)
REMOTE_BASE = "/var/www/demo.thinkfit.cn/btwe"
NGINX_CONF = "/opt/pcba-erp/docker/nginx/demo.conf"
PROXY = ("127.0.0.1", 18080)

HD = os.environ.get("HD", "") == "1"
BASE_PATH = "/btwe/HD" if HD else "/btwe"
REMOTE_ALIAS = f"/usr/share/nginx/demo/btwe{'/HD' if HD else ''}"
REMOTE_DIR = f"{REMOTE_BASE}{'/HD' if HD else ''}"
LABEL = "BTWE HD" if HD else "BTWE"
PUBLIC_URL = f"https://demo.thinkfit.cn{BASE_PATH}/"

NGINX_HELPER = (
    "p = {nginx_conf!r}\n"
    "s = open(p).read()\n"
    "changed = False\n"
    "marker = 'location ^~ {base}/'\n"
    "if marker not in s:\n"
    "    bare = 'location {base}/'\n"
    "    if bare in s:\n"
    "        s = s.replace(bare, marker)\n"
    "    else:\n"
    "        i = s.rstrip().rfind('}}')\n"
    "        block = chr(10) + '  location ^~ {base}/ {{' + chr(10) + '    alias {alias}/;' + chr(10) + '    index index.html;' + chr(10) + '    try_files $uri $uri/ {base}/index.html;' + chr(10) + '  }}' + chr(10)\n"
    "        s = s[:i] + block + s[i:]\n"
    "    changed = True\n"
    "alias = {alias!r}\n"
    "if alias + ';' in s and 'no-cache, must-revalidate' not in s.split(alias + ';')[0][-80:]:\n"
    "    s = s.replace(alias + ';', alias + ';' + chr(10) + '    add_header Cache-Control \"no-cache, must-revalidate\" always;', 1)\n"
    "    changed = True\n"
    "if changed:\n"
    "    open(p, 'w').write(s)\n"
    "    print('changed')\n"
    "else:\n"
    "    print('unchanged')\n"
).format(nginx_conf=NGINX_CONF, base=BASE_PATH, alias=REMOTE_ALIAS)


def create_proxy_socket(host, port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(30)
    sock.connect(PROXY)
    req = "CONNECT %s:%s HTTP/1.1\r\nHost: %s:%s\r\n\r\n" % (host, port, host, port)
    sock.sendall(req.encode())
    resp = b""
    while b"\r\n\r\n" not in resp:
        chunk = sock.recv(4096)
        if not chunk:
            raise RuntimeError("proxy CONNECT failed: %r" % resp)
        resp += chunk
    if b"200" not in resp.split(b"\r\n")[0]:
        raise RuntimeError("proxy CONNECT rejected: %r" % resp.split(b"\r\n")[0])
    return sock


def main():
    if not PASSWORD:
        sys.exit("BTWE_SSH_PASSWORD is not set")

    sock = create_proxy_socket(HOST, 22)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, sock=sock, timeout=30)

    sftp = client.open_sftp()
    remote_tar = "/tmp/btwe-dist.tar.gz"
    sftp.put("/tmp/btwe-dist.tar.gz", remote_tar)
    with sftp.open("/tmp/ensure_btwe_location.py", "w") as f:
        f.write(NGINX_HELPER)
    sftp.close()

    # 手机版部署时保留同目录下的 fit-best / hyrox / HD 子目录
    if HD:
        clean = "rm -rf %s/*; " % REMOTE_DIR
    else:
        clean = (
            "find %s -mindepth 1 -maxdepth 1 ! -name fit-best ! -name hyrox ! -name HD -exec rm -rf {} +; "
            % REMOTE_DIR
        )

    cmd = (
        "set -e; "
        "mkdir -p %s; "
        % REMOTE_DIR
        + clean
        + "tar -xzf %s -C %s; "
        "RES=$(python3 /tmp/ensure_btwe_location.py); echo \"nginx: $RES\"; "
        "if [ \"$RES\" = changed ]; then docker restart pcba-frontend >/dev/null; sleep 4; fi; "
        "docker exec pcba-frontend nginx -t >/dev/null 2>&1; "
        'grep "<title>" %s/index.html; '
        'curl -sk -o /dev/null -w "Public HTTP %%{http_code}\\n" %s; '
        'curl -sk -o /dev/null -w "JS HTTP %%{http_code}\\n" https://demo.thinkfit.cn%s/$(ls %s/assets | grep "^index-" | grep ".js$")'
        % (remote_tar, REMOTE_DIR, REMOTE_DIR, PUBLIC_URL, BASE_PATH, REMOTE_DIR)
    )
    stdin, stdout, stderr = client.exec_command(cmd)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        print(err)
    client.close()
    print(f"=== {LABEL} deployment complete ===")


if __name__ == "__main__":
    main()
