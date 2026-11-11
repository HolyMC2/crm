import { describe, expect, it } from 'vitest'
import {
  canPlan,
  DEFAULT_ASK,
  parseFocus,
  planArgs,
  printedText,
  saveAsk,
  savedAsk,
  settingsChanged,
  underMinimum,
} from '@/utils/surtidoAsk'

describe('the models first, in the owner words', () => {
  it('reads the pieces after a model', () => {
    expect(parseFocus('SM A16 (2), SM A27 1, iPhone 16 x3')).toEqual({
      models: ['SM A16', 'SM A27', 'iPhone 16'],
      qty: { 'SM A16': 2, 'SM A27': 1, 'iPhone 16': 3 },
    })
  })

  it('keeps a model number as the name', () => {
    expect(parseFocus('iPhone 16, Note 80, Moto G06')).toEqual({
      models: ['iPhone 16', 'Note 80', 'Moto G06'],
      qty: {},
    })
    expect(parseFocus('iPhone 16 2').qty).toEqual({ 'iPhone 16': 2 })
  })

  it('ignores blanks and repeats', () => {
    expect(parseFocus(' , A07,,A07 ;').models).toEqual(['A07'])
  })
})

describe('the plan request', () => {
  const ask = {
    ...DEFAULT_ASK,
    budget: '41300',
    marks: ['Pay Joy'],
    section: 'Telefonía',
    item_group: 'Celulares',
    focus: 'A16 2, A27 1',
  }

  it('sends the marks, the section, the group and the pieces named', () => {
    const args = planArgs(ask, 'cat-1')
    expect(args.budget).toBe(41300)
    expect(JSON.parse(args.marks)).toEqual(['Pay Joy', 'Telefonía'])
    expect(args.item_group).toBe('Celulares')
    expect(JSON.parse(args.focus)).toEqual(['A16', 'A27'])
    expect(JSON.parse(args.changes)).toEqual([
      { op: 'qty', match: 'A16', qty: 2 },
      { op: 'qty', match: 'A27', qty: 1 },
    ])
    expect([args.low_stock, args.new_models, args.missing]).toEqual([1, 1, 0])
  })

  it('leaves out what was not asked', () => {
    const args = planArgs({ ...DEFAULT_ASK, budget: 5000 }, 'cat-1')
    expect([args.marks, args.focus, args.changes, args.terms]).toEqual([
      '',
      '',
      '',
      '',
    ])
  })

  it('plans only a list with products and a budget', () => {
    expect(canPlan(ask, { lines: 88 })).toBe(true)
    expect(canPlan({ ...ask, budget: '' }, { lines: 88 })).toBe(false)
    expect(canPlan(ask, { lines: 0 })).toBe(false)
  })

  it('counts the settings that differ from the usual ones', () => {
    expect(settingsChanged(DEFAULT_ASK)).toBe(0)
    expect(settingsChanged({ ...DEFAULT_ASK, months: 6, missing: true })).toBe(
      2,
    )
  })

  it('remembers the request per list', () => {
    const store = new Map()
    const storage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
    }
    saveAsk('cat-1', ask, storage)
    expect(savedAsk('cat-1', storage).marks).toEqual(['Pay Joy'])
    expect(savedAsk('cat-2', storage)).toBeNull()
  })
})

describe('a plan line', () => {
  it('says what the list printed, with commas, without repeating the name', () => {
    expect(
      printedText({
        name: 'SAMSUNG A27 5G',
        printed: ['LATIN', '128GB/6GB', 'Pay Joy', '5G'],
      }),
    ).toBe('LATIN, 128GB/6GB, Pay Joy')
  })

  it('knows a price that asks for more pieces', () => {
    expect(underMinimum({ qty: 3, min_qty: 10 })).toBe(true)
    expect(underMinimum({ qty: 12, min_qty: 10 })).toBe(false)
    expect(underMinimum({ qty: 1, min_qty: 1 })).toBe(false)
  })
})
