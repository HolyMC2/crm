// Next-activity colour state + label (utils/activityState.js). Frappe timestamps
// are naive local strings, so every case here builds `now` as a local Date and
// feeds naive strings — a UTC-parsed "…Z" would shift the day and break "Hoy".
import { describe, it, expect } from 'vitest'
import { activityState, activityLabel } from '@/utils/activityState'

// Friday 2026-09-11, 10:00 local.
const NOW = new Date(2026, 8, 11, 10, 0, 0)

describe('activityState', () => {
  it('returns none without a timestamp', () => {
    expect(activityState(null, NOW)).toBe('none')
    expect(activityState('', NOW)).toBe('none')
    expect(activityState(undefined, NOW)).toBe('none')
  })

  it('returns none for an unparseable timestamp instead of throwing', () => {
    expect(activityState('nunca', NOW)).toBe('none')
  })

  it('marks a past due moment overdue, including earlier the same day', () => {
    expect(activityState('2026-09-09 12:00:00', NOW)).toBe('overdue')
    expect(activityState('2026-09-11 09:59:00', NOW)).toBe('overdue')
  })

  it('marks the rest of today today', () => {
    expect(activityState('2026-09-11 15:00:00', NOW)).toBe('today')
    expect(activityState('2026-09-11 23:59:00', NOW)).toBe('today')
  })

  it('marks any later day planned', () => {
    expect(activityState('2026-09-12 00:30:00', NOW)).toBe('planned')
    expect(activityState('2026-12-01 09:00:00', NOW)).toBe('planned')
  })
})

describe('activityLabel', () => {
  it('is empty without a timestamp', () => {
    expect(activityLabel(null, NOW)).toBe('')
    expect(activityLabel('nunca', NOW)).toBe('')
  })

  it('counts whole days overdue', () => {
    expect(activityLabel('2026-09-09 10:00:00', NOW)).toBe('Vencida · 2 d')
  })

  it('falls back to hours, then to a bare label, inside the first day', () => {
    expect(activityLabel('2026-09-11 07:00:00', NOW)).toBe('Vencida · 3 h')
    expect(activityLabel('2026-09-11 09:45:00', NOW)).toBe('Vencida')
  })

  it('shows the hour for something still due today', () => {
    expect(activityLabel('2026-09-11 15:00:00', NOW)).toBe('Hoy 15:00')
    expect(activityLabel('2026-09-11 18:05:00', NOW)).toBe('Hoy 18:05')
  })

  it('names tomorrow, counts the days inside a week', () => {
    expect(activityLabel('2026-09-12 08:00:00', NOW)).toBe('Mañana')
    expect(activityLabel('2026-09-14 08:00:00', NOW)).toBe('En 3 d')
    expect(activityLabel('2026-09-18 08:00:00', NOW)).toBe('En 7 d')
  })

  it('falls back to a short date beyond a week', () => {
    expect(activityLabel('2026-10-12 08:00:00', NOW)).toBe('12 oct')
    expect(activityLabel('2027-01-03 08:00:00', NOW)).toBe('3 ene')
  })

  it('counts calendar days, not 24h blocks', () => {
    // 22:00 today -> 01:00 tomorrow is 3 hours away but still "Mañana".
    const lateNight = new Date(2026, 8, 11, 22, 0, 0)
    expect(activityLabel('2026-09-12 01:00:00', lateNight)).toBe('Mañana')
    expect(activityState('2026-09-12 01:00:00', lateNight)).toBe('planned')
  })
})
