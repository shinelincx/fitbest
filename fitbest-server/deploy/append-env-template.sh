#!/bin/bash
# 向生产 .env 追加待配置项（仅追加不存在的键，不覆盖既有值）
set -e
cd /opt/fitbest/server

append_if_missing() {
  local key=$1
  grep -q "^${key}=" .env || echo "$2" >> .env
}

cat >> .env <<'EOF'

# ===== 阿里云短信（配置后真实下发；留空时后端走 dev 模式并返回可读错误） =====
EOF
append_if_missing ALIYUN_ACCESS_KEY_ID     "ALIYUN_ACCESS_KEY_ID="
append_if_missing ALIYUN_ACCESS_KEY_SECRET "ALIYUN_ACCESS_KEY_SECRET="
append_if_missing ALIYUN_SMS_SIGN_NAME     "ALIYUN_SMS_SIGN_NAME=FITBEST"
append_if_missing ALIYUN_SMS_TEMPLATE_LOGIN "ALIYUN_SMS_TEMPLATE_LOGIN="
append_if_missing ALIYUN_SMS_TEMPLATE_BIND  "ALIYUN_SMS_TEMPLATE_BIND="

cat >> .env <<'EOF'

# ===== 阿里云邮件推送 DirectMail =====
EOF
append_if_missing ALIYUN_DM_ACCOUNT "ALIYUN_DM_ACCOUNT="
append_if_missing ALIYUN_DM_ALIAS    "ALIYUN_DM_ALIAS=FITBEST"
append_if_missing ALIYUN_DM_REGION   "ALIYUN_DM_REGION=cn-hangzhou"

cat >> .env <<'EOF'

# ===== 微信开放平台（Web/APP 登录，可选） =====
EOF
append_if_missing WECHAT_APP_ID       "WECHAT_APP_ID="
append_if_missing WECHAT_APP_SECRET   "WECHAT_APP_SECRET="
append_if_missing WECHAT_WEB_APP_ID   "WECHAT_WEB_APP_ID="
append_if_missing WECHAT_WEB_APP_SECRET "WECHAT_WEB_APP_SECRET="

cat >> .env <<'EOF'

# ===== AI 教练（OpenAI 兼容接口，留空走本地规则引擎） =====
EOF
append_if_missing LLM_API_BASE   "LLM_API_BASE=https://api.openai.com/v1"
append_if_missing LLM_API_KEY    "LLM_API_KEY="
append_if_missing LLM_MODEL      "LLM_MODEL=gpt-4o-mini"
append_if_missing LLM_TIMEOUT_MS "LLM_TIMEOUT_MS=20000"

chmod 600 .env
echo "=== .env 当前结构（值已脱敏） ==="
sed -E 's/^(.*(SECRET|KEY|PASSWORD)=.).+$/\1<已配置>/' .env
