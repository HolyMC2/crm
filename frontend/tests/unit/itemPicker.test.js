import { describe, expect, it } from 'vitest'
import {
  MAX_ITEMS,
  MAX_QTY,
  canAddMore,
  isOutOfStock,
  isSelectionInvalid,
  isValidQty,
  keepSelected,
  quoteLineCount,
  selectedLines,
  stepQty,
} from '@/utils/itemPicker'

// { 'ITEM-1': qty, …, 'ITEM-n': qty }
const many = (n, qty = 1) =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`ITEM-${i + 1}`, qty]),
  )
// The codes of n lines already on the draft: ['ITEM-1', …, 'ITEM-n']
const codes = (n) => Array.from({ length: n }, (_, i) => `ITEM-${i + 1}`)

describe('itemPicker limits', () => {
  it('caps a quote at 30 lines of up to 999 each', () => {
    expect(MAX_ITEMS).toBe(30)
    expect(MAX_QTY).toBe(999)
  })
})

describe('isValidQty', () => {
  it('accepts 0 to 999, fractions and numeric strings included', () => {
    for (const value of [0, 0.5, 1, 998.5, 999, '0', '0.5', '999']) {
      expect(isValidQty(value), String(value)).toBe(true)
    }
  })

  it('rejects negative, above 999 and non-finite values', () => {
    for (const value of [-1, -0.5, 999.01, 1000, NaN, Infinity, 'abc']) {
      expect(isValidQty(value), String(value)).toBe(false)
    }
  })

  it('treats an empty input as skipped, not invalid', () => {
    expect(isValidQty('')).toBe(true)
    expect(isValidQty(null)).toBe(true)
    expect(isValidQty(undefined)).toBe(true)
  })
})

describe('selectedLines', () => {
  it('keeps quantities above zero as numbers, in entry order', () => {
    expect(
      selectedLines({
        A: 2,
        B: 0,
        C: '',
        D: 0.5,
        E: '3',
        F: -1,
        G: NaN,
        H: null,
        I: 1000,
      }),
    ).toEqual([
      { item_code: 'A', qty: 2 },
      { item_code: 'D', qty: 0.5 },
      { item_code: 'E', qty: 3 },
      { item_code: 'I', qty: 1000 },
    ])
  })

  it('returns an empty list when nothing is entered', () => {
    expect(selectedLines({})).toEqual([])
    expect(selectedLines(undefined)).toEqual([])
  })
})

describe('keepSelected', () => {
  it('drops zero, empty, negative and NaN entries and keeps the rest', () => {
    expect(
      keepSelected({ A: 2, B: 0, C: '', D: -1, E: NaN, F: '0.5' }),
    ).toEqual({ A: 2, F: 0.5 })
  })

  it('keeps an out-of-range selection so Save stays blocked on it', () => {
    const kept = keepSelected({ A: 1000 })
    expect(kept).toEqual({ A: 1000 })
    expect(isSelectionInvalid(kept)).toBe(true)
  })
})

describe('quoteLineCount', () => {
  it('counts the new picks when the draft has no lines yet', () => {
    expect(quoteLineCount(many(3))).toBe(3)
    expect(quoteLineCount({})).toBe(0)
  })

  it('adds the picks to the lines the draft already has', () => {
    expect(quoteLineCount({ NEW: 1, 'ITEM-9': 1 }, codes(25))).toBe(26)
  })

  it('a pick of a line the draft already has adds no line', () => {
    expect(quoteLineCount({ 'ITEM-1': 4 }, codes(25))).toBe(25)
  })

  it('ignores zero, empty and negative entries', () => {
    expect(quoteLineCount({ NEW: 0, B: '', C: -2 }, codes(2))).toBe(2)
  })
})

describe('canAddMore', () => {
  it('allows a new line below 30 and stops at 30', () => {
    expect(canAddMore({})).toBe(true)
    expect(canAddMore(many(29))).toBe(true)
    expect(canAddMore(many(30))).toBe(false)
  })

  it('counts the lines the draft already has against the 30', () => {
    // 28 on the draft + 1 pick = 29: one more still fits.
    expect(canAddMore({ NEW: 1 }, codes(28))).toBe(true)
    // 29 on the draft + 1 pick = 30: the quote is full.
    expect(canAddMore({ NEW: 1 }, codes(29))).toBe(false)
    expect(canAddMore({}, codes(29))).toBe(true)
  })
})

describe('isSelectionInvalid', () => {
  it('is valid when nothing is entered', () => {
    expect(isSelectionInvalid({})).toBe(false)
  })

  it('accepts 30 items and rejects 31', () => {
    expect(isSelectionInvalid(many(30))).toBe(false)
    expect(isSelectionInvalid(many(31))).toBe(true)
  })

  it('counts the lines the draft already has', () => {
    // NEW-n are not on the draft, so each one is a new line.
    // 25 on the draft + 5 new = 30: fine. + 6 new = 31: blocked before the server does.
    const fresh = (n) =>
      Object.fromEntries(
        Array.from({ length: n }, (_, i) => [`NEW-${i + 1}`, 1]),
      )
    expect(isSelectionInvalid(fresh(5), codes(25))).toBe(false)
    expect(isSelectionInvalid(fresh(6), codes(25))).toBe(true)
  })

  it('does not count a pick of a line already on the draft', () => {
    expect(isSelectionInvalid({ 'ITEM-1': 2 }, codes(30))).toBe(false)
  })

  it('does not count zero or empty entries towards the 30', () => {
    expect(isSelectionInvalid({ ...many(30), X: 0, Y: '' })).toBe(false)
  })

  it('accepts the boundary quantities 0, 0.5 and 999', () => {
    expect(isSelectionInvalid({ A: 0, B: 0.5, C: 999, D: '' })).toBe(false)
  })

  it('rejects 1000, a negative or NaN on any row', () => {
    expect(isSelectionInvalid({ A: 1, B: 1000 })).toBe(true)
    expect(isSelectionInvalid({ A: 1, B: -1 })).toBe(true)
    expect(isSelectionInvalid({ A: 1, B: NaN })).toBe(true)
  })
})

describe('stepQty', () => {
  it('starts an empty row at 1', () => {
    expect(stepQty('', 1)).toBe(1)
    expect(stepQty(undefined, 1)).toBe(1)
    expect(stepQty(NaN, 1)).toBe(1)
  })

  it('steps down to 0, never below', () => {
    expect(stepQty(1, -1)).toBe(0)
    expect(stepQty(0, -1)).toBe(0)
    expect(stepQty(0.5, -1)).toBe(0)
  })

  it('keeps fractions and rounds away float noise', () => {
    expect(stepQty(0.5, 1)).toBe(1.5)
    expect(stepQty(2.3, -1)).toBe(1.3)
    expect(stepQty('1.25', 1)).toBe(2.25)
  })

  it('stays within 0..999 from an out-of-range value', () => {
    expect(stepQty(999, 1)).toBe(999)
    expect(stepQty(1000, -1)).toBe(999)
    expect(stepQty(-3, 1)).toBe(1)
  })
})

describe('isOutOfStock', () => {
  it('flags zero or negative stock', () => {
    expect(isOutOfStock(0)).toBe(true)
    expect(isOutOfStock(-2)).toBe(true)
  })

  it('does not flag stock on hand or a missing value', () => {
    expect(isOutOfStock(1)).toBe(false)
    expect(isOutOfStock(null)).toBe(false)
    expect(isOutOfStock(undefined)).toBe(false)
  })
})
