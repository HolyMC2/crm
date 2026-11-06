import { describe, expect, it } from 'vitest'
import { gemoji } from 'gemoji'
import { isEmoji } from '@/utils/emoji'

describe('isEmoji tells an emoji from an icon name without the gemoji table', () => {
  it('every emoji the IconPicker offers is one', () => {
    const missed = gemoji.map((g) => g.emoji).filter((e) => !isEmoji(e))
    expect(missed).toEqual([])
  })

  it('flags, keycaps, skin tones and joined sequences count', () => {
    for (const emoji of ['🇲🇽', '1️⃣', '#️⃣', '👍🏽', '👨‍👩‍👧', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '❤️', '☺️'])
      expect(isEmoji(emoji), emoji).toBe(true)
  })

  it('icon names, words, digits and components are not', () => {
    for (const value of [
      'check',
      'bell-off',
      'calendar-days',
      'x',
      'a',
      '1',
      '#',
      '',
      ' ',
      '👍 bueno',
      { render: () => null },
      null,
      undefined,
    ])
      expect(isEmoji(value), String(value)).toBe(false)
  })
})
