import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe.each(['hyrox-trainer', 'btwe-trainer'])('%s 响应式布局', (app) => {
  it('手机版页面不会随浏览器宽度启用 HD 双栏样式', () => {
    const pages = resolve(process.cwd(), '..', app, 'src', 'pages')
    const files = readdirSync(pages, { recursive: true }).filter((file) => String(file).endsWith('.tsx'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const source = readFileSync(resolve(pages, String(file)), 'utf8')
      expect(source, `${app}/${String(file)} 存在未限制到 HD 的大屏样式`).not.toMatch(/(?<!hd:)\blg:/)
    }
    const css = readFileSync(resolve(process.cwd(), '..', app, 'src', 'index.css'), 'utf8')
    expect(css).toContain('@custom-variant hd (&:where(.hd, .hd *));')
    for (const size of ['sm', 'md', 'lg']) {
      expect(css).toMatch(new RegExp(`--radius-radius-${size}:\\s*\\d+px`))
    }
  })
})
