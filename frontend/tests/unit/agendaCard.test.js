import { describe, expect, it } from 'vitest'
import { cardPaint, kindIcon, timeSpan } from '@/components/agenda/agendaCard'

const MZ = { locale: 'es-MX', timeZone: 'America/Mazatlan', hour12: true }

describe('agenda cards', () => {
  it('says the day period once when both ends share it', () => {
    expect(
      timeSpan('2026-10-28T16:00:00Z', '2026-10-28T16:30:00Z', MZ),
    ).toMatch(/^9:00\s?–\s?9:30\sa\.\s?m\.$/u)
    expect(
      timeSpan('2026-10-28T18:00:00Z', '2026-10-28T20:30:00Z', MZ),
    ).toMatch(/^11:00\sa\.\s?m\.\s?–\s?1:30\sp\.\s?m\.$/u)
  })

  it('keeps an ended event readable: a tint with full ink, not a washed fill', () => {
    const coming = cardPaint({ status: 'Scheduled' }, '#039be5')
    expect(coming.background).toBe('#039be5')
    const past = cardPaint({ status: 'Scheduled' }, '#039be5', { past: true })
    expect(past.background).toContain('color-mix')
    expect(past.color).toBe('var(--ink-gray-8)')
    expect(past.boxShadow).toContain('inset 3px 0 0 #039be5')
    const done = cardPaint({ status: 'Done' }, '#039be5')
    expect(done.color).toBe('var(--ink-gray-8)')
    const cancelled = cardPaint({ status: 'Cancelled' }, '#039be5', {
      ring: '0 0 0 1px red',
    })
    expect(cancelled.boxShadow).toBe('inset 0 0 0 1px #039be5, 0 0 0 1px red')
  })

  it('marks done, citas and calls with a small icon', () => {
    expect(kindIcon({ status: 'Done' })).toBe('lucide-check')
    expect(kindIcon({ kind: 'cita', status: 'Scheduled' })).toBe(
      'lucide-calendar-check',
    )
    expect(kindIcon({ category: 'Call' })).toBe('lucide-phone')
    expect(kindIcon({ category: 'Meeting' })).toBe('')
  })
})
