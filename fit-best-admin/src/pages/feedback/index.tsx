import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Drawer, Pagination, Space, Spin } from 'antd'
import { isAxiosError } from 'axios'
import http from '@/api/http'

const sources = { fitbest: 'Fitbest', hyrox: 'HYROX', btwe: 'BTWE' }
const statuses = { pending: '待处理', in_progress: '处理中', resolved: '已处理' }
const actions = { start: '开始处理', resolve: '标为已处理', reopen: '重新打开', note: '添加备注' }
type Status = keyof typeof statuses
type Action = keyof typeof actions
type Summary = {
  id: string
  source: keyof typeof sources
  status: Status
  content: string
  submitterId: string | null
  submitterName: string | null
  version: number
  createdAt: string
}
type Page = { items: Summary[]; total: number; canWrite: boolean }
type Detail = {
  feedback: Summary
  attachments: string[]
  history: {
    version: number
    actorId: string
    actorName: string
    createdAt: string
    fromStatus: Status
    toStatus: Status
    note: string | null
  }[]
  canWrite: boolean
}

function errorStatus(error: unknown) {
  return isAxiosError(error) ? error.response?.status : undefined
}

function date(value: string) {
  return new Date(value).toLocaleString()
}

function LoadError({ forbidden, retry }: { forbidden: boolean; retry: () => void }) {
  return (
    <Alert type="error" showIcon title={forbidden ? '当前账号无反馈数据权限' : '加载失败，请重试'}
      action={forbidden ? undefined : <Button onClick={retry}>重试</Button>} />
  )
}

function Attachment({ path, index }: { path: string; index: number }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''
    http.get<Blob>(path, { responseType: 'blob', signal: controller.signal }).then(blob => {
      if (controller.signal.aborted) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    }).catch(() => {
      if (!controller.signal.aborted) setError(true)
    })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, attempt])

  if (error) return <Button onClick={() => { setError(false); setAttempt(value => value + 1) }}>重试加载图片 {index}</Button>
  if (!url) return <span role="status">正在加载图片 {index}…</span>
  return <img src={url} alt={`反馈图片 ${index}`} style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain' }} />
}

function FeedbackDetail({ id, updated, savingChanged }: {
  id: string
  updated: () => void
  savingChanged: (saving: boolean) => void
}) {
  const [detail, setDetail] = useState<Detail>()
  const [loadError, setLoadError] = useState<number>()
  const [attempt, setAttempt] = useState(0)
  const [note, setNote] = useState('')
  const [actionError, setActionError] = useState('')
  const [stale, setStale] = useState(false)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const path = `/admin/feedback/${id}`

  useEffect(() => {
    const controller = new AbortController()
    http.get<Detail>(path, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) {
        setDetail(value)
        setStale(false)
      }
    }).catch(error => {
      if (!controller.signal.aborted) setLoadError(errorStatus(error) ?? 500)
    })
    return () => controller.abort()
  }, [path, attempt])

  function reload() {
    setLoadError(undefined)
    setActionError('')
    setDetail(undefined)
    setAttempt(value => value + 1)
  }

  async function change(action: Action) {
    if (saving.current || stale || !detail?.canWrite) return
    saving.current = true
    savingChanged(true)
    setBusy(true)
    setActionError('')
    try {
      await http.post(`${path}/actions`, { version: detail.feedback.version, action, note })
      setNote('')
      reload()
      updated()
    } catch (error) {
      const status = errorStatus(error)
      setStale(status === 409 || status === 403)
      setActionError(status === 409 ? '反馈已被其他操作更新，请刷新详情后重试。'
        : status === 403 ? '当前账号无权处理反馈。' : '操作失败，备注已保留，请重试。')
    } finally {
      saving.current = false
      savingChanged(false)
      setBusy(false)
    }
  }

  if (loadError) return <LoadError forbidden={loadError === 403} retry={reload} />
  if (!detail) return <Spin aria-label="加载反馈详情" />
  const { feedback, attachments, history, canWrite } = detail
  const available: Action[] = feedback.status === 'resolved' ? ['reopen', 'note']
    : feedback.status === 'pending' ? ['start', 'resolve', 'note'] : ['resolve', 'note']

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%', overflowWrap: 'anywhere' }}>
      <div>{sources[feedback.source]} · {statuses[feedback.status]} · {date(feedback.createdAt)}</div>
      <div>提交者 {feedback.submitterId ? `${feedback.submitterName ?? '用户'}（${feedback.submitterId}）` : '访客'}</div>
      <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{feedback.content}</p>
      {attachments.map((imageId, i) => (
        <Attachment key={imageId} path={`${path}/attachments/${imageId}`} index={i + 1} />
      ))}
      <section aria-label="处理历史">
        <h3>处理历史</h3>
        {history.length === 0 ? <p>暂无处理记录</p> : (
          <ol>
            {history.map(item => <li key={item.version}>
              {date(item.createdAt)} · {item.actorName} · {statuses[item.fromStatus]} → {statuses[item.toStatus]}
              {item.note && <div style={{ whiteSpace: 'pre-wrap' }}>{item.note}</div>}
            </li>)}
          </ol>
        )}
      </section>
      {canWrite ? (
        <>
          <label>
            处理备注
            <textarea value={note} maxLength={2000} disabled={busy} onChange={event => setNote(event.target.value)}
              rows={3} style={{ display: 'block', width: '100%', boxSizing: 'border-box' }} />
          </label>
          {actionError && <Alert type="error" showIcon title={actionError}
            action={stale ? <Button onClick={reload}>刷新详情</Button> : undefined} />}
          <Space wrap>
            {available.map(action => (
              <Button key={action} disabled={busy || stale || (action === 'note' && !note.trim())}
                onClick={() => void change(action)}>{actions[action]}</Button>
            ))}
          </Space>
          {busy && <span role="status">正在保存…</span>}
        </>
      ) : <Alert type="info" title="只读权限" />}
    </Space>
  )
}

const SIZE = 20
const fieldStyle = { display: 'grid', gap: 4 }
const filterStyle = { display: 'flex', flexWrap: 'wrap' as const, alignItems: 'end', gap: 12 }
const dateParams = ['from', 'to']

export default function FeedbackPage() {
  const [query, setQuery] = useState({ page: 1, size: SIZE })
  const [result, setResult] = useState<Page>()
  const [error, setError] = useState<number>()
  const [attempt, setAttempt] = useState(0)
  const [active, setActive] = useState<string>()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const detailButton = useRef<HTMLElement | null>(null)
  const filters = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    setResult(undefined)
    setError(undefined)
    http.get<Page>('/admin/feedback', { params: query, signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setResult(value)
    }).catch(error => {
      if (!controller.signal.aborted) setError(errorStatus(error) ?? 500)
    })
    return () => controller.abort()
  }, [query, attempt])

  function refresh() {
    setAttempt(value => value + 1)
  }

  return (
    <>
      <h1>意见反馈</h1>
      <form ref={filters} aria-label="反馈筛选" style={filterStyle} onSubmit={event => {
        event.preventDefault()
        const values = new FormData(event.currentTarget)
        const params: Record<string, string> = {}
        for (const [name, value] of values) {
          if (typeof value === 'string' && value) {
            params[name] = dateParams.includes(name) ? new Date(value).toISOString() : value
          }
        }
        setQuery({ ...params, page: 1, size: SIZE })
      }}>
        <label style={fieldStyle}>来源<select name="source">
          <option value="">全部来源</option>
          {Object.entries(sources).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
        </select></label>
        <label style={fieldStyle}>状态<select name="status">
          <option value="">全部状态</option>
          {Object.entries(statuses).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
        </select></label>
        <label style={fieldStyle}>开始时间（含）<input type="datetime-local" name="from" /></label>
        <label style={fieldStyle}>结束时间（不含）<input type="datetime-local" name="to" /></label>
        <Button htmlType="submit" type="primary">筛选</Button>
        <Button onClick={() => { filters.current?.reset(); setQuery({ page: 1, size: SIZE }) }}>重置</Button>
      </form>
      <section aria-label="反馈列表" style={{ marginTop: 16 }}>
        {error ? <LoadError forbidden={error === 403} retry={refresh} /> : !result ? <Spin aria-label="加载反馈列表" /> : (
          <>
            {!result.canWrite && <Alert type="info" title="只读权限" />}
            {result.items.length === 0 && <p>暂无反馈</p>}
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {result.items.map(item => (
                <li key={item.id} style={{ borderBottom: '1px solid #ddd', padding: '12px 0', overflowWrap: 'anywhere' }}>
                  <div>{sources[item.source]} · {statuses[item.status]} · {date(item.createdAt)}</div>
                  <p>{Array.from(item.content).slice(0, 100).join('')}{Array.from(item.content).length > 100 ? '…' : ''}</p>
                  <Button onClick={event => {
                    detailButton.current = event.currentTarget
                    setActive(item.id)
                    setOpen(true)
                  }}>查看详情</Button>
                </li>
              ))}
            </ul>
            <Pagination current={query.page} total={result.total} pageSize={SIZE} showSizeChanger={false} responsive
              onChange={page => setQuery(previous => ({ ...previous, page }))} />
          </>
        )}
      </section>
      <Drawer title="反馈详情" open={open} keyboard={!saving} closable={!saving}
        focusable={{ focusTriggerAfterClose: false }} styles={{ wrapper: { maxWidth: '100vw' } }}
        onClose={() => { if (!saving) setOpen(false) }}
        afterOpenChange={visible => {
          if (!visible) {
            setActive(undefined)
            const target = detailButton.current
            if (target?.isConnected) target.focus()
            else filters.current?.querySelector('select')?.focus()
          }
        }}>
        {active && <FeedbackDetail key={active} id={active} updated={refresh} savingChanged={setSaving} />}
      </Drawer>
    </>
  )
}
