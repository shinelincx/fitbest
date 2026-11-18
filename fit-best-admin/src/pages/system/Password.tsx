import { useState } from 'react'
import { Button, Card, Form, Input, Result, message } from 'antd'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { systemApi } from '@/api/system'
import { useAdminStore } from '@/store/admin'

interface PasswordValues {
  oldPassword: string
  password: string
  confirmation: string
}

export default function Password({ setup = false }: { setup?: boolean }) {
  const location = useLocation()
  const token = new URLSearchParams(location.hash.slice(1)).get('token')
  const navigate = useNavigate()
  const logout = useAdminStore((s) => s.logout)
  const [saving, setSaving] = useState(false)

  const submit = async (values: PasswordValues) => {
    setSaving(true)
    try {
      if (setup && token) {
        await systemApi.setupPassword(token, values.password)
      } else {
        await systemApi.changePassword(values.oldPassword, values.password)
        logout()
      }
      message.success('密码已设置，请登录')
      navigate('/login', { replace: true })
    } catch {
      // API 拦截器显示错误。
    } finally {
      setSaving(false)
    }
  }

  if (setup && !token) {
    return <Result status="warning" title="设密链接无效" subTitle="请联系管理员获取新的链接。"
      extra={<Link to="/login">前往登录</Link>} />
  }

  return (
    <Card title={setup ? '设置管理账号密码' : '修改我的密码'} style={{ maxWidth: 520, margin: setup ? '48px auto' : 0 }}>
      <Form<PasswordValues> layout="vertical" onFinish={submit}>
        {!setup && (
          <Form.Item name="oldPassword" label="原密码" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
        )}
        <Form.Item name="password" label="新密码" rules={[
          { required: true, min: 12, message: '密码至少需要 12 个字符' },
          { validator: (_, value) => new TextEncoder().encode(value).length <= 72
            ? Promise.resolve() : Promise.reject(new Error('密码最多 72 字节')) },
        ]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="confirmation" label="确认新密码" dependencies={['password']} rules={[
          { required: true },
          ({ getFieldValue }) => ({
            validator: (_, value) => value === getFieldValue('password')
              ? Promise.resolve() : Promise.reject(new Error('两次输入的密码不一致')),
          }),
        ]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button htmlType="submit" type="primary" loading={saving}>保存密码</Button>
      </Form>
    </Card>
  )
}
