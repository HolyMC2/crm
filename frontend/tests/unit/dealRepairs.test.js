// The deal header's chips and Resumen's list share one Repair Order read per
// deal; a late answer for the deal the worker left never shows on the next one.
import { describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: api.call }))

import { dealRepairs, loadDealRepairs } from '@/composables/dealRepairs'

const deferred = () => {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

describe('dealRepairs', () => {
  it('reads a deal once, again only when forced', async () => {
    api.call.mockResolvedValue([{ name: 'RO-1', status: 'Recibido' }])
    await loadDealRepairs('DEAL-1')
    await loadDealRepairs('DEAL-1')
    expect(api.call).toHaveBeenCalledTimes(1)
    expect(dealRepairs('DEAL-1').data).toEqual([
      { name: 'RO-1', status: 'Recibido' },
    ])
    await loadDealRepairs('DEAL-1', { force: true })
    expect(api.call).toHaveBeenCalledTimes(2)
  })

  it('drops a late answer for the deal left behind', async () => {
    api.call.mockReset()
    const first = deferred()
    api.call
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce([{ name: 'RO-B' }])
    const a = loadDealRepairs('DEAL-A')
    await loadDealRepairs('DEAL-B')
    first.resolve([{ name: 'RO-A' }])
    await a
    expect(dealRepairs('DEAL-B').data).toEqual([{ name: 'RO-B' }])
    // a deal not yet read shows as loading, never another deal's rows
    expect(dealRepairs('DEAL-A')).toMatchObject({ data: null, loading: true })
  })
})
