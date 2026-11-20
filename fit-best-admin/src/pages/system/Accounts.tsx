import { useEffect, useState } from 'react'
import { Button, Dropdown, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography, message } from 'antd'
import { adminApi, type AdminInfo } from '@/api/admin'
import { systemApi, type AccountInput, type Organization, type SetupLink } from '@/api/system'
import { BASENAME } from '@/router/base'
import { useAdminStore } from '@/store/admin'
import { canManageAccount, gymRoles, isPlatform, roleLabels } from '@/utils/adminPermissions'

const statusLabels: Record<string, string> = { active: '已启用', pending: '待设密', disabled: '已停用' }
const roleOptions = Object.entries(roleLabels).map(([value, label]) => ({ value, label }))

interface Filters {
  keyword?: string
  orgId?: string
  gymId?: string
  role?: string
  status?: string
}

export default function Accounts() {
  const actor = useAdminStore(s => s.admin)
  const platform = isPlatform(actor)
  const [rows, setRows] = useState<AdminInfo[]>([])
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [gyms, setGyms] = useState<Awaited<ReturnType<typeof adminApi.gyms>>>([])
  const [filters, setFilters] = useState<Filters>({})
  const [editing, setEditing] = useState<AdminInfo | 'new' | null>(null)
  const [link, setLink] = useState<SetupLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<AccountInput>()
  const selectedOrg = Form.useWatch('orgId', form)
  const selectedRole = Form.useWatch('role', form)
  const setupUrl = link ? new URL(BASENAME + '/setup#token=' + link.setupToken, location.origin).href : ''

  async function load() {
    setLoading(true)
    try {
      const [accounts, organizations, gyms] = await Promise.all([
        systemApi.accounts(), systemApi.organizations(), adminApi.gyms(),
      ])
      setRows(accounts)
      setOrgs(organizations)
      setGyms(gyms)
    } catch {
      // API 拦截器显示错误。
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  function open(row: AdminInfo | 'new') {
    setEditing(row)
    form.resetFields()
    form.setFieldsValue(row === 'new'
      ? { orgId: actor?.orgId, gymId: null, role: 'viewer', siteEditor: false, sitePublisher: false, feedbackManager: false }
      : { ...row, siteEditor: !!row.siteEditor, sitePublisher: !!row.sitePublisher, feedbackManager: !!row.feedbackManager })
  }

  async function save(values: AccountInput) {
    setSaving(true)
    try {
      const data = { ...values, gymId: gymRoles.has(values.role) ? values.gymId : null }
      if (!platform || values.role === 'viewer' || values.role === 'super') {
        data.siteEditor = false
        data.sitePublisher = false
      }
      if (!platform || values.role === 'super') data.feedbackManager = false
      if (editing === 'new') setLink(await systemApi.createAccount(data))
      else if (editing) await systemApi.updateAccount(editing.id, data)
      message.success('管理账号已保存')
      setEditing(null)
      await load()
    } catch {
      // API 拦截器显示错误。
    } finally {
      setSaving(false)
    }
  }

  function confirm(row: AdminInfo, action: 'reset' | 'revoke' | 'status') {
    const nextStatus = row.status === 'disabled' ? 'active' : 'disabled'
    const labels = { reset: '生成设密链接', revoke: '撤销所有会话', status: nextStatus === 'active' ? '启用账号' : '停用账号' }
    Modal.confirm({
      title: labels[action],
      content: action === 'reset' ? '当前密码和登录会话会失效。请通过受控渠道交付新链接。' : row.name,
      onOk: async () => {
        if (action === 'reset') setLink(await systemApi.resetPassword(row.id))
        if (action === 'revoke') await systemApi.revokeSessions(row.id)
        if (action === 'status') await systemApi.accountStatus(row.id, nextStatus)
        message.success('操作成功')
        await load()
      },
    })
  }

  const keyword = filters.keyword?.trim().toLowerCase()
  const visibleRows = rows.filter(row =>
    (!keyword || row.name.toLowerCase().includes(keyword) || row.phone.includes(keyword))
    && (!filters.orgId || filters.orgId === row.orgId)
    && (!filters.gymId || filters.gymId === row.gymId)
    && (!filters.role || filters.role === row.role)
    && (!filters.status || filters.status === row.status),
  )
  const orgOptions = orgs.map(({ id, name }) => ({ value: id, label: name }))
  const gymOptions = (orgId?: string) => gyms.filter(gym => !orgId || gym.orgId === orgId)
    .map(({ id, name }) => ({ value: id, label: name }))

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>管理账号</Typography.Title>
        <Button type="primary" onClick={() => open('new')} disabled={loading}>新建账号</Button>
        <Button onClick={load}>刷新</Button>
      </Space>
      <Space wrap>
        <Input aria-label="搜索账号" placeholder="姓名或手机号" allowClear value={filters.keyword}
          onChange={e => setFilters({ ...filters, keyword: e.target.value })} />
        <Select aria-label="按组织筛选" placeholder="组织" allowClear options={orgOptions} value={filters.orgId}
          onChange={orgId => setFilters({ ...filters, orgId, gymId: undefined })} style={{ minWidth: 130 }} />
        <Select aria-label="按门店筛选" placeholder="门店" allowClear options={gymOptions(filters.orgId)} value={filters.gymId}
          onChange={gymId => setFilters({ ...filters, gymId })} style={{ minWidth: 130 }} />
        <Select aria-label="按角色筛选" placeholder="角色" allowClear options={roleOptions} value={filters.role}
          onChange={role => setFilters({ ...filters, role })} style={{ minWidth: 130 }} />
        <Select aria-label="按状态筛选" placeholder="状态" allowClear value={filters.status}
          options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
          onChange={status => setFilters({ ...filters, status })} style={{ minWidth: 110 }} />
      </Space>
      <Table<AdminInfo> rowKey="id" dataSource={visibleRows} loading={loading} scroll={{ x: 820 }} columns={[
        { title: '姓名', dataIndex: 'name' },
        { title: '手机号', dataIndex: 'phone' },
        { title: '组织', dataIndex: 'orgName' },
        { title: '门店', dataIndex: 'gymName', render: value => value ?? '—' },
        { title: '角色', dataIndex: 'role', render: (role: AdminInfo['role']) => roleLabels[role] },
        { title: '状态', dataIndex: 'status', render: (status: string) => <Tag color={status === 'active' ? 'green' : 'default'}>{statusLabels[status] ?? status}</Tag> },
        {
          title: '操作', key: 'actions', render: (_, row) => canManageAccount(actor, row) && (
            <Space>
              <Button type="link" onClick={() => open(row)}>编辑</Button>
              <Dropdown trigger={['click']} menu={{ items: [
                { key: 'reset', label: '生成设密链接', onClick: () => confirm(row, 'reset') },
                { key: 'revoke', label: '撤销所有会话', onClick: () => confirm(row, 'revoke') },
                { key: 'status', label: row.status === 'disabled' ? '启用' : '停用', onClick: () => confirm(row, 'status') },
              ] }}>
                <Button type="link">更多</Button>
              </Dropdown>
            </Space>
          ),
        },
      ]} />
      <Modal title={editing === 'new' ? '新建管理账号' : '编辑管理账号'} open={editing !== null}
        onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={saving}
        okText={editing === 'new' ? '创建并生成设密链接' : '保存'} forceRender>
        <Form form={form} layout="vertical" onFinish={save} disabled={saving}>
          <Form.Item label="姓名" name="name" rules={[{ required: true, whitespace: true }]}>
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item label="手机号" name="phone" rules={[{ required: true, pattern: /^1[3-9][0-9]{9}$/, message: '请输入有效手机号' }]}>
            <Input maxLength={11} inputMode="tel" autoComplete="off" />
          </Form.Item>
          <Form.Item label="组织" name="orgId" rules={[{ required: true }]}>
            <Select disabled={!platform} options={orgs.filter(org => org.status === 'active')
              .map(org => ({ value: org.id, label: org.name }))} onChange={() => form.setFieldValue('gymId', null)} />
          </Form.Item>
          <Form.Item label="角色" name="role" rules={[{ required: true }]}>
            <Select options={roleOptions.filter(option => platform || gymRoles.has(option.value as AdminInfo['role']))} />
          </Form.Item>
          {selectedRole && gymRoles.has(selectedRole) && (
            <Form.Item label="门店" name="gymId" rules={[{ required: true }]}>
              <Select options={gymOptions(selectedOrg)} disabled={!selectedOrg} />
            </Form.Item>
          )}
          {platform && selectedRole && selectedRole !== 'viewer' && selectedRole !== 'super' && (
            <Space size="large">
              <Form.Item label="官网编辑权限" name="siteEditor" valuePropName="checked"><Switch /></Form.Item>
              <Form.Item label="官网发布权限" name="sitePublisher" valuePropName="checked"><Switch /></Form.Item>
            </Space>
          )}
          {platform && selectedRole && selectedRole !== 'super' && (
            <Form.Item label="意见反馈菜单" name="feedbackManager" valuePropName="checked"
              extra="可查看和处理三个应用的反馈，包括访客反馈和附件。">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
      <Modal title="一次性设密链接" open={!!link} onCancel={() => setLink(null)}
        footer={<Button onClick={() => setLink(null)}>关闭</Button>} destroyOnHidden>
        <Typography.Paragraph>
          链接在 {link && new Date(link.expiresAt).toLocaleString()} 前有效。请通过受控渠道将链接交给账号本人。
        </Typography.Paragraph>
        <Typography.Paragraph copyable={{ text: setupUrl }} style={{ overflowWrap: 'anywhere' }}>{setupUrl}</Typography.Paragraph>
      </Modal>
    </Space>
  )
}
