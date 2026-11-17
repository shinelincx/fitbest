import { useTranslation } from 'react-i18next'
import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'

interface Props {
  /** 位移采样缓冲（cm），由 useSmartPin 以 20Hz 写入 */
  waveRef: MutableRefObject<number[]>
  height?: number
  /** 可通过 CSS 类覆盖高度（如平板横屏更高），绘制时以实际渲染高度为准 */
  className?: string
}

/** 力量动作实时位移波形：每一次动作一个波峰，峰点颜色表示幅度保持度 */
export default function WaveChart({ waveRef, height = 110, className }: Props) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      // 以实际渲染高度为准，支持 CSS 类在平板上拉高卡片
      const h = canvas.clientHeight || height
      if (w === 0) return
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const data = waveRef.current
      if (data.length < 8) {
        ctx.fillStyle = 'rgba(139,147,158,.55)'
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(t('开始动作后显示实时位移波形'), w / 2, h / 2)
        return
      }

      let max = 10
      for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i]

      const padL = 2
      const padR = 2
      const padT = 10
      const padB = 4
      const iw = w - padL - padR
      const ih = h - padT - padB

      // 参考网格
      ctx.strokeStyle = 'rgba(242,244,247,.07)'
      ctx.lineWidth = 1
      for (let i = 1; i <= 3; i++) {
        const y = padT + (ih * i) / 4
        ctx.beginPath()
        ctx.moveTo(padL, y)
        ctx.lineTo(w - padR, y)
        ctx.stroke()
      }

      const N = 300 // 最近 15s
      const view = data.length > N ? data.slice(data.length - N) : data
      const step = iw / (N - 1)
      const x0 = padL + iw - (view.length - 1) * step
      const px = (i: number) => x0 + i * step
      const py = (v: number) => padT + ih - (v / max) * ih

      // 线下渐变填充
      const grad = ctx.createLinearGradient(0, padT, 0, padT + ih)
      grad.addColorStop(0, 'rgba(240,24,8,.16)')
      grad.addColorStop(1, 'rgba(240,24,8,0)')
      ctx.beginPath()
      ctx.moveTo(px(0), py(view[0]))
      for (let i = 1; i < view.length; i++) ctx.lineTo(px(i), py(view[i]))
      ctx.lineTo(px(view.length - 1), padT + ih)
      ctx.lineTo(px(0), padT + ih)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()

      // 波形主线
      ctx.beginPath()
      ctx.moveTo(px(0), py(view[0]))
      for (let i = 1; i < view.length; i++) ctx.lineTo(px(i), py(view[i]))
      ctx.strokeStyle = '#F01808'
      ctx.lineWidth = 1.6
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.stroke()

      // 峰点：局部极大值，颜色 = 幅度相对窗口最高值的保持度
      const minDist = 18
      let lastPeak = -minDist
      for (let i = 2; i < view.length - 2; i++) {
        const v = view[i]
        if (v < max * 0.45) continue
        if (
          v >= view[i - 1] &&
          v >= view[i + 1] &&
          v > view[i - 2] &&
          v > view[i + 2] &&
          i - lastPeak >= minDist
        ) {
          lastPeak = i
          const ratio = v / max
          const color = ratio >= 0.92 ? '#1DC981' : ratio >= 0.8 ? '#EFAA17' : '#F01808'
          ctx.beginPath()
          ctx.arc(px(i), py(v), 3, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
        }
      }

      // 最新点
      ctx.beginPath()
      ctx.arc(px(view.length - 1), py(view[view.length - 1]), 3.2, 0, Math.PI * 2)
      ctx.fillStyle = '#F2F4F7'
      ctx.fill()
    }

    draw()
    return () => cancelAnimationFrame(raf)
  }, [waveRef, height, t])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: className ? undefined : height, display: 'block' }}
    />
  )
}
