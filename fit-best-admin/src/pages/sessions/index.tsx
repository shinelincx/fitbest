import { useEffect, useState } from 'react'
import { Button, DatePicker, Form, Input, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs, { Dayjs } from 'dayjs'
import { adminApi, type AdminSessionRow as SessionRow } from '@/api/admin'
import { exportCsvPages } from '@/utils/exportCsv'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const TYPE_LABEL: Record<string, string> = {
  treadmill: '跑步机',
  rower: '划船机',
  ski: '滑雪机',
  bike: '风阻车',
  sled: '雪橇机',
  rep: '力量训练',
}

interface Filters {
  gymId?: string
  machineId?: string
  range?: [Dayjs, Dayjs]
}

export default function Sessions() {
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [form] = Form.useForm<Filters>()
  const [data, setData] = useState<SessionRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [applied, setApplied] = useState<Filters>({ range: [dayjs().subtract(7, 'day'), dayjs()] })

  const paramsOf = (filters: Filters) => {
    const params: Record<string, string | number> = {}
    if (filters.gymId) params.gymId = filters.gymId
    if (filters.machineId) params.machineId = filters.machineId
    if (filters.range && filters.range.length === 2) {
      params.from = filters.range[0].format('YYYY-MM-DD')
      params.to = filters.range[1].format('YYYY-MM-DD')
    }
    return params
  }

  const fetchList = async (filters: Filters, nextPage = 1, nextSize = pageSize) => {
    setLoading(true)
    try {
      const res = await adminApi.sessions({ ...paramsOf(filters), page: nextPage, pageSize: nextSize })
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
    const initial: Filters = { range: [dayjs().subtract(7, 'day'), dayjs()] }
    fetchList(initial)
    form.setFieldsValue(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportCsvPages(
        message,
        '训练明细',
        ['用户', '器械类型', '器械型号', '序列号', '时长(分钟)', '距离(km)', '千卡', '平均心率', '来源', '开始时间'],
        (page, pageSize) => adminApi.sessions({ ...paramsOf(applied), page, pageSize }),
        (row) => [
          row.userNickname,
          TYPE_LABEL[row.machineType] || row.machineType,
          row.machineModel,
          row.machineSerialNo,
          Math.round(row.durationSec / 60),
          (row.distanceM / 1000).toFixed(2),
          row.calories,
          row.avgHr,
          row.source,
          dayjs(row.startedAt).format('YYYY-MM-DD HH:mm'),
        ],
      )
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnsType<SessionRow> = [
    {
      title: '用户',
      dataIndex: 'userNickname',
      key: 'userNickname',
      width: 120,
      render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span>,
    },
    {
      title: '器械',
      key: 'machine',
      width: 200,
      render: (_, r) => (
        <div>
          <div>
            <Tag color="blue" style={{ margin: 0 }}>
              {TYPE_LABEL[r.machineType] || r.machineType}
            </Tag>
            <span style={{ marginLeft: 6, fontSize: 13 }}>{r.machineModel}</span>
          </div>
          {r.machineSerialNo && <Text type="secondary" style={{ fontSize: 12 }}>{r.machineSerialNo}</Text>}
        </div>
      ),
    },
    {
      title: '时长',
      dataIndex: 'durationSec',
      key: 'durationSec',
      width: 100,
      render: (s: number) => `${Math.round(s / 60)} 分钟`,
    },
    {
      title: '距离',
      dataIndex: 'distanceM',
      key: 'distanceM',
      width: 120,
      render: (m: number) => (m / 1000).toFixed(2) + ' km',
    },
    { title: '千卡', dataIndex: 'calories', key: 'calories', width: 80 },
    {
      title: '心率',
      dataIndex: 'avgHr',
      key: 'avgHr',
      width: 80,
      render: (v: number | null) => (v ? `${v} bpm` : '-'),
    },
    {
      title: '频率/功率',
      key: 'cadence',
      width: 120,
      render: (_, r) => (
        <Text style={{ fontSize: 13 }}>
          {r.cadence ? `${r.cadence} 次/分` : r.power ? `${r.power} W` : '-'}
        </Text>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 80,
      render: (s: string) => (
        <Tag color={s === 'ble' ? 'green' : s === 'sim' ? 'orange' : 'default'}>{s}</Tag>
      ),
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 170,
      render: (t: string) => <Text type="secondary">{dayjs(t).format('YYYY-MM-DD HH:mm')}</Text>,
    },
  ]

  return (
    <div>
      <Title level={4} style={{ marginTop: 0, marginBottom: 20 }}>
        训练明细
      </Title>

      <Form
        form={form}
        layout="inline"
        style={{ marginBottom: 20, background: '#fff', padding: 20, borderRadius: 12 }}
        onFinish={(values) => fetchList(values)}
      >
        <Form.Item name="gymId">
          <Input placeholder="门店 ID" style={{ width: 180 }} allowClear />
        </Form.Item>
        <Form.Item name="machineId">
          <Input placeholder="器械 ID" style={{ width: 180 }} allowClear />
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
              const v: Filters = { range: [dayjs().subtract(7, 'day'), dayjs()] }
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

      <Table<SessionRow>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        scroll={{ x: 1100 }}
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
