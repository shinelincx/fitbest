const labels: Record<string, string> = { phone: '手机', email: '邮箱', wechat: '微信' }

export function identityLabel(type: string) {
  return labels[type] ?? type
}
