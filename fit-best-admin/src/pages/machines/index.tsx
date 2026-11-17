import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, QrcodeOutlined, ScanOutlined, ReloadOutlined } from '@ant-design/icons'
import { adminApi } from '@/api/admin'

const { Title, Text, Paragraph } = Typography

const TYPE_LABEL: Record<string, string> = {
  treadmill: '跑步机',
  rower: '划船机',
  ski: '滑雪机',
  bike: '风阻车',
  sled: '雪橇机',
  rep: '力量训练',
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '正常', color: 'success' },
  maintenance: { label: '维护', color: 'orange' },
  retired: { label: '停用', color: 'default' },
}

interface MachineRow {
  id: string
  type: string
  model: string
  brand: string | null
  name: string
  modelId: string
  serialNo: string
  status: string
  firmware: string | null
  gymId: string
  gymName: string
  createdAt: string
}

interface ModelRow {
  id: string
  orgId: string
  type: string
  model: string
  brand: string | null
  specs: unknown
  machineCount: number
  createdAt: string
}

export default function Machines() {
  const [machines, setMachines] = useState<MachineRow[]>([])
  const [models, setModels] = useState<ModelRow[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [tagOpen, setTagOpen] = useState<{ machineId: string; machineName: string } | null>(null)
  const [qrValue, setQrValue] = useState('')
  const [nfcOpen, setNfcOpen] = useState<string | null>(null)
  const [createForm] = Form.useForm()
  const [modelForm] = Form.useForm()

  const refresh = async () => {
    setLoading(true)
    try {
      const [m, md] = await Promise.all([adminApi.machines(), adminApi.machineModels()])
      setMachines(m)
      setModels(md)
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

  const handleCreateModel = async () => {
    const values = await modelForm.validateFields()
    try {
      await adminApi.createMachineModel(values)
      message.success('型号已创建')
      modelForm.resetFields()
      setModelOpen(false)
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

  const handleGenerateQr = async (machineId: string) => {
    const res = await adminApi.generateQrTag(machineId)
    setQrValue(res.qrValue)
    message.success('二维码已生成')
  }

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
    { title: '门店', dataIndex: 'gymName', key: 'gymName' },
    { title: '固件', dataIndex: 'firmware', key: 'firmware', render: (t: string | null) => t || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, r) => {
        const s = STATUS_MAP[status] || { label: status, color: 'default' }
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
      render: (_, r) => (
        <Space>
          <Button
            size="small"
            icon={<QrcodeOutlined />}
            onClick={() => {
              setTagOpen({ machineId: r.id, machineName: r.name })
              setQrValue('')
              setTimeout(() => handleGenerateQr(r.id), 100)
            }}
          >
            二维码
          </Button>
          <Button size="small" icon={<ScanOutlined />} onClick={() => setNfcOpen(r.id)}>
            NFC
          </Button>
        </Space>
      ),
    },
  ]

  const modelColumns: ColumnsType<ModelRow> = [
    { title: '类型', dataIndex: 'type', key: 'type', render: (t: string) => TYPE_LABEL[t] || t },
    { title: '品牌', dataIndex: 'brand', key: 'brand', render: (t: string | null) => t || '-' },
    { title: '型号', dataIndex: 'model', key: 'model', render: (t: string) => <Text strong>{t}</Text> },
    { title: '器械数', dataIndex: 'machineCount', key: 'machineCount', width: 100 },
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
          <Button onClick={() => setModelOpen(true)}>新建型号</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建器械
          </Button>
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

      <Card
        title={<span style={{ fontWeight: 500 }}>器械型号</span>}
        bordered={false}
        style={{ borderRadius: 12 }}
      >
        <Table<ModelRow>
          rowKey="id"
          columns={modelColumns}
          dataSource={models}
          pagination={{ pageSize: 10 }}
          size="small"
          loading={loading}
        />
      </Card>

      <Modal
        title="新建器械"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        okText="创建"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" preserve={false}>
          <Form.Item label="门店 ID" name="gymId" rules={[{ required: true, message: '请输入门店 ID' }]}>
            <Input placeholder="gym_..." />
          </Form.Item>
          <Form.Item label="型号" name="modelId" rules={[{ required: true, message: '请选择型号' }]}>
            <Select placeholder="选择型号">
              {models.map((m) => (
                <Select.Option key={m.id} value={m.id}>
                  {TYPE_LABEL[m.type]} · {m.brand} {m.model}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
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
        title="新建型号"
        open={modelOpen}
        onCancel={() => setModelOpen(false)}
        onOk={handleCreateModel}
        okText="创建"
        destroyOnClose
      >
        <Form form={modelForm} layout="vertical" preserve={false}>
          <Form.Item label="器械类型" name="type" rules={[{ required: true, message: '请选择类型' }]}>
            <Select
              options={Object.entries(TYPE_LABEL).map(([k, v]) => ({ value: k, label: v }))}
              placeholder="选择器械类型"
            />
          </Form.Item>
          <Form.Item label="型号名称" name="model" rules={[{ required: true, message: '请填写型号' }]}>
            <Input placeholder="Treadmill A1" />
          </Form.Item>
          <Form.Item label="品牌" name="brand">
            <Input placeholder="FITBEST" />
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
        {qrValue && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Paragraph>将下列字符串编码为二维码后贴于器械机身</Paragraph>
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
          // 在实际流程中，NFC 值由读卡器返回
          message.info('请先将 NFC 标签贴到读卡器，系统自动读取')
          setNfcOpen(null)
        }}
        okText="完成"
      >
        <Paragraph>
          请将 NFC 标签靠近读卡器，读取到标签值后点击完成，标签将与该器械绑定。
        </Paragraph>
      </Modal>
    </div>
  )
}
