// 自定义智能器械图标 —— 线条风格与 lucide-react 保持一致
// 接受 size / className / strokeWidth，可直接替换 lucide 图标

import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string }

function baseProps({ size = 24, strokeWidth = 1.5, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  }
}

// 跑步机：底座跑步带 + 前端控制台 + 跑步人形
export function TreadmillIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="2" y="16" width="20" height="4" rx="1" />
      <line x1="5" y1="18" x2="9" y2="18" />
      <line x1="11" y1="18" x2="15" y2="18" />
      <line x1="17" y1="18" x2="19" y2="18" />
      <line x1="17" y1="16" x2="15" y2="8" />
      <line x1="21" y1="16" x2="21" y2="8" />
      <rect x="14" y="6" width="8" height="3" rx="0.5" />
      <circle cx="9" cy="9" r="1.5" />
      <line x1="9" y1="10.5" x2="9" y2="14" />
      <line x1="9" y1="12" x2="6" y2="11" />
      <line x1="9" y1="12" x2="12" y2="13" />
      <line x1="9" y1="14" x2="6.5" y2="16" />
      <line x1="9" y1="14" x2="12" y2="16" />
    </svg>
  )
}

// 划船机：滑轨 + 座椅 + 前端飞轮 + 把手 + 脚蹬
export function RowerIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <line x1="3" y1="18" x2="18" y2="18" />
      <line x1="3" y1="20" x2="18" y2="20" />
      <rect x="10" y="16" width="4" height="2" rx="0.5" />
      <circle cx="20.5" cy="19" r="2.5" />
      <line x1="15" y1="15" x2="19" y2="17" />
      <line x1="13" y1="13" x2="15" y2="15" />
      <line x1="17" y1="13" x2="15" y2="15" />
      <line x1="17" y1="20" x2="17" y2="22" />
    </svg>
  )
}

// 滑雪机：底座 + 双立柱 + 横梁 + V 形把手 + 脚台
export function SkiIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="18" width="18" height="3" rx="1" />
      <line x1="6" y1="18" x2="6" y2="8" />
      <line x1="18" y1="18" x2="18" y2="8" />
      <line x1="6" y1="8" x2="18" y2="8" />
      <line x1="10" y1="8" x2="8" y2="14" />
      <line x1="14" y1="8" x2="16" y2="14" />
      <line x1="6" y1="14" x2="18" y2="14" />
    </svg>
  )
}

// 风阻单车：大风扇轮 + 车架 + 座椅 + 把手
export function AirBikeIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="8" cy="16" r="5" />
      <line x1="8" y1="11" x2="8" y2="21" />
      <line x1="3" y1="16" x2="13" y2="16" />
      <line x1="4.5" y1="12.5" x2="11.5" y2="19.5" />
      <line x1="11.5" y1="12.5" x2="4.5" y2="19.5" />
      <line x1="8" y1="16" x2="17" y2="9" />
      <line x1="8" y1="16" x2="19" y2="16" />
      <line x1="17" y1="9" x2="19" y2="9" />
      <line x1="19" y1="16" x2="18" y2="12" />
      <line x1="18" y1="12" x2="20" y2="12" />
    </svg>
  )
}

// 动感单车：前置大飞轮 + 车架 + 高把位
export function SpinIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="7" cy="16" r="4.5" />
      <circle cx="7" cy="16" r="1.5" />
      <line x1="7" y1="16" x2="13" y2="9" />
      <line x1="13" y1="9" x2="19" y2="9" />
      <line x1="19" y1="9" x2="17" y2="16" />
      <line x1="7" y1="16" x2="17" y2="16" />
      <line x1="13" y1="9" x2="13" y2="6" />
      <line x1="11" y1="6" x2="15" y2="6" />
      <line x1="17" y1="16" x2="17" y2="20" />
      <line x1="7" y1="20" x2="7" y2="20.5" />
    </svg>
  )
}

// 椭圆机：弧形轨迹 + 双摆杆 + 踏板
export function EllipticalIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <ellipse cx="12" cy="17" rx="9" ry="3.5" />
      <line x1="6" y1="17" x2="8" y2="6" />
      <line x1="18" y1="17" x2="16" y2="6" />
      <path d="M8 6 Q7 3.5 9 3" />
      <path d="M16 6 Q17 3.5 15 3" />
      <line x1="4" y1="15.5" x2="9" y2="15.5" />
      <line x1="15" y1="18.5" x2="20" y2="18.5" />
    </svg>
  )
}

// 健身车：立式车架 + 座椅 + 前轮
export function UprightIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="16" cy="17" r="4" />
      <circle cx="16" cy="17" r="1.2" />
      <line x1="16" y1="17" x2="10" y2="12" />
      <line x1="10" y1="12" x2="10" y2="7" />
      <line x1="7.5" y1="7" x2="12.5" y2="7" />
      <line x1="10" y1="12" x2="7" y2="17" />
      <line x1="7" y1="17" x2="16" y2="17" />
      <line x1="16" y1="13" x2="19" y2="10" />
      <line x1="18" y1="10" x2="20" y2="10" />
    </svg>
  )
}

// 楼梯机：阶梯 + 扶手立柱
export function StairIcon(props: IconProps) {
  return (
    <svg {...baseProps(props)}>
      <path d="M3 20 h4 v-3.5 h4 v-3.5 h4 v-3.5 h4 v-3.5" />
      <line x1="19" y1="6" x2="19" y2="20" />
      <line x1="19" y1="6" x2="14" y2="6" />
      <line x1="3" y1="20" x2="19" y2="20" />
    </svg>
  )
}
