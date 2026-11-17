import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const source = path.join(root, 'public/logo.png')
const out = path.join(root, 'native-assets')
await mkdir(out, { recursive: true })

const logo = (size) => sharp(source).resize(size, size, { fit: 'contain', kernel: sharp.kernel.lanczos3 }).png().toBuffer()

async function canvas(name, size, background, logoSize) {
  const input = await logo(logoSize)
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input, gravity: 'center' }])
    .png()
    .toFile(path.join(out, name))
}

await canvas('icon-only.png', 1024, '#f5f6f7', 780)
await canvas('icon-background.png', 1024, '#f5f6f7', 1)
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: await logo(560), gravity: 'center' }])
  .png()
  .toFile(path.join(out, 'icon-foreground.png'))
await canvas('splash.png', 2732, '#f5f6f7', 520)
await canvas('splash-dark.png', 2732, '#111111', 520)
console.log('FITBEST native assets generated from public/logo.png')
