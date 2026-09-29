import { describe, expect, it, vi, beforeEach } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'
const { call } = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call }))
vi.mock('@/utils/numberFormat', () => ({
  money: (value, currency) => `${currency || 'DEFAULT'} ${value}`,
}))
import {
  drillFor,
  marketingFilters,
  moneyText,
  scopeNote,
  sourceRows,
  useMarketingResource,
  marketingError,
} from '../../src/components/Reports/MarketingData'

const leadDrill = {
  doctype: 'CRM Lead',
  filters: [['source', '=', 'Web']],
}

beforeEach(() => {
  vi.stubGlobal('__', (text, args = []) =>
    text.replace(/\{(\d+)\}/g, (_match, index) => args[index]),
  )
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
      { name: 'Web', leads: 5, deals: 0, drills: { leads: null, deals: null } },
      {
        name: 'Call',
        leads: 0,
        deals: 4,
        drills: { leads: null, deals: null },
      },
    ])
  })
  it('retains zero values and handles empty reports', () => {
    expect(sourceRows(null)).toEqual([])
    expect(
      sourceRows({ leads_by_source: [{ source: 'Web', count: 0 }] }),
    ).toEqual([
      { name: 'Web', leads: 0, deals: 0, drills: { leads: null, deals: null } },
    ])
  })
  it('keeps the server drill of a single source row and drops merged ones', () => {
    const rows = sourceRows({
      leads_by_source: {
        data: [
          { source: 'Web', count: 2, drill: leadDrill },
          { source: 'Ads', count: 1, drill: leadDrill },
          { source: 'Ads', count: 1, drill: leadDrill },
        ],
      },
    })
    expect(rows[0].drills.leads).toEqual(leadDrill)
    expect(rows[1]).toMatchObject({ name: 'Ads', leads: 2 })
    expect(rows[1].drills.leads).toBeNull()
  })
})

describe('marketing filters, currency and drills', () => {
  it('sends the shared filters except company and empty values', () => {
    expect(
      marketingFilters({
        from_date: '2026-09-01',
        to_date: '2026-09-28',
        owner: 'seller@example.test',
        pipeline: '',
        company: 'Doco',
      }),
    ).toEqual({
      from_date: '2026-09-01',
      to_date: '2026-09-28',
      owner: 'seller@example.test',
    })
  })
  it('explains ignored and per-metric filters', () => {
    expect(
      scopeNote(
        {
          applied_filters: ['from_date', 'to_date', 'owner', 'pipeline'],
          ignored_filters: [],
          metric_filters: {
            sent: ['from_date', 'to_date'],
            won: ['from_date', 'to_date', 'owner', 'pipeline'],
            failed: ['from_date', 'to_date'],
          },
        },
        { sent: 'Enviados', won: 'Ganados', failed: 'Fallidos' },
      ),
    ).toBe('responsable, pipeline no aplica a: Enviados, Fallidos.')
    expect(
      scopeNote({
        applied_filters: ['from_date', 'to_date'],
        ignored_filters: ['owner', 'pipeline'],
      }),
    ).toBe('Sin efecto aquí: responsable, pipeline.')
    expect(scopeNote(null)).toBe('')
  })
  it('formats money in the row, response or mixed currencies', () => {
    expect(moneyText({ revenue: 10, currency: 'USD' }, 'revenue', 'MXN')).toBe(
      'USD 10',
    )
    expect(moneyText({ revenue: 10 }, 'revenue', 'MXN')).toBe('MXN 10')
    expect(
      moneyText(
        {
          revenue: 15,
          currency: null,
          amounts_by_currency: { revenue: { USD: 10, MXN: 5 } },
        },
        'revenue',
        'MXN',
      ),
    ).toBe('USD 10 + MXN 5')
  })
  it('finds per-metric drills and ignores malformed ones', () => {
    expect(drillFor({ drills: { won: leadDrill } }, 'won')).toEqual(leadDrill)
    expect(drillFor({ drill: leadDrill }, 'value')).toEqual(leadDrill)
    expect(drillFor({ drills: { won: { filters: [] } } }, 'won')).toBeNull()
    expect(drillFor({}, 'won')).toBeNull()
  })
  it('unwraps list envelopes into rows and meta', async () => {
    call.mockResolvedValueOnce({
      rows: [{ campaign: 'A' }],
      applied_filters: ['owner'],
      currency: 'MXN',
    })
    const scope = effectScope()
    const state = scope.run(() =>
      useMarketingResource('test.list', () => ({ owner: 'a' }), { list: true }),
    )
    await nextTick()
    await nextTick()
    expect(call).toHaveBeenLastCalledWith('test.list', {
      owner: 'a',
      with_meta: 1,
    })
    expect(state.data).toEqual([{ campaign: 'A' }])
    expect(state.meta).toEqual({ applied_filters: ['owner'], currency: 'MXN' })
    scope.stop()
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
