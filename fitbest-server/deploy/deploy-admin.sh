#!/bin/bash
# 部署管理后台：/fit-best/saas/（admin 构建产物）+ /fit-best/ 根跳转页
set -e

echo "=== 1. 部署 admin 到 /fit-best/saas/ ==="
rm -rf /opt/fitbest/web/fit-best/saas
mkdir -p /opt/fitbest/web/fit-best/saas
tar -xzf /root/fitbest-admin.tar.gz -C /opt/fitbest/web/fit-best/saas
echo "saas 文件数: $(find /opt/fitbest/web/fit-best/saas -type f | wc -l)"

echo "=== 2. /fit-best/ 根跳转页 ==="
cp /root/admin-redirect.html /opt/fitbest/web/fit-best/index.html

echo "=== 3. 外网验证 ==="
echo "/fit-best/ -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 'https://cloud.thinkfiter.com/fit-best/')（跳转页）"
echo "/fit-best/saas/ -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 'https://cloud.thinkfiter.com/fit-best/saas/')"
echo "saas title: $(curl -s --max-time 10 'https://cloud.thinkfiter.com/fit-best/saas/' | grep -o '<title>[^<]*</title>' | head -1)"
echo "saas 登录路由: $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 'https://cloud.thinkfiter.com/fit-best/saas/login')"
echo "=== 完成 ==="
