import { expect, it, vi } from 'vitest'

const http = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('../../fit-best-admin/src/api/http', () => ({ default: http }))

import { adminApi } from '../../fit-best-admin/src/api/admin'

it('按后台接口契约传递器械 ID 和 NFC 标签值', async () => {
  http.post.mockResolvedValue({})
  await adminApi.generateQrTag('machine-1')
  await adminApi.createNfcTag('machine-2', 'nfc-123')
  expect(http.post).toHaveBeenNthCalledWith(1, '/admin/tags/generate', null, { params: { machineId: 'machine-1' } })
  expect(http.post).toHaveBeenNthCalledWith(2, '/admin/tags/nfc', { tagValue: 'nfc-123' }, { params: { machineId: 'machine-2' } })
})
