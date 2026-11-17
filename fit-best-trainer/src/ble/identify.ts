import type { MachineType } from '../types'

/** 可识别的器械类别：有氧器械 + 智能插销 */
export type IdentifiedKind = MachineType | 'pin'

/**
 * 自有协议：设备广播名编码器械类型
 * 命名规范 FB-<类型码>-<序列号>，例如 FB-TM-A1 = 跑步机 A1
 *
 * 真实固件应在 manufacturer data 里放同样的类型码，
 * 这里以广播名为载体，字段对齐后改 parseAdvertisement 一处即可。
 */
const TYPE_CODES: Record<string, IdentifiedKind> = {
  TM: 'treadmill',
  RW: 'rower',
  SK: 'ski',
  AB: 'bike',
  SP: 'spin',
  EL: 'elliptical',
  UB: 'upright',
  ST: 'stair',
  PN: 'pin',
}

const KIND_LABEL: Record<IdentifiedKind, string> = {
  treadmill: '跑步机',
  rower: '划船机',
  ski: '滑雪机',
  bike: '风阻单车',
  spin: '动感单车',
  elliptical: '椭圆机',
  upright: '健身车',
  stair: '楼梯机',
  pin: '智能插销',
}

/** 从广播名识别器械类别；未命中自有协议时按常见名兜底 */
export function identifyDevice(name: string): IdentifiedKind | null {
  const m = /^FB-([A-Z]{2})-/i.exec(name.trim())
  if (m) {
    const kind = TYPE_CODES[m[1].toUpperCase()]
    if (kind) return kind
  }
  // ThinkFit 车表（FFF0 私有协议控制台）
  if (/^TF-/i.test(name.trim()) || /thinkfit/i.test(name)) return 'treadmill'
  const n = name.toLowerCase()
  if (n.includes('pin')) return 'pin'
  if (n.includes('tread')) return 'treadmill'
  if (n.includes('row')) return 'rower'
  if (n.includes('ski')) return 'ski'
  if (n.includes('spin')) return 'spin'
  if (n.includes('ellip')) return 'elliptical'
  if (n.includes('upright')) return 'upright'
  if (n.includes('stair')) return 'stair'
  if (n.includes('bike') || n.includes('cycle')) return 'bike'
  return null
}

export function kindLabel(kind: IdentifiedKind): string {
  return KIND_LABEL[kind]
}
