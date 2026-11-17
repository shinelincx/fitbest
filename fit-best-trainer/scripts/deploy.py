#!/usr/bin/env python3
"""Deploy dist/ to demo.thinkfit.cn over SSH via the local HTTP proxy tunnel.

默认部署到 /fit-best/ 主入口（手机 + 响应式平板版）。
HD=1 时部署到 /fit-best/HD/（平板 HD 横屏版，始终侧栏）。
"""
import os
import socket
import sys

import paramiko

HOST = "118.31.227.210"
USER = "root"
PASSWORD = os.environ.get("FITBEST_SSH_PASSWORD") or os.environ.get("HYROX_SSH_PASSWORD", "")
NGINX_CONF = "/opt/pcba-erp/docker/nginx/demo.conf"
PROXY = ("127.0.0.1", 18080)

HD = os.environ.get("HD", "") == "1"
BASE_PATH = "/fit-best/HD" if HD else "/fit-best"
REMOTE_ALIAS = f"/usr/share/nginx/demo/btwe/fit-best{'/HD' if HD else ''}"
REMOTE_DIR = f"/var/www/demo.thinkfit.cn/btwe/fit-best{'/HD' if HD else ''}"
LABEL = "FITBEST HD" if HD else "FITBEST"
PUBLIC_URL = f"https://demo.thinkfit.cn{BASE_PATH}/"

# 远程执行的 nginx 配置修正脚本（用 .format 避免和 nginx 的 $uri 冲突）
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
        sys.exit("FITBEST_SSH_PASSWORD is not set")

    sock = create_proxy_socket(HOST, 22)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, sock=sock, timeout=30)

    sftp = client.open_sftp()
    sftp.put("/tmp/fit-best-dist.tar.gz", "/tmp/fit-best-dist.tar.gz")
    with sftp.open("/tmp/ensure_fitbest_location.py", "w") as f:
        f.write(NGINX_HELPER)
    sftp.close()

    # 手机版部署时保留 HD 子目录，避免把 HD 版清掉
    if HD:
        clean = "rm -rf %s/*; " % REMOTE_DIR
    else:
        clean = "find %s -mindepth 1 -maxdepth 1 ! -name HD -exec rm -rf {} +; " % REMOTE_DIR

    cmd = (
        "set -e; "
        "mkdir -p %s; "
        % REMOTE_DIR
        + clean
        + "tar -xzf /tmp/fit-best-dist.tar.gz -C %s; "
        "RES=$(python3 /tmp/ensure_fitbest_location.py); echo \"nginx: $RES\"; "
        "if [ \"$RES\" = changed ]; then docker restart pcba-frontend >/dev/null; sleep 4; fi; "
        "docker exec pcba-frontend nginx -t >/dev/null 2>&1; "
        'grep "<title>" %s/index.html; '
        'curl -sk -o /dev/null -w "Public HTTP %%{http_code}\\n" %s; '
        'curl -sk -o /dev/null -w "JS HTTP %%{http_code}\\n" https://demo.thinkfit.cn%s/$(ls %s/assets | grep "^index-" | grep ".js$")'
        % (REMOTE_DIR, REMOTE_DIR, PUBLIC_URL, BASE_PATH, REMOTE_DIR)
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
