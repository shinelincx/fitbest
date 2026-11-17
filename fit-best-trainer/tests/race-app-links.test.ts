import { expect, it } from 'vitest'
import { EXTERNAL_APPS } from '../src/mock/data'

it('赛事入口使用当前站点的训练端和对应 HD 页面', () => {
  expect(EXTERNAL_APPS.map(({ href }) => href)).toEqual(['/hyrox/', '/btwe/'])
  for (const { href } of EXTERNAL_APPS) {
    expect(new URL(href, 'https://cloud.thinkfiter.com/fitbest/').origin).toBe('https://cloud.thinkfiter.com')
    expect(new URL(`${href}HD/`, 'https://cloud.thinkfiter.com/fitbest/').pathname).toBe(`${href}HD/`)
  }
})
