import { useTranslation } from 'react-i18next'
import { useEffect, useId, useRef, useState } from 'react'
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
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

export default function ScanSheet({
  onClose,
  onScanned,
}: {
  onClose: () => void
  onScanned: (raw: string) => void
}) {
  const { t } = useTranslation()
  const cameraId = useId()
  const [cameraOk, setCameraOk] = useState<boolean | null>(null)
  const [picking, setPicking] = useState(false)
  const closeRef = useRef(onClose)
  const scannedRef = useRef(onScanned)
  closeRef.current = onClose
  scannedRef.current = onScanned
  useNativeBack(true, onClose)

  useEffect(() => {
    let cancelled = false
    let webScanner: Html5Qrcode | undefined
    setPicking(false)
    setCameraOk(null)

    async function startCamera() {
      if (isNative) {
        try {
          const result = await CapacitorBarcodeScanner.scanBarcode({
            hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
            scanInstructions: t('将二维码对准框内'),
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
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraOk(false)
        return
      }
      try {
        webScanner = new Html5Qrcode(cameraId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        })
        await webScanner.start({ facingMode: 'environment' }, {
          fps: 4,
          videoConstraints: { facingMode: { ideal: 'environment' } },
          qrbox: (width, height) => {
            const size = Math.floor(Math.min(width, height) * 0.7)
            return { width: size, height: size }
          },
        }, handleRaw, undefined)
        if (cancelled) {
          await stopWebScanner()
          return
        }
        setCameraOk(true)
      } catch {
        if (!cancelled) setCameraOk(false)
      }
    }

    async function stopWebScanner() {
      if (webScanner?.isScanning) {
        const scanner = webScanner
        webScanner = undefined
        await scanner.stop().catch(() => undefined)
      }
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
    const start = window.setTimeout(() => void startCamera(), 0)

    return () => {
      cancelled = true
      window.clearTimeout(start)
      window.removeEventListener(NATIVE_BACKGROUND_EVENT, closeOnBackground)
      document.removeEventListener('visibilitychange', closeOnHidden)
      void stopWebScanner()
    }
  }, [cameraId, t])

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
          <p className="font-display text-lg font-bold">{t('扫码')}</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-text-sub"
            aria-label={t('关闭')}
          >
            <X size={16} />
          </button>
        </div>

        {isNative && cameraOk === null && (
          <div className="flex h-64 items-center justify-center rounded-xl bg-surface text-sm text-text-sub">
            {t('正在启动摄像头…')}
          </div>
        )}

        {!isNative && (
          <div hidden={cameraOk === false} className="relative overflow-hidden rounded-xl bg-black">
            <div id={cameraId} className="min-h-64 w-full" />
            {cameraOk === null ? (
              <p role="status" className="absolute inset-0 grid place-items-center bg-surface text-sm text-text-sub">
                {t('正在启动摄像头…')}
              </p>
            ) : (
              <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[12px] text-white">
                {t('将二维码对准框内')}
              </p>
            )}
          </div>
        )}

        {(cameraOk === false || picking) && (
          <div className="mt-4">
            <p className="mb-2 text-[13px] text-text-sub">
              {t(cameraOk === false ? '无法启动扫码，请检查相机权限或手动选择器械' : '手动选择器械')}
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
