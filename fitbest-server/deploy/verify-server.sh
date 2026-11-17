#!/bin/bash
# FITBEST 部署验证：静态站 + API 外网/本地检查
echo "=== 静态站文件统计 ==="
for site in fitbestwebsite btwe console hyrox fitbest fitbest-hd fit-best; do
  echo "$site: $(find /opt/fitbest/web/$site -type f 2>/dev/null | wc -l) 文件"
done

echo "=== 外网 HTTPS 验证（cloud.thinkfiter.com） ==="
for p in btwe hyrox fitbestwebsite console fit-best fitbest; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "https://cloud.thinkfiter.com/$p/")
  echo "/$p/ -> $code"
done

echo "=== API 验证 ==="
echo "health: $(curl -s --max-time 8 https://cloud.thinkfiter.com/actuator/health)"
echo "machings: $(curl -s --max-time 8 'https://cloud.thinkfiter.com/api/v1/machines' | head -c 120)"
echo "404契约: $(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://cloud.thinkfiter.com/api/v1/none)"

echo "=== SPA 深层路由（前端路由回退） ==="
for p in btwe/plans hyrox/train fit-best/login; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "https://cloud.thinkfiter.com/$p")
  echo "/$p -> $code"
done

echo "=== 容器状态 ==="
cd /opt/fitbest/server && docker compose ps --format '{{.Name}} | {{.Status}}'
