import { useEffect, useState } from 'react'
import { useMachineTypes } from '@/hooks/useMachineTypes'
import {
  Button,
  Form,
  Input,
  Modal,
  QRCode,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, QrcodeOutlined, ScanOutlined, ReloadOutlined } from '@ant-design/icons'
import { useAdminStore } from '@/store/admin'
import { adminApi } from '@/api/admin'

const { Title, Text, Paragraph } = Typography

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '正常', color: 'success' },
  maintenance: { label: '维护', color: 'orange' },
  retired: { label: '停用', color: 'default' },
}

type MachineRow = Awaited<ReturnType<typeof adminApi.machines>>[number]
type ModelRow = Awaited<ReturnType<typeof adminApi.machineModels>>[number]
type GymRow = Awaited<ReturnType<typeof adminApi.gyms>>[number]

export default function Machines() {
  const actor = useAdminStore(s => s.admin)
  const canWrite = !!actor && actor.role !== 'viewer'
  const canAssign = actor?.role === 'super' || actor?.role === 'org_admin'
  const [gyms, setGyms] = useState<GymRow[]>([])
  const { labels: machineTypeLabels } = useMachineTypes()
  const [machines, setMachines] = useState<MachineRow[]>([])
  const [models, setModels] = useState<ModelRow[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [tagOpen, setTagOpen] = useState<{ machineId: string; machineName: string } | null>(null)
  const [qrValue, setQrValue] = useState('')
  const [qrLoading, setQrLoading] = useState(false)
  const [nfcOpen, setNfcOpen] = useState<string | null>(null)
  const [nfcBusy, setNfcBusy] = useState(false)
  const [createForm] = Form.useForm()
  const modelId = Form.useWatch('modelId', createForm)
  const selectedModel = models.find(model => model.id === modelId)
  const gymOptions = (orgId: string) => gyms.filter(g => g.orgId === orgId)
    .map(g => ({ value: g.id, label: g.name + ' · ' + g.code }))
  const [nfcForm] = Form.useForm<{ tagValue: string }>()

  const refresh = async () => {
    setLoading(true)
    try {
      const [m, md, gymRows] = await Promise.all([adminApi.machines(), adminApi.machineModels(), adminApi.gyms()])
      setGyms(gymRows)
      setMachines(m)
      setModels(md)
    } catch {
      /* 请求错误已提示 */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleCreate = async () => {
    const values = await createForm.validateFields()
    try {
      await adminApi.createMachine(values)
      message.success('器械已创建')
      createForm.resetFields()
      setCreateOpen(false)
      refresh()
    } catch {
      // http 拦截器已处理
    }
  }

  const handleUpdateStatus = async (id: string, status: string) => {
    await adminApi.updateMachine(id, { status })
    message.success('状态已更新')
    refresh()
  }

  useEffect(() => {
    if (!tagOpen) return
    let current = true
    setQrValue('')
    setQrLoading(true)
    adminApi.generateQrTag(tagOpen.machineId)
      .then((res) => { if (current) setQrValue(res.qrValue) })
      .catch(() => { /* http 拦截器已提示 */ })
      .finally(() => { if (current) setQrLoading(false) })
    return () => { current = false }
  }, [tagOpen])

  const columns: ColumnsType<MachineRow> = [
    {
      title: '器械',
      key: 'name',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.name}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.type.toUpperCase()} · {r.model}
          </Text>
        </div>
      ),
    },
    { title: '序列号', dataIndex: 'serialNo', key: 'serialNo', render: (t: string) => <Text code>{t}</Text> },
    { title: '门店', key: 'gymName', render: (_, row) => {
      const model = models.find(item => item.id === row.modelId)
      if (!canAssign || !model) return row.gymName || '未分配'
      return <Select aria-label={row.serialNo + ' 的门店'} value={row.gymId ?? undefined} placeholder="未分配"
        style={{ minWidth: 140 }} showSearch={{ optionFilterProp: 'label' }} options={gymOptions(model.orgId)}
        onChange={async gymId => {
          try { await adminApi.updateMachine(row.id, { gymId }); message.success('门店已更新'); await refresh() }
          catch { /* 请求错误已提示 */ }
        }} />
    } },
    { title: '固件', dataIndex: 'firmware', key: 'firmware', render: (t: string | null) => t || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, r) => {
        if (!canWrite) return STATUS_MAP[status]?.label || status
        return (
          <Select
            size="small"
            value={status}
            style={{ width: 90 }}
            onChange={(v) => handleUpdateStatus(r.id, v)}
            options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
          />
        )
      },
    },
    {
      title: '标签',
      key: 'tags',
      width: 180,
      render: (_, r) => canWrite && (
        <Space>
          <Button
            size="small"
            icon={<QrcodeOutlined />}
            onClick={() => {
              setTagOpen({ machineId: r.id, machineName: r.name })
            }}
          >
            二维码
          </Button>
          <Button size="small" icon={<ScanOutlined />} onClick={() => { nfcForm.resetFields(); setNfcOpen(r.id) }}>
            NFC
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>
          器械管理
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refresh}>
            刷新
          </Button>
          {canWrite && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建器械
          </Button>}
        </Space>
      </div>

      <Table<MachineRow>
        rowKey="id"
        columns={columns}
        dataSource={machines}
        loading={loading}
        pagination={{ pageSize: 20 }}
        style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}
      />

      <Modal
        title="新建器械"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        okText="创建"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" preserve={false}>
          <Form.Item label="型号" name="modelId" rules={[{ required: true, message: '请选择型号' }]}>
            <Select placeholder="选择型号" onChange={() => createForm.setFieldValue('gymId', undefined)}>
              {models.map((m) => (
                <Select.Option key={m.id} value={m.id}>
                  {m.orgName && m.orgName + ' · '}{machineTypeLabels[m.type] || m.type} · {m.brand} {m.model}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          {canAssign ? <Form.Item label="门店" name="gymId">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} disabled={!selectedModel}
              placeholder={selectedModel ? '未分配，可选择门店' : '请先选择型号'} options={selectedModel ? gymOptions(selectedModel.orgId) : []} />
          </Form.Item> : <Form.Item label="所属门店">{actor?.gymName}</Form.Item>}
          <Form.Item label="序列号" name="serialNo" rules={[{ required: true, message: '请输入序列号' }]}>
            <Input placeholder="FB-TM-001" />
          </Form.Item>
          <Form.Item label="固件版本" name="firmware">
            <Input placeholder="v1.0.0" />
          </Form.Item>
          <Form.Item label="状态" name="status" initialValue="active">
            <Select options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={tagOpen ? `${tagOpen.machineName} — 二维码标签` : '二维码'}
        open={!!tagOpen}
        onCancel={() => setTagOpen(null)}
        footer={null}
        width={420}
      >
        {qrLoading && <Paragraph>正在生成二维码…</Paragraph>}
        {!qrLoading && !qrValue && <Paragraph>生成失败，请关闭后重试。</Paragraph>}
        {qrValue && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Paragraph>扫描或打印此二维码，贴于器械机身</Paragraph>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <QRCode value={qrValue} size={200} />
            </div>
            <div
              style={{
                background: '#0f1115',
                color: '#FF5B4D',
                fontFamily: 'monospace',
                padding: '16px 20px',
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: 0.5,
                wordBreak: 'break-all',
              }}
            >
              {qrValue}
            </div>
            <div style={{ marginTop: 16, fontSize: 12, color: '#8c8c8c' }}>
              扫描 / NFC 读取 / 手动输入此值均可识别器械
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title="绑定 NFC 标签"
        open={!!nfcOpen}
        onCancel={() => setNfcOpen(null)}
        onOk={async () => {
          if (!nfcOpen || nfcBusy) return
          const values = await nfcForm.validateFields().catch(() => null)
          if (!values) return
          setNfcBusy(true)
          try {
            await adminApi.createNfcTag(nfcOpen, values.tagValue.trim())
            message.success('NFC 标签已绑定')
            setNfcOpen(null)
            nfcForm.resetFields()
          } catch {
            // http 拦截器显示错误，保留输入以便重试
          } finally {
            setNfcBusy(false)
          }
        }}
        confirmLoading={nfcBusy}
        okText="绑定"
      >
        <Paragraph>请输入 NFC 读卡器读取的标签值。</Paragraph>
        <Form form={nfcForm} layout="vertical" preserve={false}>
          <Form.Item label="标签值" name="tagValue" rules={[{ required: true, whitespace: true, message: '请输入标签值' }, { max: 200, message: '标签值不能超过 200 个字符' }]}>
            <Input maxLength={200} placeholder="输入标签值" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
