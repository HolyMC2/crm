// The worker's products kept on the device (utils/productIndex): Ctrl+K ranks
// them on the keystroke; the server says when the list is out of date.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: (...args) => state.call(...args) }))

import {
  PRODUCT_DETAILS_MS,
  PRODUCT_INDEX_FAILED_MS,
  PRODUCT_INDEX_RETRY_MS,
  PRODUCT_INDEX_STALE_MS,
  _resetProductIndex,
  findProducts,
  forgetProductIndex,
  keepProductDetails,
  loadProductIndex,
  noteProductStamp,
  productDetails,
} from '@/utils/productIndex'

const ROWS = [
  ['MOD00016', 'Pantalla SM A05 ORI', 'Pantallas y Displays', 'Samsung'],
  ['MOD00017', 'Pantalla SM A05S ORI', 'Pantallas y Displays', 'Samsung'],
  ['IPN000180', 'Anillo Case Samsung A13 5G Azul', 'Fundas y Carcasas', null],
  ['IPN003214', 'Bateria para iPhone 13', 'Baterías', 'Apple'],
  ['IPN003215', 'Bateria para iPhone 13 Pro', 'Baterías', 'Apple'],
  ['IPN003216', 'Bateria para iPhone 13 Pro Max', 'Baterías', 'Apple'],
  ['MOD00148', 'Pantalla iPhone 13 INCELL', 'Pantallas y Displays', 'Apple'],
  ['MOD00154', 'Pantalla iPhone 13 PRO MAX INCELL', 'Pantallas', 'Apple'],
  ['MOD00131', 'Pantalla iPhone XS INCELL', 'Pantallas y Displays', 'Apple'],
]
const answer = (over = {}) => ({
  stamp: 's1',
  complete: true,
  rows: ROWS,
  barcodes: [
    ['7501234567890', 'IPN003214'],
    ['', 'MOD00016'],
    ['999', 'NOT-READABLE'],
  ],
  ...over,
})

function memoryStore() {
  const kept = new Map()
  return {
    kept,
    get: async (key) => kept.get(key),
    set: async (key, value) => void kept.set(key, value),
    clear: async () => void kept.clear(),
  }
}

let store
beforeEach(() => {
  store = memoryStore()
  _resetProductIndex(store)
  state.call.mockReset()
  state.call.mockResolvedValue(answer())
})

const titles = (text) => findProducts(text)?.rows.map((row) => row.title)

describe('ranking on the device', () => {
  it('has nothing to rank until the list is read', async () => {
    expect(findProducts('pantalla')).toBeNull()
    await loadProductIndex()
    expect(state.call).toHaveBeenCalledWith(
      'doco.workspaces.products.palette_index',
    )
    expect(titles('pantalla')).toHaveLength(5)
  })

  it('finds as the shared ranker does and says which list ranked', async () => {
    await loadProductIndex()
    expect(findProducts('pan sm a05')).toEqual({
      stamp: 's1',
      names: ['MOD00016', 'MOD00017'],
      rows: [
        {
          name: 'MOD00016',
          title: 'Pantalla SM A05 ORI',
          item_group: 'Pantallas y Displays',
        },
        {
          name: 'MOD00017',
          title: 'Pantalla SM A05S ORI',
          item_group: 'Pantallas y Displays',
        },
      ],
    })
    // «13» is never the 13 inside MOD0013x, nor «A13».
    expect(titles('ip 13')).toEqual([
      'Bateria para iPhone 13',
      'Pantalla iPhone 13 INCELL',
      'Bateria para iPhone 13 Pro',
      'Bateria para iPhone 13 Pro Max',
      'Pantalla iPhone 13 PRO MAX INCELL',
    ])
    // The brand is searched, weighted under the name.
    expect(titles('apple xs')).toEqual(['Pantalla iPhone XS INCELL'])
    expect(titles('zzz')).toEqual([])
  })

  it('the exact code or a scanned barcode leads', async () => {
    await loadProductIndex()
    expect(titles('mod00148')[0]).toBe('Pantalla iPhone 13 INCELL')
    expect(titles('7501234567890')).toEqual(['Bateria para iPhone 13'])
    // A barcode of a product the worker cannot read names nothing.
    expect(titles('999')).toEqual([])
  })

  it('shows five rows at most', async () => {
    await loadProductIndex()
    expect(findProducts('pantalla').names).toHaveLength(5)
  })
})

describe('the copy on the device', () => {
  it('answers the next visit without the server', async () => {
    await loadProductIndex({ now: 1000 })
    expect(store.kept.size).toBe(1)
    _resetProductIndex(store)
    state.call.mockClear()
    await loadProductIndex({ now: 2000 })
    expect(state.call).not.toHaveBeenCalled()
    expect(titles('pan sm a05')).toEqual([
      'Pantalla SM A05 ORI',
      'Pantalla SM A05S ORI',
    ])
  })

  it('an hour old still answers while a new one is read', async () => {
    await loadProductIndex({ now: 0 })
    state.call.mockClear()
    state.call.mockResolvedValue(
      answer({ stamp: 's2', rows: [['NEW1', 'Mica A05', 'Micas', null]] }),
    )
    const index = await loadProductIndex({ now: PRODUCT_INDEX_STALE_MS })
    expect(index.stamp).toBe('s1')
    expect(state.call).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(findProducts('mica')?.stamp).toBe('s2'))
    expect(titles('mica')).toEqual(['Mica A05'])
    expect(titles('pantalla')).toEqual([])
  })

  it('a catalogue too large for a device is searched by the server', async () => {
    state.call.mockResolvedValue({
      stamp: 's1',
      complete: false,
      rows: [],
      barcodes: [],
    })
    expect(await loadProductIndex({ now: 0 })).toBeNull()
    expect(findProducts('pantalla')).toBeNull()
    // Known to be too large: not read again on every open, nor for a stamp.
    await loadProductIndex({ now: 5000 })
    noteProductStamp('s9', { now: 6000 })
    expect(state.call).toHaveBeenCalledTimes(1)
  })

  it('a failed read leaves the server searching and waits to ask again', async () => {
    state.call.mockRejectedValue(new Error('offline'))
    expect(await loadProductIndex({ now: 0 })).toBeNull()
    expect(findProducts('pantalla')).toBeNull()
    await loadProductIndex({ now: PRODUCT_INDEX_FAILED_MS - 1 })
    expect(state.call).toHaveBeenCalledTimes(1)
    state.call.mockResolvedValue(answer())
    await loadProductIndex({ now: PRODUCT_INDEX_FAILED_MS })
    expect(titles('pan sm a05')).toHaveLength(2)
  })

  it('a stored copy that is not a list is ignored', async () => {
    store.kept.set('junk', { at: 'yesterday' })
    store.get = async () => ({ at: 'yesterday', rows: 'nope' })
    await loadProductIndex({ now: 0 })
    expect(state.call).toHaveBeenCalledTimes(1)
    expect(titles('pan sm a05')).toHaveLength(2)
  })

  it('sign-out leaves no list on the device', async () => {
    await loadProductIndex({ now: 0 })
    keepProductDetails([{ name: 'MOD00016', price: { rate: 450 } }])
    await forgetProductIndex()
    expect(store.kept.size).toBe(0)
    expect(findProducts('pantalla')).toBeNull()
    expect(productDetails('MOD00016')).toBeNull()
  })

  it('a read still out at sign-out keeps nothing', async () => {
    let answerNow
    state.call.mockReturnValue(
      new Promise((resolve) => {
        answerNow = resolve
      }),
    )
    const loading = loadProductIndex({ now: 0 })
    await vi.waitFor(() => expect(state.call).toHaveBeenCalled())
    await forgetProductIndex()
    answerNow(answer())
    expect(await loading).toBeNull()
    expect(store.kept.size).toBe(0)
    expect(findProducts('pantalla')).toBeNull()
  })
})

describe('the stamp of an answer', () => {
  it('the same stamp reads nothing', async () => {
    await loadProductIndex({ now: 0 })
    state.call.mockClear()
    noteProductStamp('s1', { now: 1000 })
    noteProductStamp('', { now: 1000 })
    expect(state.call).not.toHaveBeenCalled()
  })

  it('another stamp reads the list again, once', async () => {
    await loadProductIndex({ now: 0 })
    state.call.mockClear()
    state.call.mockResolvedValue(
      answer({ stamp: 's2', rows: [['NEW1', 'Mica A05', 'Micas', null]] }),
    )
    noteProductStamp('s2', { now: 1000 })
    noteProductStamp('s2', { now: 1001 })
    expect(state.call).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(titles('mica')).toEqual(['Mica A05']))
    // A catalogue that keeps changing is read again only after the wait.
    noteProductStamp('s3', { now: 1000 + PRODUCT_INDEX_RETRY_MS - 1 })
    expect(state.call).toHaveBeenCalledTimes(1)
    noteProductStamp('s3', { now: 1000 + PRODUCT_INDEX_RETRY_MS })
    expect(state.call).toHaveBeenCalledTimes(2)
  })
})

describe('price and stock of a row already answered', () => {
  it('show again while fresh', () => {
    const row = { name: 'MOD00016', price: { rate: 450 } }
    keepProductDetails([row, null, { title: 'no code' }], { now: 0 })
    expect(productDetails('MOD00016', { now: PRODUCT_DETAILS_MS - 1 })).toBe(
      row,
    )
    expect(productDetails('MOD00016', { now: PRODUCT_DETAILS_MS })).toBeNull()
    expect(productDetails('MOD00017', { now: 0 })).toBeNull()
  })
})
