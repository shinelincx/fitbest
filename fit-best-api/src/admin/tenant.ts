import type { Prisma } from '@prisma/client'
import type { AdminPayload } from '../common/jwt'

export function machineScope(admin: AdminPayload): Prisma.MachineWhereInput {
  if (admin.role === 'super') return {}
  if (admin.role === 'org_admin') return { orgId: admin.orgId }
  return admin.gymId ? { gymId: admin.gymId } : { id: { in: [] } }
}

export function sessionScope(admin: AdminPayload): Prisma.SessionWhereInput {
  if (admin.role === 'super') return {}
  if (admin.role === 'org_admin') return { gym: { orgId: admin.orgId } }
  return admin.gymId ? { gymId: admin.gymId } : { id: { in: [] } }
}

export function modelScope(admin: AdminPayload): Prisma.MachineModelWhereInput {
  if (admin.role === 'super') return {}
  return { orgId: admin.orgId }
}

export function eventScope(admin: AdminPayload): Prisma.EventLinkWhereInput {
  if (admin.role === 'super') return {}
  return { orgId: admin.orgId }
}

export function auditScope(admin: AdminPayload): Prisma.AuditLogWhereInput {
  if (admin.role === 'super') return {}
  if (admin.role === 'org_admin') return { orgId: admin.orgId }
  return admin.gymId ? { gymId: admin.gymId } : { id: { in: [] } }
}

export function userScope(admin: AdminPayload): Prisma.UserWhereInput {
  if (admin.role === 'super') return {}
  if (admin.role === 'org_admin') return { sessions: { some: { gym: { orgId: admin.orgId } } } }
  return admin.gymId
    ? { sessions: { some: { gymId: admin.gymId } } }
    : { id: { in: [] } }
}

export function gymScope(admin: AdminPayload): Prisma.GymWhereInput {
  if (admin.role === 'super') return {}
  if (admin.role === 'org_admin') return { orgId: admin.orgId }
  return admin.gymId ? { id: admin.gymId } : { id: { in: [] } }
}

export function resolveOrgId(admin: AdminPayload, inputOrgId?: string): string {
  if (admin.role === 'super') return inputOrgId ?? admin.orgId
  return admin.orgId
}

export function resolveWritableGymId(admin: AdminPayload, inputGymId?: string): string | null {
  if (admin.role === 'super' || admin.role === 'org_admin') return inputGymId ?? null
  return admin.gymId
}
