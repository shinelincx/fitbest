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

test('账号创建表单提交组织与门店并展示一次性设密链接', async ({ page }) => {
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
  const submitted = page.waitForRequest(request => request.url().endsWith('/admin/system/accounts') && request.method() === 'POST')
  await form.getByRole('button', { name: '创建并生成设密链接' }).click()
  expect((await submitted).postDataJSON()).toMatchObject({
    name: '新建只读人员', phone: '13900000066', role: 'viewer', orgId: 'org-1', gymId: 'gym-1',
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
