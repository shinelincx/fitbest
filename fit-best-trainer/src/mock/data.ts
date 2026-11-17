import type { MachineInfo, MachineType, TrainMode } from '../types'

// FTMS 协议智能有氧器械
export const MACHINES: MachineInfo[] = [
  {
    type: 'treadmill',
    name: '跑步机',
    short: 'RUN',
    tagline: '配速与耐力基础',
    description: 'FTMS 智能跑步机直连，实时读取速度、距离、卡路里与器械权威计时。',
    tips: ['前 5 分钟以轻松配速热身', '保持步频 170–180 spm', '结束后慢走 3 分钟降心率'],
    unit: 'km',
    targetDistances: [3000, 5000, 10000],
    targetTimes: [1200, 1800, 2700],
  },
  {
    type: 'rower',
    name: '划船机',
    short: 'ROW',
    tagline: '全身力量耐力',
    description: 'FTMS 智能划船机直连，捕捉桨频、功率、距离与消耗，适合 2k / 5k 测试。',
    tips: ['蹬腿—后仰—拉桨，发力顺序不能乱', '回桨时手臂先伸直再屈膝', '保持稳定桨频，避免忽快忽慢'],
    unit: 'km',
    targetDistances: [2000, 5000, 10000],
    targetTimes: [1200, 1800, 2700],
  },
  {
    type: 'ski',
    name: '滑雪机',
    short: 'SKI',
    tagline: '上肢拉推爆发',
    description: 'FTMS 智能滑雪机直连，记录桨频、功率与距离，HYROX 滑雪站专项首选。',
    tips: ['核心收紧，髋部铰链带动下拉', '手臂下压到髋部两侧再回位', '高频低幅比大幅慢拉更省力'],
    unit: 'km',
    targetDistances: [1000, 3000, 5000],
    targetTimes: [600, 1200, 1800],
  },
  {
    type: 'bike',
    name: '风阻单车',
    short: 'BIKE',
    tagline: '低冲击有氧',
    description: 'FTMS 智能风阻单车直连，读取转速、功率、速度与距离，适合恢复与间歇。',
    tips: ['坐垫高度以踩到底膝盖微屈为准', '保持 80–95 rpm 的稳定转速', '间歇时用功率而不是速度做目标'],
    unit: 'km',
    targetDistances: [10000, 20000, 30000],
    targetTimes: [1200, 1800, 2700],
  },
  {
    type: 'spin',
    name: '动感单车',
    short: 'SPIN',
    tagline: '高强度节奏骑行',
    description: 'FTMS 智能动感单车直连，读取踏频、功率、速度与距离，适合高强度间歇。',
    tips: ['把阻力调到能稳住 90 rpm 的档位', '冲刺段收紧核心，臀部贴住坐垫', '结束后低阻力慢骑 5 分钟放松'],
    unit: 'km',
    targetDistances: [10000, 20000, 30000],
    targetTimes: [1800, 2700, 3600],
  },
  {
    type: 'elliptical',
    name: '椭圆机',
    short: 'ELLI',
    tagline: '零冲击全身有氧',
    description: 'FTMS 智能椭圆机直连，读取步频、功率、距离与消耗，关节友好型耐力训练。',
    tips: ['全脚掌贴住踏板，不要踮脚', '手扶动杆参与推拉，上下肢协同', '步频稳定在 140–160 spm'],
    unit: 'km',
    targetDistances: [3000, 5000, 10000],
    targetTimes: [1200, 1800, 2700],
  },
  {
    type: 'upright',
    name: '健身车',
    short: 'UPB',
    tagline: '坐姿低强度恢复',
    description: 'FTMS 智能健身车直连，读取踏频、功率、速度与距离，适合恢复骑行与热身。',
    tips: ['坐垫高度以踩踏最低点膝盖微屈为准', '保持 70–85 rpm 轻松踏频', '恢复日把心率压在燃脂区间'],
    unit: 'km',
    targetDistances: [8000, 15000, 25000],
    targetTimes: [1200, 1800, 2700],
  },
  {
    type: 'stair',
    name: '楼梯机',
    short: 'STAIR',
    tagline: '攀登心率冲击',
    description: 'FTMS 智能楼梯机直连，读取步频、功率与攀爬高度，臀腿耐力与心肺双刺激。',
    tips: ['全脚掌踩实踏板，不要只用前脚掌', '身体直立少扶把手，扶手只做平衡', '匀速慢爬比冲一段歇一段更高效'],
    unit: 'km',
    targetDistances: [300, 600, 1000],
    targetTimes: [600, 1200, 1800],
  },
]

export const MACHINE_MAP: Record<MachineType, MachineInfo> = MACHINES.reduce(
  (acc, m) => {
    acc[m.type] = m
    return acc
  },
  {} as Record<MachineType, MachineInfo>,
)

export const MODE_LABELS: Record<TrainMode, string> = {
  free: '自由训练',
  interval: '间歇训练',
  distance: '目标距离',
  time: '目标时间',
}

export const EXTERNAL_APPS = [
  {
    id: 'hyrox',
    name: 'HYROX',
    subtitle: '室内体能赛备赛 · 8 组模拟赛计时',
    href: 'https://demo.thinkfit.cn/hyrox/',
  },
  {
    id: 'btwe',
    name: 'BTWE',
    subtitle: '体能赛专项训练 · AI 教练定制计划',
    href: 'https://demo.thinkfit.cn/btwe/',
  },
]

// 演示用初始记录（相对今天生成，保证首页有内容）
