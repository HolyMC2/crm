// Pure label helpers for the Cadencia 1:1 picker (spec 4.2). No clock/i18n/Vue —
// the numeric buckets and the server-date parsing that feed «paso 2/3 · próx. en 2 d».
import { describe, it, expect } from 'vitest'
import { touchLabel, nextTouchLabel } from '@/utils/cadenceStatus'

describe('touchLabel', () => {
  it('points at the NEXT touch, 1-based', () => {
    expect(touchLabel(0, 3)).toBe('paso 1/3') // freshly enrolled, nothing sent
    expect(touchLabel(1, 3)).toBe('paso 2/3') // one touch sent → on the 2nd
  })

  it('clamps a finished sequence to N/N (never N+1/N)', () => {
    expect(touchLabel(3, 3)).toBe('paso 3/3')
    expect(touchLabel(5, 3)).toBe('paso 3/3')
  })

  it('is empty when the cadence has no send steps', () => {
    expect(touchLabel(0, 0)).toBe('')
    expect(touchLabel(2, null)).toBe('')
  })
})

describe('nextTouchLabel', () => {
  const now = Date.parse('2026-07-26T12:00:00')

  it('reads "en breve" when the touch is due or overdue', () => {
    expect(nextTouchLabel('2026-07-26 12:00:30', now)).toBe('en breve')
    expect(nextTouchLabel('2026-07-26 09:00:00', now)).toBe('en breve') // past → never negative
  })

  it('buckets a future touch into min / h / d', () => {
    expect(nextTouchLabel('2026-07-26 12:30:00', now)).toBe('en 30 min')
    expect(nextTouchLabel('2026-07-26 15:00:00', now)).toBe('en 3 h')
    expect(nextTouchLabel('2026-07-28 12:00:00', now)).toBe('en 2 d')
  })

  it('accepts an epoch as well as a server datetime string', () => {
    expect(nextTouchLabel(now + 3 * 3600000, now)).toBe('en 3 h')
  })

  it('is empty when there is no schedule', () => {
    expect(nextTouchLabel(null, now)).toBe('')
    expect(nextTouchLabel('', now)).toBe('')
    expect(nextTouchLabel(undefined, now)).toBe('')
  })
})
