#!/bin/bash
# 修复版部署：MAIL_FROM 纯地址 + LLM 超时 60s + qwen 禁思考
set -e
cd /opt/fitbest/server

echo "=== 1. 修正 .env ==="
sed -i 's|^MAIL_FROM=.*|MAIL_FROM=no-reply@ifitbest.com|' .env
sed -i 's|^LLM_TIMEOUT_MS=.*|LLM_TIMEOUT_MS=60000|' .env
grep -E '^(MAIL_FROM|LLM_TIMEOUT_MS)=' .env

echo "=== 2. 部署新代码 ==="
rm -rf /tmp/fbdeploy
mkdir -p /tmp/fbdeploy
tar -xzf /root/fitbest-server-deploy.tar.gz -C /tmp/fbdeploy
cp -a /tmp/fbdeploy/fitbest-server/. .
rm -rf /tmp/fbdeploy

echo "=== 3. 重建并重启 ==="
docker compose build 2>&1 | tail -1
docker compose up -d 2>&1 | tail -1

echo "=== 4. 等待健康 ==="
for i in $(seq 1 30); do
  s=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:9090/actuator/health)
  [ "$s" = "200" ] && break
  sleep 2
done
echo "health: $s"
