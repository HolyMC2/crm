import { describe, expect, it, vi, beforeEach } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'
const { call } = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call }))
import {
  sourceRows,
  useMarketingResource,
  marketingError,
} from '../../src/components/Reports/MarketingData'

beforeEach(() => {
  vi.stubGlobal('__', (text) => text)
  call.mockReset()
})

describe('marketing report sources', () => {
  it('combines legacy and chart rows, aggregates duplicates and keeps deal-only sources', () => {
    expect(
      sourceRows({
        leads_by_source: {
          data: [
            { name: 'Web', value: 2 },
            { name: 'Web', value: 3 },
          ],
        },
        deals_by_source: [['Call', 4]],
      }),
    ).toEqual([
      { name: 'Web', leads: 5, deals: 0 },
      { name: 'Call', leads: 0, deals: 4 },
    ])
  })
  it('retains zero values and handles empty reports', () => {
    expect(sourceRows(null)).toEqual([])
    expect(
      sourceRows({ leads_by_source: [{ source: 'Web', count: 0 }] }),
    ).toEqual([{ name: 'Web', leads: 0, deals: 0 }])
  })
})

describe('isolated marketing requests', () => {
  it('ignores stale responses after filter changes', async () => {
    let resolveFirst
    call
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce(['new'])
    const scope = effectScope()
    const filters = reactive({ owner: 'first' })
    const state = scope.run(() =>
      useMarketingResource('test.endpoint', () => ({ user: filters.owner })),
    )
    expect(state.loading).toBe(true)
    filters.owner = 'second'
    await nextTick()
    await nextTick()
    expect(state.data).toEqual(['new'])
    resolveFirst(['old'])
    await nextTick()
    expect(state.data).toEqual(['new'])
    expect(call).toHaveBeenLastCalledWith('test.endpoint', { user: 'second' })
    scope.stop()
  })
  it('reports network failures without labeling them as permissions and retries', async () => {
    call
      .mockRejectedValueOnce(new Error('Network failed'))
      .mockResolvedValueOnce([])
    const scope = effectScope()
    const state = scope.run(() =>
      useMarketingResource('test.endpoint', () => ({})),
    )
    await nextTick()
    expect(state.loading).toBe(false)
    expect(state.error).toContain('No se pudo cargar')
    await state.reload()
    expect(state.error).toBe('')
    expect(state.data).toEqual([])
    scope.stop()
  })
  it('identifies actual permission errors', () => {
    expect(marketingError({ exc_type: 'PermissionError' })).toContain('permiso')
  })
})
