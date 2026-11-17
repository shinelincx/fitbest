import { useEffect, useState } from 'react'
import { Button, Card, Form, Input, Typography, message } from 'antd'
import { LockOutlined, PhoneOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAdminStore } from '@/store/admin'
import { adminApi } from '@/api/admin'

const { Title, Text } = Typography

export default function Login() {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const redirect = search.get('redirect') || '/dashboard'
  const setAuth = useAdminStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)

  const onFinish = async (values: { phone: string; password: string }) => {
    setLoading(true)
    try {
      const res = await adminApi.login(values.phone.trim(), values.password)
      setAuth(res.token, res.admin)
      message.success('登录成功')
      navigate(redirect, { replace: true })
    } catch {
      // http 拦截器已弹 message
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(1200px 600px at 50% -10%, rgba(240,24,8,0.20) 0%, rgba(240,24,8,0) 60%), linear-gradient(160deg, #0f1115 0%, #1a1d24 100%)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 400,
          background: '#fff',
          borderRadius: 16,
          padding: '48px 40px 36px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ marginBottom: 32 }}>
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="FITBEST"
            style={{
              width: 56,
              height: 56,
              display: 'block',
              marginBottom: 16,
            }}
          />
          <Title level={3} style={{ margin: 0, fontWeight: 600 }}>
            FITBEST 管理后台
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            请使用管理员账号登录
          </Text>
        </div>

        <Form<{ phone: string; password: string }>
          layout="vertical"
          size="large"
          onFinish={onFinish}
          autoComplete="off"
        >
          <Form.Item
            label="手机号"
            name="phone"
            rules={[{ required: true, message: '请输入手机号' }, { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' }]}
          >
            <Input prefix={<PhoneOutlined />} placeholder="请输入手机号" maxLength={11} />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
          </Form.Item>

          <Form.Item style={{ marginTop: 12, marginBottom: 0 }}>
            <Button block type="primary" htmlType="submit" loading={loading}>
              登录
            </Button>
          </Form.Item>
        </Form>


      </div>
    </div>
  )
}
