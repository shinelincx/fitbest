export const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '')

/** 去掉部署前缀，得到路由内部路径，如 /fit-best/saas/dashboard -> /dashboard */
export function stripBase(pathname: string) {
  if (!BASENAME || !pathname.startsWith(BASENAME)) return pathname
  return pathname.slice(BASENAME.length) || '/'
}
