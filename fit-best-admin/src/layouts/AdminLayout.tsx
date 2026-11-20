import { useState, useEffect } from 'react'
import { Layout, Menu, Dropdown, Avatar, Typography, theme, Segmented } from 'antd'
import {
  DashboardOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  AppstoreOutlined,
  ShopOutlined,
  CalendarOutlined,
  FileTextOutlined,
  LogoutOutlined,
  LockOutlined,
  UserOutlined,
  HeartOutlined,
  MobileOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAdminStore } from '@/store/admin'
import { stripBase } from '@/router/base'
import { BRAND_META, type BrandFilter } from '@/utils/brand'
import { canAccessFeedback, canAccessWebsite, canManageAccounts, isPlatform, roleLabels } from '@/utils/adminPermissions'

const { Sider, Header, Content } = Layout
const { Text } = Typography

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '概览' },
  { key: '/users', icon: <TeamOutlined />, label: '用户' },
  {
    key: 'train',
    icon: <ThunderboltOutlined />,
    label: '训练',
    children: [
      { key: '/training-records', icon: <HeartOutlined />, label: '品牌训练记录' },
      { key: '/device-sessions', icon: <MobileOutlined />, label: '手环 / 器械会话' },
    ],
  },
  { key: '/sessions', icon: <AppstoreOutlined aria-hidden="true" />, label: '训练记录' },
  { key: '/machines', icon: <AppstoreOutlined aria-hidden="true" />, label: '器械' },
  { key: '/machine-models', icon: <AppstoreOutlined aria-hidden="true" />, label: '器械型号' },
  { key: '/gyms', icon: <ShopOutlined />, label: '门店' },
  { key: '/events', icon: <CalendarOutlined />, label: '赛事' },
  { key: '/feedback', icon: <FileTextOutlined />, label: '意见反馈' },
  { key: '/audit', icon: <FileTextOutlined />, label: '审计日志' },
  {
    key: 'pwa-apps',
    type: 'group' as const,
    label: 'PWA 应用',
    children: [
      { key: 'ext:fitbest', icon: <LinkOutlined />, label: 'FITBEST 训练端' },
      { key: 'ext:hyrox', icon: <LinkOutlined />, label: 'HYROX 训练端' },
      { key: 'ext:btwe', icon: <LinkOutlined />, label: 'BTWE 训练端' },
    ],
  },
]

const EXT_LINKS: Record<string, string> = {
  'ext:fitbest': '/fitbest/',
  'ext:hyrox': '/hyrox/',
  'ext:btwe': '/btwe/',
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const feedbackPage = stripBase(location.pathname) === '/feedback'
  const [collapsed, setCollapsed] = useState(false)
  const [brand, setBrand] = useState<BrandFilter>(() => {
    try {
      const raw = localStorage.getItem('fitbest-admin:brand-filter')
      if (raw === 'hyrox' || raw === 'btwe' || raw === 'all') return raw
    } catch {
      // ignore
    }
    return 'all'
  })
  const admin = useAdminStore((s) => s.admin)
  const logout = useAdminStore((s) => s.logout)
  const fetchMe = useAdminStore((s) => s.fetchMe)
  const maintenanceItems = [
    ...(canManageAccounts(admin) ? [{
      key: 'system-management', type: 'group' as const, label: '系统管理',
      children: [
        { key: '/system/accounts', label: '管理账号' },
        { key: '/system/organizations', label: '组织管理' },
        { key: '/system/roles', label: '角色权限' },
      ],
    }] : []),
    ...(isPlatform(admin) ? [{ key: '/system/catalog', label: '数据字典与配置' }] : []),
    ...(canAccessWebsite(admin) ? [{ key: '/system/website', label: '官网管理' }] : []),
  ]

  useEffect(() => {
    try {
      localStorage.setItem('fitbest-admin:brand-filter', brand)
    } catch {
      // ignore
    }
    // 派发事件让各页面订阅者重新拉数
    window.dispatchEvent(new CustomEvent('brand-filter-change', { detail: brand }))
  }, [brand])

  const { token: themeToken } = theme.useToken()

  useEffect(() => {
    if (!admin) fetchMe()
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        breakpoint={feedbackPage ? 'md' : undefined}
        collapsedWidth={feedbackPage ? 0 : 80}
        style={{
          background: '#0f1115',
          borderRight: '1px solid #1f2127',
        }}
      >
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            padding: collapsed ? '0 16px' : '0 20px',
            gap: 10,
            borderBottom: '1px solid #1f2127',
          }}
        >
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="FITBEST"
            style={{ width: 28, height: 28, flexShrink: 0, display: 'block' }}
          />
          {!collapsed && (
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ color: '#f5f5f5', fontSize: 14, fontWeight: 600 }}>FITBEST</div>
              <div style={{ color: '#6b6f76', fontSize: 11, letterSpacing: 0.3 }}>ADMIN</div>
            </div>
          )}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[stripBase(location.pathname).startsWith('/users/') ? '/users' : stripBase(location.pathname)]}
          items={[...menuItems.filter(({ key }) => key !== '/feedback' || canAccessFeedback(admin)), ...maintenanceItems]}
          onClick={({ key }) => {
            if (key.startsWith('ext:')) {
              const url = EXT_LINKS[key]
              if (url) window.open(url, '_blank', 'noopener')
              return
            }
            navigate(key)
          }}
          style={{
            background: 'transparent',
            borderRight: 0,
            marginTop: 8,
          }}
          theme="dark"
        />
      </Sider>

      <Layout style={{ background: '#fafafb', minWidth: 0 }}>
        <Header
          style={{
            height: 56,
            background: '#ffffff',
            borderBottom: '1px solid #f0f0f1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            gap: 16,
          }}
        >
          {feedbackPage ? <span /> : <Segmented
            value={brand}
            onChange={(v) => setBrand(v as BrandFilter)}
            size="middle"
            options={[
              { value: 'all', label: '全部' },
              {
                value: 'hyrox',
                label: (
                  <span style={{ fontWeight: 600, color: BRAND_META.hyrox.color }}>HYROX</span>
                ),
              },
              {
                value: 'btwe',
                label: (
                  <span style={{ fontWeight: 600, color: BRAND_META.btwe.color }}>BTWE</span>
                ),
              },
            ]}
          />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {admin && (
              <Text type="secondary" style={{ fontSize: 13 }}>
                {roleLabels[admin.role] || admin.role}
                {admin.orgName && ` · ${admin.orgName}`}
                {admin.gymName && ` · ${admin.gymName}`}
              </Text>
            )}
            {admin && (
              <Dropdown
                menu={{
                  items: [
                    { type: 'group', label: admin.name },
                    { label: '修改密码', icon: <LockOutlined />, key: 'change-password', onClick: () => navigate('/my-password') },
                    { label: '退出登录', icon: <LogoutOutlined />, key: 'logout', onClick: handleLogout },
                  ],
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    padding: '4px 12px',
                    borderRadius: 8,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f5f5f6')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Avatar size={28} style={{ background: themeToken.colorPrimary }} icon={<UserOutlined />} />
                  <Text strong style={{ fontSize: 14 }}>
                    {admin.name}
                  </Text>
                </span>
              </Dropdown>
            )}
          </div>
        </Header>

        <Content
          style={{
            padding: 24,
            width: '100%',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
