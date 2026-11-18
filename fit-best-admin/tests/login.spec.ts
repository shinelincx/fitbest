import { expect, test } from '@playwright/test'

const phone = '13900000001'
const password = 'Example login for browser tests'
const admin = { id: 'test-admin', name: '测试管理员', phone, role: 'viewer' }

test('浏览器保存的账号和密码可在后台登录页自动填充并提交', async ({ page, baseURL }) => {
  await page.goto('about:logins')
  await page.getByRole('button', { name: 'Add password' }).click()
  await page.getByRole('textbox', { name: /Website address/ }).fill(baseURL!)
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(phone)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('option', { name: /13900000001/ })).toBeVisible()

  await page.route('**/admin/auth/login', route => route.fulfill({ json: { token: 'test-token', admin } }))
  await page.route('**/admin/users?*', route => route.fulfill({ json: { items: [], total: 0 } }))
  await page.goto('/fit-best/users')
  const usernameInput = page.getByLabel('手机号')
  const passwordInput = page.getByLabel('密码', { exact: true })
  await expect(usernameInput).toHaveAttribute('autocomplete', 'username')
  await expect(passwordInput).toHaveAttribute('autocomplete', 'current-password')
  await expect(usernameInput).toHaveValue(phone)
  await expect(passwordInput).toHaveValue(password)

  const request = page.waitForRequest('**/admin/auth/login')
  await passwordInput.press('Enter')
  expect((await request).postDataJSON()).toEqual({ phone, password })
  await expect(page).toHaveURL(/\/fit-best\/users$/)
  await expect(page.getByText(admin.name, { exact: true })).toBeVisible()
  const storage = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))
  expect(storage).not.toContain(password)
})

test('密码错误后可在原页面重试并返回原目标', async ({ page }) => {
  await page.route('**/admin/auth/login', route => {
    const valid = route.request().postDataJSON().password === password
    return valid
      ? route.fulfill({ json: { token: 'test-token', admin } })
      : route.fulfill({ status: 401, json: { message: '账号或密码错误' } })
  })
  await page.route('**/admin/users?*', route => route.fulfill({ json: { items: [], total: 0 } }))
  await page.goto('/fit-best/users')
  await page.getByLabel('手机号').fill(phone)
  const passwordInput = page.getByLabel('密码', { exact: true })
  await passwordInput.fill('incorrect')
  await passwordInput.press('Enter')
  await expect(page.getByText('账号或密码错误')).toBeVisible()
  await expect(page.getByLabel('手机号')).toHaveValue(phone)
  // 模拟仅更新原生输入框、未派发 change 事件的密码管理器。
  await passwordInput.evaluate((input: HTMLInputElement, value) => { input.value = value }, password)
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await expect(page).toHaveURL(/\/fit-best\/users$/)
})
