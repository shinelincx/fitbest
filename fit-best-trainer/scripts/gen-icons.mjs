import sharp from 'sharp'
import { mkdirSync } from 'fs'

// 基于品牌 LOGO 生成 PWA 图标与 favicon
const LOGO = 'public/logo.png'
const BG = { r: 10, g: 10, b: 11, alpha: 1 }

mkdirSync('public/icons', { recursive: true })

async function logoAt(size) {
  return sharp(LOGO).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
}

async function compose(size, ratio, background, file) {
  const inner = await logoAt(Math.round(size * ratio))
  const canvas = background
    ? sharp({ create: { width: size, height: size, channels: 4, background } })
    : sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  await canvas.composite([{ input: inner, gravity: 'center' }]).png().toFile(file)
  console.log('wrote', file)
}

// 透明底图标
await compose(192, 0.94, null, 'public/icons/icon-192.png')
await compose(512, 0.94, null, 'public/icons/icon-512.png')
// maskable：深色底 + 安全区内 LOGO
await compose(512, 0.62, BG, 'public/icons/icon-512-maskable.png')
// iOS 桌面图标（不可透明）
await compose(180, 0.7, BG, 'public/apple-touch-icon.png')
// favicon
await compose(64, 0.98, null, 'public/favicon.png')

// 内联 SVG 版 favicon：直接把 PNG 包进 SVG，保证浏览器标签页清晰
const { readFileSync, writeFileSync } = await import('fs')
const b64 = readFileSync('public/favicon.png').toString('base64')
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><image width="64" height="64" href="data:image/png;base64,${b64}"/></svg>`,
)
console.log('wrote favicon.svg')
