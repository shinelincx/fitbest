import type { MachineType } from '../types'

export function cadenceDisplay(type: MachineType) {
  switch (type) {
    case 'bike':
    case 'spin':
    case 'upright':
      return { label: '踏频', unit: 'rpm' }
    case 'rower':
    case 'ski':
      return { label: '桨频', unit: 'spm' }
    default:
      return { label: '步频', unit: 'spm' }
  }
}
