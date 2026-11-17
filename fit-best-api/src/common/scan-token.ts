import { createHmac } from 'node:crypto'
import { config } from '../config'

export function signMachine(machineId: string): string {
  return createHmac('sha256', config.qr.secret).update(machineId).digest('base64url').slice(0, 16)
}

export function buildQrValue(machineId: string): string {
  return `fb1.${machineId}.${signMachine(machineId)}`
}

export function parseQrValue(value: string): string | null {
  const parts = value.trim().split('.')
  if (parts.length !== 3 || parts[0] !== 'fb1') return null
  const [, machineId, sig] = parts
  return signMachine(machineId) === sig ? machineId : null
}
