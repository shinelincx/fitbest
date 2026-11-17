import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'

const theme = {
  token: {
    colorPrimary: '#F01808',
    colorLink: '#F01808',
    borderRadius: 8,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif',
  },
  components: {
    Layout: {
      headerBg: '#ffffff',
      siderBg: '#0f1115',
      bodyBg: '#fafafb',
    },
    Menu: {
      darkItemBg: 'transparent',
      darkSubMenuItemBg: 'transparent',
      darkItemSelectedBg: 'rgba(240,24,8,0.16)',
      darkItemSelectedColor: '#FF5B4D',
      darkItemHoverBg: 'rgba(255,255,255,0.05)',
      darkItemHoverColor: '#f5f5f5',
      darkItemColor: '#8c8c8c',
    },
  },
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={theme}>
      <RouterProvider router={router} />
    </ConfigProvider>
  )
}
