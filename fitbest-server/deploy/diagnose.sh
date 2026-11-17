#!/bin/bash
# 排查邮件与 LLM 失败原因
echo "=== 最近错误日志 ==="
docker logs --since 10m server-fitbest-server-1 2>&1 | grep -iE 'mail|smtp|llm|coach|exception|error' | grep -v 'actuator' | tail -25
echo ""
echo "=== 邮件配置结构（脱敏） ==="
grep -E '^MAIL_' /opt/fitbest/server/.env | sed -E 's/^(MAIL_SMTP_PASSWORD=.).+/\1***/;s/^(MAIL_SMTP_USERNAME=.{3}).+(@.+)/\1***\2/'
echo ""
echo "=== 容器到 SMTP 服务器的连通性 ==="
HOST=$(grep '^MAIL_SMTP_HOST=' /opt/fitbest/server/.env | cut -d= -f2)
PORT=$(grep '^MAIL_SMTP_PORT=' /opt/fitbest/server/.env | cut -d= -f2)
timeout 8 bash -c "echo > /dev/tcp/$HOST/$PORT" 2>/dev/null && echo "$HOST:$PORT 可达" || echo "$HOST:$PORT 不可达"
echo ""
echo "=== LLM 配置（脱敏） ==="
grep -E '^LLM_' /opt/fitbest/server/.env | sed -E 's/^(LLM_API_KEY=.{8}).+/\1.../'
echo ""
echo "=== 容器到 LLM API 的连通性 ==="
LLM_BASE=$(grep '^LLM_API_BASE=' /opt/fitbest/server/.env | cut -d= -f2)
curl -s -o /dev/null -w "LLM API: %{http_code}（DNS/网络可达性）\n" --max-time 8 "$LLM_BASE/models" 2>&1 | head -1
