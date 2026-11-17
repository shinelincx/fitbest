#!/bin/bash
echo "=== /fit-best/ 外网状态 ==="
curl -s -o /tmp/fitbest-admin-probe.html --max-time 10 -w "HTTP %{http_code}\n" "https://cloud.thinkfiter.com/fit-best/"
echo "title: $(grep -o '<title>[^<]*</title>' /tmp/fitbest-admin-probe.html | head -1)"
echo ""
echo "=== /opt/fitbest/web/fit-best 目录内容 ==="
ls /opt/fitbest/web/fit-best/ | head -15
echo "文件数: $(find /opt/fitbest/web/fit-best -type f | wc -l)"
echo "index title: $(grep -o '<title>[^<]*</title>' /opt/fitbest/web/fit-best/index.html | head -1)"
