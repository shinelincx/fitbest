import { expect, test, type Page } from '@playwright/test'
import type { AdminInfo } from '../src/api/admin'
import type { WebsiteContent } from '../src/api/system'

const platformAdmin: AdminInfo = {
  id: 'platform-1', name: '测试管理员', phone: '13900000001', role: 'super',
  orgId: 'org-1', orgName: '测试组织', gymId: null, gymName: null,
}

function useFixtureAccount(page: Page, admin: AdminInfo) {
  return page.addInitScript(account => {
    localStorage.setItem('fitbest_admin_token', 'test-session')
    localStorage.setItem('fitbest_admin_info', JSON.stringify(account))
  }, admin)
}

test('账号创建表单提交组织、门店与菜单权限并展示一次性设密链接', async ({ page }) => {
  await useFixtureAccount(page, platformAdmin)
  await page.route('**/admin/system/organizations', route => route.fulfill({ json: [
    { id: 'org-1', name: '测试组织', status: 'active' },
  ] }))
  await page.route('**/admin/gyms', route => route.fulfill({ json: [
    { id: 'gym-1', orgId: 'org-1', name: '测试门店' },
  ] }))
  await page.route('**/admin/system/accounts', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [platformAdmin] })
    return route.fulfill({ json: { setupToken: 'dummy-link-credential', expiresAt: '2026-11-18T12:00:00.000Z' } })
  })

  await page.goto('/fit-best/system/accounts')
  await page.getByRole('button', { name: '新建账号' }).click()
  const form = page.getByRole('dialog', { name: '新建管理账号' })
  await form.getByLabel('姓名').fill('新建只读人员')
  await form.getByLabel('手机号').fill('13900000066')
  await form.getByLabel('门店').click()
  await page.getByText('测试门店', { exact: true }).click()
  const feedbackMenu = form.getByRole('switch', { name: '意见反馈菜单' })
  await expect(feedbackMenu).not.toBeChecked()
  await feedbackMenu.click()
  const submitted = page.waitForRequest(request => request.url().endsWith('/admin/system/accounts') && request.method() === 'POST')
  await form.getByRole('button', { name: '创建并生成设密链接' }).click()
  expect((await submitted).postDataJSON()).toMatchObject({
    name: '新建只读人员', phone: '13900000066', role: 'viewer', orgId: 'org-1', gymId: 'gym-1',
    feedbackManager: true,
  })
  const link = page.getByRole('dialog', { name: '一次性设密链接' })
  await expect(link.getByText(/\/fit-best\/setup#token=dummy-link-credential/)).toBeVisible()
})

const website: WebsiteContent = {
  seoTitle: 'FITBEST', seoDescription: '智能器械训练', heroHeadline: '懂你的训练',
  heroEmphasis: '着眼进步', heroDescription: '连接器械开始训练', heroImageAlt: '训练图片',
  heroImage: 'https://images.unsplash.com/test.jpg', productTitle: '产品', equipmentTitle: '器械',
  equipmentDescription: '有氧与力量', trainingTitle: '开始训练', treadmillTitle: '跑步机',
  hyroxTitle: 'HYROX', btweTitle: 'BTWE', downloadTitle: '下载', downloadDescription: '官方商店版',
  storeApple: 'https://apps.apple.com/cn/app/fitbest/id6448613913', storeGoogle: 'https://play.google.com/store/apps/details?id=com.fitbest.www',
  webUrl: '/fitbest/', hdUrl: '/fitbest-hd/', treadmillUrl: '/fitbest/#/train/treadmill', hyroxUrl: '/hyrox/#/train',
  btweUrl: '/btwe/#/train', supportEmail: 'support@example.test',
}

test('有发布权限的运营可以直接发布已保存草稿', async ({ page }) => {
  await useFixtureAccount(page, { ...platformAdmin, role: 'ops', sitePublisher: true })
  let version = 1
  await page.route('**/admin/system/website', route => route.fulfill({ json: {
    draft: { revision: version, content: website },
    versions: [{ version, publishedAt: '2026-11-18T09:00:00.000Z', publishedBy: null, restoredFrom: null }],
  } }))
  await page.route('**/admin/system/website/publications', route => {
    version += 1
    return route.fulfill({ json: { version } })
  })

  await page.goto('/fit-best/system/website')
  await expect(page.getByLabel('页面标题')).toBeDisabled()
  await expect(page.getByRole('button', { name: '保存草稿' })).toHaveCount(0)
  await page.getByRole('button', { name: '发布官网' }).click()
  const submitted = page.waitForRequest('**/admin/system/website/publications')
  await page.getByRole('button', { name: '确认发布' }).click()
  expect((await submitted).postDataJSON()).toEqual({ revision: 1 })
  await expect(page.getByText('已发布版本 2', { exact: true }).first()).toBeVisible()
})

const areaPath = [
  { code: '440000', name: '广东省', level: 1, parentCode: null },
  { code: '440100', name: '广州市', level: 2, parentCode: '440000' },
  { code: '440106', name: '天河区', level: 3, parentCode: '440100' },
]
const org = { id: 'org-1', name: '测试组织', status: 'active' }
const gym = { id: 'gym-1', orgId: org.id, name: '天河门店', code: 'GZ-01', orgName: org.name,
  status: 'active', address: '体育路一号', districtCode: '440106', machineCount: 0, createdAt: '2026-11-18T00:00:00Z' }

test('门店编辑可回显原地址、清除或重新选择省市区', async ({ page }) => {
  await useFixtureAccount(page, platformAdmin)
  await page.route('**/admin/system/organizations', route => route.fulfill({ json: [org] }))
  await page.route('**/admin/system/dictionary/regions', route => route.fulfill({ json: areaPath }))
  await page.route('**/admin/gyms', route => route.fulfill({ json: [gym] }))
  await page.route('**/admin/gyms/gym-1', route => route.fulfill({ json: {} }))
  await page.goto('/fit-best/gyms')
  await expect(page.getByText('广东省 广州市 天河区 体育路一号')).toBeVisible()
  await page.getByRole('button', { name: '编辑' }).click()
  const form = page.getByRole('dialog')
  await expect(form.getByLabel('详细地址')).toHaveValue('体育路一号')
  await expect(form.getByText('时区', { exact: true })).toHaveCount(0)
  await form.locator('.ant-cascader').hover()
  await form.locator('.ant-select-clear').click()
  await form.getByLabel('省 / 市 / 区县').click()
  for (const region of areaPath) await page.getByRole('menuitemcheckbox', { name: region.name }).click()
  await form.getByLabel('详细地址').fill('体育路二号')
  const saved = page.waitForRequest(r => r.url().endsWith('/admin/gyms/gym-1') && r.method() === 'PATCH')
  await form.getByRole('button', { name: /保\s*存/ }).click()
  expect((await saved).postDataJSON()).toMatchObject({ address: '体育路二号', districtCode: '440106' })
})

test('独立型号入口、新建器械可省略或选择同组织门店', async ({ page }) => {
  await useFixtureAccount(page, platformAdmin)
  await page.route('**/admin/system/organizations', route => route.fulfill({ json: [org] }))
  await page.route('**/admin/system/dictionary/machine-types', route => route.fulfill({ json: [{ code: 'rower', label: '划船机', selectable: true }] }))
  await page.route('**/admin/machine-models', route => route.fulfill({ json: [
    { id: 'model-1', orgId: org.id, type: 'rower', model: 'R-01', brand: 'Fitbest', machineCount: 0 },
  ] }))
  await page.route('**/admin/gyms', route => route.fulfill({ json: [gym, { ...gym, id: 'other', orgId: 'org-2', name: '外部门店' }] }))
  await page.route('**/admin/machines', route => route.fulfill({ json: [] }))
  await page.goto('/fit-best/machine-models')
  await expect(page.getByRole('heading', { name: '器械型号' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'R-01' })).toBeVisible()
  await page.route('**/admin/machine-models/model-1', route => route.fulfill({ json: {} }))
  await page.getByRole('button', { name: /编\s*辑/ }).click()
  const editor = page.getByRole('dialog')
  await editor.getByLabel('型号名称').fill('R-02')
  const edited = page.waitForRequest(r => r.method() === 'PATCH' && r.url().endsWith('/admin/machine-models/model-1'))
  await editor.getByRole('button', { name: /确\s*定|OK/ }).click()
  expect((await edited).postDataJSON().model).toBe('R-02')
  await page.getByRole('menuitem', { name: /器械$/ }).click()
  for (const assign of [false, true]) {
    await page.getByRole('button', { name: '新建器械' }).click()
    const form = page.getByRole('dialog')
    await form.getByLabel('型号', { exact: true }).click()
    await page.getByText(/划船机 · Fitbest R-01/).click()
    if (assign) {
      await form.getByLabel('门店', { exact: true }).click()
      await expect(page.getByText(/外部门店/)).toHaveCount(0)
      await page.getByText(/天河门店 · GZ-01/).click()
    }
    await form.getByLabel('序列号').fill(assign ? 'assigned' : 'unassigned')
    const created = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/admin/machines'))
    await form.getByRole('button', { name: /创\s*建/, exact: true }).click()
    const body = (await created).postDataJSON()
    expect(body.modelId).toBe('model-1')
    expect(body.gymId).toBe(assign ? 'gym-1' : undefined)
    await expect(form).toHaveCount(0)
  }
})

test('用户明细按活动分组，返回列表保留检索条件', async ({ page }) => {
  await useFixtureAccount(page, platformAdmin)
  const user = { id: 'user-1', nickname: '测试学员', status: 'active', createdAt: '2026-11-18',
    goals: { weeklySessions: 3, weeklyMinutes: 90 }, identities: [{ type: 'phone', identifier: '139****0001', verifiedAt: null }] }
  await page.route('**/admin/users?**', route => route.fulfill({ json: { items: [user], total: 1, page: 1, pageSize: 20 } }))
  await page.route('**/admin/users/user-1', route => route.fulfill({ json: { ...user, sessions: [], registrations: [], trainingRecords: [] } }))
  await page.route('**/admin/system/dictionary/machine-types', route => route.fulfill({ json: [] }))
  await page.goto('/fit-best/users')
  await page.getByLabel('搜索训练用户').fill('测试学员')
  await page.getByLabel('搜索训练用户').press('Enter')
  await page.getByRole('link', { name: '查看明细' }).click()
  await expect(page.getByText('账号资料')).toBeVisible()
  await expect(page.getByText('139****0001')).toBeVisible()
  await page.getByRole('tab', { name: /器械训练/ }).click()
  await expect(page.getByText('暂无器械训练')).toBeVisible()
  await page.getByRole('button', { name: '返回用户列表' }).click()
  await expect(page.getByLabel('搜索训练用户')).toHaveValue('测试学员')
  await expect(page.getByRole('menuitem', { name: /训练记录$/ })).toBeVisible()
})

test('数据字典可在选定市下新增区县', async ({ page }) => {
  await useFixtureAccount(page, platformAdmin)
  await page.route('**/admin/system/dictionary/machine-types', route => route.fulfill({ json: [] }))
  await page.route('**/admin/system/settings', route => route.fulfill({ json: { defaultGymTimezone: 'Asia/Shanghai' } }))
  await page.route('**/admin/system/dictionary/regions', route => route.fulfill({ json: areaPath }))
  await page.goto('/fit-best/system/catalog')
  const province = page.getByRole('row', { name: /广东省/ })
  await province.locator('button.ant-table-row-expand-icon').click()
  await page.getByRole('row', { name: /广州市/ }).getByRole('button', { name: '新增区/县' }).click()
  const form = page.getByRole('dialog')
  await form.getByLabel('地区编码').fill('440199')
  await form.getByLabel('地区名称').fill('测试区')
  const saved = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/dictionary/regions'))
  await form.getByRole('button', { name: /确\s*定|OK/ }).click()
  expect((await saved).postDataJSON()).toEqual({ code: '440199', name: '测试区', parentCode: '440100' })
})
