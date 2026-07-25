// Phone-normalization helper for duplicate detection (spec 4.3). Pure logic —
// this matrix MUST match the backend contract in
// doco_marketing/services/dedupe.py :: normalize_phone (and its own test matrix in
// doco_marketing/tests/test_dedupe.py).
import { describe, it, expect } from 'vitest'
import { normalizePhone } from '@/utils/phoneNormalize'

describe('normalizePhone', () => {
  it('keeps the last 10 digits, stripping prefixes and formatting', () => {
    const cases = [
      ['5512345678', '5512345678'], // bare 10-digit local
      ['525512345678', '5512345678'], // 52 country prefix
      ['5215512345678', '5512345678'], // 521 WhatsApp/mobile prefix
      ['+52 55 1234 5678', '5512345678'], // + and spaces
      ['55-1234-5678', '5512345678'], // dashes
      ['  (55) 1234 5678 ', '5512345678'], // parens + surrounding space
      ['521 55 1234 5678', '5512345678'], // 521 + spaces
    ]
    for (const [raw, expected] of cases) {
      expect(normalizePhone(raw), `input=${JSON.stringify(raw)}`).toBe(expected)
    }
  })

  it('returns fewer-than-10-digit input unchanged (weak key, never mass-matches)', () => {
    expect(normalizePhone('12345')).toBe('12345')
    expect(normalizePhone('')).toBe('')
    expect(normalizePhone(null)).toBe('')
    expect(normalizePhone(undefined)).toBe('')
  })

  it('distinct local numbers do not collide', () => {
    expect(normalizePhone('5215512345678')).not.toBe(normalizePhone('5215599998888'))
  })
})
