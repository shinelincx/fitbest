import 'dotenv/config'

function env(key: string, fallback = ''): string {
  return process.env[key] ?? fallback
}

function num(key: string, fallback: number): number {
  const value = Number(process.env[key])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export const config = {
  env: env('NODE_ENV', 'development'),
  port: num('PORT', 3000),
  publicBaseUrl: env('PUBLIC_BASE_URL', 'http://localhost:3000'),
  databaseUrl: env('DATABASE_URL', 'postgresql://fitbest:fitbest@localhost:5432/fitbest?schema=public'),
  redisUrl: env('REDIS_URL', 'redis://localhost:6379'),
  jwt: {
    accessSecret: env('JWT_ACCESS_SECRET', 'dev-access-secret'),
    refreshSecret: env('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
    adminSecret: env('JWT_ADMIN_SECRET', 'dev-admin-secret'),
    accessTtl: env('JWT_ACCESS_TTL', '15m'),
    refreshTtl: env('JWT_REFRESH_TTL', '30d'),
  },
  auth: {
    codeTtl: num('AUTH_CODE_TTL', 300),
    cooldown: num('AUTH_CODE_COOLDOWN', 60),
    dailyLimit: num('AUTH_CODE_DAILY_LIMIT', 10),
    devReturnCode: env('AUTH_DEV_RETURN_CODE', 'false') === 'true',
    // 演示/测试号码白名单：仅这些手机号在 dev 短信模式下回传验证码
    devPhoneAllowlist: env('AUTH_DEV_PHONE_ALLOWLIST', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  qr: {
    secret: env('QR_SIGN_SECRET', 'dev-qr-secret'),
  },
  wechat: {
    appId: env('WECHAT_APP_ID'),
    appSecret: env('WECHAT_APP_SECRET'),
    webAppId: env('WECHAT_WEB_APP_ID'),
    webAppSecret: env('WECHAT_WEB_APP_SECRET'),
  },
  aliyun: {
    accessKeyId: env('ALIYUN_ACCESS_KEY_ID'),
    accessKeySecret: env('ALIYUN_ACCESS_KEY_SECRET'),
    smsSignName: env('ALIYUN_SMS_SIGN_NAME', 'FITBEST'),
    smsTemplateLogin: env('ALIYUN_SMS_TEMPLATE_LOGIN'),
    smsTemplateBind: env('ALIYUN_SMS_TEMPLATE_BIND'),
    dmAccount: env('ALIYUN_DM_ACCOUNT'),
    dmAlias: env('ALIYUN_DM_ALIAS', 'FITBEST'),
    dmRegion: env('ALIYUN_DM_REGION', 'cn-hangzhou'),
  },
  llm: {
    apiBase: env('LLM_API_BASE', 'https://api.openai.com/v1'),
    apiKey: env('LLM_API_KEY'),
    model: env('LLM_MODEL', 'gpt-4o-mini'),
    timeoutMs: num('LLM_TIMEOUT_MS', 20000),
  },
}

export const isProd = config.env === 'production'
