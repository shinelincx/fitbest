import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Form, Input, Modal, Popconfirm, Space, Table, message } from 'antd'
import { systemApi, type Region } from '@/api/system'
import { regionTree, type RegionNode } from '@/utils/regions'

const levels = ['', '省级地区', '市级地区', '区/县']

export default function Regions() {
  const [rows, setRows] = useState<Region[]>([])
  const tree = useMemo(() => regionTree(rows), [rows])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dialog, setDialog] = useState<{ level: number; parent?: Region; editing?: Region } | null>(null)
  const [form] = Form.useForm<{ code: string; name: string }>()

  async function load() {
    setLoading(true)
    try { setRows(await systemApi.regions()) }
    catch { /* 请求错误已提示 */ }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  function open(level: number, parent?: Region, editing?: Region) {
    form.resetFields()
    if (editing) form.setFieldsValue(editing)
    setDialog({ level, parent, editing })
  }

  async function save(values: { code: string; name: string }) {
    if (!dialog) return
    setSaving(true)
    try {
      if (dialog.editing) await systemApi.renameRegion(dialog.editing.code, values.name.trim())
      else await systemApi.createRegion({ ...values, name: values.name.trim(), parentCode: dialog.parent?.code ?? null })
      setDialog(null)
      message.success('地区已保存')
      await load()
    } catch { /* 保留输入 */ }
    finally { setSaving(false) }
  }

  return <Card title="省市区字典" extra={<Button onClick={() => open(1)}>新增省级地区</Button>}>
    <Table<RegionNode> rowKey="code" dataSource={tree} loading={loading} size="small"
      pagination={{ pageSize: 10, showSizeChanger: false }} columns={[
        { title: '地区名称', dataIndex: 'name' },
        { title: '编码', dataIndex: 'code' },
        { title: '级别', dataIndex: 'level', render: level => levels[level] },
        { title: '操作', render: (_, row) => <Space wrap>
          {row.level < 3 && <Button type="link" onClick={() => open(row.level + 1, row)}>新增{levels[row.level + 1]}</Button>}
          <Button type="link" onClick={() => open(row.level, undefined, row)}>编辑</Button>
          <Popconfirm title={'删除' + row.name + '？'} onConfirm={async () => {
            try { await systemApi.deleteRegion(row.code); message.success('地区已删除'); await load() }
            catch { /* 请求错误已提示 */ }
          }}><Button type="link" danger disabled={!!row.children?.length}>删除</Button></Popconfirm>
        </Space> },
      ]} />
    <Modal open={!!dialog} forceRender title={(dialog?.editing ? '编辑' : '新增') + levels[dialog?.level ?? 0]}
      onCancel={() => setDialog(null)} onOk={() => form.submit()} confirmLoading={saving}>
      <Form form={form} layout="vertical" onFinish={save} disabled={saving}>
        {dialog?.parent && <Form.Item label="上级地区">{dialog.parent.name}（{dialog.parent.code}）</Form.Item>}
        <Form.Item name="code" label="地区编码" rules={[{ required: true, pattern: /^[0-9]{6}$/, message: '请输入六位数字编码' }]}>
          <Input disabled={!!dialog?.editing} maxLength={6} />
        </Form.Item>
        <Form.Item name="name" label="地区名称" rules={[{ required: true, whitespace: true }]}><Input maxLength={80} /></Form.Item>
      </Form>
    </Modal>
  </Card>
}
