import { useEffect, useState } from 'react'
import { useMachineTypes } from '@/hooks/useMachineTypes'
import { Card, Col, Row, Statistic, Spin, Empty, Typography } from 'antd'
import {
  UserOutlined,
  ThunderboltOutlined,
  RiseOutlined,
  AppstoreOutlined,
  ShopOutlined,
  TrophyOutlined,
  HeartOutlined,
  FireOutlined,
} from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { adminApi, type AdminOverview } from '@/api/admin'
import { useBrand } from '@/hooks/useBrand'
import { BRAND_META } from '@/utils/brand'

const { Title, Text } = Typography

const TYPE_COLORS: Record<string, string> = {
  treadmill: '#F01808',
  rower: '#4a9eff',
  ski: '#9b7bff',
  bike: '#ff8c42',
  sled: '#ff5c7a',
  rep: '#f5c542',
}

function KpiCard({
  title,
  value,
  icon,
  accent,
  suffix,
}: {
  title: string
  value: number | string | null
  icon: React.ReactNode
  accent: string
  suffix?: React.ReactNode
}) {
  const display = value === null || value === undefined ? '—' : value
  return (
    <Card
      bordered={false}
      style={{
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
      bodyStyle={{ padding: '20px 24px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {title}
          </Text>
          <div style={{ marginTop: 6, fontSize: 28, fontWeight: 700, color: '#1f1f1f' }}>
            {display}
            {suffix && <span style={{ fontSize: 14, marginLeft: 6, fontWeight: 500, color: '#8c8c8c' }}>{suffix}</span>}
          </div>
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 11,
            background: `${accent}1a`,
            color: accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
          }}
        >
          {icon}
        </div>
      </div>
    </Card>
  )
}

function formatDuration(sec: number | null | undefined): string {
  if (!sec) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h) return `${h}h ${m}m`
  return `${m}m`
}

function formatDistance(m: number | null | undefined): string {
  if (!m) return '—'
  return `${(m / 1000).toFixed(1)} km`
}

export default function Dashboard() {
  const { labels: machineTypeLabels } = useMachineTypes()
  const { app, brand } = useBrand()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AdminOverview | null>(null)

  useEffect(() => {
    setLoading(true)
    adminApi
      .overview(app)
      .then(setData)
      .finally(() => setLoading(false))
  }, [app])

  if (loading)
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )

  if (!data) return <Empty description="暂无数据" />

  const pieOption = {
    tooltip: { trigger: 'item', formatter: '{b}: {c} 次 ({d}%)' },
    legend: { orient: 'vertical', right: 0, top: 'middle', itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 12 } },
    series: [
      {
        type: 'pie',
        radius: ['45%', '72%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data: data.byType.map((item) => ({
          name: machineTypeLabels[item.type] || item.type,
          value: item.sessions,
          itemStyle: { color: TYPE_COLORS[item.type] || '#999' },
        })),
      },
    ],
  }

  const activeMeta = BRAND_META[brand]
  const scopeText =
    brand === 'all' ? '全品牌汇总' : `${activeMeta.label} · 专属训练`

  return (
    <div>
      <Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
        概览
      </Title>
      <Text type="secondary" style={{ fontSize: 13, marginBottom: 20, display: 'block' }}>
        {scopeText}
      </Text>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard title="活跃用户" value={data.users} icon={<UserOutlined />} accent="#4a9eff" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard title="今日器械训练" value={data.sessionsToday} icon={<ThunderboltOutlined />} accent="#F01808" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard title="本周器械训练" value={data.sessionsThisWeek} icon={<RiseOutlined />} accent="#9b7bff" />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <KpiCard title="活跃器械" value={data.activeMachines} icon={<AppstoreOutlined />} accent="#ff8c42" />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card
            bordered={false}
            title={
              <span style={{ fontWeight: 500 }}>
                <HeartOutlined style={{ marginRight: 8, color: activeMeta.accent }} />
                {brand === 'all' ? '训练记录' : `${activeMeta.label} 训练记录`}
              </span>
            }
            style={{ borderRadius: 12, height: '100%' }}
          >
            <Row gutter={[16, 8]}>
              <Col span={24}>
                <Statistic
                  title="累计训练场次"
                  value={data.trainingRecordsTotal ?? 0}
                  valueStyle={{ fontSize: 32, fontWeight: 700, color: activeMeta.accent }}
                  suffix="场"
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="累计时长"
                  value={formatDuration(data.trainingTotalSec)}
                  valueStyle={{ fontSize: 24, fontWeight: 600 }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="累计跑量"
                  value={formatDistance(data.trainingTotalDistanceM)}
                  valueStyle={{ fontSize: 24, fontWeight: 600 }}
                />
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card
            bordered={false}
            title={
              <span style={{ fontWeight: 500 }}>
                <TrophyOutlined style={{ marginRight: 8, color: '#f5a623' }} />
                本周器械类型分布
              </span>
            }
            style={{ borderRadius: 12, height: '100%' }}
          >
            {data.byType.length === 0 ? (
              <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bfbfbf' }}>
                本周暂无训练数据
              </div>
            ) : (
              <ReactECharts option={pieOption} style={{ height: 240 }} />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card
            bordered={false}
            title={
              <span style={{ fontWeight: 500 }}>
                <ShopOutlined style={{ marginRight: 8, color: '#4a9eff' }} />
                门店数量
              </span>
            }
            style={{ borderRadius: 12 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0' }}>
              <Statistic
                value={data.gyms}
                valueStyle={{ fontSize: 48, fontWeight: 700, color: '#1f1f1f' }}
                suffix={<Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>家门店</Text>}
              />
            </div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            bordered={false}
            title={
              <span style={{ fontWeight: 500 }}>
                <FireOutlined style={{ marginRight: 8, color: '#ff5c7a' }} />
                提示
              </span>
            }
            style={{ borderRadius: 12 }}
          >
            <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.8 }}>
              {brand === 'all'
                ? '顶部切换 HYROX / BTWE 可查看单品牌的训练 KPI。器械训练与门店数据不区分品牌。'
                : `已锁定 ${activeMeta.label}。若需查看门店、器械等全渠道数据，请切换到「全部」。`}
            </Text>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
