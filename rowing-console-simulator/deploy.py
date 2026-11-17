#!/usr/bin/env python3
"""Deploy the console simulator to demo.thinkfit.cn/console/ via SSH over local HTTP proxy."""
import os
import socket
import sys

import paramiko

HOST = "118.31.227.210"
USER = "root"
PASSWORD = os.environ.get("FITBEST_SSH_PASSWORD") or os.environ.get("HYROX_SSH_PASSWORD", "")
REMOTE_DIR = "/var/www/demo.thinkfit.cn/btwe/console"
NGINX_CONF = "/opt/pcba-erp/docker/nginx/demo.conf"
PROXY = ("127.0.0.1", 18080)

NGINX_HELPER = """import re
p = %r
s = open(p).read()
changed = False

def drop(pattern):
    global s, changed
    s2 = re.sub(pattern, '\\n', s)
    if s2 != s:
        s = s2
        changed = True

# 旧的 /console/rowing/ 独立目录块（alias 指向 rowing 子目录）
drop(r'\\n\\s*location \\^~ /console/rowing/ \\{[^}]*btwe/console/rowing/;[^}]*\\}\\n')
# 旧的 /console/rowing 与 /rowingConsole 跳转块，统一重建
drop(r'\\n\\s*location = /console/rowing \\{[^}]*\\}\\n')
drop(r'\\n\\s*location \\^~ /console/rowing/ \\{[^}]*\\}\\n')
drop(r'\\n\\s*location = /rowingConsole \\{[^}]*\\}\\n')
drop(r'\\n\\s*location \\^~ /rowingConsole/ \\{[^}]*\\}\\n')

# /console/ 是仪表模拟器主入口（index.html 直接放在 console 根目录）
if 'alias /usr/share/nginx/demo/btwe/console/;' not in s:
    i = s.rstrip().rfind('}')
    block = '''
  location ^~ /console/ {
    alias /usr/share/nginx/demo/btwe/console/;
    add_header Cache-Control "no-cache, must-revalidate" always;
    index index.html;
    try_files $uri $uri/ /console/tft/index.html;
  }
'''
    s = s[:i] + block + s[i:]
    changed = True

# 旧地址统一 301 到新入口
i = s.rstrip().rfind('}')
block = '''
  location = /console/rowing {
    return 301 /console/;
  }

  location ^~ /console/rowing/ {
    return 301 /console/;
  }

  location = /rowingConsole {
    return 301 /console/;
  }

  location ^~ /rowingConsole/ {
    return 301 /console/;
  }
'''
s = s[:i] + block + s[i:]
changed = True

if changed:
    open(p, 'w').write(s)
    print('changed')
else:
    print('unchanged')
""" % NGINX_CONF


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
    sftp.put("/workspace/rowing-console-simulator/index.html", "/tmp/rowing-console-index.html")
    sftp.put("/workspace/rowing-console-simulator/logo.png", "/tmp/rowing-console-logo.png")
    sftp.put("/workspace/rowing-console-simulator/media/rowing-pov.mp4", "/tmp/rowing-console-pov.mp4")
    sftp.put("/workspace/rowing-console-simulator/media/rowing-pov.jpg", "/tmp/rowing-console-pov.jpg")
    with sftp.open("/tmp/ensure_console_location.py", "w") as f:
        f.write(NGINX_HELPER)
    sftp.close()

    cmd = (
        "set -e; "
        "mkdir -p %s %s/media; "
        "cp /tmp/rowing-console-index.html %s/index.html; "
        "cp /tmp/rowing-console-logo.png %s/logo.png; "
        "cp /tmp/rowing-console-pov.mp4 %s/media/rowing-pov.mp4; "
        "cp /tmp/rowing-console-pov.jpg %s/media/rowing-pov.jpg; "
        "RES=$(python3 /tmp/ensure_console_location.py); echo \"nginx: $RES\"; "
        "if [ \"$RES\" = changed ]; then docker restart pcba-frontend >/dev/null; sleep 4; fi; "
        "docker exec pcba-frontend nginx -t >/dev/null 2>&1 && echo 'nginx: config ok'; "
        'curl -sk -o /dev/null -w "Console HTTP %%{http_code}\\n" https://demo.thinkfit.cn/console/; '
        'curl -sk -o /dev/null -w "PM5 HTTP %%{http_code}\\n" https://demo.thinkfit.cn/console/pm5/; '
        'curl -sk -o /dev/null -w "Video HTTP %%{http_code} %%{size_download} bytes\\n" https://demo.thinkfit.cn/console/media/rowing-pov.mp4; '
        'curl -sk -o /dev/null -w "Old rowing HTTP %%{http_code} -> %%{redirect_url}\\n" https://demo.thinkfit.cn/console/rowing/'
        % (REMOTE_DIR, REMOTE_DIR, REMOTE_DIR, REMOTE_DIR, REMOTE_DIR, REMOTE_DIR)
    )
    stdin, stdout, stderr = client.exec_command(cmd)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        print(err)
    client.close()
    print("=== Console simulator deployment complete ===")


if __name__ == "__main__":
    main()
