// 秒数 → mm:ss 或 h:mm:ss
export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

// 秒数 → 带毫秒的 mm:ss.t
export function formatTimer(totalMs: number): string {
  const totalSeconds = totalMs / 1000
  const m = Math.floor(totalSeconds / 60)
  const s = Math.floor(totalSeconds % 60)
  const t = Math.floor((totalMs % 1000) / 10)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${t
    .toString()
    .padStart(2, '0')}`
}

export function levelLabel(level: string): string {
  switch (level) {
    case 'beginner':
      return '入门'
    case 'intermediate':
      return '进阶'
    case 'elite':
      return '精英'
    default:
      return level
  }
}
