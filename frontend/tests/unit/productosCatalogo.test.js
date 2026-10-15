// Productos as a catálogo: filters in the URL, the remembered layout, the
// initials tile, the stock and price words, and how old a price is.
import { describe, expect, it } from 'vitest'
import {
  activeFilters,
  catalogArgs,
  catalogChoice,
  groupFacets,
  groupLabel,
  groupOf,
  groupRoute,
  initials,
  listState,
  loadLayout,
  priceStatus,
  productKind,
  relativeAge,
  saveLayout,
  stockBadge,
  tileTone,
  TILE_TONES,
} from '../../src/composables/useProductos.js'

function memoryStorage() {
  const data = new Map()
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  }
}

describe('catálogo filters', () => {
  it('reads existencias and foto from the URL, only con or sin', () => {
    const state = listState({
      grupo: 'Fundas',
      existencias: 'con',
      foto: 'sin',
    })
    expect(catalogArgs(state)).toEqual({
      group: 'Fundas',
      stock: 'con',
      photo: 'sin',
    })
    expect(listState({ existencias: 'todo', foto: ['con'] })).toMatchObject({
      stock: '',
      photo: '',
    })
    expect(catalogChoice('sin')).toBe('sin')
    expect(catalogChoice('SIN')).toBe('')
  })

  it('lists the active filters as chips that clear themselves', () => {
    const chips = activeFilters({ group: 'Recargas', stock: 'sin', photo: '' })
    expect(chips.map((c) => [c.key, c.label, c.query])).toEqual([
      ['grupo', 'Recargas', { grupo: '' }],
      ['existencias', 'Without stock', { existencias: '' }],
    ])
    expect(activeFilters({})).toEqual([])
  })

  it('ERPNext’s root item group names no group; as a filter it is «Todos los grupos»', () => {
    expect(groupOf({ item_group: 'All Item Groups' })).toBe('')
    expect(groupOf({ item_group: 'Todos los grupos de artículos' })).toBe('')
    expect(groupOf({ item_group: 'Fundas' })).toBe('Fundas')
    expect(groupOf({})).toBe('')
    expect(
      groupFacets([
        { value: 'All Item Groups', count: 12 },
        { value: 'Fundas', count: 3 },
      ]),
    ).toEqual([{ value: 'Fundas', count: 3 }])
    expect(groupLabel('All Item Groups')).toBe('All groups')
    expect(groupLabel('Fundas')).toBe('Fundas')
    expect(activeFilters({ group: 'All Item Groups' })[0].label).toBe(
      'All groups',
    )
  })

  it('opens Todos on a group from the product page', () => {
    expect(groupRoute('Recargas')).toEqual({
      name: 'Productos',
      query: { grupo: 'Recargas' },
    })
  })
})

describe('layout memory', () => {
  it('keeps Lista or Tarjetas per user and ignores anything else', () => {
    const storage = memoryStorage()
    expect(loadLayout('ana@x', storage)).toBe('lista')
    saveLayout('ana@x', 'tarjetas', storage)
    saveLayout('ana@x', 'mosaico', storage)
    expect(loadLayout('ana@x', storage)).toBe('tarjetas')
    expect(loadLayout('beto@x', storage)).toBe('lista')
    const broken = {
      getItem() {
        throw new Error('blocked')
      },
    }
    expect(loadLayout('ana@x', broken)).toBe('lista')
  })
})

describe('product tile', () => {
  it('takes two initials, accents and symbols aside', () => {
    expect(initials('Recarga ABIB $130')).toBe('RA')
    expect(initials('Batería')).toBe('BA')
    expect(initials('_Test Extra Item 1')).toBe('TE')
    expect(initials('  ')).toBe('?')
  })

  it('gives a group always the same tone', () => {
    expect(tileTone('Fundas')).toBe(tileTone('Fundas'))
    expect(TILE_TONES).toContain(tileTone('Recargas'))
  })
})

describe('stock and price words', () => {
  it('says service, sold out or how many are on hand', () => {
    expect(stockBadge({ stock_item: false, stock: { qty: 0 } }).kind).toBe(
      'service',
    )
    expect(stockBadge({ stock_item: true, stock: { qty: 0 } })).toMatchObject({
      kind: 'out',
      theme: 'red',
    })
    expect(stockBadge({ stock_item: true, stock: { qty: 12 } })).toMatchObject({
      kind: 'in',
      text: '12 in stock',
    })
    expect(stockBadge({ stock_item: true, stock: { qty: -2 } }).kind).toBe(
      'negative',
    )
    // A store row (Faltan, Bajo mínimo) counts that store.
    expect(stockBadge({ warehouse: 'Centro', actual_qty: 0 }).kind).toBe('out')
    // Who cannot read stock is never told «agotado».
    expect(stockBadge({ stock_item: true, stock: null })).toBeNull()
  })

  it('names the price status of each list', () => {
    expect(priceStatus({ rate: null }).text).toBe('No price')
    expect(priceStatus({ rate: 10, status: 'vigente' }).theme).toBe('green')
    expect(priceStatus({ rate: 10, status: 'por-revisar' }).theme).toBe(
      'orange',
    )
    expect(priceStatus({ rate: 10, status: 'vence' }).text).toBe('Ends soon')
  })

  it('says how old a price is and how fresh that is', () => {
    const today = '2026-10-14'
    expect(relativeAge('2026-10-14 08:00:00', today)).toMatchObject({
      text: 'today',
      tone: 'fresh',
    })
    expect(relativeAge('2026-10-13', today).text).toBe('yesterday')
    expect(relativeAge('2026-10-08 22:03:05', today)).toMatchObject({
      text: '6 days ago',
      tone: 'fresh',
    })
    expect(relativeAge('2026-08-01', today)).toMatchObject({
      text: '2 months ago',
      tone: 'old',
    })
    expect(relativeAge('2024-10-01', today)).toMatchObject({
      text: '2 years ago',
      tone: 'stale',
    })
    expect(relativeAge(null, today).tone).toBe('never')
  })

  it('names the kind of product', () => {
    expect(productKind({ is_stock_item: 0 }).kind).toBe('service')
    expect(productKind({ is_stock_item: 1, has_serial_no: 1 }).kind).toBe(
      'serial',
    )
    expect(productKind({ is_stock_item: 1, has_batch_no: 1 }).kind).toBe(
      'batch',
    )
    expect(productKind({ is_stock_item: 1 }).kind).toBe('stock')
  })
})
