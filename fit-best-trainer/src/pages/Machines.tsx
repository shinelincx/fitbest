import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Bluetooth, Heart } from 'lucide-react'
import { AirBikeIcon, EllipticalIcon, RowerIcon, SkiIcon, SpinIcon, StairIcon, TreadmillIcon, UprightIcon } from '../components/MachineIcons'
import { fetchSessions } from '../api'
import type { MachineSession, MachineType } from '../types'
import { MACHINES } from '../mock/data'
import { useDevices } from '../context/DeviceContext'
import { useToast } from '../components/Toast'
import { MiniRing } from '../components/Charts'
import DevicePanel from '../components/DevicePanel'
import ConsolePanel from '../components/ConsolePanel'
import QuickConnect from '../components/QuickConnect'
import { isThisWeek } from '../utils/stats'
import { parseNfcEquipmentLabel } from '../ble/equipmentLabel'
import { readTextOnce } from '../platform/nfc'
import { isCancellation } from '../platform/runtime'

const MACHINE_ICON = {
  treadmill: TreadmillIcon,
  rower: RowerIcon,
  ski: SkiIcon,
  bike: AirBikeIcon,
  spin: SpinIcon,
  elliptical: EllipticalIcon,
  upright: UprightIcon,
  stair: StairIcon,
}

// NewAiFitbest 运动页的固定顺序，滑雪机在导航加载后追加。
const LEGACY_MACHINE_ORDER: MachineType[] = ['treadmill', 'spin', 'rower', 'elliptical', 'stair', 'ski']

function machineOrder(type: MachineType) {
  const index = LEGACY_MACHINE_ORDER.indexOf(type)
  return index < 0 ? LEGACY_MACHINE_ORDER.length : index
}

export default function Machines() {
  const { t, i18n } = useTranslation()
  const [sessions, setSessions] = useState<MachineSession[]>([])
  const [loading, setLoading] = useState(true)
  const [nfcReading, setNfcReading] = useState(false)
  const [nfcConnection, setNfcConnection] = useState<{
    target: NonNullable<ReturnType<typeof parseNfcEquipmentLabel>>
    failed: boolean
  } | null>(null)
  const nfcAttempt = useRef<AbortController | null>(null)
  const { devices, connectDevice, machineNavigation } = useDevices()
  const navigationItems = (machineNavigation
    ? machineNavigation.machineTypes.flatMap(({ code, names }) => {
      const machine = MACHINES.find((item) => item.type === code)
      if (!machine) return []
      const language = i18n.resolvedLanguage ?? i18n.language
      return [{ ...machine, name: names[language] || names[language.split('-')[0]] || names['zh-CN'] || machine.name }]
    })
    : MACHINES.slice()
  ).sort((a, b) => machineOrder(a.type) - machineOrder(b.type))
  const navigate = useNavigate()
  const toast = useToast()

  useEffect(() => () => nfcAttempt.current?.abort(), [])

  const connectNfcTarget = useCallback(async (target: NonNullable<ReturnType<typeof parseNfcEquipmentLabel>>) => {
    const activeMachine = MACHINES.find(({ type }) => devices[type].connected)
    if (activeMachine) {
      setNfcConnection(null)
      toast(t('器械已连接：{{name}}', { name: devices[activeMachine.type].name || t(activeMachine.name) }))
      return
    }
    setNfcConnection({ target, failed: false })
    try {
      if (await connectDevice(target.type, undefined, target.name, 'case-sensitive')) {
        setNfcConnection(null)
        toast(t('连接成功'))
        navigate(`/train/${target.type}`)
        return
      }
    } catch (error) {
      console.warn('NFC 器械连接失败：', error)
    }
    setNfcConnection({ target, failed: true })
  }, [connectDevice, devices, navigate, t, toast])

  const handleNfc = useCallback(async () => {
    if (nfcAttempt.current) return
    setNfcConnection(null)
    const attempt = new AbortController()
    nfcAttempt.current = attempt
    const timeout = window.setTimeout(() => {
      attempt.abort()
      toast(t('读取 NFC 标签超时，请重试'))
    }, 15_000)
    setNfcReading(true)
    try {
      const text = await readTextOnce(attempt.signal)
      window.clearTimeout(timeout)
      if (attempt.signal.aborted) return
      const hit = parseNfcEquipmentLabel(text, machineNavigation)
      if (!hit) {
        toast(t('无法识别的器械标签'))
        return
      }
      setNfcReading(false)
      await connectNfcTarget(hit)
    } catch (error) {
      if (isCancellation(error)) return
      console.warn('NFC 读取失败：', error)
      toast(error instanceof Error ? error.message : t('NFC 读取失败，请重试'))
    } finally {
      window.clearTimeout(timeout)
      nfcAttempt.current = null
      setNfcReading(false)
    }
  }, [connectNfcTarget, machineNavigation, t, toast])

  useEffect(() => {
    fetchSessions().then((s) => {
      setSessions(s)
      setLoading(false)
    })
  }, [])

  const week = sessions.filter((s) => isThisWeek(s.date))
  const machineDays = Object.fromEntries(
    MACHINES.map((m) => [m.type, Array(7).fill(0) as number[]]),
  ) as Record<string, number[]>
  week.forEach((s) => {
    machineDays[s.machine][(new Date(s.date).getDay() + 6) % 7] += 1
  })

  return (
    <div className="px-5 pt-5 hd:lg:px-8 hd:lg:pt-7">
      <header className="reveal reveal-1 flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[20px] font-bold leading-tight">{t('智能器械')}</h1>
          <p className="mt-1 text-xs text-text-sub">{t('选一台器械，开始单机训练')}</p>
        </div>
        <button
          type="button"
          aria-label={t('NFC 一碰即连')}
          onClick={handleNfc}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-[11px] font-bold tracking-tight text-text"
        >
          NFC
        </button>
      </header>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      ) : (
        <div className="reveal reveal-2 mt-4 overflow-hidden rounded-md border border-border bg-surface hd:lg:grid hd:lg:grid-cols-2 hd:lg:gap-3 hd:lg:overflow-visible hd:lg:rounded-none hd:lg:border-0 hd:lg:bg-transparent">
          {navigationItems.map((m, i) => {
            const Icon = MACHINE_ICON[m.type]
            const list = week.filter((s) => s.machine === m.type)
            const distance = list.reduce((a, s) => a + s.distanceM, 0)
            return (
              <div
                key={m.type}
                className={`${i > 0 ? 'border-t border-border hd:lg:border-t-0' : ''} hd:lg:rounded-md hd:lg:border hd:lg:border-border hd:lg:bg-surface`}
              >
                <div className="flex items-center gap-2.5 px-4 py-4">
                  <Link to={`/train/${m.type}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-primary">
                      <Icon size={19} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t(m.name)}</p>
                      <p className="mt-0.5 truncate text-[13px] text-text-sub">
                        {list.length
                          ? t('本周 {{count}} 次 · {{distance}}', { count: list.length, distance: `${(distance / 1000).toFixed(2)} km` })
                          : t(m.tagline)}
                      </p>
                    </div>
                  </Link>
                  <MiniRing values={machineDays[m.type]} />
                  <QuickConnect type={m.type} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <section className="reveal reveal-3 mt-6">
        <h2 className="mb-2.5 flex items-center gap-1.5 text-[15px] font-semibold">
          <Heart size={15} className="text-primary" /> {t('心率带')}
        </h2>
        <DevicePanel types={['heartRate']} />
      </section>

      {/* ThinkFit 车表（FFF0 私有协议） */}
      <div className="reveal reveal-3">
        <ConsolePanel />
      </div>

      {nfcConnection && (
        <div className="fixed inset-0 z-[75] grid place-items-center bg-black/55 px-5">
          <div role="dialog" aria-modal="true" aria-labelledby="nfc-connect-title" className="w-full max-w-xs rounded-2xl bg-bg p-6 text-center">
            {!nfcConnection.failed && <Bluetooth size={28} className="mx-auto mb-3 animate-pulse text-primary" aria-hidden="true" />}
            <h2 id="nfc-connect-title" role="status" className="font-semibold">
              {t(nfcConnection.failed ? '未能连接器械' : '正在后台连接器械…')}
            </h2>
            <p className="mt-2 break-words font-mono text-sm text-text-sub">{nfcConnection.target.name}</p>
            {nfcConnection.failed && (
              <div className="mt-5 flex justify-center gap-2">
                <button type="button" className="min-h-11 rounded-md border border-border px-4 text-sm" onClick={() => setNfcConnection(null)}>
                  {t('取消')}
                </button>
                <button type="button" className="min-h-11 rounded-md bg-text px-4 text-sm font-semibold text-bg"
                  onClick={() => void handleNfc()}>
                  {t('重新扫描')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* NFC 识别中浮层 */}
      {nfcReading && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/55">
          <div className="flex w-64 flex-col items-center rounded-2xl bg-bg px-6 py-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Bluetooth size={28} className="animate-pulse text-primary" />
            </div>
            <p className="mt-4 text-[15px] font-semibold">{t('正在识别 NFC 标签')}</p>
            <p className="mt-1 text-[12px] text-text-sub">{t('请将手机靠近器械…')}</p>
            <button type="button" className="mt-5 rounded-md border border-border px-5 py-2 text-sm" onClick={() => nfcAttempt.current?.abort()}>
              {t('取消')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
