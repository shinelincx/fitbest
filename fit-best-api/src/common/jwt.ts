import type { AdminRole } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { config } from '../config'

export interface AccessPayload {
  sub: string
  typ: 'access'
}

export interface RefreshPayload {
  sub: string
  sid: string
  typ: 'refresh'
}

export interface AdminPayload {
  aid: string
  typ: 'admin'
  role: AdminRole
  orgId: string
  gymId: string | null
}

export function signAccess(userId: string): string {
  return jwt.sign({ sub: userId, typ: 'access' }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessTtl as jwt.SignOptions['expiresIn'],
  })
}

export function signRefresh(userId: string, sessionId: string): string {
  return jwt.sign({ sub: userId, sid: sessionId, typ: 'refresh' }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshTtl as jwt.SignOptions['expiresIn'],
  })
}

export function verifyAccess(token: string): AccessPayload {
  const payload = jwt.verify(token, config.jwt.accessSecret) as AccessPayload
  if (payload.typ !== 'access') throw new Error('invalid token type')
  return payload
}

export function verifyRefresh(token: string): RefreshPayload {
  const payload = jwt.verify(token, config.jwt.refreshSecret) as RefreshPayload
  if (payload.typ !== 'refresh') throw new Error('invalid token type')
  return payload
}

export function signAdmin(payload: Omit<AdminPayload, 'typ'>): string {
  return jwt.sign({ ...payload, typ: 'admin' }, config.jwt.adminSecret, { expiresIn: '8h' })
}

export function verifyAdmin(token: string): AdminPayload {
  const payload = jwt.verify(token, config.jwt.adminSecret) as AdminPayload
  if (payload.typ !== 'admin') throw new Error('invalid token type')
  return payload
}
