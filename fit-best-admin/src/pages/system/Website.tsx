import { useEffect, useState } from 'react'
import { Button, Card, Col, Form, Input, Modal, Row, Segmented, Select, Space, Table, Tag, Typography, message } from 'antd'
import { systemApi, type Publication, type WebsiteContent } from '@/api/system'
import { useAdminStore } from '@/store/admin'
import { canEditWebsite, canPublishWebsite } from '@/utils/adminPermissions'

const groups: { title: string; fields: [keyof WebsiteContent, string, number][] }[] = [
  { title: '首页与搜索展示', fields: [
    ['seoTitle', '页面标题', 160], ['seoDescription', '搜索摘要', 320],
    ['heroHeadline', '首屏标题', 80], ['heroEmphasis', '首屏强调文案', 80],
    ['heroDescription', '首屏介绍', 380], ['heroImage', '主图地址', 1000], ['heroImageAlt', '主图替代文字', 120],
  ] },
  { title: '产品与训练', fields: [
    ['productTitle', '产品区标题', 120], ['equipmentTitle', '器械区标题', 120],
    ['equipmentDescription', '器械区介绍', 380], ['trainingTitle', '训练区标题', 120],
    ['treadmillTitle', '主训练卡片标题', 120], ['hyroxTitle', 'HYROX 卡片标题', 120], ['btweTitle', 'BTWE 卡片标题', 120],
    ['webUrl', '网页训练入口', 240], ['hdUrl', '场馆大屏入口', 240],
    ['treadmillUrl', '主训练卡片入口', 240], ['hyroxUrl', 'HYROX 卡片入口', 240], ['btweUrl', 'BTWE 卡片入口', 240],
  ] },
  { title: '下载与联系', fields: [
    ['downloadTitle', '下载区标题', 120], ['downloadDescription', '下载区介绍', 380],
    ['storeApple', 'App Store 地址', 1000], ['storeGoogle', 'Google Play 地址', 1000], ['supportEmail', '联系邮箱', 254],
  ] },
]

const trainingPaths = [
  ['/fitbest/', '主训练端首页'], ['/fitbest-hd/', '主训练端 HD'], ['/fitbest/#/train/treadmill', '跑步机训练'],
  ['/fitbest/#/machines', '器械列表'], ['/fitbest/#/strength', '力量训练'], ['/fitbest/#/pin', '智能插销'],
  ['/hyrox/', 'HYROX 首页'], ['/hyrox/HD/', 'HYROX HD'], ['/hyrox/#/train', 'HYROX 训练'], ['/hyrox/#/plans', 'HYROX 计划'],
  ['/btwe/', 'BTWE 首页'], ['/btwe/HD/', 'BTWE HD'], ['/btwe/#/train', 'BTWE 训练'], ['/btwe/#/plans', 'BTWE 计划'],
].map(([value, label]) => ({ value, label }))

export default function Website() {
  const actor = useAdminStore(s => s.admin)
  const editor = canEditWebsite(actor)
  const publisher = canPublishWebsite(actor)
  const [form] = Form.useForm<WebsiteContent>()
  const [revision, setRevision] = useState<number>()
  const [versions, setVersions] = useState<Publication[]>([])
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [preview, setPreview] = useState<string>()
  const [previewWidth, setPreviewWidth] = useState(1200)

  async function load() {
    const state = await systemApi.website()
    form.setFieldsValue(state.draft.content)
    setRevision(state.draft.revision)
    setVersions(state.versions)
    setDirty(false)
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } catch {
      // API 拦截器和表单展示错误。
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void run(load) }, [])

  async function save(content: WebsiteContent) {
    if (!revision) return
    await run(async () => {
      const draft = await systemApi.saveWebsite({ revision, content })
      setRevision(draft.revision)
      setDirty(false)
      message.success('官网草稿已保存')
    })
  }

  function confirmPublish(restoreVersion?: number) {
    if (!revision || dirty) return
    Modal.confirm({
      title: restoreVersion ? '恢复版本 ' + restoreVersion : '发布官网',
      content: '确认后，匿名访客将看到这次发布的内容。',
      okText: restoreVersion ? '恢复并发布' : '确认发布',
      onOk: () => run(async () => {
        const result = await systemApi.publishWebsite(revision, restoreVersion)
        await load()
        message.success('已发布版本 ' + result.version)
      }),
    })
  }

  function refresh() {
    if (dirty) {
      Modal.confirm({ title: '重新加载草稿', content: '未保存的修改会被覆盖。', onOk: () => run(load) })
    } else {
      void run(load)
    }
  }

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Space wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>官网管理</Typography.Title>
        {versions[0] && <Tag color="green">已发布版本 {versions[0].version}</Tag>}
        {dirty && <Tag color="orange">草稿未保存</Tag>}
      </Space>
      <Space wrap>
        <Button onClick={refresh} loading={busy}>重新加载</Button>
        <Button disabled={!revision || busy} onClick={() => run(async () => {
          const content = await form.validateFields()
          setPreview((await systemApi.previewWebsite(content)).html)
        })}>预览</Button>
        {editor && <Button disabled={!revision || !dirty || busy} onClick={() => form.submit()}>保存草稿</Button>}
        {publisher && <Button type="primary" disabled={!revision || dirty || busy} onClick={() => confirmPublish()}>发布官网</Button>}
        <Button href="/fitbestwebsite/" target="_blank" rel="noopener">打开已发布官网</Button>
      </Space>
      <Form form={form} layout="vertical" disabled={!editor || !revision || busy} onFinish={save}
        onValuesChange={() => setDirty(true)}>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {groups.map(group => (
            <Card key={group.title} title={group.title}>
              <Row gutter={24}>
                {group.fields.map(([name, label, limit]) => (
                  <Col key={name} xs={24} lg={12}>
                    <Form.Item name={name} label={label} rules={[
                      { required: true, whitespace: true },
                      ...(name === 'supportEmail' ? [{ type: 'email' as const, message: '请输入有效邮箱' }] : []),
                    ]}>
                      {name.endsWith('Url') ? <Select options={trainingPaths} />
                        : name.endsWith('Description') ? <Input.TextArea maxLength={limit} rows={2} />
                          : <Input maxLength={limit} />}
                    </Form.Item>
                  </Col>
                ))}
              </Row>
            </Card>
          ))}
        </Space>
      </Form>
      <Card title="发布记录">
        <Table<Publication> rowKey="version" dataSource={versions} loading={busy} scroll={{ x: 560 }}
          pagination={{ pageSize: 10 }} columns={[
            { title: '版本', dataIndex: 'version' },
            { title: '发布时间', dataIndex: 'publishedAt', render: value => new Date(value).toLocaleString() },
            { title: '发布人 ID', dataIndex: 'publishedBy', render: value => value ?? '初始版本' },
            { title: '恢复自', dataIndex: 'restoredFrom', render: value => value ?? '—' },
            { title: '操作', render: (_, row, index) => publisher && index > 0 &&
              <Button type="link" disabled={dirty || busy} onClick={() => confirmPublish(row.version)}>恢复此版本</Button> },
          ]} />
      </Card>
      <Modal title="官网预览" open={preview !== undefined} onCancel={() => setPreview(undefined)}
        width="min(1260px, 96vw)" footer={null} destroyOnHidden>
        <Space orientation="vertical" align="center" style={{ width: '100%' }}>
          <Segmented<number> value={previewWidth} onChange={setPreviewWidth}
            options={[{ label: '桌面', value: 1200 }, { label: '手机', value: 390 }]} />
          <iframe title="官网预览画面" sandbox="allow-scripts" srcDoc={preview}
            style={{ display: 'block', width: previewWidth, maxWidth: '85vw', height: '70vh', border: '1px solid #ddd' }} />
        </Space>
      </Modal>
    </Space>
  )
}
