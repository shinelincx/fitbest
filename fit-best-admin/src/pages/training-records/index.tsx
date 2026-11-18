import { useEffect, useState } from 'react'
import { Button, DatePicker, Form, Input, Select, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs, { Dayjs } from 'dayjs'
import { adminApi, type AdminTrainingRecordRow } from '@/api/admin'
import { exportCsvPages } from '@/utils/exportCsv'
import { useBrand } from '@/hooks/useBrand'
import { BRAND_META, type BrandFilter } from '@/utils/brand'

const STORAGE_KEY = 'fitbest-admin:brand-filter'

function setGlobalBrand(b: BrandFilter) {
  try {
    localStorage.setItem(STORAGE_KEY, b)
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent('brand-filter-change', { detail: b }))
}

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const APP_META: Record<string, { label: string; color: string }> = {
  hyrox: { label: 'HYROX', color: '#F01808' },
  btwe: { label: 'BTWE', color: '#18a957' },
}

interface Filters {
  brand?: BrandFilter
  userId?: string
  completed?: string
  range?: [Dayjs, Dayjs]
}

export default function TrainingRecords() {
  const { brand } = useBrand()
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [form] = Form.useForm<Filters>()
  const [data, setData] = useState<AdminTrainingRecordRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [applied, setApplied] = useState<Filters>({ brand: 'all', range: [dayjs().subtract(14, 'day'), dayjs()] })

  const paramsOf = (filters: Filters) => {
    const params: Record<string, string | number> = {}
    const effective = filters.brand ?? brand
    if (effective !== 'all') params.app = effective
    if (filters.userId) params.userId = filters.userId
    if (filters.completed) params.completed = filters.completed
    if (filters.range && filters.range.length === 2) {
      params.from = filters.range[0].format('YYYY-MM-DD')
      params.to = filters.range[1].format('YYYY-MM-DD')
    }
    return params
  }

  const fetchList = async (filters: Filters, nextPage = 1, nextSize = pageSize) => {
    setLoading(true)
    try {
      const res = await adminApi.trainingRecords({ ...paramsOf(filters), page: nextPage, pageSize: nextSize })
      setData(res.items)
      setTotal(res.total)
      setPage(res.page)
      setPageSize(res.pageSize)
      setApplied(filters)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // 全局品牌变化时同步到表单并重新拉数
    form.setFieldsValue({ brand })
    const next: Filters = { ...applied, brand }
    fetchList(next, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand])

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportCsvPages(
        message,
        '品牌训练记录',
        ['用户', '品牌', '是否完成', '用时(分钟)', '距离(km)', '平均心率', '最大心率', 'RPE', '短板站点', '开始时间', '创建时间'],
        (page, pageSize) => adminApi.trainingRecords({ ...paramsOf(applied), page, pageSize }),
        (row) => [
          row.userNickname,
          APP_META[row.app]?.label || row.app,
          row.completed ? '是' : '否',
          Math.round(row.totalTimeSec / 60),
          (row.distanceM / 1000).toFixed(2),
          row.avgHr ?? '',
          row.maxHr ?? '',
          row.rpe ?? '',
          row.weakestStation ?? '',
          row.startedAt ? dayjs(row.startedAt).format('YYYY-MM-DD HH:mm') : '',
          dayjs(row.createdAt).format('YYYY-MM-DD HH:mm'),
        ],
      )
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnsType<AdminTrainingRecordRow> = [
    {
      title: '用户',
      dataIndex: 'userNickname',
      key: 'userNickname',
      width: 120,
      render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span>,
    },
    {
      title: '品牌',
      dataIndex: 'app',
      key: 'app',
      width: 90,
      render: (v: string) => (
        <Tag color={APP_META[v]?.color || 'default'} style={{ margin: 0 }}>
          {APP_META[v]?.label || v}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'completed',
      key: 'completed',
      width: 80,
      render: (v: boolean) =>
        v ? <Tag color="green" style={{ margin: 0 }}>已完成</Tag> : <Tag style={{ margin: 0 }}>进行中</Tag>,
    },
    {
      title: '总用时',
      dataIndex: 'totalTimeSec',
      key: 'totalTimeSec',
      width: 100,
      render: (s: number) => `${Math.round(s / 60)} 分钟`,
    },
    {
      title: '跑量',
      dataIndex: 'distanceM',
      key: 'distanceM',
      width: 100,
      render: (m: number) => (m / 1000).toFixed(2) + ' km',
    },
    {
      title: '配速',
      key: 'runSplits',
      width: 120,
      render: (_, r) => {
        const splits = Array.isArray(r.runSplits) ? (r.runSplits as number[]) : []
        if (!splits.length) return <Text type="secondary">-</Text>
        const avg = Math.round(splits.reduce((a, b) => a + b, 0) / splits.length)
        const m = Math.floor(avg / 60)
        const s = avg % 60
        return <Text style={{ fontWeight: 500 }}>{m}'{String(s).padStart(2, '0')}"/km · {splits.length}段</Text>
      },
    },
    {
      title: '平均心率',
      dataIndex: 'avgHr',
      key: 'avgHr',
      width: 90,
      render: (v: number | null) => (v ? `${v} bpm` : '-'),
    },
    {
      title: '最大心率',
      dataIndex: 'maxHr',
      key: 'maxHr',
      width: 90,
      render: (v: number | null) => (v ? `${v} bpm` : '-'),
    },
    { title: 'RPE', dataIndex: 'rpe', key: 'rpe', width: 60, render: (v: number | null) => v ?? '-' },
    {
      title: '短板',
      dataIndex: 'weakestStation',
      key: 'weakestStation',
      width: 120,
      render: (v: string | null) => v || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t: string) => <Text type="secondary">{dayjs(t).format('YYYY-MM-DD HH:mm')}</Text>,
    },
  ]

  return (
    <div>
      <Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
        品牌训练记录
      </Title>
      <Text type="secondary" style={{ fontSize: 13, marginBottom: 20, display: 'block' }}>
        {brand === 'all' ? '跨品牌汇总的训练记录' : `${BRAND_META[brand].label} 专属训练记录`}
      </Text>

      <Form
        form={form}
        layout="inline"
        initialValues={applied}
        style={{ marginBottom: 20, background: '#fff', padding: 20, borderRadius: 12 }}
        onFinish={(values) => fetchList(values)}
      >
        <Form.Item name="brand" label="品牌">
          <Select
            placeholder="全部品牌"
            style={{ width: 130 }}
            onChange={(v: BrandFilter) => setGlobalBrand(v)}
            options={[
              { value: 'all', label: '全部品牌' },
              { value: 'hyrox', label: 'HYROX' },
              { value: 'btwe', label: 'BTWE' },
            ]}
          />
        </Form.Item>
        <Form.Item name="userId">
          <Input placeholder="用户 ID" style={{ width: 180 }} allowClear />
        </Form.Item>
        <Form.Item name="completed">
          <Select
            placeholder="完成状态"
            style={{ width: 140 }}
            allowClear
            options={[
              { value: 'true', label: '已完成' },
              { value: 'false', label: '未完成' },
            ]}
          />
        </Form.Item>
        <Form.Item name="range" label="时间范围">
          <RangePicker />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
            查询
          </Button>
          <Button
            icon={<ReloadOutlined />}
            style={{ marginLeft: 8 }}
            onClick={() => {
              const v: Filters = { brand: 'all', range: [dayjs().subtract(14, 'day'), dayjs()] }
              setGlobalBrand('all')
              form.setFieldsValue(v)
              fetchList(v)
            }}
          >
            重置
          </Button>
          <Button icon={<DownloadOutlined />} loading={exporting} style={{ marginLeft: 8 }} onClick={handleExport}>
            导出筛选结果
          </Button>
        </Form.Item>
      </Form>

      <Table<AdminTrainingRecordRow>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (value) => `共 ${value} 条`,
          onChange: (nextPage, nextSize) => fetchList(applied, nextPage, nextSize),
        }}
        style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}
      />
    </div>
  )
}
