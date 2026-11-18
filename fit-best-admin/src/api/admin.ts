import http from './http'

export interface AdminInfo {
  id: string
  name: string
  phone: string
  role: 'super' | 'org_admin' | 'gym_admin' | 'ops' | 'viewer'
  orgId: string
  orgName: string | null
  gymId: string | null
  gymName: string | null
  status?: string
  siteEditor?: boolean
  sitePublisher?: boolean
  createdAt?: string
}

export interface TokenLogin {
  token: string
  admin: AdminInfo
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface AuditFilters {
  adminId?: string
  orgId?: string
  action?: string
  from?: string
  to?: string
}

export interface AdminUserRow {
  id: string
  nickname: string
  avatar: string | null
  status: string
  createdAt: string
  goals: { weeklySessions: number; weeklyMinutes: number }
  identities: Array<{ type: string; identifier: string; verifiedAt: string | null }>
}

export interface AdminSessionRow {
  id: string
  userNickname: string
  gymId: string | null
  machineId: string | null
  machineSerialNo: string | null
  machineType: string
  machineModel: string | null
  durationSec: number
  distanceM: number
  calories: number
  avgHr: number | null
  avgSpeed: number | null
  cadence: number | null
  power: number | null
  source: string
  startedAt: string
  endedAt: string | null
}

export interface AdminEventRow {
  id: string
  orgId: string | null
  title: string
  subtitle: string | null
  coverUrl: string | null
  externalUrl: string
  startAt: string | null
  endAt: string | null
  sort: number
  status: string
  createdAt: string
  registrationCount: number
}

export interface AdminRegistrationRow {
  id: string
  status: string
  createdAt: string
  user: { id: string; nickname: string; avatar: string | null }
  event: { id: string; title: string; startAt: string | null }
}

export interface AdminTrainingRecordRow {
  id: string
  userNickname: string
  app: string
  completed: boolean
  totalTimeSec: number
  distanceM: number
  rpe: number | null
  weakestStation: string | null
  moduleTimes: unknown
  runSplits: unknown
  avgHr: number | null
  maxHr: number | null
  startedAt: string | null
  createdAt: string
}

export interface AdminDeviceSessionRow {
  id: string
  userNickname: string
  deviceSerialNo: string
  deviceLabel: string | null
  app: string
  mode: string
  clientSessionId: string
  durationSec: number
  distanceM: number
  avgHr: number | null
  maxHr: number | null
  closeReason: string | null
  quality: string
  segmentCount: number
  trainingRecordId: string | null
  startedAt: string
  endedAt: string | null
}

export interface AdminOverview {
  users: number
  sessionsToday: number
  sessionsThisWeek: number
  activeMachines: number
  gyms: number
  byType: Array<{ type: string; sessions: number }>
  trainingRecordsTotal: number | null
  trainingTotalSec: number | null
  trainingTotalDistanceM: number | null
}

export interface AdminUserDetail extends AdminUserRow {
  trainingRecords: AdminTrainingRecordRow[]
  registrations: Array<{
    id: string
    status: string
    createdAt: string
    event: { id: string; title: string; startAt: string | null; status: string }
  }>
  sessions: Array<{
    id: string
    machineType: string
    machineSerialNo: string | null
    durationSec: number
    distanceM: number
    calories: number
    startedAt: string
  }>
}

export const adminApi = {
  login: (phone: string, password: string) =>
    http.post<TokenLogin>('/admin/auth/login', { phone, password }),
  me: () => http.get<AdminInfo>('/admin/me'),
  overview: (app?: string) =>
    http.get<AdminOverview>('/admin/overview', { params: app ? { app } : {} }),
  users: (keyword?: string, app?: string, page?: number, pageSize?: number) =>
    http.get<Paginated<AdminUserRow>>('/admin/users', { params: { keyword, app, page, pageSize } }),
  userDetail: (id: string, app?: string) =>
    http.get<AdminUserDetail>(`/admin/users/${id}`, { params: app ? { app } : {} }),
  sessions: (params: {
    gymId?: string
    machineId?: string
    app?: string
    from?: string
    to?: string
    page?: number
    pageSize?: number
  }) => http.get<Paginated<AdminSessionRow>>('/admin/sessions', { params }),
  trainingRecords: (params: {
    app?: string
    userId?: string
    completed?: string
    from?: string
    to?: string
    page?: number
    pageSize?: number
  }) => http.get<Paginated<AdminTrainingRecordRow>>('/admin/training-records', { params }),
  deviceSessions: (params: {
    app?: string
    mode?: string
    deviceSerial?: string
    from?: string
    to?: string
    page?: number
    pageSize?: number
  }) => http.get<Paginated<AdminDeviceSessionRow>>('/admin/device-sessions', { params }),
  registrations: (params: {
    eventId?: string
    from?: string
    to?: string
    page?: number
    pageSize?: number
  }) => http.get<Paginated<AdminRegistrationRow>>('/admin/event-registrations', { params }),
  machines: (gymId?: string) =>
    http.get<Array<{
      id: string
      type: string
      model: string
      brand: string | null
      name: string
      modelId: string
      serialNo: string
      status: string
      firmware: string | null
      gymId: string
      gymName: string
      createdAt: string
    }>>('/admin/machines', { params: { gymId } }),
  createMachine: (data: { gymId: string; modelId: string; serialNo: string; status?: string; firmware?: string }) =>
    http.post('/admin/machines', data),
  updateMachine: (id: string, data: { gymId?: string; status?: string; firmware?: string | null }) =>
    http.patch(`/admin/machines/${id}`, data),
  machineModels: () =>
    http.get<Array<{
      id: string
      orgId: string
      type: string
      model: string
      brand: string | null
      specs: unknown
      machineCount: number
      createdAt: string
    }>>('/admin/machine-models'),
  createMachineModel: (data: { type: string; model: string; brand?: string; specs?: Record<string, unknown> }) =>
    http.post('/admin/machine-models', data),
  generateQrTag: (machineId: string) =>
    http.post<{ machine: unknown; tag: unknown; qrValue: string }>('/admin/tags/generate', null, { params: { machineId } }),
  createNfcTag: (machineId: string, tagValue: string) =>
    http.post('/admin/tags/nfc', { tagValue }, { params: { machineId } }),
  eventLinks: () => http.get<AdminEventRow[]>('/admin/event-links'),
  createEventLink: (data: Record<string, unknown>) => http.post('/admin/event-links', data),
  updateEventLink: (id: string, data: Record<string, unknown>) => http.patch(`/admin/event-links/${id}`, data),
  deleteEventLink: (id: string) => http.delete(`/admin/event-links/${id}`),
  auditLogs: (page?: number, pageSize?: number, filters?: AuditFilters) =>
    http.get<
      Paginated<{
        id: string
        adminId: string | null
        orgId: string | null
        gymId: string | null
        action: string
        targetType: string | null
        targetId: string | null
        payload: unknown
        ip: string | null
        createdAt: string
      }>
    >('/admin/audit-logs', { params: { page, pageSize, ...filters } }),

  // ---------- Gym management ----------
  gyms: () =>
    http.get<Array<{
      id: string
      orgId: string
      orgName: string
      name: string
      code: string
      address: string | null
      timezone: string
      status: string
      machineCount: number
      createdAt: string
    }>>('/admin/gyms'),
  createGym: (data: { orgId?: string; name: string; code: string; address?: string; timezone?: string }) =>
    http.post('/admin/gyms', data),
  updateGym: (id: string, data: { name?: string; code?: string; address?: string | null; timezone?: string; status?: string }) =>
    http.patch(`/admin/gyms/${id}`, data),
  deleteGym: (id: string) => http.delete(`/admin/gyms/${id}`),
}
