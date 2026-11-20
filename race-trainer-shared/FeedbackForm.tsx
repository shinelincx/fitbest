import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'

const ACCEPT = 'image/jpeg,image/png,image/webp'
const SIZE_LIMIT = 5 * 1024 * 1024

export interface FeedbackReceipt {
  id: string
  createdAt: string
}

interface Props {
  source: 'fitbest' | 'hyrox' | 'btwe'
  accountId: () => string | null
  pickImages?: (limit: number, maxBytes: number) => Promise<File[]>
  send: (body: FormData, key: string, signal: AbortSignal) => Promise<FeedbackReceipt>
}

function newKey() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function Preview({ file, index, disabled, remove }: {
  file: File
  index: number
  disabled: boolean
  remove: () => void
}) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const preview = URL.createObjectURL(file)
    setUrl(preview)
    return () => URL.revokeObjectURL(preview)
  }, [file])

  return (
    <li className="min-w-0">
      {url && <img src={url} alt={`图片 ${index + 1}预览`} className="aspect-square w-full rounded-md object-contain" />}
      <button type="button" disabled={disabled} onClick={remove} className="min-h-11 text-sm underline">
        移除图片 {index + 1}
      </button>
    </li>
  )
}

export default function FeedbackForm({ source, accountId, pickImages, send }: Props) {
  const labelId = useId()
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const submission = useRef<{ key: string; account: string | null } | null>(null)
  const pending = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const pickerButton = useRef<HTMLButtonElement>(null)

  function edited() {
    submission.current = null
    setError('')
    setSuccess(false)
  }

  function addImages(selected: File[]) {
    if (pending.current || !selected.length) return
    setSuccess(false)
    if (files.length + selected.length > 3) {
      setError('最多添加 3 张图片')
    } else if (selected.some(file => file.type
      ? !ACCEPT.split(',').includes(file.type)
      : !/\.(jpe?g|png|webp)$/i.test(file.name))) {
      setError('仅支持 JPEG、PNG 或 WebP 图片')
    } else if (selected.some(file => file.size === 0 || file.size > SIZE_LIMIT)) {
      setError('每张图片不得超过 5 MiB，且不能为空')
    } else {
      edited()
      setFiles([...files, ...selected])
    }
  }

  function choose(event: ChangeEvent<HTMLInputElement>) {
    addImages(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  async function chooseNative() {
    if (!pickImages || pending.current || picking || files.length === 3) return
    setPicking(true)
    try {
      addImages(await pickImages(3 - files.length, SIZE_LIMIT))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取所选图片，请重试')
    } finally {
      setPicking(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current || picking) return
    const content = text.replace(/^[\p{White_Space}\uFEFF]+|[\p{White_Space}\uFEFF]+$/gu, '')
    const length = Array.from(content).length
    setSuccess(false)
    if (length < 5 || length > 2000) {
      setError('请输入 5–2000 字的反馈')
      return
    }
    if (!navigator.onLine) {
      setError('当前离线，请联网后重试')
      return
    }
    const account = accountId()
    if (submission.current && submission.current.account !== account) {
      setError('登录账号已变更，请恢复原账号后重试，或修改反馈后重新提交')
      return
    }
    pending.current = true
    setBusy(true)
    setError('')
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 30_000)
    try {
      const body = new FormData()
      body.append('source', source)
      body.append('text', content)
      files.forEach(file => body.append('images', file))
      submission.current ??= { key: newKey(), account }
      const receipt = await send(body, submission.current.key, controller.signal)
      if (!receipt?.id || !receipt.createdAt) throw new Error('未收到保存确认，请重试')
      setText('')
      setFiles([])
      submission.current = null
      setSuccess(true)
    } catch (reason) {
      const error = reason instanceof Error ? reason : undefined
      setError(`${controller.signal.aborted ? '提交超时' : error?.message || '提交失败'}，内容已保留，请重试`)
    } finally {
      window.clearTimeout(timeout)
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} aria-label="意见反馈" aria-busy={busy} className="rounded-lg border border-border bg-surface p-4">
      <label htmlFor={labelId} className="mb-2 block text-sm font-medium">使用中遇到的问题或建议（5–2000 字）</label>
      <textarea id={labelId} value={text} disabled={busy} rows={4}
        onChange={event => { edited(); setText(event.target.value) }}
        className="w-full rounded-md border border-border bg-surface-2 p-3 text-sm text-text" />
      {pickImages ? (
        <div className="my-2 text-sm">
          <p id={`${labelId}-images`}>可选，最多 3 张，每张 5 MiB，JPEG、PNG 或 WebP</p>
          <button type="button" ref={pickerButton} disabled={busy || picking || files.length === 3}
            aria-describedby={`${labelId}-images`} onClick={() => void chooseNative()}
            className="mt-2 min-h-11 w-full rounded-md border border-border p-2">
            {picking ? '正在选图…' : '添加图片'}
          </button>
        </div>
      ) : (
        <label className="my-2 block text-sm">
          添加图片（可选，最多 3 张，每张 5 MiB，JPEG、PNG 或 WebP）
          <input ref={fileInput} type="file" multiple accept={ACCEPT} disabled={busy || files.length === 3}
            onChange={choose} className="mt-2 block w-full rounded-md border border-border p-2 text-sm" />
        </label>
      )}
      <ul className="grid grid-cols-3 gap-2">
        {files.map((file, index) => (
          <Preview key={index} file={file} index={index} disabled={busy || picking} remove={() => {
            edited()
            setFiles(files.filter((_, i) => i !== index))
            requestAnimationFrame(() => (fileInput.current ?? pickerButton.current)?.focus())
          }} />
        ))}
      </ul>
      {error && <p role="alert" className="my-2 text-sm">{error}</p>}
      <p role="status" aria-atomic="true" className={success ? 'my-2 text-sm' : 'sr-only'}>
        {success ? '感谢反馈，服务端已保存。' : ''}
      </p>
      <button type="submit" aria-disabled={busy || picking}
        className="mt-3 min-h-11 w-full rounded-md bg-primary p-2 text-sm font-semibold text-bg aria-disabled:opacity-60">
        {busy ? '提交中…' : '提交反馈'}
      </button>
    </form>
  )
}
