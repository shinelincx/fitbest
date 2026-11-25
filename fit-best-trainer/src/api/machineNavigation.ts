import { Capacitor, CapacitorHttp } from '@capacitor/core'
import type { MachineType } from '../types'

type BleRule = {
  machineType: MachineType
  match: 'exact' | 'prefix' | 'contains'
  patterns: string[]
  preferredProtocol: 'FTMS' | 'PRIVATE'
  priority: number
}

export interface MachineNavigation {
  machineTypes: { code: MachineType; names: Record<string, string>; sortOrder: number }[]
  bleRules: BleRule[]
  resistanceDisabledPatterns: string[]
}

const cacheKey = 'fitbest:machine-navigation'
const nativeBase = 'https://cloud.thinkfiter.com/fit-best/api/v1'
const normalize = (value: string) => value.trim().toLowerCase()
const supportedTypes = new Set<string>(['treadmill', 'rower', 'ski', 'bike', 'spin', 'elliptical', 'upright', 'stair'])

export function matchBleRule(config: MachineNavigation | null, name: string, type?: string): BleRule | undefined {
  const deviceName = normalize(name)
  return config?.bleRules.slice().sort((a, b) => a.priority - b.priority).find((rule) =>
    supportedTypes.has(rule.machineType) && (!type || rule.machineType === type) && rule.patterns.some((value) => {
      const pattern = normalize(value)
      if (!pattern) return false
      if (rule.match === 'exact') return deviceName === pattern
      if (rule.match === 'prefix') return deviceName.startsWith(pattern)
      return rule.match === 'contains' && deviceName.includes(pattern)
    }),
  )
}

function validate(data: MachineNavigation): MachineNavigation {
  if (!Array.isArray(data?.machineTypes) || !Array.isArray(data.bleRules) || !Array.isArray(data.resistanceDisabledPatterns) ||
    !data.machineTypes.every((item) => item?.names && typeof item.names === 'object' &&
      Object.values(item.names).every((name) => typeof name === 'string')) ||
    !data.bleRules.every((rule) => Number.isFinite(rule?.priority) && Array.isArray(rule.patterns) &&
      rule.patterns.every((value) => typeof value === 'string'))) {
    throw new Error('Invalid machine navigation configuration')
  }
  return data
}

export function readMachineNavigation(): MachineNavigation | null {
  try { return validate(JSON.parse(localStorage.getItem(cacheKey) ?? 'null')) } catch { return null }
}

let pending: Promise<MachineNavigation> | undefined

export function fetchMachineNavigation(): Promise<MachineNavigation> {
  pending ??= load().finally(() => { pending = undefined })
  return pending
}

async function load(): Promise<MachineNavigation> {
  const native = Capacitor.isNativePlatform()
  const base = import.meta.env.VITE_API_BASE?.trim() || (native ? nativeBase : '/fit-best/api/v1')
  const url = `${base.replace(/\/$/, '')}/machine-navigation`
  let result: unknown
  if (native) {
    const response = await CapacitorHttp.get({ url, connectTimeout: 5000, readTimeout: 5000 })
    if (response.status !== 200) throw new Error(`Machine navigation HTTP ${response.status}`)
    result = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
  } else {
    const response = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(5000) })
    if (!response.ok) throw new Error(`Machine navigation HTTP ${response.status}`)
    result = await response.json()
  }
  const config = validate(result as MachineNavigation)
  try { localStorage.setItem(cacheKey, JSON.stringify(config)) } catch { /* storage is optional */ }
  return config
}
