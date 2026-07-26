// Pure helpers behind ScoreBacktest.vue (P2 S17): percentage + lift formatting,
// es-MX month labels, and the grade-row shaping that guarantees four bands.
import { describe, it, expect } from 'vitest'
import { pct, fmtLift, monthLabel, gradeRows, barPct, GRADES } from '@/utils/backtestFormat'

describe('pct', () => {
  it('formats a 0..1 ratio as a whole percent', () => {
    expect(pct(0)).toBe('0%')
    expect(pct(0.5)).toBe('50%')
    expect(pct(1)).toBe('100%')
    expect(pct(0.333)).toBe('33%')
  })
  it('honours a decimal-places argument', () => {
    expect(pct(0.125, 1)).toBe('12.5%')
  })
  it('renders — for null/undefined/NaN (no data)', () => {
    expect(pct(null)).toBe('—')
    expect(pct(undefined)).toBe('—')
    expect(pct(NaN)).toBe('—')
  })
})

describe('fmtLift', () => {
  it('one decimal, trailing .0 trimmed', () => {
    expect(fmtLift(4.2)).toBe('4.2×')
    expect(fmtLift(3)).toBe('3×')
    expect(fmtLift(10)).toBe('10×')
    expect(fmtLift(2.25)).toBe('2.3×') // rounds to one dp
  })
  it('returns null when the lift is absent (div-zero / thin data)', () => {
    expect(fmtLift(null)).toBeNull()
    expect(fmtLift(undefined)).toBeNull()
    expect(fmtLift(NaN)).toBeNull()
  })
})

describe('monthLabel', () => {
  it('maps YYYY-MM to an es-MX abbreviated label', () => {
    expect(monthLabel('2026-07')).toBe('jul 2026')
    expect(monthLabel('2026-01')).toBe('ene 2026')
    expect(monthLabel('2025-12')).toBe('dic 2025')
  })
  it('returns a malformed key unchanged (never throws)', () => {
    expect(monthLabel('nope')).toBe('nope')
    expect(monthLabel('')).toBe('')
    expect(monthLabel(null)).toBe('')
  })
})

describe('gradeRows', () => {
  it('always returns the four bands in order, even from a partial object', () => {
    const rows = gradeRows({ A: { leads: 3, converted: 2, win_rate: 0.6667 } })
    expect(rows.map((r) => r.grade)).toEqual(GRADES)
    expect(rows[0]).toEqual({ grade: 'A', leads: 3, converted: 2, win_rate: 0.6667 })
    // B/C/D absent → zero rows
    expect(rows[3]).toEqual({ grade: 'D', leads: 0, converted: 0, win_rate: 0 })
  })
  it('tolerates null / undefined input', () => {
    expect(gradeRows(null).map((r) => r.grade)).toEqual(GRADES)
    expect(gradeRows(undefined).every((r) => r.leads === 0)).toBe(true)
  })
  it('coerces missing win_rate to 0, not NaN', () => {
    const rows = gradeRows({ C: { leads: 1, converted: 0 } })
    const c = rows.find((r) => r.grade === 'C')
    expect(c.win_rate).toBe(0)
  })
})

describe('barPct', () => {
  it('scales a 0..1 ratio to an integer 0..100', () => {
    expect(barPct(0)).toBe(0)
    expect(barPct(0.5)).toBe(50)
    expect(barPct(1)).toBe(100)
  })
  it('clamps out-of-range and non-finite values', () => {
    expect(barPct(1.5)).toBe(100)
    expect(barPct(-0.2)).toBe(0)
    expect(barPct(NaN)).toBe(0)
    expect(barPct(null)).toBe(0)
  })
})
