import type { PinMachine } from '../types'

/**
 * 插片式力量器械库
 * 智能插销通过激光测距读取配重片位置 → 换算重量；加速度/位移识别次数与幅度。
 * 这里描述每种器械的配重规格，实际配重以插销读数为准。
 */
export const PIN_MACHINES: PinMachine[] = [
  {
    id: 'pin-chest-press',
    name: '坐姿推胸',
    en: 'Chest Press',
    exerciseId: 'chest-press-machine',
    muscles: ['chest', 'arms'],
    plateKg: 5,
    plates: 20,
    startPlate: 8,
  },
  {
    id: 'pin-pec-deck',
    name: '蝴蝶机夹胸',
    en: 'Pec Deck',
    exerciseId: 'pec-deck',
    muscles: ['chest'],
    plateKg: 5,
    plates: 16,
    startPlate: 6,
  },
  {
    id: 'pin-lat-pulldown',
    name: '高位下拉',
    en: 'Lat Pulldown',
    exerciseId: 'lat-pulldown',
    muscles: ['back', 'arms'],
    plateKg: 5,
    plates: 24,
    startPlate: 10,
  },
  {
    id: 'pin-seated-row',
    name: '坐姿划船',
    en: 'Seated Row',
    exerciseId: 'seated-row',
    muscles: ['back', 'arms'],
    plateKg: 5,
    plates: 24,
    startPlate: 10,
  },
  {
    id: 'pin-shoulder-press',
    name: '坐姿推肩',
    en: 'Shoulder Press',
    exerciseId: 'shoulder-press-machine',
    muscles: ['shoulders', 'arms'],
    plateKg: 5,
    plates: 16,
    startPlate: 6,
  },
  {
    id: 'pin-leg-press',
    name: '腿举',
    en: 'Leg Press',
    exerciseId: 'leg-press',
    muscles: ['legs', 'glutes'],
    plateKg: 10,
    plates: 25,
    startPlate: 12,
    leverage: 'double',
  },
  {
    id: 'pin-leg-extension',
    name: '腿屈伸',
    en: 'Leg Extension',
    exerciseId: 'leg-extension',
    muscles: ['legs'],
    plateKg: 5,
    plates: 20,
    startPlate: 8,
    leverage: 'double',
  },
  {
    id: 'pin-leg-curl',
    name: '腿弯举',
    en: 'Leg Curl',
    exerciseId: 'leg-curl',
    muscles: ['legs'],
    plateKg: 5,
    plates: 20,
    startPlate: 6,
    leverage: 'double',
  },
  {
    id: 'pin-hip-abduction',
    name: '坐姿髋外展',
    en: 'Hip Abduction',
    exerciseId: 'hip-abduction',
    muscles: ['glutes'],
    plateKg: 5,
    plates: 16,
    startPlate: 8,
  },
  {
    id: 'pin-biceps',
    name: '器械弯举',
    en: 'Biceps Curl',
    exerciseId: 'preacher-curl',
    muscles: ['arms'],
    plateKg: 5,
    plates: 12,
    startPlate: 4,
  },
  {
    id: 'pin-triceps',
    name: '器械臂屈伸',
    en: 'Triceps Extension',
    exerciseId: 'triceps-machine',
    muscles: ['arms'],
    plateKg: 5,
    plates: 12,
    startPlate: 4,
  },
  {
    id: 'pin-ab-crunch',
    name: '坐姿卷腹',
    en: 'Ab Crunch',
    exerciseId: 'ab-machine',
    muscles: ['core'],
    plateKg: 5,
    plates: 16,
    startPlate: 6,
  },
]

export const PIN_MACHINE_MAP: Record<string, PinMachine> = PIN_MACHINES.reduce(
  (acc, m) => {
    acc[m.id] = m
    return acc
  },
  {} as Record<string, PinMachine>,
)

/** 档位 → 重量 */
export function plateToWeight(m: PinMachine, plate: number): number {
  return plate * m.plateKg
}

/** 重量 → 就近档位 */
export function weightToPlate(m: PinMachine, weight: number): number {
  return Math.max(1, Math.min(m.plates, Math.round(weight / m.plateKg)))
}
