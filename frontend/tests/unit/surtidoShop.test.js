import { describe, expect, it } from 'vitest'
import {
  cartFromPlan,
  cartLines,
  cartMinimums,
  cartTotals,
  categoriesOf,
  hasMark,
  pictureShop,
  saveCart,
  savedCart,
  searchMatcher,
  setPieces,
  shownRows,
  similarRows,
} from '@/utils/surtidoShop'

const row = (line, name, extra = {}) => ({
  line,
  name,
  model: '',
  category: 'Telefonía',
  printed: [],
  price: 1000,
  min_qty: 1,
  sold: 0,
  stock: 0,
  family: '',
  ...extra,
})

const ROWS = [
  row('a17', 'Samsung A17 4G', {
    model: 'A17 4G',
    family: 'samsung a17 4g',
    printed: ['Latin', 'Pay Joy'],
    sold: 8,
    stock: 0,
    price: 2879,
    min_qty: 10,
  }),
  row('a16', 'Samsung A16', {
    model: 'A16',
    family: 'samsung a16',
    printed: ['Latin'],
    sold: 26,
    stock: 3,
  }),
  row('a27t', 'Samsung A27 5G', {
    model: 'A27 5G',
    family: 'samsung a27 5g',
    printed: ['Telcel', 'Pay Joy'],
    price: 4299,
    min_qty: 10,
  }),
  row('a27l', 'Samsung A27 5G', {
    model: 'A27 5G',
    family: 'samsung a27 5g',
    printed: ['Latin', 'Pay Joy'],
    price: 4299,
    min_qty: 10,
  }),
  row('j012', 'Blu Bold Joy J012', {
    category: 'Telefonía (Económicos)',
    price: 398,
    min_qty: 20,
  }),
  row('sp52', 'Mochila SP5234', { category: 'Mochilas', price: 129 }),
]

describe('the search box', () => {
  it('takes words in any order, accents aside', () => {
    expect(ROWS.filter(searchMatcher('latin a17')).map((r) => r.line)).toEqual([
      'a17',
    ])
    expect(
      ROWS.filter(searchMatcher('telefonia economicos')).map((r) => r.line),
    ).toEqual(['j012'])
  })

  it('takes a pattern between slashes', () => {
    expect(ROWS.filter(searchMatcher('/a1[67]/')).map((r) => r.line)).toEqual([
      'a17',
      'a16',
    ])
    expect(ROWS.filter(searchMatcher('/^samsung a27/')).length).toBe(2)
  })

  it('searches a broken pattern as words', () => {
    expect(ROWS.filter(searchMatcher('/a1[/')).length).toBe(0)
    expect(() => searchMatcher('/(/')).not.toThrow()
  })
})

describe('browsing the list', () => {
  it('names its categories in order with their counts', () => {
    expect(categoriesOf(ROWS)).toEqual([
      { value: 'Telefonía', label: 'Telefonía', count: 4 },
      {
        value: 'Telefonía (Económicos)',
        label: 'Telefonía (Económicos)',
        count: 1,
      },
      { value: 'Mochilas', label: 'Mochilas', count: 1 },
    ])
  })

  it('narrows by category, marks and the shop history together', () => {
    const lines = (f) => shownRows(ROWS, f).map((r) => r.line)
    expect(lines({ marks: ['pay joy'] })).toEqual(['a17', 'a27t', 'a27l'])
    expect(lines({ marks: ['Pay Joy', 'Latin'] })).toEqual(['a17', 'a27l'])
    expect(lines({ history: 'agotado' })).toEqual(['a17'])
    expect(lines({ history: 'vendo' })).toEqual(['a17', 'a16'])
    expect(lines({ history: 'nuevo', category: 'Telefonía' })).toEqual([
      'a27t',
      'a27l',
    ])
    expect(hasMark(ROWS[0], 'PAYJOY')).toBe(true)
  })

  it('finds similar products: the same family first, then words of the category', () => {
    expect(similarRows(ROWS, ROWS[2]).map((r) => r.line)[0]).toBe('a27l')
    expect(similarRows(ROWS, ROWS[0]).map((r) => r.line)).toContain('a16')
    expect(similarRows(ROWS, ROWS[0])).not.toContain(ROWS[0])
    expect(shownRows(ROWS, { similarTo: ROWS[2] }).map((r) => r.line)).toEqual(
      expect.arrayContaining(['a27t', 'a27l']),
    )
  })

  it('reads as a grid only when the list has pictures', () => {
    expect(pictureShop(ROWS, 0)).toBe(false)
    expect(pictureShop(ROWS, 4)).toBe(true)
  })
})

describe('the cart', () => {
  it('keeps pieces per line and drops a line at zero', () => {
    let cart = setPieces({}, 'a17', 2)
    cart = setPieces(cart, 'a27l', 1)
    cart = setPieces(cart, 'a27l', 0)
    expect(cart).toEqual({ a17: 2 })
  })

  it('totals lines, pieces and money in the list order', () => {
    const lines = cartLines({ a27t: 1, a17: 2 }, ROWS)
    expect(lines.map((l) => l.line)).toEqual(['a17', 'a27t'])
    expect(cartTotals(lines)).toEqual({ lines: 2, pieces: 3, total: 10057 })
  })

  it('says where a price asks for more pieces than the cart holds', () => {
    const got = cartMinimums(cartLines({ a17: 2, a27t: 1, sp52: 1 }, ROWS))
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ category: 'Telefonía', need: 10, pieces: 3 })
    expect(got[0].short.map((l) => l.line)).toEqual(['a17', 'a27t'])
  })

  it('fills from a suggestion and is kept per list', () => {
    expect(cartFromPlan({ lines: [{ line: 'a17', qty: 2 }] })).toEqual({
      a17: 2,
    })
    const store = new Map()
    const storage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    }
    saveCart('cat', { a17: 2 }, storage)
    expect(savedCart('cat', storage)).toEqual({ a17: 2 })
    saveCart('cat', {}, storage)
    expect(savedCart('cat', storage)).toEqual({})
  })
})

describe('what the shop knows of a product', () => {
  const row = {
    price: 2879,
    sold: 8,
    stock: 0,
    selling: 3999,
    paid: { rate: 2950, date: '2026-10-02' },
    change: { kind: 'down', old_price: 2950, new_price: 2879 },
    other: { price: 2800, supplier_name: 'FixCell' },
  }

  it('reads the numbers in the order an owner decides', async () => {
    const { productFacts } = await import('@/utils/surtidoShop')
    const facts = productFacts(row)
    expect(facts.map((f) => f.label)).toEqual([
      'Sold in 12 months',
      'In stock',
      'You paid',
      'You sell it at',
      'Margin at this price',
      'Since the last list',
      'Cheaper at',
    ])
    expect(facts.find((f) => f.label === 'Margin at this price').value).toBe(
      '28%',
    )
    expect(facts.find((f) => f.label === 'Cheaper at').note).toBe('FixCell')
  })

  it('says the change, the margin and a cheaper supplier in one line', async () => {
    const { productLine, marginOf } = await import('@/utils/surtidoShop')
    expect(productLine(row)).toMatch(
      /^Down .*71, margin 28%, .*2,800.* at FixCell$/,
    )
    expect(productLine({ price: 100 })).toBe('')
    expect(marginOf(100, 0)).toBeNull()
  })
})
