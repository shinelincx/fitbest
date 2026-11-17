// 训练反馈 —— 音效与震动

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
    navigator.vibrate?.(pattern)
  } catch {
    // ignore
  }
}
