import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { exportCsvPages } from '../../fit-best-admin/src/utils/exportCsv'

const account = vi.hoisted(() => ({ token: 'admin-a' }))
vi.mock('../../fit-best-admin/src/store/admin', () => ({
  useAdminStore: { getState: () => account },
}))

const status = { success: vi.fn(), error: vi.fn() }
const click = vi.fn()
const blobs: Blob[] = []

beforeEach(() => {
  account.token = 'admin-a'
  vi.stubGlobal('document', { createElement: () => ({ click }) })
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob)
    return 'blob:test'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  blobs.length = 0
})

it('导出所有 5,005 条筛选记录，保留顺序并正确处理 CSV 字段', async () => {
  const total = 5_005
  const data = Array.from({ length: total }, (_, id) => ({ id, nickname: id === 0 ? 'A,"B"\rC' : `用户 ${id}` }))
  const fetchPage = vi.fn(async (page: number, pageSize: number) => ({
    page,
    pageSize,
    total,
    items: data.slice((page - 1) * pageSize, page * pageSize),
  }))
  await exportCsvPages(status, '手环器械会话', ['ID', '用户'], fetchPage, (row) => [row.id, row.nickname])

  expect(fetchPage.mock.calls).toEqual(Array.from({ length: 11 }, (_, i) => [i + 1, 500]))
  expect(click).toHaveBeenCalledTimes(1)
  expect(status.success).toHaveBeenCalledWith('已导出 5005 条记录')
  expect(new Uint8Array(await blobs[0].arrayBuffer()).slice(0, 3)).toEqual(Uint8Array.of(0xef, 0xbb, 0xbf))
  const lines = (await blobs[0].text()).split('\n')
  expect(lines).toHaveLength(total + 1)
  expect(lines[0]).toBe('ID,用户')
  expect(lines[1]).toBe('0,"A,""B""\rC"')
  expect(lines.at(-1)).toBe('5004,用户 5004')
  expect(lines.slice(1).map((line) => Number(line.slice(0, line.indexOf(','))))).toEqual(data.map(({ id }) => id))
})

it.each(['total', 'duplicate', 'short page', 'request failed'])('分页返回异常时不下载半份 CSV（%s）', async (reason) => {
  const fetchPage = vi.fn(async (page: number) => {
    if (page === 2 && reason === 'request failed') throw new Error('网络已断开')
    const total = page === 2 && reason === 'total' ? 3 : 2
    const id = reason === 'duplicate' ? 'shared' : String(page)
    return { page, pageSize: 1, total, items: page === 2 && reason === 'short page' ? [] : [{ id }] }
  })
  await exportCsvPages(status, '训练记录', ['ID'], fetchPage, (row) => [row.id])

  expect(fetchPage.mock.calls).toEqual([[1, 500], [2, 1]])
  expect(blobs).toEqual([])
  expect(click).not.toHaveBeenCalled()
  expect(status.success).not.toHaveBeenCalled()
  expect(status.error).toHaveBeenCalledExactlyOnceWith(reason === 'request failed' ? '网络已断开' : '导出期间列表发生变化，请重新导出')
})

it('切换后台账号时丢弃正在导出的内容', async () => {
  const fetchPage = vi.fn(async (page: number) => {
    if (page === 2) account.token = 'admin-b'
    return { page, pageSize: 1, total: 3, items: [{ id: String(page) }] }
  })
  await exportCsvPages(status, '训练记录', ['ID'], fetchPage, (row) => [row.id])

  expect(fetchPage).toHaveBeenCalledTimes(2)
  expect(click).not.toHaveBeenCalled()
  expect(status.error).toHaveBeenCalledExactlyOnceWith('后台账号已切换，请重新导出')
})
