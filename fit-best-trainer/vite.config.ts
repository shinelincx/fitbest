import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isHD = env.VITE_BUILD === 'hd'
  const isNative = env.VITE_NATIVE === 'true'

  return {
    base: './',
    resolve: { dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom', 'lucide-react'] },
    plugins: [
      react(),
      tailwindcss(),
      // 原生 APP 全部资源离线打包，不注册 Service Worker。
      ...(!isNative ? [VitePWA({
        registerType: 'autoUpdate',
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
          navigateFallback: null,
          cleanupOutdatedCaches: true,
          // HD 版用独立缓存命名空间，避免与手机版 SW 冲突
          cacheId: isHD ? 'fitbest-hd' : 'fitbest',
          runtimeCaching: [
            {
              urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: isHD ? 'fitbest-hd-pages' : 'fitbest-pages',
                networkTimeoutSeconds: 3,
                expiration: { maxEntries: 8, maxAgeSeconds: 86400 },
              },
            },
          ],
        },
      })] : []),
    ],
  }
})
