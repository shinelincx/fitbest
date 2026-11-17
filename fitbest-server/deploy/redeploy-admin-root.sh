#!/bin/bash
# 管理后台根路径部署（base=/fit-best/）+ 后端 resolver 修复部署 + 全面验证
set -e
cd /opt/fitbest/server

echo "=== 1. 部署后端（目录级 SPA fallback 修复） ==="
rm -rf /tmp/fbdeploy
mkdir -p /tmp/fbdeploy
tar -xzf /root/fitbest-server-deploy.tar.gz -C /tmp/fbdeploy
cp -a /tmp/fbdeploy/fitbest-server/. .
rm -rf /tmp/fbdeploy
docker compose build 2>&1 | tail -1
docker compose up -d 2>&1 | tail -1

echo "=== 2. 管理后台部署到 /fit-best/ 根（清空旧内容与 saas 子目录） ==="
rm -rf /opt/fitbest/web/fit-best
mkdir -p /opt/fitbest/web/fit-best
tar -xzf /root/fitbest-admin.tar.gz -C /opt/fitbest/web/fit-best
echo "admin 文件数: $(find /opt/fitbest/web/fit-best -type f | wc -l)"

echo "=== 3. 等待健康 ==="
for i in $(seq 1 40); do
  s=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:9090/actuator/health)
  [ "$s" = "200" ] && break
  sleep 2
done
echo "health: $s"

echo "=== 4. 外网验证 ==="
BASE=https://cloud.thinkfiter.com
echo "/fit-best/ -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 $BASE/fit-best/)"
INDEX=$(curl -s --max-time 10 $BASE/fit-best/)
echo "index title: $(echo "$INDEX" | grep -o '<title>[^<]*</title>' | head -1)"
echo "index 引用资源: $(echo "$INDEX" | grep -o 'src="[^"]*\.js"' | head -1)"
ASSET=$(echo "$INDEX" | grep -o 'src="[^"]*\.js"' | head -1 | sed 's/src="//;s/"//')
echo "资源可达: $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE$ASSET") $ASSET"
echo "/fit-best/login(SPA路由) -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 $BASE/fit-best/login)"
echo "嵌套目录回归 /btwe/HD/ -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 $BASE/btwe/HD/)"
echo "=== 完成 ==="
