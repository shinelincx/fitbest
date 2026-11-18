import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const scope = 'https://example.test/fitbest/'
const legacyCache = 'fitbest-precache-v2-' + scope
type LifecycleHandler = (event: { waitUntil: (promise: Promise<unknown>) => void }) => void

function worker(cacheNames: string[], active = true) {
  const source = readFileSync(new URL('../public/sw-navigation-upgrade.js', import.meta.url), 'utf8')
  const events = new Map<string, LifecycleHandler>()
  const skipWaiting = vi.fn()
  runInNewContext(source, {
    self: {
      registration: { scope, active: active ? {} : null },
      addEventListener: (name: string, handler: LifecycleHandler) => events.set(name, handler),
      skipWaiting,
    },
    caches: {
      keys: async () => cacheNames.slice(),
      open: async (name: string) => { if (!cacheNames.includes(name)) cacheNames.push(name) },
    },
    URL,
  })
  async function dispatch(name: string) {
    const tasks: Promise<unknown>[] = []
    events.get(name)?.({ waitUntil: (promise) => { tasks.push(promise) } })
    await Promise.all(tasks)
  }
  return { dispatch, skipWaiting }
}

it('旧入口缓存只自动迁移一次，后续版本继续等待用户确认', async () => {
  const cacheNames = [legacyCache]
  const bridge = worker(cacheNames)
  await bridge.dispatch('install')
  expect(bridge.skipWaiting).toHaveBeenCalledOnce()
  await bridge.dispatch('activate')

  const next = worker(cacheNames)
  await next.dispatch('install')
  expect(next.skipWaiting).not.toHaveBeenCalled()
})

it('首次安装与其他站点缓存不会触发旧版迁移', async () => {
  const first = worker([legacyCache], false)
  await first.dispatch('install')
  expect(first.skipWaiting).not.toHaveBeenCalled()

  const otherSite = worker(['fitbest-hd-precache-v2-https://example.test/fitbest-hd/'])
  await otherSite.dispatch('install')
  expect(otherSite.skipWaiting).not.toHaveBeenCalled()
})
