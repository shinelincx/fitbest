import { isAxiosError } from 'axios'
import type { Paginated } from '../api/admin'
import { useAdminStore } from '../store/admin'

type CsvCell = string | number | null | undefined

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** 导出 CSV（带 BOM，Excel 打开不乱码） */
function exportCsv(
  filename: string,
  headers: string[],
  rows: CsvCell[][],
) {
  const content = ['\ufeff' + headers.map(escapeCell).join(','), ...rows.map((row) => row.map(escapeCell).join(','))].join(
    '\n',
  )
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
export async function exportCsvPages<Row extends { id: string | number }>(
  status: { success: (message: string) => unknown; error: (message: string) => unknown },
  filename: string,
  headers: string[],
  fetchPage: (page: number, pageSize: number) => Promise<Paginated<Row>>,
  toRow: (row: Row) => CsvCell[],
) {
  const token = useAdminStore.getState().token
  try {
    const first = await fetchPage(1, 500)
    const { total, pageSize } = first
    if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(pageSize) || pageSize < 1) {
      throw new Error('导出分页数据无效，请重试')
    }
    const rows: CsvCell[][] = []
    const ids = new Set<Row['id']>()
    for (let page = 1; page <= Math.max(1, Math.ceil(total / pageSize)); page++) {
      const result = page === 1 ? first : await fetchPage(page, pageSize)
      if (useAdminStore.getState().token !== token) {
        throw new Error('后台账号已切换，请重新导出')
      }
      const expected = Math.min(pageSize, total - rows.length)
      if (result.page !== page || result.pageSize !== pageSize || result.total !== total || result.items.length !== expected) {
        throw new Error('导出期间列表发生变化，请重新导出')
      }
      for (const item of result.items) {
        if (ids.has(item.id)) throw new Error('导出期间列表发生变化，请重新导出')
        ids.add(item.id)
        rows.push(toRow(item))
      }
    }
    exportCsv(filename, headers, rows)
    status.success(`已导出 ${rows.length} 条记录`)
  } catch (error) {
    // 请求错误已经由后台 API 拦截器提示。
    if (!isAxiosError(error)) status.error(error instanceof Error ? error.message : '导出失败，请重试')
  }
}
