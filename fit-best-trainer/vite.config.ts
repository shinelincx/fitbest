import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// 此全局变量由 Workbox 生成的 Service Worker 提供。
declare const self: { location: { origin: string }; registration: { scope: string } }

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isHD = env.VITE_BUILD === 'hd'
  const isNative = env.VITE_NATIVE === 'true'
  const offlineEntry = 'index.html?fitbest-offline=1'

  return {
    base: './',
    server: {
      proxy: {
        '/fit-best/api/v1': {
          target: env.FITBEST_DEV_API_TARGET || 'http://127.0.0.1:8080',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/fit-best/, ''),
        },
      },
      fs: {
        allow: [searchForWorkspaceRoot(process.cwd()), fileURLToPath(new URL('../race-trainer-shared', import.meta.url))],
      },
    },
    resolve: { dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom', 'lucide-react'] },
    plugins: [
      react(),
      tailwindcss(),
      // 原生 APP 全部资源离线打包，不注册 Service Worker。
      ...(!isNative ? [VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'favicon.png', 'logo.png', 'apple-touch-icon.png', 'icons/*.png'],
        manifest: {
          name: isHD ? 'FITBEST HD 智能训练' : 'FITBEST 智能训练',
          short_name: isHD ? 'FITBEST HD' : 'FITBEST',
          description: isHD
            ? '平板 HD 横屏 · 智能器械单机训练 + 力量训练 + 智能插销'
            : '智能器械单机训练 + HYROX / BTWE 赛事训练聚合入口',
          theme_color: '#f5f6f7',
          background_color: '#f5f6f7',
          display: 'standalone',
          orientation: 'any',
          start_url: './',
          icons: [
            {
              src: 'icons/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'icons/icon-512-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          globIgnores: ['sw-navigation-upgrade.js'],
          importScripts: ['sw-navigation-upgrade.js'],
          // 避免预缓存先匹配 / 或 /index.html，离线时再读取配套的 HTML。
          modifyURLPrefix: { 'index.html': offlineEntry },
          navigateFallback: null,
          clientsClaim: true,
          // 旧版的带指纹资源留给仍在运行的训练窗口。
          cacheId: isHD ? 'fitbest-hd-navigation' : 'fitbest-navigation',
          runtimeCaching: [
            {
              urlPattern: ({ request, url }: { request: Request; url: URL }) =>
                request.mode === 'navigate' && url.origin === self.location.origin
                && [new URL(self.registration.scope).pathname, new URL('index.html', self.registration.scope).pathname].includes(url.pathname),
              handler: 'NetworkOnly',
              options: {
                precacheFallback: { fallbackURL: offlineEntry },
              },
            },
          ],
        },
      })] : []),
    ],
  }
})
