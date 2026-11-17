import { useEffect, useState } from 'react'
import {
  Button,
  DatePicker,
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
import { DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { adminApi, type AdminEventRow as EventRow, type AdminRegistrationRow } from '@/api/admin'
import { exportCsvPages } from '@/utils/exportCsv'

const { Title, Text } = Typography

export default function Events() {
  const [list, setList] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<EventRow | null>(null)
  const [form] = Form.useForm()

  const [regEvent, setRegEvent] = useState<EventRow | null>(null)
  const [regRows, setRegRows] = useState<AdminRegistrationRow[]>([])
  const [regTotal, setRegTotal] = useState(0)
  const [regPage, setRegPage] = useState(1)
  const [regPageSize, setRegPageSize] = useState(20)
  const [regLoading, setRegLoading] = useState(false)
  const [regExporting, setRegExporting] = useState(false)

  const fetchRegistrations = (eventId: string, nextPage = 1, nextSize = regPageSize) => {
    setRegLoading(true)
    adminApi
      .registrations({ eventId, page: nextPage, pageSize: nextSize })
      .then((res) => {
        setRegRows(res.items)
        setRegTotal(res.total)
        setRegPage(res.page)
        setRegPageSize(res.pageSize)
      })
      .finally(() => setRegLoading(false))
  }

  const openRegistrations = (event: EventRow) => {
    setRegEvent(event)
    fetchRegistrations(event.id, 1, regPageSize)
  }

  const exportRegistrations = async () => {
    if (!regEvent) return
    setRegExporting(true)
    try {
      await exportCsvPages(
        message,
        `${regEvent.title}-报名名单`,
        ['用户', '用户 ID', '赛事', '报名时间', '状态'],
        (page, pageSize) => adminApi.registrations({ eventId: regEvent.id, page, pageSize }),
        (row) => [
          row.user.nickname,
          row.user.id,
          row.event.title,
          dayjs(row.createdAt).format('YYYY-MM-DD HH:mm'),
          row.status === 'registered' ? '已报名' : row.status,
        ],
      )
    } finally {
      setRegExporting(false)
    }
  }

  const refresh = async () => {
    setLoading(true)
    try {
      setList(await adminApi.eventLinks())
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
    setOpen(true)
  }

  const openEdit = (r: EventRow) => {
    setEditing(r)
    form.setFieldsValue({
      ...r,
      startAt: r.startAt ? dayjs(r.startAt) : undefined,
      endAt: r.endAt ? dayjs(r.endAt) : undefined,
    })
    setOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload: Record<string, unknown> = {
      title: values.title,
      subtitle: values.subtitle || null,
      externalUrl: values.externalUrl,
      coverUrl: values.coverUrl || null,
      startAt: values.startAt ? values.startAt.toISOString() : null,
      endAt: values.endAt ? values.endAt.toISOString() : null,
      sort: values.sort ?? 0,
      status: values.status || 'published',
    }
    try {
      if (editing) {
        await adminApi.updateEventLink(editing.id, payload)
        message.success('赛事已更新')
      } else {
        await adminApi.createEventLink(payload)
        message.success('赛事已创建')
      }
      setOpen(false)
      refresh()
    } catch {
      // http 拦截器已处理
    }
  }

  const handleDelete = async (id: string) => {
    await adminApi.deleteEventLink(id)
    message.success('已删除')
    refresh()
  }

  const columns: ColumnsType<EventRow> = [
    {
      title: '赛事',
      key: 'title',
      render: (_, r) => (
        <div>
          <a href={r.externalUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 500 }}>
            {r.title}
          </a>
          {r.subtitle && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {r.subtitle}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: '时间',
      key: 'time',
      width: 200,
      render: (_, r) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {r.startAt ? dayjs(r.startAt).format('YYYY-MM-DD') : '-'} ~{' '}
          {r.endAt ? dayjs(r.endAt).format('YYYY-MM-DD') : '-'}
        </Text>
      ),
    },
    { title: '排序', dataIndex: 'sort', key: 'sort', width: 80 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: string) => (
        <Tag color={s === 'published' ? 'success' : s === 'draft' ? 'blue' : 'default'}>
          {s === 'published' ? '已发布' : s === 'draft' ? '草稿' : '已下线'}
        </Tag>
      ),
    },
    {
      title: '报名人数',
      dataIndex: 'registrationCount',
      key: 'registrationCount',
      width: 100,
      render: (value: number, record) => (
        <Button type="link" size="small" icon={<TeamOutlined />} onClick={() => openRegistrations(record)}>
          {value} 人
        </Button>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" onClick={() => openRegistrations(r)}>
            报名
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
            编辑
          </Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
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
          赛事管理
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建赛事
        </Button>
      </div>

      <Table<EventRow>
        rowKey="id"
        columns={columns}
        dataSource={list}
        loading={loading}
        pagination={{ pageSize: 20 }}
        style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}
      />

      <Modal
        title={editing ? '编辑赛事' : '新建赛事'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleSubmit}
        okText={editing ? '保存' : '创建'}
        destroyOnClose
        width={520}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="FITBEST 城市挑战赛" />
          </Form.Item>
          <Form.Item label="副标题" name="subtitle">
            <Input placeholder="可选，一行描述" />
          </Form.Item>
          <Form.Item label="跳转链接" name="externalUrl" rules={[{ required: true, message: '请填写链接' }, { type: 'url', message: '链接格式不正确' }]}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item label="封面图 URL" name="coverUrl">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item label="时间" style={{ marginBottom: 8 }}>
            <Input.Group compact>
              <Form.Item name="startAt" noStyle>
                <DatePicker showTime placeholder="开始时间" style={{ width: 180 }} />
              </Form.Item>
              <div style={{ margin: '0 8px', color: '#bfbfbf' }}>至</div>
              <Form.Item name="endAt" noStyle>
                <DatePicker showTime placeholder="结束时间" style={{ width: 180 }} />
              </Form.Item>
            </Input.Group>
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label="排序" name="sort" initialValue={0} style={{ width: 140 }}>
              <Input type="number" />
            </Form.Item>
            <Form.Item label="状态" name="status" initialValue="published" style={{ flex: 1 }}>
              <Select
                options={[
                  { value: 'published', label: '已发布' },
                  { value: 'draft', label: '草稿' },
                  { value: 'offline', label: '已下线' },
                ]}
              />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        title={regEvent ? `${regEvent.title} · 报名名单` : '报名名单'}
        open={!!regEvent}
        onCancel={() => setRegEvent(null)}
        width={720}
        footer={[
          <Button
            key="export"
            icon={<DownloadOutlined />}
            loading={regExporting}
            onClick={exportRegistrations}
          >
            导出全部报名
          </Button>,
          <Button key="close" onClick={() => setRegEvent(null)}>
            关闭
          </Button>,
        ]}
      >
        <Table<AdminRegistrationRow>
          rowKey="id"
          size="small"
          loading={regLoading}
          dataSource={regRows}
          locale={{ emptyText: '暂无报名' }}
          pagination={{
            current: regPage,
            pageSize: regPageSize,
            total: regTotal,
            showSizeChanger: true,
            showTotal: (value) => `共 ${value} 人`,
            onChange: (nextPage, nextSize) => regEvent && fetchRegistrations(regEvent.id, nextPage, nextSize),
          }}
          columns={[
            {
              title: '用户',
              key: 'user',
              render: (_, row) => (
                <div>
                  <div style={{ fontWeight: 500 }}>{row.user.nickname}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {row.user.id.slice(0, 8)}…
                  </Text>
                </div>
              ),
            },
            {
              title: '报名时间',
              dataIndex: 'createdAt',
              key: 'createdAt',
              width: 180,
              render: (value: string) => <Text type="secondary">{dayjs(value).format('YYYY-MM-DD HH:mm')}</Text>,
            },
            {
              title: '状态',
              dataIndex: 'status',
              key: 'status',
              width: 100,
              render: (value: string) => (
                <Tag color={value === 'registered' ? 'success' : 'default'}>
                  {value === 'registered' ? '已报名' : value}
                </Tag>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  )
}
