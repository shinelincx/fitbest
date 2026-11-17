import { useEffect, useState } from 'react'
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EditOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined, EnvironmentOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { adminApi } from '@/api/admin'

const { Title, Text } = Typography

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '运营中', color: 'success' },
  closed: { label: '已关闭', color: 'default' },
  maintenance: { label: '维护中', color: 'orange' },
}

interface GymRow {
  id: string
  orgId: string
  orgName: string
  name: string
  code: string
  address: string | null
  timezone: string
  status: string
  machineCount: number
  createdAt: string
}

export default function Gyms() {
  const [list, setList] = useState<GymRow[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<GymRow | null>(null)
  const [form] = Form.useForm()

  const refresh = async () => {
    setLoading(true)
    try {
      setList(await adminApi.gyms())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ timezone: 'Asia/Shanghai', status: 'active' })
    setOpen(true)
  }

  const openEdit = (r: GymRow) => {
    setEditing(r)
    form.setFieldsValue(r)
    setOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    try {
      if (editing) {
        await adminApi.updateGym(editing.id, {
          name: values.name,
          code: values.code,
          address: values.address ?? null,
          timezone: values.timezone,
          status: values.status,
        })
        message.success('门店已更新')
      } else {
        await adminApi.createGym({
          name: values.name,
          code: values.code,
          address: values.address,
          timezone: values.timezone,
        })
        message.success('门店已创建')
      }
      setOpen(false)
      refresh()
    } catch {
      // http 拦截器已处理
    }
  }

  const handleDelete = async (id: string) => {
    await adminApi.deleteGym(id)
    message.success('已删除')
    refresh()
  }

  const columns: ColumnsType<GymRow> = [
    {
      title: '门店',
      key: 'name',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.name}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.code} · {r.orgName}
          </Text>
        </div>
      ),
    },
    {
      title: '地址',
      dataIndex: 'address',
      key: 'address',
      render: (t: string | null) =>
        t ? (
          <span>
            <EnvironmentOutlined style={{ marginRight: 6, color: '#8c8c8c' }} />
            {t}
          </span>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: '时区',
      dataIndex: 'timezone',
      key: 'timezone',
      width: 120,
      render: (t: string) => <Text code style={{ fontSize: 12 }}>{t}</Text>,
    },
    {
      title: '器械数',
      dataIndex: 'machineCount',
      key: 'machineCount',
      width: 100,
      sorter: (a, b) => a.machineCount - b.machineCount,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: string) => {
        const st = STATUS_MAP[s] || { label: s, color: 'default' }
        return <Tag color={st.color}>{st.label}</Tag>
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (t: string) => <Text type="secondary">{dayjs(t).format('YYYY-MM-DD HH:mm')}</Text>,
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
            编辑
          </Button>
          <Popconfirm title="确认删除？" description="有器械绑定的门店无法删除" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>
          门店管理
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refresh}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建门店
          </Button>
        </Space>
      </div>

      <Table<GymRow>
        rowKey="id"
        columns={columns}
        dataSource={list}
        loading={loading}
        pagination={{ pageSize: 20 }}
        style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}
      />

      <Modal
        title={editing ? '编辑门店' : '新建门店'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        destroyOnClose
        width={520}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="门店名称" name="name" rules={[{ required: true, message: '请填写名称' }]} style={{ flex: 1 }}>
              <Input placeholder="上海旗舰店" />
            </Form.Item>
            <Form.Item label="门店编码" name="code" rules={[{ required: true, message: '请填写编码' }]} style={{ width: 180 }}>
              <Input placeholder="SH-001" />
            </Form.Item>
          </div>
          <Form.Item label="地址" name="address">
            <Input placeholder="上海市静安区..." />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label="时区" name="timezone" initialValue="Asia/Shanghai" style={{ width: 200 }}>
              <Select
                options={[
                  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (UTC+8)' },
                  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+9)' },
                  { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
                  { value: 'Europe/London', label: 'Europe/London' },
                  { value: 'America/New_York', label: 'America/New_York' },
                ]}
              />
            </Form.Item>
            <Form.Item label="状态" name="status" initialValue="active" style={{ flex: 1 }}>
              <Select
                options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
              />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
