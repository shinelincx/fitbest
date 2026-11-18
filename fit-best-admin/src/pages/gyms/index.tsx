import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Cascader,
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
import { useSearchParams } from 'react-router-dom'
import { adminApi } from '@/api/admin'
import { systemApi, type Organization, type Region } from '@/api/system'
import { regionTree } from '@/utils/regions'
import { useAdminStore } from '@/store/admin'

const { Title, Text } = Typography

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '运营中', color: 'success' },
  closed: { label: '已关闭', color: 'default' },
  maintenance: { label: '维护中', color: 'orange' },
}

type GymRow = Awaited<ReturnType<typeof adminApi.gyms>>[number]

export default function Gyms() {
  const actor = useAdminStore(s => s.admin)
  const [params] = useSearchParams()
  const selectedOrg = params.get('orgId')
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const options = useMemo(() => regionTree(regions), [regions])
  const byCode = useMemo(() => new Map(regions.map(r => [r.code, r])), [regions])
  function addressPath(code: string | null) {
    const path: Region[] = []
    let region = code && byCode.get(code)
    while (region) {
      path.unshift(region)
      region = region.parentCode && byCode.get(region.parentCode)
    }
    return path
  }
  const [list, setList] = useState<GymRow[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<GymRow | null>(null)
  const [form] = Form.useForm()
  const canWrite = !!actor && actor.role !== 'viewer'

  const refresh = async () => {
    setLoading(true)
    try {
      const [gyms, areas, orgs] = await Promise.all([
        adminApi.gyms(), systemApi.regions(), actor?.role === 'super' ? systemApi.organizations() : [],
      ])
      setList(gyms)
      setRegions(areas)
      setOrganizations(orgs)
    } catch {
      // API 拦截器显示错误。
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (actor) void refresh()
  }, [actor?.role])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    form.setFieldsValue({ orgId: selectedOrg ?? actor?.orgId })
    setOpen(true)
  }

  const openEdit = (r: GymRow) => {
    setEditing(r)
    form.setFieldsValue({ ...r, region: addressPath(r.districtCode).map(area => area.code) })
    setOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    try {
      if (editing) {
        await adminApi.updateGym(editing.id, {
          name: values.name,
          code: values.code,
          address: values.address?.trim() ?? '',
          districtCode: values.region?.[2] ?? '',
          status: values.status,
        })
        message.success('门店已更新')
      } else {
        await adminApi.createGym({
          orgId: values.orgId,
          name: values.name,
          code: values.code,
          address: values.address,
          districtCode: values.region?.[2] ?? '',
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
      key: 'address',
      render: (_, row) => {
        const names = addressPath(row.districtCode).map(area => area.name)
        const address = [...new Set(names), row.address].filter(Boolean).join(' ')
        return address ? <span><EnvironmentOutlined /> {address}</span> : <Text type="secondary">未填写</Text>
      },
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
      render: (_, r) => canWrite && (
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
          {canWrite && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={loading}>
            新建门店
          </Button>}
        </Space>
      </div>

      <Table<GymRow>
        rowKey="id"
        columns={columns}
        dataSource={selectedOrg ? list.filter(gym => gym.orgId === selectedOrg) : list}
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
        forceRender
        width={520}
      >
        <Form form={form} layout="vertical" preserve={false}>
          {!editing && actor?.role === 'super' && (
            <Form.Item label="所属组织" name="orgId" rules={[{ required: true }]}>
              <Select options={organizations.filter(org => org.status === 'active')
                .map(org => ({ value: org.id, label: org.name }))} />
            </Form.Item>
          )}
          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="门店名称" name="name" rules={[{ required: true, message: '请填写名称' }]} style={{ flex: 1 }}>
              <Input placeholder="上海旗舰店" />
            </Form.Item>
            <Form.Item label="门店编码" name="code" rules={[{ required: true, message: '请填写编码' }]} style={{ width: 180 }}>
              <Input placeholder="SH-001" />
            </Form.Item>
          </div>
          <Form.Item label="省 / 市 / 区县" name="region" rules={[{
            validator: (_, value) => !value?.length || value.length === 3 ? Promise.resolve() : Promise.reject(new Error('请选择至区/县')),
          }]}>
            <Cascader options={options} fieldNames={{ label: 'name', value: 'code', children: 'children' }}
              showSearch allowClear placeholder="选择省、市、区/县" />
          </Form.Item>
          <Form.Item label="详细地址" name="address">
            <Input maxLength={300} placeholder="街道、门牌号、楼层等" />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            {editing && <Form.Item label="状态" name="status" style={{ flex: 1 }}>
              <Select
                options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
              />
            </Form.Item>}
          </div>
        </Form>
      </Modal>
    </div>
  )
}
