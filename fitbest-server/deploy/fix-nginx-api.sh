#!/bin/bash
# 修复 nginx：为 cloud.thinkfiter.com 增加 /fit-best/api/ 反代（此前遗漏，导致前端 API 全部落入静态站）
set -e
CONF=/etc/nginx/conf.d/irox-production-http.conf

# 在 cloud server 块内（proxy_pass 9090 的块）插入 /fit-best/api/ 前置规则
if ! grep -q '/fit-best/api/' "$CONF"; then
  # 定位 cloud server 块中 "server_name cloud.thinkfiter.com;" 之后的 location / 前插入
  sed -i '/server_name cloud.thinkfiter.com;/,/proxy_pass http:\/\/127.0.0.1:9090;/ {
    /location \/ {/i\
    location ^~ /fit-best/api/ {\
        proxy_pass http://127.0.0.1:9090/api/;\
        proxy_set_header Host $host;\
        proxy_set_header X-Real-IP $remote_addr;\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\
        proxy_set_header X-Forwarded-Proto https;\
    }\
' "$CONF"
fi

echo "=== 修改后 cloud 块 ==="
awk '/server_name cloud.thinkfiter.com;/,/^}/' "$CONF"

nginx -t && nginx -s reload && echo "=== nginx 已重载 ==="
