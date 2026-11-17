import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Activity, BarChart3, Dumbbell, Home, Radar, User } from 'lucide-react'

// 是否 HD 平板版（由 .env.hd 的 VITE_BUILD=hd 决定）
const IS_HD = import.meta.env.VITE_BUILD === 'hd'

// 手机版底部导航（3 项）
const NAV_ITEMS = [
  { key: 'home', label: '首页', to: '/', icon: Home },
  { key: 'records', label: '记录', to: '/records', icon: BarChart3 },
  { key: 'profile', label: '我的', to: '/profile', icon: User },
]

// HD 版底部图标栏（6 项，始终显示）
const HD_BOTTOM_ITEMS = [
  { key: 'home', label: '首页', to: '/', icon: Home },
  { key: 'discover', label: '搜索设备', to: '/discover', icon: Radar },
  { key: 'machines', label: '智能器械', to: '/machines', icon: Dumbbell },
  { key: 'strength', label: '力量训练', to: '/strength', icon: Activity },
  { key: 'records', label: '训练记录', to: '/records', icon: BarChart3 },
  { key: 'profile', label: '我的', to: '/profile', icon: User },
]

export default function Layout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  // 训练页全屏沉浸：隐藏所有导航
  const isTraining = pathname.startsWith('/train') || /^\/pin(\/|$)/.test(pathname)
  const isAuth = pathname.startsWith('/login') || pathname.startsWith('/register')
  const isShare = pathname.startsWith('/s/')
  const hideNav = isTraining || isAuth || isShare

  // 容器：HD 版全宽（根节点带 .hd，启用平板双栏样式）；手机版任何宽度都限宽 430px
  const containerCls = IS_HD
    ? 'hd relative z-10 mx-auto flex h-[100dvh] w-full flex-col bg-bg'
    : 'relative z-10 mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col bg-bg'

  // 底部栏高度预留
  const bottomPad = IS_HD ? 'pb-[88px]' : hideNav ? 'pb-[calc(env(safe-area-inset-bottom)+12px)]' : 'pb-24'

  const mainPaddingCls = `flex-1 overflow-y-auto ${bottomPad}`

  const contentWrapCls = IS_HD ? 'mx-auto w-full max-w-[1280px]' : 'w-full'

  return (
    <div className={containerCls}>
      {/* 手机版顶部安全区 */}
      {!IS_HD && <div className="h-[env(safe-area-inset-top)] shrink-0" />}

      <main className={mainPaddingCls}>
        <div className={contentWrapCls}>
          <Outlet />
        </div>
      </main>

      {/* HD 版：始终显示的居中底部图标栏 */}
      {IS_HD && !hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface/95 backdrop-blur-xl">
          <div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-center gap-1">
            {HD_BOTTOM_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.key}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-0.5 rounded-md px-5 py-2 transition-colors ${
                      isActive ? 'text-primary' : 'text-text-sub hover:text-text'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={26} strokeWidth={isActive ? 2.4 : 1.8} />
                      <span className="text-[13px] font-medium">{t(item.label)}</span>
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>
        </nav>
      )}

      {/* 手机版：底部 tab（任何宽度都显示，训练/登录/分享页隐藏） */}
      {!IS_HD && !hideNav && (
        <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 border-t border-border bg-surface/90 backdrop-blur-xl">
          <div className="flex items-end justify-around px-2 pb-[env(safe-area-inset-bottom)] pt-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.key}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex flex-1 flex-col items-center gap-1 py-2 transition-colors ${
                      isActive ? 'text-primary' : 'text-text-sub'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
                      <span className="text-[14px] font-medium">{t(item.label)}</span>
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}
