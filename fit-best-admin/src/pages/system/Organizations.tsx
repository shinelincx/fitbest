import { useEffect, useState } from 'react'
import { Button, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import { Link } from 'react-router-dom'
import { systemApi, type Organization, type OrganizationInput } from '@/api/system'
import { useAdminStore } from '@/store/admin'
import { isPlatform } from '@/utils/adminPermissions'

export default function Organizations() {
  const platform = useAdminStore(s => isPlatform(s.admin))
  const [rows, setRows] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Organization | 'new' | null>(null)
  const [form] = Form.useForm<OrganizationInput>()

  async function load() {
    setLoading(true)
    try {
      setRows(await systemApi.organizations())
    } catch {
      // API 拦截器显示错误。
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  function open(row: Organization | 'new') {
    form.resetFields()
    form.setFieldsValue(row === 'new' ? { status: 'active' } : row)
    setEditing(row)
  }

  async function save(values: OrganizationInput) {
    setSaving(true)
    try {
      if (editing === 'new') await systemApi.createOrganization(values)
      else if (editing) await systemApi.updateOrganization(editing.id, values)
      message.success('组织已保存')
      setEditing(null)
      await load()
    } catch {
      // API 拦截器显示错误。
    } finally {
      setSaving(false)
    }
  }

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>组织管理</Typography.Title>
        {platform && <Button type="primary" onClick={() => open('new')}>新建组织</Button>}
        <Button onClick={load}>刷新</Button>
      </Space>
      <Table<Organization> rowKey="id" dataSource={rows} loading={loading} columns={[
        { title: '名称', dataIndex: 'name' },
        { title: '编码', dataIndex: 'code' },
        { title: '状态', dataIndex: 'status', render: status => <Tag>{status === 'active' ? '启用' : '停用'}</Tag> },
        { title: '操作', render: (_, row) => (
          <Space>
            {platform && <Button type="link" onClick={() => open(row)}>编辑</Button>}
            <Link to={'/gyms?orgId=' + row.id}>查看门店</Link>
          </Space>
        ) },
      ]} />
      <Modal title={editing === 'new' ? '新建组织' : '编辑组织'} open={editing !== null} forceRender
        onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={saving}>
        <Form layout="vertical" form={form} disabled={saving} onFinish={save}>
          <Form.Item name="name" label="名称" rules={[{ required: true, whitespace: true }]}><Input maxLength={100} /></Form.Item>
          <Form.Item name="code" label="编码" rules={[
            { required: true, pattern: /^[A-Za-z0-9_-]{1,40}$/, message: '使用字母、数字、下划线或短横线' },
          ]}><Input maxLength={40} /></Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]} extra="停用前需处理该组织的有效账号和未关闭门店。">
            <Select options={[{ value: 'active', label: '启用' }, { value: 'disabled', label: '停用' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
