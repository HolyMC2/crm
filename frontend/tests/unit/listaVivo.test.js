import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  changedLines,
  concerns,
  editorOf,
  initials,
  othersIn,
  storiesToAsk,
  viewerName,
  storyFacts,
  storyShape,
  tellsAStory,
} from '@/utils/listaVivo'

const here = dirname(fileURLToPath(import.meta.url))

describe('the order as a shared sheet', () => {
  it('hears only its own supplier', () => {
    expect(concerns({ supplier: 'Gamma' }, 'Gamma')).toBe(true)
    expect(concerns({ supplier: 'Xmovil' }, 'Gamma')).toBe(false)
    expect(concerns(null, 'Gamma')).toBe(false)
    expect(concerns({ supplier: '' }, '')).toBe(false)
  })

  it('names who changed it; its own tap is no news, Muelle for the same person is', () => {
    const me = 'karla@shop.mx'
    expect(editorOf({ user: me, by: 'Karla M.', bot: false }, me)).toBeNull()
    expect(editorOf({ user: me, by: 'Karla M.', bot: true }, me)).toEqual({
      bot: true,
      name: '',
      user: me,
    })
    expect(editorOf({ user: 'jose@shop.mx', by: 'José L.' }, me)).toEqual({
      bot: false,
      name: 'José L.',
      user: 'jose@shop.mx',
    })
  })

  it('finds the rows whose quantity changed, never the ones this page is sending', () => {
    const before = { A: { qty: 2 }, B: { qty: 1 }, C: { qty: 5 } }
    const after = { A: { qty: 2 }, B: { qty: 4 }, D: { qty: 1 } }
    expect(changedLines(before, after)).toEqual([
      { line: 'B', was: 1, now: 4 },
      { line: 'C', was: 5, now: 0 },
      { line: 'D', was: 0, now: 1 },
    ])
    expect(changedLines(before, after, { B: 4 }).map((c) => c.line)).toEqual([
      'C',
      'D',
    ])
  })

  it('shows the other people once each, with their initials', () => {
    expect(othersIn(['me', 'ana', 'ana', 'luis', ''], 'me')).toEqual([
      'ana',
      'luis',
    ])
    expect(initials('Karla Martínez Soto')).toBe('KS')
    expect(initials('Muelle')).toBe('M')
    expect(initials('')).toBe('?')
  })

  it('names a person by their name, never by their login', () => {
    expect(viewerName('karla@shop.mx', 'Karla Martínez')).toBe('Karla Martínez')
    // the users store's stand-in before it loads the person
    expect(viewerName('jose.luis@shop.mx', 'jose.luis')).toBe('Jose Luis')
    expect(viewerName('jose.luis@shop.mx')).toBe('Jose Luis')
    expect(viewerName('')).toBe('')
  })
})

describe('a row’s price story', () => {
  const points = [
    {
      date: '2026-08-01',
      price: 50,
      source: 'lista',
      mine: true,
      supplier_name: 'Gamma',
    },
    {
      date: '2026-09-01',
      price: 44,
      source: 'recibo',
      mine: true,
      supplier_name: 'Gamma',
    },
    {
      date: '2026-10-01',
      price: 42,
      source: 'lista',
      mine: false,
      supplier_name: 'Xmovil',
    },
    {
      date: '2026-10-15',
      price: 46,
      source: 'lista',
      mine: false,
      supplier_name: 'Perfeccel',
    },
    {
      date: '2026-11-01',
      price: 45,
      source: 'lista',
      mine: true,
      supplier_name: 'Gamma',
    },
  ]

  it('draws this supplier as a line, the others as rings, what was paid as squares', () => {
    const shape = storyShape(points, { width: 100, height: 20, pad: 0 })
    expect(shape.mine).toHaveLength(2)
    expect(shape.others).toHaveLength(2)
    expect(shape.paid).toHaveLength(1)
    // oldest on the left, dearest on top
    expect(shape.mine[0]).toEqual({ x: 0, y: 0 })
    expect(shape.mine[1].x).toBe(100)
    expect(shape.others[0].y).toBe(20)
    expect(shape.line).toBe(`0,0 100,${shape.mine[1].y}`)
    expect([shape.low, shape.high]).toEqual([42, 50])
    expect(storyShape([])).toBeNull()
    // one price over one day sits in the middle
    expect(
      storyShape(
        [{ date: '2026-11-01', price: 5, source: 'lista', mine: true }],
        {
          width: 10,
          height: 10,
        },
      ).mine[0],
    ).toEqual({ x: 5, y: 5 })
  })

  it('tells the newest list price, the cheapest other supplier and the last payment', () => {
    const facts = storyFacts(points)
    expect(facts.mine.price).toBe(45)
    expect(facts.other.supplier_name).toBe('Xmovil')
    expect(facts.paid.price).toBe(44)
    expect(storyFacts([]).other).toBeNull()
  })

  it('draws a story only when the prices span two days', () => {
    expect(tellsAStory(points)).toBe(true)
    const sameDay = [
      { date: '2026-11-01', price: 45, source: 'lista', mine: true },
      { date: '2026-11-01 10:00:00', price: 45, source: 'lista', mine: true },
    ]
    expect(tellsAStory(sameDay)).toBe(false)
    expect(tellsAStory([])).toBe(false)
  })

  it('asks only for the rows it has no story of, at most the server’s limit', () => {
    expect(storiesToAsk(['a', 'b', 'c'], { b: [] })).toEqual(['a', 'c'])
    expect(storiesToAsk(['a', 'b', 'c'], {}, 2)).toEqual(['a', 'b'])
  })
})

describe('the page wiring', () => {
  const page = readFileSync(
    resolve(here, '../../src/pages/CompraLista.vue'),
    'utf8',
  )

  it('listens to the order announcements and reads the order part alone', () => {
    expect(page).toContain('socket?.on?.(LIVE_EVENT, onOrderEvent)')
    expect(page).toContain('socket?.off?.(LIVE_EVENT, onOrderEvent)')
    expect(page).toContain("call('estado', { catalogo: props.name })")
    expect(page).toContain('useLiveWatch(')
  })

  it('opens and closes the order for presence', () => {
    expect(page).toContain("socket?.emit?.('doc_open', ORDER_DOCTYPE, openDoc)")
    expect(page).toContain(
      "socket?.emit?.('doc_close', ORDER_DOCTYPE, openDoc)",
    )
    expect(page).toContain('openPresence(null)')
  })
})
