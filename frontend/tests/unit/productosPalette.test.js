// Ctrl+K and Ctrl+G find products, serial numbers (IMEI) and batches
// (doco.workspaces.products.palette), and the rows the shell filters itself
// follow the shell's search rule: every word, any order, no accents.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({
  call: (...args) => state.call(...args),
  toast: { success: vi.fn(), error: vi.fn() },
  useColorScheme: () => ({
    colorScheme: ref('light'),
    setColorScheme: vi.fn(),
  }),
  createResource: () => ({ data: null, fetch: vi.fn() }),
}))
vi.mock('@/composables/breakpoint', async () => {
  const { computed, ref } = await import('vue')
  const mobile = ref(false)
  return {
    isMobile: mobile,
    isNarrow: mobile,
    isWide: computed(() => !mobile.value),
  }
})

import {
  federatedSearch,
  groupPaletteItems,
  parsePaletteQuery,
  providersFor,
} from '@/vendor/muelle-shell/contracts'
import {
  createShellProviders,
  instantRows,
  orderPaletteSections,
  productosItems,
  statesToShow,
} from '@/utils/shellPalette'
import { _resetProductIndex, loadProductIndex } from '@/utils/productIndex'

const screen = {
  name: 'MOD00016',
  title: 'Pantalla SM A05 ORI',
  item_group: 'Pantallas y Displays',
  uom: 'Nos',
  stock_item: true,
  price: { rate: 450, currency: 'MXN' },
  stock: { qty: 3, projected: 3, stores: 1 },
}
const serial = {
  kind: 'serial',
  name: '356938035643809',
  item_code: 'CEL-A05',
  item_name: 'Samsung A05',
  status: 'Delivered',
  status_label: 'Entregada',
  warehouse: null,
  warranty_until: null,
}

beforeEach(() => {
  globalThis.__ = (text, args) =>
    args ? text.replace(/{(\d+)}/g, (_, i) => args[i]) : text
  state.call.mockReset()
  // No product list on the device unless a test reads one.
  const kept = new Map()
  _resetProductIndex({
    get: async (key) => kept.get(key),
    set: async (key, value) => void kept.set(key, value),
    clear: async () => void kept.clear(),
  })
})

describe('productosItems', () => {
  it('a product reads its group, price and stock and opens its page', () => {
    const [row] = productosItems({ items: [screen] }, 'pan sm a05')
    expect(row).toMatchObject({
      group: 'registros',
      title: 'Pantalla SM A05 ORI',
      href: '/productos/MOD00016',
    })
    expect(row.subtitle).toContain('Producto · Pantallas y Displays · $450')
    expect(row.subtitle).toContain('in stock')
  })

  it('stock this worker cannot read is never «agotado»', () => {
    const [row] = productosItems(
      { items: [{ ...screen, stock: null }] },
      'pantalla',
    )
    expect(row.subtitle).not.toMatch(/stock/i)
  })

  it('a serial says its product and state, then its history in Taller', () => {
    const rows = productosItems(
      { units: [serial], items: [], checked: true },
      serial.name,
      { taller: true },
    )
    expect(rows.map((row) => [row.group, row.title])).toEqual([
      ['registros', `Serial ${serial.name}`],
      ['acciones', `Device history of ${serial.name}`],
    ])
    expect(rows[0]).toMatchObject({
      subtitle: 'Samsung A05 · Entregada',
      href: '/productos/CEL-A05',
    })
    expect(rows[1].external).toBe(`/taller/imei?identifier=${serial.name}`)
  })

  it('a batch says its quantity and that it expired', () => {
    const [row] = productosItems(
      {
        units: [
          {
            kind: 'batch',
            name: 'L2024-07',
            item_code: 'JARABE',
            item_name: 'Jarabe',
            qty: 12,
            expiry: '2020-01-01',
            expired: true,
          },
        ],
        checked: true,
      },
      'L2024-07',
    )
    expect(row).toMatchObject({
      title: 'Batch L2024-07',
      href: '/productos/JARABE',
    })
    expect(row.subtitle).toMatch(/^Jarabe · 12 · Expired on \S/)
  })

  it('a code nothing has says so and offers where to look next', () => {
    const lookup = { units: [], items: [], checked: true }
    const [taller] = productosItems(lookup, 'ZX123456', { taller: true })
    expect(taller).toMatchObject({
      title: 'No serial or batch «ZX123456»',
      external: '/taller/imei?identifier=ZX123456',
    })
    const [alone] = productosItems(lookup, 'ZX123456')
    expect(alone.href).toBe('/productos?q=ZX123456')
    // A name is never «not found»: it was not looked up as a code.
    expect(productosItems({ items: [], checked: false }, 'pantalla')).toEqual(
      [],
    )
  })

  it('a full page of products offers the whole Productos list', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      ...screen,
      name: `MOD${i}`,
    }))
    const rows = productosItems({ items }, 'pantalla sm')
    expect(rows.at(-1)).toMatchObject({
      group: 'acciones',
      href: '/productos?q=pantalla%20sm',
    })
    expect(productosItems({ items: [screen] }, 'pantalla sm')).toHaveLength(1)
  })
})

describe('the shell palette', () => {
  const boot = (modules) => ({
    user: { name: 'ana@example.test', full_name: 'Ana López' },
    modules,
  })
  async function rows(raw, modules) {
    const providers = createShellProviders({
      boot: ref(boot(modules)),
      modules: ref([]),
    })
    const q = parsePaletteQuery(raw)
    const states = await federatedSearch(providersFor(providers, q), q, {
      signal: new AbortController().signal,
      onUpdate() {},
    })
    return orderPaletteSections(groupPaletteItems(states)).flatMap((section) =>
      section.items.map((item) => `${section.group}/${item.title}`),
    )
  }

  it('«pan sm a05» asks Productos and lists the screen as a record', async () => {
    state.call.mockImplementation(async (method, args) => {
      if (method === 'doco.workspaces.products.palette') {
        expect(args).toEqual({ q: 'pan sm a05' })
        return { items: [screen], units: [], checked: false }
      }
      return []
    })
    const found = await rows('pan sm a05', {
      productos: { key: 'productos', enabled: true, capabilities: {} },
    })
    expect(found[0]).toBe('registros/Pantalla SM A05 ORI')
  })

  describe('with the product list on the device', () => {
    const modules = {
      productos: { key: 'productos', enabled: true, capabilities: {} },
    }
    const index = {
      stamp: 's1',
      complete: true,
      rows: [
        ['MOD00016', 'Pantalla SM A05 ORI', 'Pantallas y Displays', 'Samsung'],
        ['MOD00017', 'Pantalla SM A05S ORI', 'Pantallas y Displays', null],
        ['IPN000180', 'Case Samsung A05 Rosa', 'Fundas y Carcasas', null],
      ],
      barcodes: [],
    }
    const server = (palette) =>
      state.call.mockImplementation(async (method, args) => {
        if (method === 'doco.workspaces.products.palette_index') return index
        if (method === 'doco.workspaces.products.palette') return palette(args)
        return []
      })
    const known = (raw) => {
      const providers = createShellProviders({
        boot: ref(boot(modules)),
        modules: ref([]),
      })
      const q = parsePaletteQuery(raw)
      return instantRows(providersFor(providers, q), q)
    }

    it('the rows are there on the keystroke, before any answer', async () => {
      server(() => new Promise(() => {}))
      expect(known('pan sm a05').has('productos')).toBe(false)
      await loadProductIndex()
      state.call.mockClear()
      const rows = known('pan sm a05').get('productos')
      expect(
        rows.map((row) => [row.source, row.id, row.title, row.subtitle]),
      ).toEqual([
        [
          'productos',
          'item:MOD00016',
          'Pantalla SM A05 ORI',
          'Producto · Pantallas y Displays',
        ],
        [
          'productos',
          'item:MOD00017',
          'Pantalla SM A05S ORI',
          'Producto · Pantallas y Displays',
        ],
      ])
      expect(rows[0].href).toBe('/productos/MOD00016')
      expect(state.call).not.toHaveBeenCalled()
      // Only Productos knows before asking, and one letter is not a search.
      expect([...known('pan sm a05').keys()]).toEqual(['productos'])
      expect(known('p').has('productos')).toBe(false)
      expect(known('').has('productos')).toBe(false)
    })

    it('the server is asked for those rows only, and its answer stays', async () => {
      const asked = []
      server((args) => {
        asked.push(args)
        return { items: [screen], units: [], checked: false, stamp: 's1' }
      })
      await loadProductIndex()
      const found = await rows('pan sm a05', modules)
      expect(asked).toEqual([
        { q: 'pan sm a05', names: ['MOD00016', 'MOD00017'], stamp: 's1' },
      ])
      expect(found[0]).toBe('registros/Pantalla SM A05 ORI')
      // The next keystroke shows the price and stock just answered, at once.
      const [row] = known('pan sm a0').get('productos')
      expect(row.subtitle).toContain('$450')
      expect(row.subtitle).toContain('in stock')
    })

    it('a serial number is still looked up when no product matches', async () => {
      const asked = []
      server((args) => {
        asked.push(args)
        return { items: [], units: [serial], checked: true, stamp: 's1' }
      })
      await loadProductIndex()
      expect(known(serial.name).get('productos')).toEqual([])
      const found = await rows(serial.name, modules)
      expect(asked).toEqual([{ q: serial.name, names: [], stamp: 's1' }])
      expect(found).toContain(`registros/Serial ${serial.name}`)
    })

    it('an answer with another stamp reads the list again', async () => {
      server(() => ({ items: [], units: [], checked: false, stamp: 's2' }))
      await loadProductIndex()
      state.call.mockClear()
      await rows('pan sm a05', modules)
      expect(
        state.call.mock.calls.filter(
          ([method]) => method === 'doco.workspaces.products.palette_index',
        ),
      ).toHaveLength(1)
    })

    it('a full page offers the whole Productos list at once', async () => {
      index.rows = Array.from({ length: 6 }, (_, i) => [
        `MOD${i}`,
        `Pantalla SM A0${i}`,
        'Pantallas',
        null,
      ])
      server(() => new Promise(() => {}))
      await loadProductIndex()
      const rows = known('pantalla sm').get('productos')
      expect(rows.filter((row) => row.group === 'registros')).toHaveLength(5)
      expect(rows.at(-1)).toMatchObject({
        group: 'acciones',
        href: '/productos?q=pantalla%20sm',
      })
    })
  })

  it('without Productos the server is not asked', async () => {
    state.call.mockResolvedValue([])
    await rows('pan sm a05', {})
    expect(state.call).not.toHaveBeenCalledWith(
      'doco.workspaces.products.palette',
      expect.anything(),
    )
  })

  it('places match every word in any order and without accents', async () => {
    state.call.mockResolvedValue([])
    const modules = {
      cobranza: { key: 'cobranza', enabled: true, capabilities: {} },
      garantias: { key: 'garantias', enabled: true, capabilities: {} },
    }
    expect(await rows('cob venc', modules)).toContain(
      'ir_a/Cobranza › Vencidas',
    )
    expect(await rows('vencidas cobranza', modules)).toContain(
      'ir_a/Cobranza › Vencidas',
    )
    expect(await rows('garantias nuevas', modules)).toContain(
      'ir_a/Garantías › Nuevas',
    )
  })
})

describe('statesToShow', () => {
  const row = (title, subtitle = '') => ({ id: title, title, subtitle })
  const known = new Map([['productos', [row('Pantalla SM A05 ORI')]]])
  const last = [
    { key: 'productos', status: 'done', items: [row('Pantalla vieja')] },
    {
      key: 'contactos',
      status: 'done',
      items: [row('Pancho López'), row('Ana Ruiz')],
    },
  ]
  const shown = (status, map = known) =>
    Object.fromEntries(
      statesToShow(
        [
          { key: 'productos', status, items: [] },
          { key: 'contactos', status, items: [] },
        ],
        last,
        map,
        'pan',
      ).map((state) => [state.key, state.items.map((item) => item.title)]),
    )

  it('a provider still asking shows what the device knows, else what still matches', () => {
    for (const status of ['loading', 'slow'])
      expect(shown(status)).toEqual({
        productos: ['Pantalla SM A05 ORI'],
        contactos: ['Pancho López'],
      })
    // No list on the device: the last rows that still match, as before.
    expect(shown('loading', new Map()).productos).toEqual(['Pantalla vieja'])
  })

  it('an answer replaces both', () => {
    const answered = [
      { key: 'productos', status: 'done', items: [row('Pantalla SM A05S')] },
    ]
    expect(statesToShow(answered, last, known, 'pan')).toEqual(answered)
    // The device knowing of nothing is an answer while asking too.
    expect(shown('loading', new Map([['productos', []]])).productos).toEqual([])
  })

  it('a failed request keeps the rows the device knows, and only those', () => {
    expect(shown('error')).toEqual({
      productos: ['Pantalla SM A05 ORI'],
      contactos: [],
    })
  })
})
