import { useEffect, useState } from 'react'
import { Button, Input, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { adminApi, type AdminUserRow } from '@/api/admin'
import { exportCsvPages } from '@/utils/exportCsv'
import { useBrand } from '@/hooks/useBrand'

const { Title, Text } = Typography

const identityColors: Record<string, string> = {
  phone: 'blue',
  email: 'green',
  wechat: 'default',
}

export default function Users() {
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [data, setData] = useState<AdminUserRow[]>([])

  const fetchList = (nextPage = page, nextSize = pageSize, nextKeyword = appliedKeyword) => {
    setLoading(true)
    adminApi
      .users(nextKeyword.trim() || undefined, undefined, nextPage, nextSize)
      .then((res) => {
        setData(res.items)
        setTotal(res.total)
        setPage(res.page)
        setPageSize(res.pageSize)
        setAppliedKeyword(nextKeyword.trim())
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList(1, pageSize, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportCsvPages(
        message,
        '用户列表',
        ['用户 ID', '昵称', '状态', '绑定方式', '每周训练次数', '每周训练分钟', '注册时间'],
        (page, pageSize) => adminApi.users(appliedKeyword || undefined, undefined, page, pageSize),
        (user) => [
          user.id,
          user.nickname,
          user.status === 'active' ? '正常' : user.status,
          user.identities.map((it) => `${it.type}:${it.identifier}`).join(' / '),
          user.goals.weeklySessions,
          user.goals.weeklyMinutes,
          new Date(user.createdAt).toLocaleString('zh-CN'),
        ],
      )
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnsType<AdminUserRow> = [
    {
      title: '用户',
      dataIndex: 'nickname',
      key: 'nickname',
      render: (text: string, record) => (
        <div>
          <Link to={`/users/${record.id}`} style={{ fontWeight: 500 }}>
            {text}
          </Link>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              ID: {record.id.slice(0, 8)}…
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: '绑定方式',
      dataIndex: 'identities',
      key: 'identities',
      render: (identities: AdminUserRow['identities']) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {identities.map((it) => (
            <Tag key={it.type} color={identityColors[it.type] || 'default'} style={{ margin: 0 }}>
              {it.type === 'phone' ? '📱' : it.type === 'email' ? '✉️' : '💬'} {it.identifier}
            </Tag>
          ))}
        </div>
      ),
    },
    {
      title: '本周目标',
      key: 'goals',
      dataIndex: 'goals',
      render: (goals: AdminUserRow['goals']) => (
        <Text style={{ fontSize: 13 }}>
          {goals.weeklySessions} 次 / {goals.weeklyMinutes} 分钟
        </Text>
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => <Text type="secondary">{new Date(text).toLocaleString('zh-CN')}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => (
        <Tag color={status === 'active' ? 'success' : 'default'}>{status === 'active' ? '正常' : status}</Tag>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 20, gap: 12 }}>
        <Title level={4} style={{ margin: 0 }}>
          用户管理
        </Title>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minWidth: 0 }}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="搜索昵称 / 手机号 / 邮箱"
            style={{ width: 300, maxWidth: '100%' }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => fetchList(1, pageSize, keyword)}
          />
          <Button onClick={() => fetchList(1, pageSize, keyword)}>搜索</Button>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
            导出筛选结果
          </Button>
        </div>
      </div>

      <Table<AdminUserRow>
        rowKey="id"
        scroll={{ x: 760 }}
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (value) => `共 ${value} 条`,
          onChange: (nextPage, nextSize) => fetchList(nextPage, nextSize),
        }}
        style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}
      />
    </div>
  )
}
