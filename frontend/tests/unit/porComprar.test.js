// Compras › Por comprar: the queue Muelle proposes (doco por_comprar), its
// blocks per supplier, the supplier sheet and the owner's settings sheet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({ api: vi.fn(), push: vi.fn() }))

vi.mock('@/composables/useCompras', async (original) => ({
  ...(await original()),
  comprasApi: (...args) => state.api(...args),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/compras?segment=por-comprar' }),
  useRouter: () => ({ push: state.push }),
}))
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  return {
    BottomSheet: {
      props: ['open', 'title', 'ariaLabel'],
      setup:
        (p, { slots }) =>
        () =>
          p.open
            ? h('div', { 'data-sheet': p.title || p.ariaLabel }, [
                slots.default?.(),
                slots.actions?.(),
              ])
            : null,
    },
    Segmented: {
      props: ['modelValue', 'options', 'label'],
      emits: ['update:modelValue'],
      setup:
        (p, { emit, attrs }) =>
        () =>
          h(
            'div',
            attrs,
            p.options.map((o) =>
              h(
                'button',
                {
                  'aria-checked': String(o.value === p.modelValue),
                  'data-value': o.value,
                  onClick: () => emit('update:modelValue', o.value),
                },
                o.label,
              ),
            ),
          ),
    },
    ChipGroup: {
      props: ['modelValue', 'options', 'label', 'testid'],
      emits: ['update:modelValue'],
      setup:
        (p, { emit }) =>
        () =>
          h(
            'div',
            p.options.map((o) =>
              h(
                'button',
                {
                  'data-testid': `${p.testid}-${o.value}`,
                  'aria-pressed': String(p.modelValue.includes(o.value)),
                  onClick: () =>
                    emit(
                      'update:modelValue',
                      p.modelValue.includes(o.value)
                        ? p.modelValue.filter((v) => v !== o.value)
                        : [...p.modelValue, o.value],
                    ),
                },
                o.label,
              ),
            ),
          ),
    },
  }
})

import PorComprarCola from '@/components/compras/porcomprar/PorComprarCola.vue'
import {
  asksAgain,
  blocksOf,
  draftsShown,
  pillOf,
  proposedCount,
  putLines,
} from '@/components/compras/porcomprar/porComprar'

const API = 'doco.workspaces.por_comprar'

function line(over = {}) {
  return {
    item: 'PANT-11',
    item_name: 'Pantalla iPhone 11 Incell',
    item_group: 'Pantallas',
    uom: 'Pieza',
    stock_uom: 'Pieza',
    proposed: true,
    qty: 4,
    pack: 1,
    stock_qty: 4,
    sold: 9,
    on_hand: 0,
    on_way: 0,
    per_week: 1.1,
    floor: 2,
    target: 4,
    min: false,
    minimum: 0,
    cover_days: 0,
    state: 'agotado',
    supplier: 'SUP-ALT',
    price: 412,
    price_date: '2026-11-03',
    price_source: 'lista',
    price_currency: 'MXN',
    price_stale: false,
    price_foreign: false,
    offers: [
      {
        supplier: 'SUP-ALT',
        price: 412,
        price_date: '2026-11-03',
        price_source: 'lista',
        price_currency: 'MXN',
        price_stale: false,
        price_foreign: false,
        price_extra: false,
      },
      {
        supplier: 'SUP-PIX',
        price: 438,
        price_date: '2026-11-12',
        price_source: 'compra',
        price_currency: 'MXN',
        price_stale: false,
        price_foreign: false,
        price_extra: false,
      },
    ],
    in_draft: null,
    ...over,
  }
}

function queue(over = {}) {
  return {
    on: 1,
    can_configure: true,
    can_add: true,
    quantities_only: false,
    company: 'Doco',
    currency: 'MXN',
    today: '2026-11-23',
    weeks: 8,
    cycle: 14,
    lead: 7,
    receive_at: null,
    needs_receive_at: false,
    reason: null,
    hidden: 0,
    capped: 0,
    lines: [
      line(),
      line({
        item: 'BAT-A32',
        item_name: 'Batería Samsung A32',
        qty: 5,
        sold: 14,
        on_hand: 1,
        cover_days: 4,
        state: 'dias',
        price: 96,
      }),
      line({
        item: 'MICA-13',
        item_name: 'Mica cristal iPhone 13',
        qty: 11,
        sold: 33,
        on_hand: 0,
        supplier: 'SUP-PIX',
        price: 14,
        offers: [
          {
            supplier: 'SUP-PIX',
            price: 14,
            price_currency: 'MXN',
            price_extra: false,
          },
        ],
      }),
      line({
        item: 'FUNDA-G54',
        item_name: 'Funda uso rudo G54',
        qty: 3,
        sold: 8,
        supplier: null,
        price: null,
        offers: [],
      }),
    ],
    suppliers: [
      {
        supplier: 'SUP-ALT',
        label: 'Refacciones Altamar',
        lead_days: 7,
        lead_source: 'proveedor',
      },
      {
        supplier: 'SUP-PIX',
        label: 'Mayoreo Pixel',
        lead_days: 3,
        lead_source: 'medido',
      },
    ],
    drafts: [],
    ...over,
  }
}

const flush = async () => {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('porComprar helpers', () => {
  it('groups by supplier, most urgent first, «Sin proveedor» last', () => {
    const blocks = blocksOf(queue())
    expect(blocks.map((b) => b.supplier)).toEqual(['SUP-ALT', 'SUP-PIX', ''])
    expect(blocks[0].entries.map((e) => e.line.item)).toEqual([
      'PANT-11',
      'BAT-A32',
    ])
    // 4 × 412 + 5 × 96
    expect(blocks[0].amount).toBe(2128)
    expect(blocks[0].open).toHaveLength(2)
    expect(blocks[2].amount).toBe(0)
  })

  it('sorts by what sold and by what is left', () => {
    const q = queue()
    const sold = blocksOf(q, { sort: 'vendido' })
    expect(sold[0].supplier).toBe('SUP-PIX')
    expect(blocksOf(q, { sort: 'vendido' })[1].entries[0].line.item).toBe(
      'BAT-A32',
    )
    const left = blocksOf(q, { sort: 'quedan' })
    expect(left[0].entries.map((e) => e.line.item)).toEqual([
      'PANT-11',
      'BAT-A32',
    ])
  })

  it('a supplier picked on screen moves the line to its block with its price', () => {
    const blocks = blocksOf(queue(), { picks: { 'PANT-11': 'SUP-PIX' } })
    const pixel = blocks.find((b) => b.supplier === 'SUP-PIX')
    expect(pixel.entries.map((e) => e.line.item)).toEqual([
      'PANT-11',
      'MICA-13',
    ])
    expect(pixel.amount).toBe(4 * 438 + 11 * 14)
  })

  it('a price in another currency stays out of the block total', () => {
    const q = queue({
      lines: [
        line({ price_foreign: true, price_currency: 'USD', price: 20 }),
        line({ item: 'X', qty: 2, price: 10 }),
      ],
    })
    expect(blocksOf(q)[0].amount).toBe(20)
  })

  it('a block with a draft shows the draft amount and leaves the list', () => {
    const q = queue({
      lines: [
        line({ in_draft: { order: 'PUR-ORD-1', qty: 4 } }),
        line({ item: 'X' }),
      ],
      drafts: [
        {
          supplier: 'SUP-ALT',
          order: 'PUR-ORD-1',
          count: 3,
          net_total: 3193,
          currency: 'MXN',
          created_here: true,
        },
      ],
    })
    const [block] = blocksOf(q)
    expect(block.draft.order).toBe('PUR-ORD-1')
    expect(block.amount).toBe(3193)
    expect(block.open.map((e) => e.line.item)).toEqual(['X'])
    expect([...draftsShown(q)]).toEqual(['PUR-ORD-1'])
    expect(proposedCount(q)).toBe(1)
  })

  it('reads the pill from state, never from a minimum alone', () => {
    expect(pillOf(line()).label).toBe('Out of stock')
    expect(pillOf(line({ state: 'min', minimum: 3 })).label).toBe('min 3')
    expect(
      pillOf(line({ state: 'dias', cover_days: 5, minimum: 3 })).label,
    ).toBe('5 days')
  })

  it('the search finds a product or a supplier', () => {
    expect(
      blocksOf(queue(), { search: 'bateria' }).flatMap((b) =>
        b.entries.map((e) => e.line.item),
      ),
    ).toEqual(['BAT-A32'])
    expect(
      blocksOf(queue(), { search: 'pixel' }).map((b) => b.supplier),
    ).toEqual(['SUP-PIX'])
  })

  it('asks again on the «Vuelve a intentarlo» answer with the same request id', async () => {
    const busy = Object.assign(new Error('put'), {
      status: 417,
      exc_type: 'TimestampMismatchError',
    })
    const api = vi
      .fn()
      .mockRejectedValueOnce(busy)
      .mockRejectedValueOnce(busy)
      .mockResolvedValue({ name: 'PUR-ORD-1' })
    const args = { request_id: 'r1', supplier: 'S', lines: [] }
    await expect(putLines(args, { api, wait: 0 })).resolves.toEqual({
      name: 'PUR-ORD-1',
    })
    expect(api).toHaveBeenCalledTimes(3)
    expect(api.mock.calls.every(([, a]) => a.request_id === 'r1')).toBe(true)
    const refused = Object.assign(new Error('put'), {
      status: 417,
      exc_type: 'ValidationError',
    })
    expect(asksAgain(refused)).toBe(false)
    const once = vi.fn().mockRejectedValue(refused)
    await expect(putLines(args, { api: once, wait: 0 })).rejects.toBe(refused)
    expect(once).toHaveBeenCalledTimes(1)
  })
})

describe('Por comprar queue', () => {
  let host, app, events
  beforeEach(() => {
    state.api.mockReset()
    state.push.mockReset()
    host = document.createElement('div')
    document.body.appendChild(host)
    events = { on: vi.fn(), count: vi.fn(), drafts: vi.fn() }
  })
  afterEach(() => {
    app?.unmount()
    host.remove()
  })
  const mount = (props = {}) => {
    app = createApp({
      render: () =>
        h(PorComprarCola, {
          onOn: events.on,
          onCount: events.count,
          onDrafts: events.drafts,
          ...props,
        }),
    })
    app.config.globalProperties.__ = globalThis.__
    app.mount(host)
  }
  const answer = (handlers) =>
    state.api.mockImplementation(async (method, args) => {
      const name = method.replace(`${API}.`, '')
      const reply = handlers[name]
      if (!reply) throw new Error(`unexpected ${method}`)
      return typeof reply === 'function' ? reply(args) : reply
    })
  const calls = (name) =>
    state.api.mock.calls.filter(([m]) => m === `${API}.${name}`)

  it('off: the owner sees one tile with the switch, and one tap turns it on', async () => {
    let on = 0
    answer({
      queue: () => (on ? queue() : { on: 0, can_configure: true }),
      save_settings: () => {
        on = 1
        return {}
      },
    })
    mount()
    await flush()
    expect(host.querySelector('[data-pc-apagado]')).not.toBeNull()
    expect(host.querySelector('[data-pc-orden]')).toBeNull()
    expect(host.querySelectorAll('[data-pc-bloque]')).toHaveLength(0)
    host.querySelector('[data-pc-encender]').click()
    await flush()
    expect(calls('save_settings')[0][1]).toEqual({ on: 1 })
    expect(host.querySelectorAll('[data-pc-bloque]')).toHaveLength(3)
  })

  it('off: a worker who cannot set it up sees nothing', async () => {
    answer({ queue: { on: 0, can_configure: false } })
    mount()
    await flush()
    expect(host.querySelector('[data-por-comprar]')).toBeNull()
    expect(events.on).toHaveBeenLastCalledWith(false)
  })

  it('off with two stores and no «Recibe en»: the tile opens the sheet with the field lit', async () => {
    answer({
      queue: { on: 0, can_configure: true, needs_receive_at: true },
      settings: {
        on: 0,
        weeks: 8,
        cycle: 14,
        lead: 7,
        groups: [],
        warehouses: [],
        receive_at: null,
        asks_receive_at: true,
        options: {
          weeks: [4, 8, 12],
          groups: [],
          warehouses: [
            { value: 'Centro - D', label: 'Centro' },
            { value: 'Norte - D', label: 'Plaza Norte' },
          ],
        },
      },
    })
    mount()
    await flush()
    host.querySelector('[data-pc-encender]').click()
    await flush()
    expect(calls('save_settings')).toHaveLength(0)
    const select = host.querySelector('[data-pc-recibe]')
    expect(select.getAttribute('aria-invalid')).toBe('true')
    expect(host.querySelector('[data-pc-guardar]').disabled).toBe(true)
  })

  it('shows the blocks, the filled button on the top one only, and the count', async () => {
    answer({ queue: queue() })
    mount()
    await flush()
    const blocks = [...host.querySelectorAll('[data-pc-bloque]')]
    expect(blocks.map((b) => b.dataset.pcBloque)).toEqual([
      'SUP-ALT',
      'SUP-PIX',
      'sin-proveedor',
    ])
    const adds = [...host.querySelectorAll('[data-pc-agregar]')]
    expect(adds.map((b) => b.textContent.trim())).toEqual(['Add 2', 'Add 1'])
    expect(adds[0].className).toContain('bg-surface-gray-10')
    expect(adds[1].className).not.toContain('bg-surface-gray-10')
    expect(blocks[0].querySelector('[data-pc-importe]').textContent).toContain(
      '2,128',
    )
    expect(events.count).toHaveBeenLastCalledWith(4)
    // «Sin proveedor»: the price slot is the supplier chip and the add waits
    const funda = host.querySelector('[data-pc-linea="FUNDA-G54"]')
    expect(funda.querySelector('[data-pc-proveedor]')).not.toBeNull()
    expect(funda.querySelector('[data-pc-linea-agregar]').disabled).toBe(true)
  })

  it('sorts by each chip', async () => {
    answer({ queue: queue() })
    mount()
    await flush()
    host.querySelector('[data-pc-sort="vendido"]').click()
    await flush()
    expect(
      host
        .querySelector('[data-pc-sort="vendido"]')
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(host.querySelector('[data-pc-bloque]').dataset.pcBloque).toBe(
      'SUP-PIX',
    )
    host.querySelector('[data-pc-sort="quedan"]').click()
    await flush()
    expect(host.querySelector('[data-pc-bloque]').dataset.pcBloque).toBe(
      'SUP-ALT',
    )
  })

  it('«Agregar N» posts the block once and reads the queue again', async () => {
    answer({
      queue: queue(),
      put: { name: 'PUR-ORD-9', created: true },
    })
    mount()
    await flush()
    host.querySelector('[data-pc-agregar]').click()
    await flush()
    const puts = calls('put')
    expect(puts).toHaveLength(1)
    expect(puts[0][1]).toMatchObject({
      supplier: 'SUP-ALT',
      lines: [
        { item: 'PANT-11', qty: 4 },
        { item: 'BAT-A32', qty: 5 },
      ],
    })
    expect(puts[0][1].request_id).toBeTruthy()
    expect(calls('queue')).toHaveLength(2)
  })

  it('«Revisar» opens the draft the queue filled', async () => {
    answer({
      queue: queue({
        lines: [line({ in_draft: { order: 'PUR-ORD-1', qty: 4 } })],
        drafts: [
          {
            supplier: 'SUP-ALT',
            order: 'PUR-ORD-1',
            count: 1,
            net_total: 1648,
            currency: 'MXN',
          },
        ],
      }),
    })
    mount()
    await flush()
    expect(host.querySelector('[data-pc-agregar]')).toBeNull()
    host.querySelector('[data-pc-revisar]').click()
    expect(state.push).toHaveBeenCalledWith({
      name: 'CompraOrden',
      params: { name: 'PUR-ORD-1' },
      query: { list: '/compras?segment=por-comprar' },
    })
    expect([...events.drafts.mock.calls.at(-1)[0]]).toEqual(['PUR-ORD-1'])
  })

  it('stepper to 0 hides the product in place; «Siempre» and undo', async () => {
    let hidden = false
    answer({
      queue: () =>
        hidden ? queue({ lines: queue().lines.slice(1), hidden: 1 }) : queue(),
      hide: (args) => {
        hidden = true
        return {
          item: args.item,
          until: args.always ? null : '2026-12-07',
          always: Boolean(args.always),
        }
      },
      show: (args) => {
        hidden = false
        return { item: args.item, until: null, always: false }
      },
    })
    mount()
    await flush()
    const row = () => host.querySelector('[data-pc-linea="PANT-11"]')
    // 4 → 0 by typing
    const input = row().querySelector('input')
    input.value = '0'
    input.dispatchEvent(new Event('change'))
    await flush()
    expect(calls('hide')[0][1]).toEqual({ item: 'PANT-11' })
    expect(row().querySelector('[data-pc-oculta]')).not.toBeNull()
    expect(
      row()
        .querySelector('[data-pc-ocultar-dias]')
        .getAttribute('aria-pressed'),
    ).toBe('true')
    row().querySelector('[data-pc-ocultar-siempre]').click()
    await flush()
    expect(calls('hide')[1][1]).toEqual({ item: 'PANT-11', always: 1 })
    expect(
      row()
        .querySelector('[data-pc-ocultar-siempre]')
        .getAttribute('aria-pressed'),
    ).toBe('true')
    row().querySelector('[data-pc-deshacer]').click()
    await flush()
    expect(calls('show')[0][1]).toEqual({ item: 'PANT-11' })
    expect(row().querySelector('[data-pc-oculta]')).toBeNull()
  })

  it('«Ocultos N» unfolds the hidden products and brings one back', async () => {
    answer({
      queue: queue({ hidden: 1 }),
      hidden: {
        rows: [
          {
            item: 'AUD-BT',
            item_name: 'Audífonos Bluetooth',
            until: null,
            always: true,
          },
        ],
        count: 1,
      },
      show: { item: 'AUD-BT' },
    })
    mount()
    await flush()
    host.querySelector('[data-pc-ocultos] button').click()
    await flush()
    const row = host.querySelector('[data-pc-oculto="AUD-BT"]')
    expect(row.textContent).toContain('Always')
    row.querySelector('[data-pc-traer]').click()
    await flush()
    expect(calls('show')[0][1]).toEqual({ item: 'AUD-BT' })
  })

  it('a supplier picked in the sheet regroups the line', async () => {
    answer({ queue: queue() })
    mount()
    await flush()
    host
      .querySelector('[data-pc-linea="PANT-11"] [data-pc-precio-abrir]')
      .click()
    await flush()
    const sheet = host.querySelector('[data-pc-hoja]')
    expect(sheet).not.toBeNull()
    sheet.querySelector('[data-pc-oferta="SUP-PIX"]').click()
    await flush()
    const pixel = host.querySelector('[data-pc-bloque="SUP-PIX"]')
    expect(pixel.querySelector('[data-pc-linea="PANT-11"]')).not.toBeNull()
    expect(calls('put')).toHaveLength(0)
  })

  it('without the shop money: no price, no total, no currency sign', async () => {
    // as the server sends it: every key that starts with «price» is gone
    const lines = queue().lines.map((full) => ({
      ...Object.fromEntries(
        Object.entries(full).filter(([key]) => !key.startsWith('price')),
      ),
      offers: full.offers.map((o) => ({ supplier: o.supplier })),
    }))
    answer({ queue: queue({ quantities_only: true, lines }) })
    mount()
    await flush()
    expect(host.querySelector('[data-pc-importe]')).toBeNull()
    expect(host.querySelector('[data-pc-precio]')).toBeNull()
    expect(host.textContent).not.toContain('$')
  })

  it('the owner steps a supplier’s delivery days in place', async () => {
    vi.useFakeTimers()
    try {
      answer({
        queue: queue(),
        lead: (args) => ({ supplier: args.supplier, lead_days: args.days }),
      })
      mount()
      await flush()
      host.querySelector('[data-pc-bloque="SUP-PIX"] [data-pc-entrega]').click()
      await flush()
      const stepper = host.querySelector(
        '[data-pc-bloque="SUP-PIX"] [data-pc-entrega-editar]',
      )
      stepper.querySelectorAll('button')[1].click()
      await flush()
      stepper.querySelectorAll('button')[1].click()
      await flush()
      vi.advanceTimersByTime(700)
      await flush()
      expect(calls('lead')).toEqual([
        [`${API}.lead`, { supplier: 'SUP-PIX', days: 5 }],
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('the settings sheet sends only its fields', async () => {
    answer({
      queue: queue(),
      settings: {
        on: 1,
        weeks: 8,
        cycle: 14,
        lead: 7,
        groups: ['Pantallas'],
        warehouses: [],
        receive_at: null,
        asks_receive_at: false,
        can_configure: true,
        options: {
          weeks: [4, 8, 12],
          groups: [
            { value: 'Pantallas', label: 'Pantallas' },
            { value: 'Baterías', label: 'Baterías' },
          ],
          warehouses: [{ value: 'Centro - D', label: 'Centro' }],
        },
      },
      save_settings: (args) => ({ ...args }),
    })
    mount()
    await flush()
    host.querySelector('[data-pc-ajustes]').click()
    await flush()
    host.querySelector('[data-pc-semanas] [data-value="12"]').click()
    host.querySelector('[data-testid="pc-grupo-Baterías"]').click()
    host.querySelector('[data-pc-ciclo] button:last-of-type').click()
    await flush()
    host.querySelector('[data-pc-guardar]').click()
    await flush()
    expect(calls('save_settings')[0][1]).toEqual({
      on: 1,
      weeks: 12,
      cycle: 15,
      lead: 7,
      groups: ['Pantallas', 'Baterías'],
      warehouses: [],
    })
    expect(calls('queue')).toHaveLength(2)
  })
})

describe('Por comprar copy', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const dir = resolve(here, '../../src/components/compras/porcomprar')
  it('no hint paragraphs: a <p> is only a guard or an error', () => {
    for (const file of [
      'PorComprarCola.vue',
      'PorComprarLinea.vue',
      'ProveedorSheet.vue',
      'PorComprarAjustes.vue',
      'DiasStepper.vue',
    ]) {
      const source = readFileSync(resolve(dir, file), 'utf8')
      const template = source.slice(0, source.indexOf('<script'))
      for (const p of template.match(/<p\b[^>]*>/g) || [])
        expect(p, `${file}: ${p}`).toMatch(/role="alert"|role="status"/)
    }
  })
})
