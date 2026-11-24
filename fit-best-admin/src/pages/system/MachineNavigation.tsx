import { useEffect, useState } from 'react'
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, message } from 'antd'
import { machineNavigationApi, type BluetoothRule, type BluetoothRuleInput, type MachineNavigationConfig,
  type MachineNavigationPreview, type NavigationItem } from '@/api/system'

const languages = { 'zh-CN': '简体中文', en: '英语', ja: '日语', ko: '韩语', es: '西班牙语', de: '德语', fr: '法语' }
const matchLabels = { exact: '完整名称', prefix: '前缀', contains: '包含' }
const protocolLabels = { FTMS: 'FTMS', PRIVATE: '私有协议（FFF0）' }
const integerRules = [{ required: true, type: 'integer' as const, min: 0, max: 2147483647, message: '请输入非负整数' }]

type Editor = { kind: 'item'; item: NavigationItem } | { kind: 'rule'; rule?: BluetoothRule }
type RuleForm = Omit<BluetoothRuleInput, 'patterns'> & { patterns: string }

function splitPatterns(value = '') {
  return value.split(/\r?\n/).map(pattern => pattern.trim()).filter(Boolean)
}

function patternValidator(max: number, required: boolean) {
  return async (_: unknown, value?: string) => {
    const patterns = splitPatterns(value)
    if (required && patterns.length === 0) throw new Error('请至少填写一个广播名')
    if (patterns.length > max) throw new Error(`最多可填写 ${max} 个广播名`)
    if (patterns.some(pattern => pattern.length > 128)) throw new Error('每行最多 128 个字符')
    if (new Set(patterns.map(pattern => pattern.toLowerCase())).size !== patterns.length) {
      throw new Error('请移除重复的广播名，匹配时忽略大小写')
    }
  }
}

export default function MachineNavigation() {
  const [config, setConfig] = useState<MachineNavigationConfig>()
  const [loading, setLoading] = useState(true)
  const [loadingFailed, setLoadingFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editor, setEditor] = useState<Editor>()
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<MachineNavigationPreview>()
  const [messages, messageContext] = message.useMessage()

  async function load(signal?: AbortSignal) {
    try {
      const result = await machineNavigationApi.get(signal)
      if (signal?.aborted) return
      setConfig(result)
      setLoadingFailed(false)
      setPreview(undefined)
    } catch {
      if (!signal?.aborted) setLoadingFailed(true)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [])

  function refresh() {
    setLoading(true)
    setLoadingFailed(false)
    void load()
  }

  async function save(request: () => Promise<MachineNavigationConfig>) {
    setSaving(true)
    try {
      setConfig(await request())
      setPreview(undefined)
      setEditor(undefined)
      messages.success('已保存，客户端刷新后生效')
    } catch {
      // API 拦截器显示错误，保留输入供修改。
    } finally {
      setSaving(false)
    }
  }

  async function runPreview({ name }: { name: string }) {
    setPreviewing(true)
    setPreview(undefined)
    try {
      setPreview(await machineNavigationApi.preview(name.trim()))
    } catch {
      // API 拦截器显示错误。
    } finally {
      setPreviewing(false)
    }
  }

  const busy = loading || saving || previewing
  const machines = config?.machineTypes ?? []
  const label = (code: string) => machines.find(item => item.code === code)?.names['zh-CN'] ?? code
  const rule = editor?.kind === 'rule' ? editor.rule : undefined

  return (
    <Card title="器械导航与蓝牙规则" extra={<Button onClick={refresh} loading={loading} disabled={saving || previewing}>刷新配置</Button>}>
      {messageContext}
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        {loadingFailed && <Alert showIcon type="error" title="无法加载配置，请点击刷新配置重试" />}
        <section aria-label="App 器械导航">
          <h3>App 器械导航</h3>
          <Table<NavigationItem> rowKey="code" loading={loading} size="small" pagination={false} scroll={{ x: 500 }}
            dataSource={machines} columns={[
              { title: '机型', dataIndex: 'code', render: (code: string) => `${label(code)} · ${code}` },
              { title: '排序', dataIndex: 'sortOrder' },
              { title: '导航状态', dataIndex: 'visible', render: (visible: boolean) => <Tag color={visible ? 'green' : 'default'}>{visible ? '显示' : '隐藏'}</Tag> },
              { title: '操作', render: (_, item) => <Button type="link" aria-label={`编辑导航 ${label(item.code)}`}
                disabled={busy} onClick={() => setEditor({ kind: 'item', item })}>编辑</Button> },
            ]} />
        </section>
        <section aria-label="蓝牙识别规则">
          <Space wrap size="middle" style={{ width: '100%', justifyContent: 'space-between' }}>
            <h3>蓝牙识别规则</h3>
            <Button type="primary" disabled={busy || !config} onClick={() => setEditor({ kind: 'rule' })}>新增规则</Button>
          </Space>
          <Table<BluetoothRule> rowKey="id" loading={loading} size="small" scroll={{ x: 760 }}
            dataSource={config?.bleRules ?? []} columns={[
              { title: '优先级', dataIndex: 'priority', width: 80 },
              { title: '器械类型', dataIndex: 'machineType', render: label, width: 110 },
              { title: '匹配方式', dataIndex: 'match', render: (match: BluetoothRule['match']) => matchLabels[match], width: 100 },
              { title: '广播名', dataIndex: 'patterns', render: (patterns: string[]) => <span style={{ overflowWrap: 'anywhere' }}>{patterns.join('、')}</span> },
              { title: '首选协议', dataIndex: 'preferredProtocol', render: (protocol: BluetoothRule['preferredProtocol']) => protocolLabels[protocol], width: 135 },
              { title: '状态', dataIndex: 'enabled', render: (enabled: boolean) => <Tag color={enabled ? 'green' : 'default'}>{enabled ? '启用' : '停用'}</Tag>, width: 80 },
              { title: '操作', render: (_, row) => <Button type="link" aria-label={`编辑蓝牙规则 ${row.priority}`}
                disabled={busy} onClick={() => setEditor({ kind: 'rule', rule: row })}>编辑</Button>, width: 80 },
            ]} />
        </section>
        {config && <>
          <section aria-label="禁用阻力调节">
            <h3>禁用阻力调节</h3>
            <Form<{ patterns: string }> name="resistancePatterns" key={JSON.stringify(config.resistanceDisabledPatterns)} layout="vertical"
              initialValues={{ patterns: config.resistanceDisabledPatterns.join('\n') }} disabled={busy}
              onFinish={({ patterns }) => save(() => machineNavigationApi.saveResistance(splitPatterns(patterns)))}>
              <Form.Item name="patterns" label="禁调阻力广播名片段" extra="每行一项。广播名包含任一片段时禁用阻力调节，忽略大小写。"
                rules={[{ validator: patternValidator(500, false) }]}>
                <Input.TextArea rows={3} />
              </Form.Item>
              <Button htmlType="submit" loading={saving && !editor}>保存名单</Button>
            </Form>
          </section>
          <section aria-label="广播名预览">
            <h3>广播名预览</h3>
            <Form<{ name: string }> name="broadcastPreview" layout="vertical" disabled={busy} onFinish={runPreview}>
              <Form.Item name="name" label="设备广播名" rules={[{ required: true, whitespace: true, message: '请输入设备广播名' }]}>
                <Input maxLength={128} onChange={() => setPreview(undefined)} />
              </Form.Item>
              <Button htmlType="submit" loading={previewing}>检查已保存规则</Button>
            </Form>
            <div role="status" aria-live="polite" style={{ marginTop: 12 }}>
              {preview && <Alert showIcon type={preview.matchedRules.length > 1 ? 'warning' : 'info'}
                title={preview.matchedRules.length === 0 ? '未命中识别规则' : '匹配结果'}
                description={<>
                  {preview.matchedRules.length > 0 && <ul>{preview.matchedRules.map((hit, index) => (
                    <li key={hit.id}>{label(hit.machineType)} · {protocolLabels[hit.preferredProtocol]} · 优先级 {hit.priority}{index === 0 ? '（生效）' : ''}</li>
                  ))}</ul>}
                  <div>{preview.resistanceDisabled ? '命中禁调阻力名单' : '未命中禁调阻力名单'}</div>
                </>} />}
            </div>
          </section>
        </>}
      </Space>
      {editor?.kind === 'item' && <Modal open title={`编辑导航 · ${label(editor.item.code)}`} footer={null}
        onCancel={() => { if (!saving) setEditor(undefined) }}>
        <Form<NavigationItem> name="navigationItem" layout="vertical" initialValues={editor.item} disabled={saving} scrollToFirstError={{ focus: true }}
          onFinish={values => save(() => machineNavigationApi.saveItem({ ...values, code: editor.item.code,
            names: Object.fromEntries(Object.entries(values.names).flatMap(([lang, name]) => name?.trim() ? [[lang, name.trim()]] : [])),
          }))}>
          <Form.Item name="visible" label="在 App 导航中显示" valuePropName="checked" extra="隐藏入口后，已启用的蓝牙规则仍参与识别。">
            <Switch aria-label="在 App 导航中显示" />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序" rules={integerRules}><InputNumber min={0} precision={0} /></Form.Item>
          {Object.entries(languages).map(([lang, language]) => (
            <Form.Item key={lang} name={['names', lang]} label={language} rules={lang === 'zh-CN'
              ? [{ required: true, whitespace: true, message: '请输入简体中文名称' }] : []}>
              <Input maxLength={80} />
            </Form.Item>
          ))}
          <Button type="primary" htmlType="submit" loading={saving}>保存导航</Button>
        </Form>
      </Modal>}
      {editor?.kind === 'rule' && <Modal open title={rule ? '编辑蓝牙规则' : '新增蓝牙规则'} footer={null}
        onCancel={() => { if (!saving) setEditor(undefined) }}>
        <Form<RuleForm> name="bluetoothRule" layout="vertical" disabled={saving} scrollToFirstError={{ focus: true }}
          initialValues={rule ? { ...rule, patterns: rule.patterns.join('\n') } : { match: 'exact', preferredProtocol: 'FTMS', enabled: true }}
          onFinish={values => save(() => {
            const input = { ...values, patterns: splitPatterns(values.patterns) }
            return rule ? machineNavigationApi.updateRule(rule.id, input) : machineNavigationApi.createRule(input)
          })}>
          <Form.Item name="machineType" label="器械类型" rules={[{ required: true, message: '请选择器械类型' }]}>
            <Select options={machines.map(item => ({ value: item.code, label: label(item.code) }))} />
          </Form.Item>
          <Form.Item name="match" label="匹配方式" rules={[{ required: true }]}>
            <Select options={Object.entries(matchLabels).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="patterns" label="广播名规则" required extra="每行一项，忽略大小写。"
            rules={[{ validator: patternValidator(100, true) }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="preferredProtocol" label="首选协议" rules={[{ required: true }]}>
            <Select options={Object.entries(protocolLabels).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="priority" label="优先级" extra="数值越小越先匹配。每条启用规则的优先级须不同。" rules={integerRules}>
            <InputNumber min={0} precision={0} />
          </Form.Item>
          <Form.Item name="enabled" label="启用规则" valuePropName="checked"><Switch aria-label="启用规则" /></Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>保存规则</Button>
        </Form>
      </Modal>}
    </Card>
  )
}
