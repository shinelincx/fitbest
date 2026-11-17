// 训练反馈 —— 音效与震动

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { isNative } from '../platform/runtime'

export function beep(freq = 880, duration = 140) {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.value = 0.08
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration / 1000)
    osc.onended = () => ctx.close()
  } catch {
    // 浏览器不支持音频时静默失败
  }
}

export function vibrate(pattern: number | number[] = 80) {
  try {
    if (isNative) {
      if (Array.isArray(pattern)) {
        void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined)
      } else {
        void Haptics.impact({ style: pattern >= 100 ? ImpactStyle.Medium : ImpactStyle.Light }).catch(
          () => undefined,
        )
      }
      return
    }
    navigator.vibrate?.(pattern)
  } catch {
    // ignore
  }
}
