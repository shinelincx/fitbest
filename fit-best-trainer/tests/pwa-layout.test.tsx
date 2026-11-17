import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (text: string) => text }) }))

import FitbestLayout from '../src/components/Layout'
import HyroxLayout from '../../hyrox-trainer/src/components/Layout'
import BtweLayout from '../../btwe-trainer/src/components/Layout'

describe.each([
  ['FITBEST', FitbestLayout], ['HYROX', HyroxLayout], ['BTWE', BtweLayout],
])('%s PWA 布局', (_name, Layout) => {
  const render = (path: string) => renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route element={<Layout />}><Route path="*" element={<div>测试内容</div>} /></Route></Routes>
    </MemoryRouter>,
  )

  it('底部导航预留安全区，避免内容被遮挡', () => {
    const html = render('/')
    expect(html).toContain(import.meta.env.VITE_BUILD === 'hd'
      ? 'pb-[calc(env(safe-area-inset-bottom)+88px)]'
      : 'pb-[calc(env(safe-area-inset-bottom)+96px)]')
    expect(html).toContain('pb-[env(safe-area-inset-bottom)]')
    expect(html).toContain('<nav')
  })

  it('训练全屏隐藏导航并保留底部安全区', () => {
    const html = render('/train')
    expect(html).not.toContain('<nav')
    expect(html).toContain('pb-[calc(env(safe-area-inset-bottom)+12px)]')
  })
})
