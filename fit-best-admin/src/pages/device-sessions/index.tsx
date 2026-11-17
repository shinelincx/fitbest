import { useEffect, useState } from 'react'
import { Button, DatePicker, Form, Input, Select, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs, { Dayjs } from 'dayjs'
import { adminApi, type AdminDeviceSessionRow } from '@/api/admin'
import { exportCsvPages } from '@/utils/exportCsv'
import { useBrand } from '@/hooks/useBrand'
import { BRAND_META } from '@/utils/brand'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

const APP_META: Record<string, { label: string; color: string }> = {
  hyrox: { label: 'HYROX', color: '#F01808' },
  btwe: { label: 'BTWE', color: '#18a957' },
}

const MODE_META: Record<string, { label: string; color: string }> = {
  training: { label: '训练', color: 'blue' },
  race: { label: '比赛', color: 'purple' },
}

const QUALITY_META: Record<string, { label: string; color: string }> = {
  ok: { label: '正常', color: 'green' },
  partial: { label: '不完整', color: 'orange' },
  invalid: { label: '无效', color: 'red' },
}

interface Filters {
  mode?: string
  deviceSerial?: string
  range?: [Dayjs, Dayjs]
}

export default function DeviceSessions() {
  const { app, brand } = useBrand()
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [form] = Form.useForm<Filters>()
  const [data, setData] = useState<AdminDeviceSessionRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [applied, setApplied] = useState<Filters>({ range: [dayjs().subtract(14, 'day'), dayjs()] })

  const paramsOf = (filters: Filters) => {
    const params: Record<string, string | number> = { ...(app ? { app } : {}) }
    if (filters.mode) params.mode = filters.mode
    if (filters.deviceSerial) params.deviceSerial = filters.deviceSerial
    if (filters.range && filters.range.length === 2) {
      params.from = filters.range[0].format('YYYY-MM-DD')
      params.to = filters.range[1].format('YYYY-MM-DD')
    }
    return params
  }

  const fetchList = async (filters: Filters, nextPage = 1, nextSize = pageSize) => {
    setLoading(true)
    try {
      const res = await adminApi.deviceSessions({ ...paramsOf(filters), page: nextPage, pageSize: nextSize })
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
    fetchList(applied, 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app])

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportCsvPages(
        message,
        '手环器械会话',
        ['用户', '手环序列号', '品牌', '模式', '质量', '场次 ID', '用时(分钟)', '跑量(km)', '平均心率', '最大心率', '分段数', '关联训练记录', '开始时间'],
        (page, pageSize) => adminApi.deviceSessions({ ...paramsOf(applied), page, pageSize }),
        (row) => [
          row.userNickname,
          row.deviceSerialNo,
          APP_META[row.app]?.label || row.app,
          MODE_META[row.mode]?.label || row.mode,
          QUALITY_META[row.quality]?.label || row.quality,
          row.clientSessionId,
          Math.round(row.durationSec / 60),
          (row.distanceM / 1000).toFixed(2),
          row.avgHr ?? '',
          row.maxHr ?? '',
          row.segmentCount,
          row.trainingRecordId ? '是' : '否',
          dayjs(row.startedAt).format('YYYY-MM-DD HH:mm'),
        ],
      )
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnsType<AdminDeviceSessionRow> = [
    {
      title: '用户',
      dataIndex: 'userNickname',
      key: 'userNickname',
      width: 120,
      render: (t: string) => <span style={{ fontWeight: 500 }}>{t}</span>,
    },
    {
      title: '手环',
      key: 'device',
      width: 200,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{r.deviceSerialNo}</div>
          {r.deviceLabel && <Text type="secondary" style={{ fontSize: 12 }}>{r.deviceLabel}</Text>}
        </div>
      ),
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
      title: '模式',
      dataIndex: 'mode',
      key: 'mode',
      width: 80,
      render: (v: string) => (
        <Tag color={MODE_META[v]?.color || 'default'} style={{ margin: 0 }}>
          {MODE_META[v]?.label || v}
        </Tag>
      ),
    },
    {
      title: '质量',
      dataIndex: 'quality',
      key: 'quality',
      width: 80,
      render: (v: string) => (
        <Tag color={QUALITY_META[v]?.color || 'default'} style={{ margin: 0 }}>
          {QUALITY_META[v]?.label || v}
        </Tag>
      ),
    },
    {
      title: '时长',
      dataIndex: 'durationSec',
      key: 'durationSec',
      width: 90,
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
      title: '分段',
      dataIndex: 'segmentCount',
      key: 'segmentCount',
      width: 70,
    },
    {
      title: '平均心率',
      dataIndex: 'avgHr',
      key: 'avgHr',
      width: 90,
      render: (v: number | null) => (v ? `${v} bpm` : '-'),
    },
    {
      title: '结束原因',
      dataIndex: 'closeReason',
      key: 'closeReason',
      width: 100,
      render: (v: string | null) => v || '-',
    },
    {
      title: '关联训练记录',
      dataIndex: 'trainingRecordId',
      key: 'trainingRecordId',
      width: 110,
      render: (v: string | null) =>
        v ? (
          <Tag color="cyan" style={{ margin: 0 }}>已关联</Tag>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>未关联</Text>
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
      <Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
        手环 / 器械会话
      </Title>
      <Text type="secondary" style={{ fontSize: 13, marginBottom: 20, display: 'block' }}>
        {brand === 'all' ? '跨品牌汇总。比赛（race）数据只存会话、不进训练记录与教练 digest。' : `${BRAND_META[brand].label} 专属手环会话。`}
      </Text>

      <Form
        form={form}
        layout="inline"
        initialValues={applied}
        style={{ marginBottom: 20, background: '#fff', padding: 20, borderRadius: 12 }}
        onFinish={(values) => fetchList(values)}
      >
        <Form.Item name="deviceSerial">
          <Input placeholder="手环序列号" style={{ width: 200 }} allowClear />
        </Form.Item>
        <Form.Item name="mode">
          <Select
            placeholder="模式"
            style={{ width: 140 }}
            allowClear
            options={[
              { value: 'training', label: '训练' },
              { value: 'race', label: '比赛' },
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
              const v: Filters = { range: [dayjs().subtract(14, 'day'), dayjs()] }
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

      <Table<AdminDeviceSessionRow>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        scroll={{ x: 1300 }}
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
