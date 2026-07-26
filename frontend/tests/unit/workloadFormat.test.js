// Pure helpers behind WorkloadView.vue (P2 S11): cap math (percent / bar width / color
// token) + the client-side column sort (null-sinks-to-bottom), all dependency-free.
import { describe, it, expect } from 'vitest'
import { capPercent, barWidth, barToken, sortWorkload } from '@/utils/workloadFormat'

describe('capPercent', () => {
  it('returns null when no cap is configured', () => {
    expect(capPercent(5, 0)).toBeNull()
    expect(capPercent(5, null)).toBeNull()
    expect(capPercent(5, undefined)).toBeNull()
  })
  it('rounds the percentage of cap consumed', () => {
    expect(capPercent(0, 10)).toBe(0)
    expect(capPercent(5, 10)).toBe(50)
    expect(capPercent(10, 10)).toBe(100)
    expect(capPercent(13, 10)).toBe(130) // over cap is not clamped here
    expect(capPercent(1, 3)).toBe(33)
  })
  it('coerces non-numeric load to 0', () => {
    expect(capPercent(undefined, 10)).toBe(0)
  })
})

describe('barWidth', () => {
  it('is 0 when no cap (bar hidden)', () => {
    expect(barWidth(5, 0)).toBe(0)
  })
  it('clamps to 0..100', () => {
    expect(barWidth(0, 10)).toBe(0)
    expect(barWidth(5, 10)).toBe(50)
    expect(barWidth(10, 10)).toBe(100)
    expect(barWidth(30, 10)).toBe(100) // over cap pins at full
  })
})

describe('barToken', () => {
  it('neutral gray when no cap', () => {
    expect(barToken(4, 0)).toBe('bg-surface-gray-4')
  })
  it('green under 75% of cap', () => {
    expect(barToken(7, 10)).toBe('bg-surface-green-3') // 70%
    expect(barToken(0, 10)).toBe('bg-surface-green-3')
  })
  it('amber from 75% up to (not incl.) 100%', () => {
    expect(barToken(8, 10)).toBe('bg-surface-amber-2') // 80%
    expect(barToken(75, 100)).toBe('bg-surface-amber-2')
  })
  it('red at or over cap', () => {
    expect(barToken(10, 10)).toBe('bg-surface-red-5') // 100%
    expect(barToken(14, 10)).toBe('bg-surface-red-5') // 140%
  })
})

describe('sortWorkload', () => {
  const rows = [
    { full_name: 'Beto', open_total: 6, open_deals: 4, open_leads: 2, sla_overdue_count: 1 },
    { full_name: 'Ana', open_total: 9, open_deals: 3, open_leads: 6, sla_overdue_count: null },
    { full_name: 'Caro', open_total: 2, open_deals: 1, open_leads: 1, sla_overdue_count: 3 },
  ]

  it('never mutates the source array', () => {
    const snapshot = JSON.parse(JSON.stringify(rows))
    sortWorkload(rows, 'open_total', 'desc')
    expect(rows).toEqual(snapshot)
  })
  it('numeric desc (open_total)', () => {
    expect(sortWorkload(rows, 'open_total', 'desc').map((r) => r.full_name)).toEqual(['Ana', 'Beto', 'Caro'])
  })
  it('numeric asc (open_deals)', () => {
    expect(sortWorkload(rows, 'open_deals', 'asc').map((r) => r.full_name)).toEqual(['Caro', 'Ana', 'Beto'])
  })
  it('null overdue sinks to the bottom in BOTH directions', () => {
    expect(sortWorkload(rows, 'sla_overdue_count', 'asc').map((r) => r.full_name)).toEqual(['Beto', 'Caro', 'Ana'])
    expect(sortWorkload(rows, 'sla_overdue_count', 'desc').map((r) => r.full_name)).toEqual(['Caro', 'Beto', 'Ana'])
  })
  it('text sort uses es locale (asc)', () => {
    expect(sortWorkload(rows, 'full_name', 'asc').map((r) => r.full_name)).toEqual(['Ana', 'Beto', 'Caro'])
  })
  it('tolerates null / empty input', () => {
    expect(sortWorkload(null, 'open_total')).toEqual([])
    expect(sortWorkload([], 'open_total')).toEqual([])
  })
})
