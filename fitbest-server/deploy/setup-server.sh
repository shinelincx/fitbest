#!/bin/bash
# FITBEST 统一服务 · 服务器初始化（目录 + 生产 .env）
# 可重复执行；.env 仅在不存在时生成（避免覆盖既有密钥）
set -e

APP_DIR=/opt/fitbest/server
WEB_DIR=/opt/fitbest/web
HOST_PORT=9090
PUBLIC_BASE_URL=https://cloud.thinkfiter.com

# 1. 目录结构
mkdir -p "$APP_DIR" "$WEB_DIR"
for site in fitbest fitbest-hd fit-best hyrox btwe fitbestwebsite console; do
  mkdir -p "$WEB_DIR/$site"
done

# 2. 解压部署包
if [ -f /root/fitbest-server-deploy.tar.gz ]; then
  rm -rf /tmp/fitbest-extract
  mkdir -p /tmp/fitbest-extract
  tar -xzf /root/fitbest-server-deploy.tar.gz -C /tmp/fitbest-extract --strip-components=1
  rsync -a /tmp/fitbest-extract/ "$APP_DIR"/
  rm -rf /tmp/fitbest-extract
  echo "[1/2] 部署包已解压到 $APP_DIR"
else
  echo "[1/2] 未找到部署包，仅初始化目录"
fi

cd "$APP_DIR"

# 3. 生产 .env
if [ ! -f .env ]; then
  cat > .env <<EOF
HOST_PORT=$HOST_PORT
NODE_ENV=production
PUBLIC_BASE_URL=$PUBLIC_BASE_URL
POSTGRES_PASSWORD=$(openssl rand -hex 16)
FITBEST_WEB_DIR=$WEB_DIR
CORS_ALLOWED_ORIGINS=$PUBLIC_BASE_URL
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
JWT_ADMIN_SECRET=$(openssl rand -hex 32)
QR_SIGN_SECRET=$(openssl rand -hex 32)
AUTH_DEV_RETURN_CODE=false
EOF
  chmod 600 .env
  echo "[2/2] 生产 .env 已生成（随机密钥）"
else
  echo "[2/2] .env 已存在，跳过"
fi

echo "=== $APP_DIR ==="
ls -la "$APP_DIR"
echo "=== $WEB_DIR ==="
ls "$WEB_DIR"
