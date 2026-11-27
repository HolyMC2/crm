// Bandeja › Llamadas: the words for who a call rings right now (ringNow.js).
import { describe, expect, it } from 'vitest'
import {
  nowTitleOf,
  reachLineOf,
  skippedAreas,
  whyLineOf,
} from '@/components/Settings/Inbox/ringNow'

const someone = [{ user: 'a@example.com' }]

describe('who rings now', () => {
  it('says what happens to a call right now', () => {
    expect(nowTitleOf(null)).toBe('')
    expect(nowTitleOf({ closed: true, people: someone })).toContain(
      'Closed now',
    )
    expect(nowTitleOf({ mode: 'shift', people: someone })).toBe(
      'A call rings now',
    )
    expect(
      nowTitleOf({
        mode: 'fallback',
        because: 'nobody',
        fallback: 'list',
        people: someone,
      }),
    ).toContain('the list rings')
    expect(
      nowTitleOf({
        mode: 'fallback',
        because: 'nobody',
        fallback: 'message',
        people: [],
      }),
    ).toContain('callers go to the message')
    expect(
      nowTitleOf({ mode: 'fallback', because: 'no_shifts', people: someone }),
    ).toContain('keeps no shifts')
    expect(nowTitleOf({ mode: 'list', people: [] })).toContain('Nobody rings')
  })

  it('says why each person rings and where the call finds them', () => {
    expect(whyLineOf({ kind: 'shift', shift: '9–15', checked_in: '' })).toBe(
      'shift 9–15',
    )
    expect(whyLineOf({ kind: 'shift', shift: '', checked_in: '10:02' })).toBe(
      'checked in 10:02',
    )
    expect(whyLineOf({ kind: 'always' })).toBe('always rings')
    expect(whyLineOf({ kind: 'list' })).toBe('on the list')
    expect(reachLineOf({ reach: 'phone', mobile_end: '4321' })).toBe(
      'on their phone ···4321',
    )
    expect(reachLineOf({ reach: 'muelle_off' })).toBe('Muelle is closed')
    expect(reachLineOf({ reach: 'muelle' })).toBe('in Muelle')
    expect(reachLineOf({ reach: 'sip' })).toBe('on the softphone')
  })

  it('reads the areas off the line', () => {
    expect([...skippedAreas('["Taller", 2]')]).toEqual(['Taller'])
    expect(skippedAreas('nope').size).toBe(0)
    expect(skippedAreas('').size).toBe(0)
  })
})
