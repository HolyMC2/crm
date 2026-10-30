import { describe, expect, it } from 'vitest'
import { filtersHideUnstatused, orphansForFilters } from '@/utils/inboxOrphans'

const rows = [
  { phone: '1', last_message_ts: '2026-10-27 17:45:00' },
  { phone: '2', last_message_ts: '2026-10-29 09:00:00' },
]

describe('orphansForFilters', () => {
  it('keeps orphans on the default «Abiertos» view', () => {
    expect(
      orphansForFilters(rows, { dealState: 'open', leadState: 'open' }),
    ).toEqual(rows)
  })

  it('keeps orphans on «Todos los estados»', () => {
    expect(orphansForFilters(rows, { dealState: '', leadState: '' })).toEqual(
      rows,
    )
  })

  it('hides orphans for a hand-picked status, «Cerrados» or an etiqueta', () => {
    expect(orphansForFilters(rows, { dealStatus: ['Completado'] })).toEqual([])
    expect(orphansForFilters(rows, { leadStatus: ['Nuevo'] })).toEqual([])
    expect(orphansForFilters(rows, { repairStatus: ['Recibido'] })).toEqual([])
    expect(orphansForFilters(rows, { dealState: 'closed' })).toEqual([])
    expect(orphansForFilters(rows, { leadState: 'closed' })).toEqual([])
    expect(orphansForFilters(rows, { tag: 'vip' })).toEqual([])
  })

  it('keeps the orphans last heard from inside a date range', () => {
    expect(
      orphansForFilters(rows, {
        dealState: 'open',
        leadState: 'open',
        dateFrom: '2026-10-28',
      }),
    ).toEqual([rows[1]])
    expect(orphansForFilters(rows, { dateTo: '2026-10-27' })).toEqual([rows[0]])
    expect(
      orphansForFilters(rows, { dateFrom: '2026-10-27', dateTo: '2026-10-29' }),
    ).toEqual(rows)
  })

  it('handles an empty list', () => {
    expect(orphansForFilters(null, {})).toEqual([])
    expect(orphansForFilters([], {})).toEqual([])
  })
})

describe('filtersHideUnstatused', () => {
  it('the default view hides nothing', () => {
    expect(
      filtersHideUnstatused({ dealState: 'open', leadState: 'open' }),
    ).toBe(false)
    expect(filtersHideUnstatused({})).toBe(false)
  })

  it('a real narrowing hides Archivados, Limpiados and comments', () => {
    expect(filtersHideUnstatused({ dateFrom: '2026-10-01' })).toBe(true)
    expect(filtersHideUnstatused({ dealState: 'closed' })).toBe(true)
    expect(filtersHideUnstatused({ dealStatus: ['Ganado'] })).toBe(true)
    expect(filtersHideUnstatused({ tag: 'x' })).toBe(true)
  })
})
