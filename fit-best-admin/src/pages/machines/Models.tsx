import { useEffect, useState } from 'react'
import { Button, Form, Input, Modal, Select, Space, Table, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { adminApi } from '@/api/admin'
import { systemApi, type Organization } from '@/api/system'
import { useMachineTypes } from '@/hooks/useMachineTypes'
import { useAdminStore } from '@/store/admin'

type Model = Awaited<ReturnType<typeof adminApi.machineModels>>[number]
type Fields = { orgId?: string; type: string; model: string; brand?: string }

export default function MachineModels() {
  const actor = useAdminStore(s => s.admin)
  const { types, labels } = useMachineTypes()
  const [rows, setRows] = useState<Model[]>([])
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Model | null>(null)
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<Fields>()
  const canWrite = !!actor && actor.role !== 'viewer'
  const platform = actor?.role === 'super'

  async function load() {
    setLoading(true)
    try {
      const [models, organizations] = await Promise.all([adminApi.machineModels(), platform ? systemApi.organizations() : []])
      setRows(models)
      setOrgs(organizations)
    } catch { /* 请求错误已提示 */ }
    finally { setLoading(false) }
  }
  useEffect(() => { if (actor) void load() }, [actor?.role])

  function edit(row: Model | null) {
    setEditing(row)
    form.resetFields()
    form.setFieldsValue(row ? { ...row, brand: row.brand ?? undefined } : { orgId: actor?.orgId })
    setOpen(true)
  }

  async function save(values: Fields) {
    setSaving(true)
    try {
      if (editing) await adminApi.updateMachineModel(editing.id, { model: values.model.trim(), brand: values.brand?.trim() })
      else await adminApi.createMachineModel({ ...values, model: values.model.trim(), brand: values.brand?.trim() })
      setOpen(false)
      message.success('型号已保存')
      await load()
    } catch { /* 保留输入 */ }
    finally { setSaving(false) }
  }

  return <>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
      <Typography.Title level={4} style={{ margin: 0 }}>器械型号</Typography.Title>
      <Space><Button onClick={load}>刷新</Button>{canWrite && <Button type="primary" icon={<PlusOutlined />} onClick={() => edit(null)}>新建型号</Button>}</Space>
    </div>
    <Table<Model> rowKey="id" dataSource={rows} loading={loading} scroll={{ x: 660 }} columns={[
      { title: '型号', dataIndex: 'model' }, { title: '器械类型', dataIndex: 'type', render: type => labels[type] || type },
      { title: '品牌', dataIndex: 'brand', render: value => value || '—' },
      ...(platform ? [{ title: '所属组织', dataIndex: 'orgName' }] : []),
      { title: '器械数', dataIndex: 'machineCount' },
      ...(platform || actor?.role === 'org_admin' ? [{ title: '操作', render: (_: unknown, row: Model) => <Button type="link" onClick={() => edit(row)}>编辑</Button> }] : []),
    ]} />
    <Modal title={editing ? '编辑型号' : '新建型号'} open={open} forceRender onCancel={() => setOpen(false)}
      onOk={() => form.submit()} confirmLoading={saving}>
      <Form form={form} layout="vertical" onFinish={save} disabled={saving}>
        {platform && <Form.Item name="orgId" label="所属组织" rules={[{ required: true }]}>
          <Select disabled={!!editing} options={orgs.filter(o => o.status === 'active' || editing?.orgId === o.id).map(o => ({ value: o.id, label: o.name }))} />
        </Form.Item>}
        <Form.Item name="type" label="器械类型" rules={[{ required: true }]}>
          <Select disabled={!!editing} options={types.filter(t => t.selectable || t.code === editing?.type).map(t => ({ value: t.code, label: t.label }))} />
        </Form.Item>
        <Form.Item name="model" label="型号名称" rules={[{ required: true, whitespace: true }]}><Input maxLength={100} /></Form.Item>
        <Form.Item name="brand" label="品牌"><Input maxLength={50} /></Form.Item>
      </Form>
    </Modal>
  </>
}
