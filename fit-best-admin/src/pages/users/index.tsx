import { useEffect, useState } from 'react'
import { Avatar, Button, Input, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Link, useSearchParams } from 'react-router-dom'
import { adminApi, type AdminUserRow } from '@/api/admin'
import { exportCsvPages } from '@/utils/exportCsv'
import { identityLabel } from './identityLabel'
import { useBrand } from '@/hooks/useBrand'

const { Title, Text } = Typography

export default function Users() {
  const { app, brand } = useBrand()
  const [params, setParams] = useSearchParams()
  const appliedKeyword = params.get('q') || ''
  const [keyword, setKeyword] = useState(appliedKeyword)
  const page = params.get('brand') === brand ? Math.max(1, Number(params.get('page')) || 1) : 1
  const pageSize = Number(params.get('size')) || 20
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [total, setTotal] = useState(0)
  const [data, setData] = useState<AdminUserRow[]>([])
  const detailLink = (id: string) => ({ pathname: '/users/' + id, search: params.toString() })

  function search(nextPage: number, size: number, term: string) {
    const query = new URLSearchParams({ page: String(nextPage), size: String(size), brand })
    if (term.trim()) query.set('q', term.trim())
    setParams(query)
  }

  useEffect(() => { setKeyword(appliedKeyword) }, [appliedKeyword])
  useEffect(() => {
    let current = true
    setLoading(true)
    adminApi.users(appliedKeyword || undefined, app, page, pageSize)
      .then(res => { if (current) { setData(res.items); setTotal(res.total) } })
      .catch(() => { if (current) { setData([]); setTotal(0) } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [appliedKeyword, app, page, pageSize])

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportCsvPages(
        message,
        '用户列表',
        ['用户 ID', '昵称', '状态', '绑定方式', '每周训练次数', '每周训练分钟', '注册时间'],
        (page, pageSize) => adminApi.users(appliedKeyword || undefined, app, page, pageSize),
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
      render: (name: string, row) => <Space>
        <Avatar src={row.avatar}>{name?.[0]}</Avatar>
        <Link to={detailLink(row.id)}>{name || '未设置昵称'}</Link>
      </Space>,
    },
    {
      title: '绑定账号',
      render: (_, row) => row.identities.length ? <Space orientation="vertical" size={0}>
        {row.identities.map(it => <span key={it.type + it.identifier}>{identityLabel(it.type)} · {it.identifier}</span>)}
      </Space> : '暂无绑定',
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
    { title: '操作', key: 'detail', render: (_, row) => <Link to={detailLink(row.id)}>查看明细</Link> },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 20, gap: 12 }}>
        <Title level={4} style={{ margin: 0 }}>
          用户管理
        </Title>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, minWidth: 0 }}>
          <Input
            aria-label="搜索训练用户"
            allowClear
            onClear={() => search(1, pageSize, '')}
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="搜索昵称 / 手机号 / 邮箱"
            style={{ width: 300, maxWidth: '100%' }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => search(1, pageSize, keyword)}
          />
          <Button onClick={() => search(1, pageSize, keyword)}>搜索</Button>
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
          onChange: (nextPage, nextSize) => search(nextSize === pageSize ? nextPage : 1, nextSize, appliedKeyword),
        }}
        style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}
      />
    </div>
  )
}
