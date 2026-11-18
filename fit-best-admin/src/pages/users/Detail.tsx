import { useEffect, useState } from 'react'
import { Avatar, Button, Card, Descriptions, Result, Space, Spin, Table, Tabs, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useBrand } from '@/hooks/useBrand'
import { useMachineTypes } from '@/hooks/useMachineTypes'
import { identityLabel } from './identityLabel'
import { adminApi, type AdminTrainingRecordRow, type AdminUserDetail } from '@/api/admin'

const { Title, Text } = Typography

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m} 分 ${s.toString().padStart(2, '0')} 秒`
}

export default function UserDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const back = () => navigate({ pathname: '/users', search: location.search })
  const { app } = useBrand()
  const { labels } = useMachineTypes()
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)

  useEffect(() => {
    if (!id) return
    let current = true
    setLoading(true)
    setDetail(null)
    adminApi
      .userDetail(id, app)
      .then(data => { if (current) setDetail(data) })
      .catch(() => { /* 请求错误已提示 */ })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [id, app])

  if (loading)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )

  if (!detail) return <Result title="无法查看该用户" extra={<Button onClick={back}>返回用户列表</Button>} />

  const trainingColumns: ColumnsType<AdminTrainingRecordRow> = [
    {
      title: '训练时间',
      key: 'time',
      width: 170,
      render: (_, r) => (
        <Text type="secondary">{dayjs(r.startedAt || r.createdAt).format('YYYY-MM-DD HH:mm')}</Text>
      ),
    },
    {
      title: '来源',
      dataIndex: 'app',
      key: 'app',
      width: 90,
      render: (app: string) => <Tag color="blue">{app.toUpperCase()}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'completed',
      key: 'completed',
      width: 90,
      render: (completed: boolean) => (
        <Tag color={completed ? 'success' : 'warning'}>{completed ? '已完成' : '未完成'}</Tag>
      ),
    },
    {
      title: '用时',
      dataIndex: 'totalTimeSec',
      key: 'totalTimeSec',
      width: 120,
      render: (value: number) => formatDuration(value),
    },
    {
      title: '距离',
      dataIndex: 'distanceM',
      key: 'distanceM',
      width: 90,
      render: (value: number) => (value ? `${(value / 1000).toFixed(2)} km` : '-'),
    },
    { title: 'RPE', dataIndex: 'rpe', key: 'rpe', width: 70, render: (value: number | null) => value ?? '-' },
    {
      title: '最弱站点',
      dataIndex: 'weakestStation',
      key: 'weakestStation',
      render: (value: string | null) => value || <Text type="secondary">-</Text>,
    },
  ]

  const registrationColumns: ColumnsType<AdminUserDetail['registrations'][number]> = [
    {
      title: '赛事',
      key: 'event',
      render: (_, r) => <span style={{ fontWeight: 500 }}>{r.event.title}</span>,
    },
    {
      title: '比赛时间',
      key: 'startAt',
      width: 160,
      render: (_, r) => (r.event.startAt ? dayjs(r.event.startAt).format('YYYY-MM-DD') : '-'),
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
      render: (value: string) => <Tag color={value === 'registered' ? 'success' : 'default'}>{value}</Tag>,
    },
  ]

  const sessionColumns: ColumnsType<AdminUserDetail['sessions'][number]> = [
    {
      title: '器械',
      key: 'machine',
      render: (_, r) => (
        <Space size={6}>
          <Tag color="blue">{labels[r.machineType] || r.machineType}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.machineSerialNo || '-'}
          </Text>
        </Space>
      ),
    },
    { title: '时长', dataIndex: 'durationSec', key: 'durationSec', width: 110, render: (v: number) => `${Math.round(v / 60)} 分钟` },
    {
      title: '距离',
      dataIndex: 'distanceM',
      key: 'distanceM',
      width: 100,
      render: (v: number) => (v ? `${(v / 1000).toFixed(2)} km` : '-'),
    },
    { title: '千卡', dataIndex: 'calories', key: 'calories', width: 90 },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 170,
      render: (v: string) => <Text type="secondary">{dayjs(v).format('YYYY-MM-DD HH:mm')}</Text>,
    },
  ]

  return (
    <div>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={back} style={{ marginBottom: 12 }}>
        返回用户列表
      </Button>

      <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <Space size={16} align="start">
          <Avatar size={64} src={detail.avatar || undefined}>
            {detail.nickname?.[0]}
          </Avatar>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              {detail.nickname || '未设置昵称'}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              用户 ID · {detail.id}
            </Text>
          </div>
        </Space>

        <Descriptions title="账号资料" size="small" column={{ xs: 1, md: 3 }} style={{ marginTop: 20 }}>
          <Descriptions.Item label="状态">
            <Tag color={detail.status === 'active' ? 'success' : 'default'}>
              {detail.status === 'active' ? '正常' : detail.status}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="注册时间">
            {dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label="本周目标">
            {detail.goals.weeklySessions} 次 / {detail.goals.weeklyMinutes} 分钟
          </Descriptions.Item>
        </Descriptions>
      </div>

      <Card title="绑定账号" style={{ marginBottom: 20 }}>
        <Table rowKey={row => row.type + row.identifier} dataSource={detail.identities} size="small"
          pagination={false} locale={{ emptyText: '暂无绑定账号' }} columns={[
            { title: '绑定方式', dataIndex: 'type', render: identityLabel },
            { title: '账号', dataIndex: 'identifier' },
            { title: '验证时间', dataIndex: 'verifiedAt', render: time => time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '暂无验证记录' },
          ]} />
      </Card>

      <div style={{ background: '#fff', borderRadius: 12, padding: '0 24px 24px' }}>
        <Tabs
          defaultActiveKey="training"
          items={[
            {
              key: 'training',
              label: app ? app.toUpperCase() + ' 品牌训练（最近 20 条）' : '品牌训练（最近 20 条）',
              children: (
                <Table<AdminTrainingRecordRow>
                  scroll={{ x: 620 }}
                  rowKey="id"
                  columns={trainingColumns}
                  dataSource={detail.trainingRecords}
                  pagination={{ pageSize: 10, hideOnSinglePage: true }}
                  locale={{ emptyText: '暂无训练记录' }}
                />
              ),
            },
            {
              key: 'registrations',
              label: '赛事报名（最近 20 条）',
              children: (
                <Table
                  scroll={{ x: 620 }}
                  rowKey="id"
                  columns={registrationColumns}
                  dataSource={detail.registrations}
                  pagination={false}
                  locale={{ emptyText: '暂无报名记录' }}
                />
              ),
            },
            {
              key: 'sessions',
              label: '器械训练（最近 10 条）',
              children: (
                <Table
                  scroll={{ x: 620 }}
                  rowKey="id"
                  columns={sessionColumns}
                  dataSource={detail.sessions}
                  pagination={false}
                  locale={{ emptyText: '暂无器械训练' }}
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
