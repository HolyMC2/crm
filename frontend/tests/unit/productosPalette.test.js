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
  orderPaletteSections,
  productosItems,
} from '@/utils/shellPalette'

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
