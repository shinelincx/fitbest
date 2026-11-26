import { useTranslation } from 'react-i18next'
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { DeviceType } from '../context/DeviceContext'
import { MACHINES } from '../mock/data'
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerCameraDirection,
  CapacitorBarcodeScannerScanOrientation,
  CapacitorBarcodeScannerTypeHint,
} from '@capacitor/barcode-scanner'
import { useNativeBack } from '../platform/NativeRuntime'
import { NATIVE_BACKGROUND_EVENT, isCancellation, isNative } from '../platform/runtime'

export default function ScanSheet({
  open,
  onClose,
  onScanned,
}: {
  open: boolean
  onClose: () => void
  onScanned: (raw: string) => void
}) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<{ detect: (s: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } | null>(null)
  const rafRef = useRef<number | null>(null)
  const [cameraOk, setCameraOk] = useState<boolean | null>(null)
  const [picking, setPicking] = useState(false)
  const closeRef = useRef(onClose)
  const scannedRef = useRef(onScanned)
  closeRef.current = onClose
  scannedRef.current = onScanned
  useNativeBack(open, onClose)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setPicking(false)
    setCameraOk(null)

    const BD = (window as unknown as { BarcodeDetector?: new (opts?: { formats: string[] }) => unknown }).BarcodeDetector

    async function startCamera() {
      if (isNative) {
        try {
          const result = await CapacitorBarcodeScanner.scanBarcode({
            hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
            scanInstructions: t('将器械二维码对准框内'),
            scanOrientation: CapacitorBarcodeScannerScanOrientation.PORTRAIT,
            cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
          })
          if (!cancelled) {
            if (result.ScanResult) handleRaw(result.ScanResult)
            else closeRef.current()
          }
        } catch (error) {
          if (cancelled) return
          if (isCancellation(error)) closeRef.current()
          else setCameraOk(false)
        }
        return
      }
      if (!BD || !navigator.mediaDevices?.getUserMedia) {
        setCameraOk(false)
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const detector = new BD({ formats: ['qr_code'] }) as {
          detect: (s: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>
        }
        detectorRef.current = detector
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => undefined)
        }
        setCameraOk(true)
        scanLoop()
      } catch {
        setCameraOk(false)
      }
    }

    async function scanLoop() {
      if (cancelled) return
      const video = videoRef.current
      const detector = detectorRef.current
      if (video && detector && video.readyState >= 2) {
        try {
          const codes = await detector.detect(video)
          if (codes?.[0]?.rawValue) {
            handleRaw(codes[0].rawValue)
            return
          }
        } catch {
          /* 重试 */
        }
      }
      rafRef.current = window.setTimeout(scanLoop, 300) as unknown as number
    }

    function handleRaw(raw: string) {
      if (!cancelled) scannedRef.current(raw)
    }

    const closeOnBackground = () => closeRef.current()
    const closeOnHidden = () => {
      if (document.hidden) closeOnBackground()
    }
    if (!isNative) {
      window.addEventListener(NATIVE_BACKGROUND_EVENT, closeOnBackground)
      document.addEventListener('visibilitychange', closeOnHidden)
    }
    startCamera()

    return () => {
      cancelled = true
      window.removeEventListener(NATIVE_BACKGROUND_EVENT, closeOnBackground)
      document.removeEventListener('visibilitychange', closeOnHidden)
      if (rafRef.current) window.clearTimeout(rafRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [open, t])

  if (!open) return null

  function pickMachine(type: DeviceType, _name: string) {
    onScanned(type)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-bg p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="font-display text-lg font-bold">{t('扫码连接器械')}</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-text-sub"
            aria-label={t('关闭')}
          >
            <X size={16} />
          </button>
        </div>

        {cameraOk === null && (
          <div className="flex h-64 items-center justify-center rounded-xl bg-surface text-sm text-text-sub">
            {t('正在启动摄像头…')}
          </div>
        )}

        {cameraOk === true && (
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              className="h-64 w-full object-cover"
              playsInline
              muted
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-40 w-40 rounded-lg border-2 border-primary/80" />
            </div>
            <p className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[12px] text-white">
              {t('将器械二维码对准框内')}
            </p>
          </div>
        )}


        {(cameraOk === false || picking) && (
          <div className="mt-4">
            <p className="mb-2 text-[13px] text-text-sub">
              {cameraOk === false
                ? isNative
                  ? t('无法启动扫码，请检查相机权限或手动选择器械')
                  : t('当前浏览器不支持摄像头扫码，请手动选择器械')
                : t('手动选择器械')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {MACHINES.map((m) => (
                <button
                  key={m.type}
                  type="button"
                  aria-label={t('扫码选择{{name}}', { name: t(m.name) })}
                  onClick={() => pickMachine(m.type, m.name)}
                  className="rounded-md border border-border bg-surface px-3 py-3 text-left text-sm font-medium transition-colors active:bg-surface-2"
                >
                  {t(m.name)}
                </button>
              ))}
            </div>
          </div>
        )}

        {cameraOk === true && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="mt-4 w-full rounded-md border border-border py-2.5 text-[14px] text-text-sub"
          >
            {t('扫不到？手动选择器械')}
          </button>
        )}
      </div>
    </div>
  )
}
