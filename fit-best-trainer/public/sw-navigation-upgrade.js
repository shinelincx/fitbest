const fitbestScope = self.registration.scope
const navigationUpgrade = 'fitbest-navigation-upgraded:' + fitbestScope
const legacyPrecaches = ['fitbest', 'fitbest-hd'].map((id) => id + '-precache-v2-' + fitbestScope)

self.addEventListener('install', (event) => {
  if (!self.registration.active) return
  event.waitUntil((async () => {
    const names = await caches.keys()
    // 旧页面没有更新按钮，只在首次迁移时让新 Worker 主动接管。
    if (!names.includes(navigationUpgrade) && legacyPrecaches.some((name) => names.includes(name))) {
      await self.skipWaiting()
    }
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.open(navigationUpgrade))
})

const assetRoot = new URL('assets/', fitbestScope).href
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(assetRoot)) return
  // 待关闭的旧窗口仍可能按需加载其原有构建产物。
  event.respondWith((async () => {
    const cached = await caches.match(event.request, { ignoreSearch: true })
    return cached ?? fetch(event.request)
  })())
})
