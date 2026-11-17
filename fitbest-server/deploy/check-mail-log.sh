#!/bin/bash
echo "=== 邮件失败详情（message_logs） ==="
docker compose -f /opt/fitbest/server/docker-compose.yml exec -T postgres psql -U fitbest -d fitbest -t -c \
  "SELECT channel, status, error FROM message_logs WHERE channel='email' ORDER BY created_at DESC LIMIT 3;"
