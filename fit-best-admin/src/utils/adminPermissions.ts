import type { AdminInfo } from '@/api/admin'

export const roleLabels: Record<AdminInfo['role'], string> = {
  super: '平台管理员',
  org_admin: '组织管理员',
  gym_admin: '门店管理员',
  ops: '运营',
  viewer: '只读',
}

export const gymRoles: ReadonlySet<AdminInfo['role']> = new Set(['gym_admin', 'ops', 'viewer'])

export const isPlatform = (admin: AdminInfo | null) => admin?.role === 'super'
export const canManageAccounts = (admin: AdminInfo | null) => isPlatform(admin) || admin?.role === 'org_admin'
export const canEditWebsite = (admin: AdminInfo | null) => isPlatform(admin) || admin?.siteEditor === true
export const canPublishWebsite = (admin: AdminInfo | null) => isPlatform(admin) || admin?.sitePublisher === true
export const canAccessWebsite = (admin: AdminInfo | null) => canEditWebsite(admin) || canPublishWebsite(admin)
export const canAccessFeedback = (admin: AdminInfo | null) => isPlatform(admin) || admin?.feedbackManager === true

export function canManageAccount(actor: AdminInfo | null, target: AdminInfo) {
  return actor?.id !== target.id && (isPlatform(actor) || (
    actor?.role === 'org_admin' && actor.orgId === target.orgId && gymRoles.has(target.role)
      && !target.siteEditor && !target.sitePublisher && !target.feedbackManager
  ))
}
