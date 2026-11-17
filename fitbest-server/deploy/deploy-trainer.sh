#!/bin/bash
# 部署 trainer 手机版 + HD 版产物到 /opt/fitbest/web/
set -e

deploy() {
  local tarball=$1
  local target=$2
  rm -rf "$target"
  mkdir -p "$target"
  tar -xzf "$tarball" -C "$target"
  echo "$target: $(find $target -type f | wc -l) 文件"
}

deploy /root/fitbest-mobile.tar.gz /opt/fitbest/web/fitbest
deploy /root/fitbest-hd.tar.gz /opt/fitbest/web/fitbest-hd

echo "=== 外网验证 ==="
for p in fitbest fitbest-hd; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://cloud.thinkfiter.com/$p/")
  echo "https://cloud.thinkfiter.com/$p/ -> $code"
done
echo "=== 深层路由（SPA 回退） ==="
for p in fitbest/records fitbest-hd/machines; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://cloud.thinkfiter.com/$p")
  echo "/$p -> $code"
done
echo "=== index.html 引用检查（API 客户端已打包） ==="
curl -s --max-time 10 "https://cloud.thinkfiter.com/fitbest/" | grep -o 'assets/index-[^"]*\.js' | head -1
