import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="112" fill="#0a0a0b"/>
  <rect x="16" y="16" width="480" height="480" rx="96" fill="none" stroke="#a3e635" stroke-width="4" opacity="0.25"/>
  <g fill="#a3e635">
    <rect x="116" y="140" width="280" height="52" rx="12"/>
    <rect x="116" y="230" width="280" height="52" rx="12"/>
    <rect x="116" y="320" width="180" height="52" rx="12"/>
  </g>
  <circle cx="380" cy="346" r="22" fill="#22d3ee"/>
</svg>
`

const out = (size, maskable = false) =>
  `public/icons/icon-${size}${maskable ? '-maskable' : ''}.png`

mkdirSync('public/icons', { recursive: true })

const sizes = [192, 512]
for (const s of sizes) {
  await sharp(Buffer.from(svg)).resize(s, s).png().toFile(out(s))
  console.log('wrote', out(s))
}
// maskable: keep artwork inside safe zone (80% center)
const maskable = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="112" fill="#0a0a0b"/>
  <g fill="#a3e635" transform="translate(64,64) scale(0.75)">
    <rect x="116" y="140" width="280" height="52" rx="12"/>
    <rect x="116" y="230" width="280" height="52" rx="12"/>
    <rect x="116" y="320" width="180" height="52" rx="12"/>
  </g>
  <circle cx="380" cy="346" r="18" fill="#22d3ee" transform="translate(64,64) scale(0.75)"/>
</svg>
`
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile(out(512, true))
console.log('wrote', out(512, true))

// favicon.svg (small mark)
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0a0a0b"/><g fill="#a3e635"><rect x="14" y="17" width="36" height="7" rx="2"/><rect x="14" y="29" width="36" height="7" rx="2"/><rect x="14" y="41" width="22" height="7" rx="2"/></g><circle cx="48" cy="44" r="3" fill="#22d3ee"/></svg>`
const { writeFileSync } = await import('fs')
writeFileSync('public/favicon.svg', favicon)
console.log('wrote favicon.svg')
