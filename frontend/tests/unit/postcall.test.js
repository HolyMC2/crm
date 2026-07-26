// Post-llamada pure helpers (PostCallSheet.vue, spec 4.4). No frappe-ui mock, so
// the vitest-4 spy-results trap (see outbox.test.js) is irrelevant here. The
// tomorrow-9 epoch is asserted by LOCAL-time properties rather than a hardcoded
// number so the test is timezone-agnostic (CI runs in whatever tz).
import { describe, it, expect } from 'vitest'
import {
  OUTCOMES,
  isValidOutcome,
  outcomeLabel,
  tomorrow9Epoch,
  formatCallDuration,
} from '@/utils/postcallOutcome'

describe('outcome enum', () => {
  it('exposes the five spec outcomes as ascii values', () => {
    expect(OUTCOMES.map((o) => o.value)).toEqual([
      'contesto',
      'no_contesto',
      'buzon',
      'venta',
      'otro',
    ])
  })

  it('validates membership', () => {
    expect(isValidOutcome('venta')).toBe(true)
    expect(isValidOutcome('no_contesto')).toBe(true)
    expect(isValidOutcome('missed')).toBe(false)
    expect(isValidOutcome('')).toBe(false)
    expect(isValidOutcome(undefined)).toBe(false)
  })

  it('maps values to es-MX labels', () => {
    expect(outcomeLabel('no_contesto')).toBe('No contestó')
    expect(outcomeLabel('venta')).toBe('Venta')
    expect(outcomeLabel('nope')).toBe('')
  })
})

describe('tomorrow9Epoch', () => {
  const at = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi, 0, 0).getTime()

  it('lands on 09:00 local the next calendar day', () => {
    const now = at(2026, 6, 25, 14, 30) // Sat Jul 25 2026 14:30 local
    const d = new Date(tomorrow9Epoch(now))
    expect(d.getHours()).toBe(9)
    expect(d.getMinutes()).toBe(0)
    expect(d.getSeconds()).toBe(0)
    expect(d.getDate()).toBe(26)
  })

  it('is always in the future and within ~48h', () => {
    const now = Date.now()
    const e = tomorrow9Epoch(now)
    expect(e).toBeGreaterThan(now)
    expect(e - now).toBeLessThan(48 * 3600 * 1000)
  })

  it('rolls the month over correctly (last day of month)', () => {
    const now = at(2026, 0, 31, 23, 15) // Jan 31 → Feb 1
    const d = new Date(tomorrow9Epoch(now))
    expect(d.getMonth()).toBe(1) // February
    expect(d.getDate()).toBe(1)
    expect(d.getHours()).toBe(9)
  })

  it('defaults now to Date.now()', () => {
    expect(typeof tomorrow9Epoch()).toBe('number')
  })
})

describe('formatCallDuration', () => {
  it('formats minutes:seconds', () => {
    expect(formatCallDuration(0)).toBe('0:00')
    expect(formatCallDuration(5)).toBe('0:05')
    expect(formatCallDuration(65)).toBe('1:05')
    expect(formatCallDuration(600)).toBe('10:00')
    expect(formatCallDuration(3661)).toBe('61:01')
  })

  it('floors fractional seconds', () => {
    expect(formatCallDuration(9.9)).toBe('0:09')
  })

  it('collapses junk / negatives to 0:00', () => {
    expect(formatCallDuration(-5)).toBe('0:00')
    expect(formatCallDuration(NaN)).toBe('0:00')
    expect(formatCallDuration(null)).toBe('0:00')
    expect(formatCallDuration(undefined)).toBe('0:00')
  })
})
