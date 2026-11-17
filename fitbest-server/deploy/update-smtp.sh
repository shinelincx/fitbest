#!/bin/bash
# 更新 .env（阿里云邮件段 → 通用 SMTP 段）+ 重建部署新版本
set -e
cd /opt/fitbest/server

echo "=== 1. .env 邮件段替换 ==="
# 删除阿里云 DirectMail 相关行
sed -i '/^ALIYUN_DM_/d' .env
# 删除旧段落注释（阿里云邮件推送标题行）
sed -i '/^# ===== 阿里云邮件推送 DirectMail =====$/d' .env
# 追加 SMTP 段（仅当不存在）
if ! grep -q '^MAIL_SMTP_HOST=' .env; then
  cat >> .env <<'EOF'

# ===== 邮件（通用 SMTP：腾讯企业邮 smtp.exmail.qq.com / QQ smtp.qq.com / 网易 smtp.163.com 等） =====
MAIL_SMTP_HOST=
MAIL_SMTP_PORT=465
MAIL_SMTP_SSL=true
MAIL_SMTP_USERNAME=
MAIL_SMTP_PASSWORD=
MAIL_FROM=
MAIL_FROM_NAME=FITBEST
EOF
fi
grep -A8 'MAIL_SMTP_HOST' .env | head -9

echo "=== 2. 解压新版本源码 ==="
rm -rf /tmp/fbdeploy
mkdir -p /tmp/fbdeploy
tar -xzf /root/fitbest-server-deploy.tar.gz -C /tmp/fbdeploy
cp -a /tmp/fbdeploy/fitbest-server/. .
rm -rf /tmp/fbdeploy
ls Dockerfile pom.xml src/main/java/com/ifitbest/server/infra/integration/EmailGateway.java

echo "=== 3. 重建镜像并重启 ==="
docker compose build 2>&1 | tail -2
docker compose up -d 2>&1 | tail -2

echo "=== 4. 等待健康 ==="
for i in $(seq 1 30); do
  s=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:9090/actuator/health)
  [ "$s" = "200" ] && break
  sleep 2
done
echo "health: $s"

echo "=== 5. 邮箱验证码接口回归（未配置 SMTP 时应返回 dev 模式可读提示） ==="
curl -s -X POST http://127.0.0.1:9090/api/v1/auth/email/send -H 'Content-Type: application/json' \
  -d '{"email":"probe@example.com","scene":"login"}' | head -c 200
echo ""
echo "=== 更新完成 ==="
