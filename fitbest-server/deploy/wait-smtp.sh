#!/bin/bash
# 等待 SMTP 版本部署完成并验证
echo "=== 等待构建/重启完成 ==="
for i in $(seq 1 60); do
  n=$(ps aux | grep 'compose build' | grep -v grep | wc -l)
  [ "$n" -eq 0 ] && break
  sleep 10
done
echo "构建进程结束"

cd /opt/fitbest/server
docker compose up -d 2>&1 | tail -1

for i in $(seq 1 30); do
  s=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:9090/actuator/health)
  [ "$s" = "200" ] && break
  sleep 2
done
echo "health: $s"

echo "=== 邮箱验证码接口（未配置 SMTP → dev 模式可读提示） ==="
curl -s -X POST http://127.0.0.1:9090/api/v1/auth/email/send -H 'Content-Type: application/json' \
  -d '{"email":"probe@example.com","scene":"login"}'
echo ""
echo "=== 镜像信息 ==="
docker images | grep fitbest-server | head -1
echo "=== 完成验证 ==="
