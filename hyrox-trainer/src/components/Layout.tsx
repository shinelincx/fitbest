import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Home, CalendarDays, Timer, BarChart3, User } from 'lucide-react'

// 是否 HD 平板版（由 .env.hd 的 VITE_BUILD=hd 决定）
const IS_HD = import.meta.env.VITE_BUILD === 'hd'

// 底部导航配置 —— 全站唯一来源，所有页面共用
const NAV_ITEMS = [
  { key: 'home', label: '首页', to: '/', icon: Home },
  { key: 'plans', label: '计划', to: '/plans', icon: CalendarDays },
  { key: 'train', label: '训练', to: '/train', icon: Timer, center: true },
  { key: 'records', label: '记录', to: '/records', icon: BarChart3 },
  { key: 'profile', label: '我的', to: '/profile', icon: User },
]

export default function Layout() {
  const { pathname } = useLocation()
  // 训练页全屏沉浸，不显示底部导航
  const isTraining = pathname === '/train'

  // 容器：HD 版全宽，手机版限宽 430px
  const containerCls = IS_HD
    ? 'hd relative z-10 mx-auto flex h-[100dvh] w-full flex-col bg-bg'
    : 'relative z-10 mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col bg-bg'

  const mainPadding = isTraining
    ? 'pb-[calc(env(safe-area-inset-bottom)+12px)]'
    : IS_HD ? 'pb-[calc(env(safe-area-inset-bottom)+88px)]' : 'pb-[calc(env(safe-area-inset-bottom)+96px)]'

  return (
    <div className={containerCls}>
      {/* 顶部安全区占位（适配灵动岛/状态栏） */}
      {!IS_HD && <div className="h-[env(safe-area-inset-top)] shrink-0" />}

      {/* 主内容区 */}
      <main className={`flex-1 overflow-y-auto ${mainPadding}`}>
        <div className={IS_HD ? 'mx-auto w-full max-w-[1280px]' : 'w-full'}>
          <Outlet />
        </div>
      </main>

      {/* HD 版：居中底部图标栏（训练页隐藏） */}
      {IS_HD && !isTraining && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
          <div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-center gap-1">
            {NAV_ITEMS.map((item) => {
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
                      <span className="text-[13px] font-medium">{item.label}</span>
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>
        </nav>
      )}

      {/* 手机版底部导航 —— 训练页隐藏 */}
      {!IS_HD && !isTraining && (
        <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 border-t border-border bg-surface/90 backdrop-blur-xl">
          <div className="relative flex items-end justify-around px-2 pb-[env(safe-area-inset-bottom)] pt-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              if (item.center) {
                return (
                  <NavLink
                    key={item.key}
                    to={item.to}
                    className={({ isActive }) =>
                      `relative -mt-8 flex flex-col items-center gap-1 ${
                        isActive ? 'text-primary' : 'text-text-sub'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={`flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all ${
                            isActive
                              ? 'border-primary bg-primary text-bg pulse-glow'
                              : 'border-border bg-surface-2 text-text'
                          }`}
                        >
                          <Icon size={26} strokeWidth={2.2} />
                        </span>
                        <span className="text-[11px] font-medium">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                )
              }
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
                      <span className="text-[11px] font-medium">{item.label}</span>
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
