import { useEffect, useState } from 'react'
import { Avatar, Button, Descriptions, Space, Spin, Table, Tabs, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate, useParams } from 'react-router-dom'
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
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    adminApi
      .userDetail(id)
      .then(setDetail)
      .finally(() => setLoading(false))
  }, [id])

  if (loading)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )

  if (!detail) return <Text type="secondary">用户不存在</Text>

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
          <Tag color="blue">{r.machineType}</Tag>
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
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/users')} style={{ marginBottom: 12 }}>
        返回用户列表
      </Button>

      <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <Space size={16} align="start">
          <Avatar size={64} src={detail.avatar || undefined}>
            {detail.nickname?.[0]}
          </Avatar>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              {detail.nickname}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              ID: {detail.id}
            </Text>
          </div>
        </Space>

        <Descriptions size="small" column={3} style={{ marginTop: 20 }}>
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
          <Descriptions.Item label="绑定方式" span={3}>
            {detail.identities.length === 0 ? (
              <Text type="secondary">-</Text>
            ) : (
              <Space size={4} wrap>
                {detail.identities.map((identity) => (
                  <Tag key={identity.type}>
                    {identity.type}: {identity.identifier}
                  </Tag>
                ))}
              </Space>
            )}
          </Descriptions.Item>
        </Descriptions>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, padding: '0 24px 24px' }}>
        <Tabs
          defaultActiveKey="training"
          items={[
            {
              key: 'training',
              label: `训练记录 (${detail.trainingRecords.length})`,
              children: (
                <Table<AdminTrainingRecordRow>
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
              label: `赛事报名 (${detail.registrations.length})`,
              children: (
                <Table
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
              label: `器械训练 (${detail.sessions.length})`,
              children: (
                <Table
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
