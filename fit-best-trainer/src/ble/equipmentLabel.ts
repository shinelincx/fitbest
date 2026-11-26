import { matchBleRule, type MachineNavigation } from '../api/machineNavigation'
import { identifyDevice } from './identify'
import { MACHINES } from '../mock/data'
import type { MachineType } from '../types'

const legacyTypes: Partial<Record<string, MachineType>> = {
  '1': 'spin', '2': 'treadmill', '3': 'upright', '5': 'rower',
  '6': 'elliptical', '16': 'stair', '36': 'ski',
}

const modelNames: Partial<Record<string, MachineType>> = {
  'treadmill a1': 'treadmill', 'rower x2': 'rower', 'skierg pro': 'ski',
  'airbike s3': 'bike', 'spinbike s5': 'spin', 'elliptical e7': 'elliptical',
  'uprightbike u3': 'upright', 'stairclimber c9': 'stair',
}

export function parseEquipmentLabel(raw: string, navigation: MachineNavigation | null) {
  const text = raw.trim()
  let name = text
  let typeCode = ''
  if (text.startsWith('{')) {
    try {
      const data = JSON.parse(text)
      name = typeof data.name === 'string' ? data.name.trim() : ''
      typeCode = String(data.type ?? data.stype ?? '')
    } catch {
      return null
    }
  } else if (text.includes('?') || /^(?:from|name|localName|stype)=/.test(text)) {
    const params = new URLSearchParams(text.includes('?') ? text.split('?')[1] : text)
    const linkType = params.get('type')
    name = (params.get('name') || params.get('localName') ||
      (linkType === 'connectDevice' ? params.get('blename') : '') || '').trim()
    typeCode = params.get('stype') || (linkType === 'connectDevice' ? '' : linkType) || ''
  }
  const code = typeCode.trim().toLowerCase()
  const alias = name.toLowerCase()
  const namedType = MACHINES.find((machine) => machine.type === alias)?.type ?? modelNames[alias]
  const type = MACHINES.find((machine) => machine.type === code)?.type ?? legacyTypes[code] ??
    namedType ?? matchBleRule(navigation, name)?.machineType ?? identifyDevice(name)
  if (!type || type === 'pin') return null
  return { type, name: namedType ? '' : name }
}
