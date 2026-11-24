import { useEffect, useState } from 'react'
import { Button, Card, Form, Input, InputNumber, Modal, Space, Switch, Table, Tag, Typography, message } from 'antd'
import Regions from './Regions'
import MachineNavigation from './MachineNavigation'
import { systemApi, type BusinessSettings, type MachineTypeItem } from '@/api/system'

export default function Catalog() {
  const [rows, setRows] = useState<MachineTypeItem[]>([])
  const [initialSettings, setInitialSettings] = useState<BusinessSettings | null>(null)
  const [editing, setEditing] = useState<MachineTypeItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form] = Form.useForm<MachineTypeItem>()

  async function load() {
    setLoading(true)
    try {
      const [types, settings] = await Promise.all([systemApi.machineTypes(), systemApi.settings()])
      setRows(types)
      setInitialSettings(settings)
    } catch {
      // API 拦截器显示错误。
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function saveType(values: MachineTypeItem) {
    if (!editing) return
    setSaving(true)
    try {
      await systemApi.updateMachineType({ ...values, code: editing.code })
      message.success('字典项已保存')
      setEditing(null)
      await load()
    } catch {
      // API 拦截器显示错误。
    } finally {
      setSaving(false)
    }
  }

  async function saveSettings(values: BusinessSettings) {
    setSaving(true)
    try {
      setInitialSettings(await systemApi.updateSettings(values))
      message.success('业务设置已保存')
    } catch {
      // API 拦截器显示错误。
    } finally {
      setSaving(false)
    }
  }

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>数据字典与配置</Typography.Title>
      <Card title="器械类型" extra={<Button onClick={load}>刷新</Button>}>
        <Table<MachineTypeItem> rowKey="code" dataSource={rows} loading={loading} pagination={false} columns={[
          { title: '代码', dataIndex: 'code', render: code => <Typography.Text code>{code}</Typography.Text> },
          { title: '名称', dataIndex: 'label' },
          { title: '排序', dataIndex: 'sortOrder' },
          { title: '新增可选', dataIndex: 'selectable', render: value => <Tag color={value ? 'green' : 'default'}>{value ? '是' : '否'}</Tag> },
          { title: '操作', render: (_, row) => <Button type="link" onClick={() => { form.setFieldsValue(row); setEditing(row) }}>编辑</Button> },
        ]} />
      </Card>
      <MachineNavigation />
      <Regions />
      {initialSettings && (
        <Card title="业务设置">
          <Form<BusinessSettings> layout="vertical" initialValues={initialSettings} onFinish={saveSettings} disabled={saving}
            key={initialSettings.defaultGymTimezone}>
            <Form.Item label="新建门店默认时区" name="defaultGymTimezone" rules={[{ required: true }]}
              extra="使用 IANA 时区名称，例如 Asia/Shanghai。">
              <Input maxLength={80} style={{ maxWidth: 340 }} />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={saving}>保存设置</Button>
          </Form>
        </Card>
      )}
      <Modal title={'编辑器械类型 ' + (editing?.code ?? '')} open={!!editing} forceRender
        onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={saving}>
        <Form form={form} layout="vertical" onFinish={saveType} disabled={saving}>
          <Form.Item label="显示名称" name="label" rules={[{ required: true, whitespace: true }]}><Input maxLength={80} /></Form.Item>
          <Form.Item label="排序" name="sortOrder" rules={[{ required: true, type: 'integer', min: 0 }]}>
            <InputNumber min={0} max={2147483647} precision={0} />
          </Form.Item>
          <Form.Item label="可用于新增型号" name="selectable" valuePropName="checked"
            extra="关闭后，已有器械和训练记录仍可查看和导出。">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
