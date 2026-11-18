import { useEffect, useState } from 'react'
import { Button, Descriptions, Form, Input, Select, Space, Table, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DownloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { adminApi, type AuditFilters } from '@/api/admin'
import { exportCsvPages } from '@/utils/exportCsv'

const { Title, Text } = Typography

interface AuditRow {
  id: string
  adminId: string | null
  orgId: string | null
  gymId: string | null
  action: string
  targetType: string | null
  targetId: string | null
  payload: unknown
  ip: string | null
  createdAt: string
}

export default function Audit() {
  const [list, setList] = useState<AuditRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [filters, setFilters] = useState<AuditFilters>({})
  const [filterForm] = Form.useForm<AuditFilters>()

  const fetchList = (nextPage = 1, nextSize = pageSize, applied = filters) => {
    setLoading(true)
    adminApi
      .auditLogs(nextPage, nextSize, applied)
      .then((res) => {
        setList(res.items)
        setTotal(res.total)
        setPage(res.page)
        setPageSize(res.pageSize)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList(1, pageSize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportCsvPages(
        message,
        '审计日志',
        ['时间', '操作', '管理员 ID', '组织 ID', '门店 ID', '目标类型', '目标 ID', 'IP', 'Payload'],
        (page, pageSize) => adminApi.auditLogs(page, pageSize, filters),
        (row) => [
          dayjs(row.createdAt).format('YYYY-MM-DD HH:mm:ss'),
          row.action,
          row.adminId,
          row.orgId,
          row.gymId,
          row.targetType,
          row.targetId,
          row.ip,
          JSON.stringify(row.payload ?? {}),
        ],
      )
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnsType<AuditRow> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (t: string) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 13 }}>{dayjs(t).format('YYYY-MM-DD HH:mm:ss')}</Text>
      ),
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 180,
      render: (a: string) => (
        <Text style={{ fontSize: 13 }}>
          {a.split(' ')[0] ? <span style={{ fontWeight: 600 }}>{a.split(' ')[0]}</span> : null}
          <span style={{ color: '#8c8c8c', marginLeft: 6 }}>{a.split(' ').slice(1).join(' ')}</span>
        </Text>
      ),
    },
    {
      title: '管理员',
      dataIndex: 'adminId',
      key: 'adminId',
      width: 120,
      render: (t: string | null) => (t ? <Text code>{t.slice(0, 8)}…</Text> : '-'),
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      key: 'ip',
      width: 130,
      render: (t: string | null) => (t ? <Text style={{ fontFamily: 'monospace', fontSize: 13 }}>{t}</Text> : '-'),
    },
    {
      title: '详情',
      key: 'payload',
      render: (_, r) => (
        <Text ellipsis style={{ fontSize: 12, color: '#8c8c8c' }}>
          {JSON.stringify(r.payload || {}).slice(0, 120)}
        </Text>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>
          审计日志
        </Title>
        <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
          导出查询结果
        </Button>
      </div>

      <Form form={filterForm} layout="inline" style={{ marginBottom: 16, rowGap: 8 }}
        onFinish={values => {
          const applied = Object.fromEntries(Object.entries(values).filter(([, value]) => value?.trim()))
          setFilters(applied)
          fetchList(1, pageSize, applied)
        }}>
        <Form.Item name="adminId" label="操作者"><Input placeholder="管理员 ID" /></Form.Item>
        <Form.Item name="orgId" label="目标组织"><Input placeholder="组织 ID" /></Form.Item>
        <Form.Item name="action" label="操作">
          <Select allowClear placeholder="选择操作" style={{ width: 140 }} options={[
            ['account.create', '新建账号'], ['account.update', '编辑账号'], ['account.reset-password', '重置密码'],
            ['account.set-status', '账号状态'], ['account.revoke-sessions', '撤销会话'],
            ['account.setup-password', '账号设密'], ['account.change-password', '本人改密'],
            ['organization.create', '新建组织'], ['organization.update', '编辑组织'],
            ['dictionary.update', '更新字典'], ['settings.update', '更新设置'],
            ['website.save-draft', '保存官网草稿'], ['website.publish', '发布官网'], ['website.restore', '恢复官网版本'],
          ].map(([value, label]) => ({ value, label }))} />
        </Form.Item>
        <Form.Item name="from" label="起始日期 (UTC)"><Input type="date" /></Form.Item>
        <Form.Item name="to" label="结束日期 (UTC)"><Input type="date" /></Form.Item>
        <Form.Item><Space>
          <Button type="primary" htmlType="submit">查询</Button>
          <Button onClick={() => { filterForm.resetFields(); setFilters({}); fetchList(1, pageSize, {}) }}>清空</Button>
        </Space></Form.Item>
      </Form>
      <Table<AuditRow>
        rowKey="id"
        columns={columns}
        dataSource={list}
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
        expandable={{
          expandedRowRender: (r) => (
            <Descriptions size="small" column={2} bordered style={{ background: '#fafafa' }}>
              <Descriptions.Item label="管理员 ID">
                {r.adminId ? <Text code>{r.adminId}</Text> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="组织 ID">
                {r.orgId ? <Text code>{r.orgId}</Text> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="门店 ID">
                {r.gymId ? <Text code>{r.gymId}</Text> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="目标">
                {r.targetType || '-'} {r.targetId ? <Text code>{r.targetId}</Text> : null}
              </Descriptions.Item>
              <Descriptions.Item label="IP 地址">{r.ip || '-'}</Descriptions.Item>
              <Descriptions.Item label="时间">{dayjs(r.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
              <Descriptions.Item label="Payload" span={2}>
                <pre style={{ margin: 0, fontSize: 12, maxHeight: 200, overflow: 'auto', background: '#0f1115', color: '#FF5B4D', padding: 12, borderRadius: 6 }}>
                  {JSON.stringify(r.payload || {}, null, 2)}
                </pre>
              </Descriptions.Item>
            </Descriptions>
          ),
        }}
      />
    </div>
  )
}
