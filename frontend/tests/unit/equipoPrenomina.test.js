import { describe, expect, it } from 'vitest'
import {
  PRENOMINA,
  advancesText,
  daysText,
  periodFromQuery,
  periodQuery,
  periodRange,
} from '../../src/composables/useEquipo.js'

describe('pre-nómina period in the address', () => {
  it('opens on the week, and a fortnight survives a reload', () => {
    expect(periodFromQuery({})).toEqual({ period: 'week', start: null })
    expect(
      periodFromQuery({ periodo: 'quincena', desde: '2026-10-16' }),
    ).toEqual({ period: 'fortnight', start: '2026-10-16' })
  })
  it('ignores an unknown period or a malformed day', () => {
    expect(periodFromQuery({ periodo: 'mes', desde: 'ayer' })).toEqual({
      period: 'week',
      start: null,
    })
  })
  it('writes the period back with Spanish keys and drops the default week', () => {
    expect(periodQuery('week', '2026-10-19')).toEqual({ desde: '2026-10-19' })
    expect(periodQuery('fortnight', '2026-10-16')).toEqual({
      periodo: 'quincena',
      desde: '2026-10-16',
    })
  })
})

describe('pre-nómina cells', () => {
  it('names the service it reads', () => {
    expect(PRENOMINA).toBe('doco.erp_experience.prenomina.get_period')
  })
  it('shows a dash for what the reader cannot see, not a zero', () => {
    expect(daysText(null)).toBe('—')
    expect(daysText(0)).toBe('0')
    expect(daysText(4.5)).toBe('4.5')
    expect(advancesText(null)).toBe('—')
  })
  it('lists open advances per currency with their count', () => {
    const format = (value, currency) => `${currency} ${value}`
    expect(advancesText([], format)).toBe('0')
    expect(
      advancesText(
        [
          { currency: 'MXN', count: 2, pending: 750 },
          { currency: 'USD', count: 1, pending: 20 },
        ],
        format,
      ),
    ).toBe('MXN 750 (2) · USD 20 (1)')
  })
  it('spells the period as a date range', () => {
    expect(periodRange({ start: '2026-10-19', end: '2026-10-25' })).toMatch(
      /19.*25/,
    )
    expect(periodRange(null)).toBe('')
  })
})
