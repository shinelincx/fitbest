import type { Account } from '../utils/auth'

interface Props {
  user?: Account | null
  name?: string
  size?: number
  className?: string
}

// 有头像用图片，没有时回退为昵称首字色块
export default function Avatar({ user, name, size = 45, className = '' }: Props) {
  const label = (name ?? user?.nickname ?? '?').trim().slice(0, 1) || '?'
  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.nickname}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    )
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-text font-display font-bold text-bg ${className}`}
    >
      {label}
    </span>
  )
}
