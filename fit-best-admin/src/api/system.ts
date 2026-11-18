import http from './http'
import type { AdminInfo } from './admin'

const prefix = '/admin/system'

export interface Organization {
  id: string
  name: string
  code: string
  status: 'active' | 'disabled'
}

export type OrganizationInput = Omit<Organization, 'id'>
export type AccountInput = Pick<AdminInfo, 'name' | 'phone' | 'role' | 'orgId' | 'gymId'> & {
  siteEditor: boolean
  sitePublisher: boolean
}

export interface SetupLink {
  account: AdminInfo
  setupToken: string
  expiresAt: string
}

export interface MachineTypeItem {
  code: string
  label: string
  sortOrder: number
  selectable: boolean
}

export interface Region {
  code: string
  name: string
  parentCode: string | null
  level: number
}

export interface BusinessSettings {
  defaultGymTimezone: string
}

export interface WebsiteContent {
  seoTitle: string
  seoDescription: string
  heroHeadline: string
  heroEmphasis: string
  heroDescription: string
  heroImage: string
  heroImageAlt: string
  productTitle: string
  equipmentTitle: string
  equipmentDescription: string
  trainingTitle: string
  treadmillTitle: string
  hyroxTitle: string
  btweTitle: string
  downloadTitle: string
  downloadDescription: string
  storeApple: string
  storeGoogle: string
  webUrl: string
  hdUrl: string
  treadmillUrl: string
  hyroxUrl: string
  btweUrl: string
  supportEmail: string
}

export interface WebsiteDraft {
  revision: number
  content: WebsiteContent
}

export interface Publication {
  version: number
  publishedAt: string
  publishedBy: string | null
  restoredFrom: number | null
}

export const systemApi = {
  accounts: () => http.get<AdminInfo[]>(prefix + '/accounts'),
  createAccount: (data: AccountInput) => http.post<SetupLink>(prefix + '/accounts', data),
  updateAccount: (id: string, data: AccountInput) => http.put<AdminInfo>(prefix + '/accounts/' + id, data),
  accountStatus: (id: string, status: string) => http.put(prefix + '/accounts/' + id + '/status', { status }),
  resetPassword: (id: string) => http.post<SetupLink>(prefix + '/accounts/' + id + '/reset-password'),
  revokeSessions: (id: string) => http.post(prefix + '/accounts/' + id + '/revoke-sessions'),
  setupPassword: (token: string, password: string) => http.post(prefix + '/setup-password', { token, password }),
  changePassword: (oldPassword: string, password: string) =>
    http.post(prefix + '/my-password', { oldPassword, password }),
  organizations: () => http.get<Organization[]>(prefix + '/organizations'),
  createOrganization: (data: OrganizationInput) => http.post<Organization>(prefix + '/organizations', data),
  updateOrganization: (id: string, data: OrganizationInput) =>
    http.put<Organization>(prefix + '/organizations/' + id, data),
  machineTypes: () => http.get<MachineTypeItem[]>(prefix + '/dictionary/machine-types'),
  updateMachineType: ({ code, ...data }: MachineTypeItem) =>
    http.put(prefix + '/dictionary/machine-types/' + code, data),
  regions: () => http.get<Region[]>(prefix + '/dictionary/regions'),
  createRegion: (data: Omit<Region, 'level'>) => http.post(prefix + '/dictionary/regions', data),
  renameRegion: (code: string, name: string) => http.put(prefix + '/dictionary/regions/' + code, { name }),
  deleteRegion: (code: string) => http.delete(prefix + '/dictionary/regions/' + code),
  settings: () => http.get<BusinessSettings>(prefix + '/settings'),
  updateSettings: (data: BusinessSettings) => http.put<BusinessSettings>(prefix + '/settings', data),
  website: () => http.get<{ draft: WebsiteDraft; versions: Publication[] }>(prefix + '/website'),
  saveWebsite: (draft: WebsiteDraft) => http.put<WebsiteDraft>(prefix + '/website/draft', draft),
  previewWebsite: (content: WebsiteContent) => http.post<{ html: string }>(prefix + '/website/preview', content),
  publishWebsite: (revision: number, restoreVersion?: number) =>
    http.post<{ version: number }>(prefix + '/website/publications', { revision, restoreVersion }),
}
