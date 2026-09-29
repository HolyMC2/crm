import { describe, expect, it, vi } from 'vitest'
import {
  periodRange,
  todayDate,
  previousPeriod,
  periodDelta,
  readReportQuery,
  reportFilterQuery,
  reportApiFilters,
  readReportDrill,
} from '@/components/Reports/reportFilters'

describe('report calendar periods', () => {
  it.each([
    ['today', '2026-09-28', '2026-09-28', '2026-09-28'],
    ['7d', '2026-01-03', '2025-12-28', '2026-01-03'],
    ['30d', '2024-03-01', '2024-02-01', '2024-03-01'],
    ['month', '2024-02-29', '2024-02-01', '2024-02-29'],
    ['last-month', '2024-03-15', '2024-02-01', '2024-02-29'],
    ['last-month', '2026-01-03', '2025-12-01', '2025-12-31'],
    ['7d', '2026-03-10', '2026-03-04', '2026-03-10'],
    ['7d', '2026-11-03', '2026-10-28', '2026-11-03'],
  ])('%s on %s uses inclusive calendar dates', (preset, today, from, to) => {
    expect(periodRange(preset, today)).toEqual({
      from_date: from,
      to_date: to,
    })
  })

  it('compares an equal-length preceding cohort without dropping scope', () => {
    const filters = {
      from_date: '2024-03-01',
      to_date: '2024-03-31',
      owner: 'seller@example.test',
      pipeline: 'Retail',
      company: 'Example',
    }
    expect(previousPeriod(filters)).toEqual({
      ...filters,
      from_date: '2024-01-30',
      to_date: '2024-02-29',
    })
    expect(filters.from_date).toBe('2024-03-01')
  })

  it('compares a single day with the preceding calendar date', () => {
    expect(
      previousPeriod({ from_date: '2026-01-01', to_date: '2026-01-01' }),
    ).toEqual({ from_date: '2025-12-31', to_date: '2025-12-31' })
  })

  it.each([
    { from_date: '', to_date: '2026-09-28' },
    { from_date: '2026-02-30', to_date: '2026-03-01' },
    { from_date: '2026-09-28', to_date: '2026-09-01' },
  ])('does not invent a comparison for invalid dates %j', (filters) => {
    expect(previousPeriod(filters)).toBeNull()
  })
})

describe('report drill URL boundaries', () => {
  it.each([
    '[]',
    'null',
    'true',
    '"source"',
    '{',
    '{"owner":[]}',
    '{"source":{}}',
    '{"owner":null}',
    '{"unknown":"value"}',
    '{"__proto__":{"polluted":true}}',
    '{"constructor":"value"}',
    '{"prototype":"value"}',
  ])('rejects malformed or unrecognized bucket %s', (drill_bucket) => {
    expect(readReportDrill({ drill_kind: 'leads', drill_bucket })).toBeNull()
  })

  it.each(['', 'contact', ['leads'], null])(
    'rejects invalid record kind %j',
    (drill_kind) => {
      expect(readReportDrill({ drill_kind, drill_bucket: '{}' })).toBeNull()
    },
  )

  it('preserves empty source and owner buckets plus zero-valued flags exactly', () => {
    expect(
      readReportDrill({
        drill_kind: 'leads',
        drill_bucket: '{"source":"","owner":"","converted":0}',
        drill_title: 'Unassigned unknown source',
      }),
    ).toEqual({
      kind: 'leads',
      bucket: { source: '', owner: '', converted: 0 },
      title: 'Unassigned unknown source',
    })
  })

  it('uses a safe default title when the URL title is not a scalar', () => {
    expect(
      readReportDrill({ drill_kind: 'deals', drill_title: ['one', 'two'] }),
    ).toEqual({ kind: 'deals', bucket: {}, title: 'Report records' })
  })
})

describe('report period comparisons', () => {
  it.each([
    [12, 8, { percent: 50, difference: 4, state: 'change' }],
    [4, 8, { percent: -50, difference: -4, state: 'change' }],
    [0, 8, { percent: -100, difference: -8, state: 'change' }],
    [8, 8, { percent: 0, difference: 0, state: 'flat' }],
    [0, 0, { percent: 0, difference: 0, state: 'flat' }],
    [8, 0, { percent: null, difference: 8, state: 'new' }],
    [null, 8, { percent: null, difference: null, state: 'unavailable' }],
    [8, undefined, { percent: null, difference: null, state: 'unavailable' }],
    [NaN, 8, { percent: null, difference: null, state: 'unavailable' }],
  ])(
    'handles current %s and previous %s honestly',
    (current, previous, result) => {
      expect(periodDelta(current, previous)).toEqual(result)
    },
  )
})

describe('report URL filters', () => {
  it('defaults to the last 30 inclusive dates with no artificial scope', () => {
    expect(readReportQuery({}, '2026-09-28')).toEqual({
      preset: '30d',
      from_date: '2026-08-30',
      to_date: '2026-09-28',
      owner: '',
      pipeline: '',
      company: '',
    })
  })

  it('preserves explicit dates when reopening an older report link', () => {
    expect(
      readReportQuery(
        {
          from_date: '2024-02-01',
          to_date: '2024-02-29',
          owner: 'seller@example.test',
          pipeline: 'Retail',
          company: 'Example',
        },
        '2026-09-28',
      ),
    ).toEqual({
      preset: 'custom',
      from_date: '2024-02-01',
      to_date: '2024-02-29',
      owner: 'seller@example.test',
      pipeline: 'Retail',
      company: 'Example',
    })
  })

  it('normalizes non-scalar scope and invalid presets while retaining explicit dates', () => {
    expect(
      readReportQuery(
        {
          period: 'unsupported',
          from_date: '2026-09-01',
          to_date: '2026-09-10',
          owner: ['first@example.test', 'second@example.test'],
          pipeline: null,
        },
        '2026-09-28',
      ),
    ).toMatchObject({
      preset: 'custom',
      from_date: '2026-09-01',
      to_date: '2026-09-10',
      owner: '',
      pipeline: '',
    })
  })

  it('keeps the dates of a saved preset instead of silently moving its cohort', () => {
    expect(
      readReportQuery(
        { period: '7d', from_date: '2026-09-01', to_date: '2026-09-07' },
        '2026-09-28',
      ),
    ).toMatchObject({
      preset: '7d',
      from_date: '2026-09-01',
      to_date: '2026-09-07',
    })
  })

  it('strips presentation state and empty values from backend arguments', () => {
    expect(
      reportApiFilters({
        preset: 'custom',
        from_date: '2026-09-01',
        to_date: '2026-09-28',
        owner: '',
        pipeline: 'Retail',
        company: '',
      }),
    ).toEqual({
      from_date: '2026-09-01',
      to_date: '2026-09-28',
      pipeline: 'Retail',
    })
  })

  it('preserves unrelated URL context and clears obsolete drills and empty filters', () => {
    const query = {
      area: 'marketing',
      owner: 'old@example.test',
      drill_kind: 'leads',
      drill_bucket: '{"source":""}',
      drill_title: 'Unknown source',
    }
    const result = reportFilterQuery(query, {
      preset: 'custom',
      from_date: '2026-09-01',
      to_date: '2026-09-28',
      owner: '',
      pipeline: 'Retail',
      company: '',
    })
    expect(result).toMatchObject({
      area: 'marketing',
      period: 'custom',
      from_date: '2026-09-01',
      to_date: '2026-09-28',
      pipeline: 'Retail',
    })
    for (const key of [
      'owner',
      'company',
      'drill_kind',
      'drill_bucket',
      'drill_title',
    ])
      expect(result).not.toHaveProperty(key)
    expect(query.owner).toBe('old@example.test')
  })
})

describe('report date timezone', () => {
  it('uses the site calendar at a UTC day boundary without a fixed locale', () => {
    const original = window.sysdefaults
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-28T06:00:00Z'))
    try {
      window.sysdefaults = { ...original, time_zone: 'Pacific/Honolulu' }
      expect(todayDate()).toBe('2026-09-27')
      window.sysdefaults = { ...original, time_zone: 'Asia/Tokyo' }
      expect(todayDate()).toBe('2026-09-28')
    } finally {
      window.sysdefaults = original
      vi.useRealTimers()
    }
  })
})
