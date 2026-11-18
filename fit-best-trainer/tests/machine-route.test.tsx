import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import App from '../src/App'
import { DeviceProvider } from '../src/context/DeviceContext'

vi.mock('../src/i18n', () => ({ default: { t: (text: string) => text } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (text: string) => text }) }))

it('训练路由对不存在的器械提供返回入口，已知器械仍可打开', () => {
  const render = (id: string) => renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/train/${id}`]}>
      <DeviceProvider><App /></DeviceProvider>
    </MemoryRouter>,
  )

  for (const id of ['unknown-type', 'constructor', 'heartRate']) {
    expect(render(id)).toContain('器械不存在')
    expect(render(id)).toContain('返回器械列表')
  }
  expect(render('rower')).toContain('未连接器械')
})
