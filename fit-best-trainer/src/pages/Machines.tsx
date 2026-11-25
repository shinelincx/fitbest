import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Bluetooth, Heart } from 'lucide-react'
import { AirBikeIcon, EllipticalIcon, RowerIcon, SkiIcon, SpinIcon, StairIcon, TreadmillIcon, UprightIcon } from '../components/MachineIcons'
import { fetchSessions } from '../api'
import type { MachineSession } from '../types'
import { MACHINES } from '../mock/data'
import { useDevices, type DeviceType } from '../context/DeviceContext'
import { useToast } from '../components/Toast'
import { MiniRing } from '../components/Charts'
import DevicePanel from '../components/DevicePanel'
import ConsolePanel from '../components/ConsolePanel'
import QuickConnect from '../components/QuickConnect'
import { formatDistance, isThisWeek } from '../utils/stats'
import { readTextOnce } from '../platform/nfc'
import { isCancellation } from '../platform/runtime'

const NFC_MODELS: Record<string, string> = {
  treadmill: 'Treadmill A1',
  rower: 'Rower X2',
  ski: 'SkiErg Pro',
  bike: 'AirBike S3',
  spin: 'SpinBike S5',
  elliptical: 'Elliptical E7',
  upright: 'UprightBike U3',
  stair: 'StairClimber C9',
}

/** 标签内容为器械型号或类型关键字，如 "Treadmill A1" / "spin" */
function detectNfcMachine(text: string): { type: DeviceType; name: string } | null {
  const lower = text.toLowerCase()
  for (const [type, model] of Object.entries(NFC_MODELS)) {
    if (lower === model.toLowerCase() || lower.includes(type)) {
      return { type: type as DeviceType, name: model }
    }
  }
  return null
}

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

export default function Machines() {
  const { t, i18n } = useTranslation()
  const [sessions, setSessions] = useState<MachineSession[]>([])
  const [loading, setLoading] = useState(true)
  const [nfcReading, setNfcReading] = useState(false)
  const nfcAttempt = useRef<AbortController | null>(null)
  const { devices, connectDevice, machineNavigation } = useDevices()
  const navigationItems = machineNavigation
    ? machineNavigation.machineTypes.flatMap(({ code, names }) => {
      const machine = MACHINES.find((item) => item.type === code)
      if (!machine) return []
      const language = i18n.resolvedLanguage ?? i18n.language
      return [{ ...machine, name: names[language] || names[language.split('-')[0]] || names['zh-CN'] || machine.name }]
    })
    : MACHINES
  const navigate = useNavigate()
  const toast = useToast()

  useEffect(() => () => nfcAttempt.current?.abort(), [])

  const handleNfc = useCallback(async () => {
    if (nfcAttempt.current) return
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
      const hit = detectNfcMachine(text)
      if (!hit) {
        toast(t('无法识别的器械标签'))
        return
      }
      setNfcReading(false)
      const connected = devices[hit.type].connected || await connectDevice(hit.type)
      if (!attempt.signal.aborted && connected) navigate(`/train/${hit.type}`)
    } catch (error) {
      if (isCancellation(error)) return
      console.warn('NFC 读取失败：', error)
      toast(error instanceof Error ? error.message : t('NFC 读取失败，请重试'))
    } finally {
      window.clearTimeout(timeout)
      nfcAttempt.current = null
      setNfcReading(false)
    }
  }, [connectDevice, devices, navigate, t, toast])

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
                          ? t('本周 {{count}} 次 · {{distance}}', { count: list.length, distance: formatDistance(distance) })
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
