import { expect, test, type Page } from '@playwright/test'

const route = '/fit-best/feedback'
const api = '**/api/v1/admin/feedback'
const id = '94c283e5-1858-40d7-8188-7f6cb7860764'
const imageId = '5c2600c9-69d6-4c45-b9f9-afb8f0d89a9b'
const createdAt = '2026-11-19T10:00:00Z'
const item = {
  id, source: 'hyrox', status: 'pending', version: 0, createdAt,
  content: '隔离反馈浏览器样本', submitterId: null, submitterName: null,
}

async function seed(page: Page, role: 'viewer' | 'super') {
  await page.addInitScript(role => {
    localStorage.setItem('fitbest_admin_token', 'feedback-test-token')
    localStorage.setItem('fitbest_admin_info', JSON.stringify({ id: 'test', role, name: '测试人员' }))
  }, role)
}

test('筛选、图片授权头、冲突刷新及服务故障重试', async ({ page }) => {
  await seed(page, 'super')
  let attempts = 0
  let version = 0
  await page.route(`${api}?*`, route => route.fulfill({ json: { items: [item], total: 21, canWrite: true } }))
  await page.route(`${api}/${id}`, route => route.fulfill({ json: {
    feedback: { ...item, version, status: version ? 'in_progress' : 'pending' }, attachments: [imageId],
    history: version ? [{ version, actorId: 'test', actorName: '测试处理者',
      fromStatus: 'pending', toStatus: 'in_progress', note: '样本历史', createdAt }] : [],
    canWrite: true,
  } }))
  await page.route(`${api}/${id}/attachments/${imageId}`, async route => {
    expect(route.request().headers().authorization).toBe('Bearer feedback-test-token')
    await route.fulfill({ contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=', 'base64') })
  })
  await page.route(`${api}/${id}/actions`, async route => {
    attempts += 1
    expect(route.request().postDataJSON().note).toBe('测试备注')
    if (attempts === 1) {
      version = 1
      await route.fulfill({ status: 409, json: { message: '反馈已被更新' } })
    } else if (attempts === 2) {
      await route.fulfill({ status: 500, json: { message: '服务故障' } })
    } else {
      version = 2
      await route.fulfill({ json: { version } })
    }
  })

  await page.goto(route)
  const filters = page.getByRole('form', { name: '反馈筛选' })
  await filters.getByRole('combobox', { name: '来源' }).selectOption('hyrox')
  await filters.getByRole('combobox', { name: '状态' }).selectOption('pending')
  const filtered = page.waitForRequest(req => req.url().includes('source=hyrox') && req.url().includes('status=pending'))
  await filters.getByRole('button', { name: /^筛\s*选$/ }).click()
  await filtered

  await page.getByRole('button', { name: '查看详情' }).click()
  const dialog = page.getByRole('dialog', { name: '反馈详情' })
  await expect(dialog.getByRole('img', { name: '反馈图片 1' })).toBeVisible()
  await dialog.getByRole('textbox', { name: '处理备注' }).fill('测试备注')
  await dialog.getByRole('button', { name: '开始处理' }).click()
  await expect(dialog.getByText('反馈已被其他操作更新，请刷新详情后重试。')).toBeVisible()
  await dialog.getByRole('button', { name: '刷新详情' }).click()
  await expect(dialog.getByText('样本历史')).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: '处理备注' })).toHaveValue('测试备注')
  await dialog.getByRole('button', { name: '添加备注' }).click()
  await expect(dialog.getByText('操作失败，备注已保留，请重试。')).toBeVisible()
  await dialog.getByRole('button', { name: '添加备注' }).click()
  await expect(dialog.getByRole('textbox', { name: '处理备注' })).toHaveValue('')
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect.poll(async () => page.evaluate(() => document.activeElement?.tagName)).toMatch(/^(BUTTON|SELECT)$/)
  expect(attempts).toBe(3)
})

test('只呈现服务端许可的只读信息，403 时隐藏反馈，列表故障可重试', async ({ page }) => {
  await seed(page, 'viewer')
  let status = 500
  await page.route(`${api}?*`, route => status === 200
    ? route.fulfill({ json: { items: [item], total: 1, canWrite: false } })
    : route.fulfill({ status, json: { message: '测试错误' } }))
  await page.route(`${api}/${id}`, route => route.fulfill({
    json: { feedback: item, attachments: [], history: [], canWrite: false },
  }))
  await page.goto(route)
  await expect(page.getByText('加载失败，请重试')).toBeVisible()
  status = 200
  await page.getByRole('button', { name: /^重\s*试$/ }).click()
  await page.getByRole('button', { name: '查看详情' }).click()
  const dialog = page.getByRole('dialog', { name: '反馈详情' })
  await expect(dialog.getByText('只读权限')).toBeVisible()
  await expect(dialog.getByRole('button', { name: '开始处理' })).toHaveCount(0)
  status = 403
  await page.reload()
  await expect(page.getByText('当前账号无反馈数据权限')).toBeVisible()
  await expect(page.getByText(item.content)).toHaveCount(0)
})
