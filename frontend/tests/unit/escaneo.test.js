// The shell's own scanner (components/escaneo): one code read with the camera,
// typed or shot by a scanner gun opens its product, asks which when several
// products carry it, and turns a code nobody has into a product in the same
// sheet. A page that counts codes itself (Recepción) takes them as read, and a
// document's items get the product back as a line.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({ calls: [], replies: {}, toasts: [] }))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: async (url, args) => {
      const name = url.split('.').pop()
      state.calls.push([name, args])
      const reply = state.replies[name]
      return typeof reply === 'function' ? reply(args) : reply
    },
    toast: {
      success: (text) => state.toasts.push(text),
      error: (text) => state.toasts.push(text),
    },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'button',
            { disabled: props.disabled, onClick: () => emit('click') },
            props.label,
          ),
    },
    FormControl: {
      props: ['modelValue', 'label', 'type', 'options', 'disabled'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h('input', {
            'data-label': props.label,
            value: props.modelValue,
            onInput: (e) => emit('update:modelValue', e.target.value),
          }),
    },
  }
})
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  const ListRow = (await vi.importActual('@/components/ui/ListRow.vue')).default
  return {
    ListRow,
    BottomSheet: {
      props: ['open', 'title', 'dismissible'],
      emits: ['update:open', 'closed'],
      setup:
        (props, { emit, slots }) =>
        () =>
          props.open
            ? h('div', { role: 'dialog' }, [
                h('h2', props.title),
                h('button', {
                  'data-sheet-close': '',
                  onClick: () => {
                    emit('update:open', false)
                    emit('closed')
                  },
                }),
                slots.default?.(),
                slots.actions?.(),
              ])
            : null,
    },
  }
})

import ScanSheet from '@/components/escaneo/ScanSheet.vue'
import ItemsEditor from '@/components/documentos/ItemsEditor.vue'
import {
  createdItem,
  looksLikeCode,
  priceValue,
  suggestedName,
} from '@/components/escaneo/escaneo'
import {
  claimScans,
  openScan,
  scan,
  scanClaim,
  settleScan,
} from '@/components/escaneo/scanDoor'

globalThis.__ = (text, args) =>
  args ? text.replace(/{(\d+)}/g, (_, i) => args[i]) : text

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const $ = (selector) => document.querySelector(selector)
const text = () => document.body.textContent
function type(selector, value) {
  const input = $(selector)
  input.value = value
  input.dispatchEvent(new Event('input'))
}
const submit = (selector) =>
  $(selector).dispatchEvent(new Event('submit', { cancelable: true }))

let app, root, router
async function mount(component, props = {}) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/hoy', component: { render: () => null } },
      { path: '/productos', component: { render: () => null } },
      { path: '/productos/:code', component: { render: () => null } },
    ],
  })
  await router.push('/hoy')
  await router.isReady()
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = globalThis.__
  app.use(router)
  app.mount(root)
  await flush()
}

beforeEach(() => {
  state.calls = []
  state.replies = {}
  state.toasts = []
})
afterEach(() => {
  settleScan(null)
  scan.wanted = false
  app?.unmount()
  root?.remove()
  app = null
})

describe('what a code is', () => {
  it('a code is one word with a digit; a typed name is a search', () => {
    expect(looksLikeCode('7501031311309')).toBe(true)
    expect(looksLikeCode(' FUN-12 ')).toBe(true)
    expect(looksLikeCode('356938035643809')).toBe(true)
    expect(looksLikeCode('funda roja')).toBe(false)
    expect(looksLikeCode('funda')).toBe(false)
    expect(looksLikeCode('A12')).toBe(false)
    expect(looksLikeCode('')).toBe(false)
  })
  it('a typed price reads like Precios; blank or zero is no price', () => {
    expect(priceValue('$1,234.50')).toBe(1234.5)
    expect(priceValue('89,90')).toBe(89.9)
    expect(priceValue(' 25 ')).toBe(25)
    expect(priceValue('')).toBeNull()
    expect(priceValue('0')).toBeNull()
    expect(priceValue('abc')).toBeNull()
  })
  it('the shelf name carries the size once', () => {
    expect(suggestedName({ suggested_name: 'Agua Ciel', size: '1 L' })).toBe(
      'Agua Ciel 1 L',
    )
    expect(suggestedName({ product_name: 'Agua  Ciel 1 l', size: '1 L' })).toBe(
      'Agua Ciel 1 l',
    )
    expect(suggestedName({ size: '1 L' })).toBe('')
  })
  it('a create answers in the shape a resolved scan has', () => {
    expect(
      createdItem({ item_code: 'AG-1', uom: 'Pieza', created: true }),
    ).toEqual({
      kind: 'item',
      via: 'created',
      item_code: 'AG-1',
      item_name: 'AG-1',
      stock_uom: 'Pieza',
      created: true,
    })
  })
})

describe('the scan door', () => {
  it('a second open settles the first with nothing', async () => {
    const first = openScan({ code: '1' })
    const second = openScan({ code: '2' })
    expect(await first).toBeNull()
    expect(scan.options).toEqual({ code: '2' })
    settleScan({ item_code: 'X' })
    expect(await second).toEqual({ item_code: 'X' })
    expect(scan.open).toBe(false)
  })
  it('the last page that claimed scans takes them until it lets go', () => {
    const a = vi.fn()
    const b = vi.fn()
    const releaseA = claimScans(a)
    const releaseB = claimScans(b)
    expect(scanClaim()).toBe(b)
    releaseB()
    expect(scanClaim()).toBe(a)
    releaseA()
    expect(scanClaim()).toBeNull()
  })
})

describe('the scan sheet', () => {
  it('a typed code opens its product in Productos', async () => {
    state.replies.resolve_scan = {
      kind: 'item',
      via: 'barcode',
      item_code: 'FUN 12',
      item_name: 'Funda roja',
    }
    const done = openScan()
    await mount(ScanSheet)
    expect($('[role="dialog"] h2').textContent).toBe('Scan a code')
    expect(text()).toContain('Its product opens.')
    type('#shell-scan-code', ' 7501031311309 ')
    submit('[data-scan-read]')
    await flush()
    expect(state.calls).toEqual([['resolve_scan', { code: '7501031311309' }]])
    expect(router.currentRoute.value.path).toBe('/productos/FUN%2012')
    expect(await done).toMatchObject({ item_code: 'FUN 12' })
    expect($('[role="dialog"]')).toBeNull()
  })

  it('a code several products carry asks which, and the pick goes to the document', async () => {
    state.replies.resolve_scan = {
      kind: 'choose',
      code: '7501',
      items: [
        { item_code: 'A', item_name: 'Funda roja', disabled: 0 },
        { item_code: 'B', item_name: 'Funda azul', disabled: 1 },
      ],
    }
    const onItem = vi.fn()
    openScan({ code: '7501', doctype: 'Purchase Order', onItem })
    await mount(ScanSheet)
    expect(state.calls).toEqual([
      ['resolve_scan', { code: '7501', ctx: { doctype: 'Purchase Order' } }],
    ])
    expect($('[role="dialog"] h2').textContent).toBe('Which product is it?')
    expect(text()).toContain('Several products carry «7501».')
    expect($('[data-scan-choose]').textContent).toContain('Disabled')
    $('[data-scan-choice="B"]').click()
    await flush()
    expect(onItem).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'item', item_code: 'B' }),
    )
    expect(router.currentRoute.value.path).toBe('/hoy')
  })

  it('a code nobody has becomes a product in the sheet, pre-filled, and goes on the document', async () => {
    state.replies.get_list = (args) =>
      args.doctype === 'UOM'
        ? [{ name: 'Pieza' }, { name: 'Caja' }]
        : [{ name: 'Bebidas' }]
    state.replies.create_item_from_scan = {
      item_code: 'AGUA-1L',
      item_name: 'Agua Ciel 1 L',
      uom: 'Pieza',
      created: true,
    }
    const onItem = vi.fn()
    openScan({
      resolved: {
        kind: 'unknown',
        code: '750100',
        prefill: {
          barcode: '750100',
          can_create: true,
          found_in: 'central',
          suggested_name: 'Agua Ciel',
          size: '1 L',
          brand: 'Ciel',
          item_group: 'Bebidas',
          stock_uom: 'Pieza',
        },
      },
      doctype: 'Purchase Order',
      onItem,
    })
    await mount(ScanSheet)
    expect($('[role="dialog"] h2').textContent).toBe('New product')
    expect($('[data-scan-alta-source]').textContent).toContain(
      'From the shared product catalog, Ciel',
    )
    expect($('input[data-label="Name"]').value).toBe('Agua Ciel 1 L')
    expect(state.calls.map(([name]) => name)).toEqual(['get_list', 'get_list'])
    type('input[data-label="Sale price"]', '25,50')
    submit('#shell-scan-alta')
    await flush()
    expect(state.calls.at(-1)).toEqual([
      'create_item_from_scan',
      {
        barcode: '750100',
        item_name: 'Agua Ciel 1 L',
        item_group: 'Bebidas',
        stock_uom: 'Pieza',
        brand: 'Ciel',
        selling_price: 25.5,
        buying_price: null,
        ctx: { doctype: 'Purchase Order' },
      },
    ])
    expect(onItem).toHaveBeenCalledWith(
      expect.objectContaining({ item_code: 'AGUA-1L', created: true }),
    )
    expect(state.toasts).toEqual(['Agua Ciel 1 L added to your catalog'])
  })

  it('without the right to create, the worker asks for the product', async () => {
    state.replies.request_item_for_barcode = { name: 'REQ-1' }
    const done = openScan({
      resolved: {
        kind: 'unknown',
        code: '750100',
        prefill: { barcode: '750100', can_create: false, product_name: 'Agua' },
      },
    })
    await mount(ScanSheet)
    expect($('[role="dialog"] h2').textContent).toBe('Not in your catalog')
    expect($('[data-scan-alta-request]').textContent).toContain(
      'Agua is not in your catalog yet.',
    )
    submit('#shell-scan-alta')
    await flush()
    expect(state.calls).toEqual([
      [
        'request_item_for_barcode',
        { barcode: '750100', note: null, source_app: 'other' },
      ],
    ])
    expect(state.toasts).toEqual(['Request sent'])
    expect(await done).toBeNull()
  })

  it('a typed name is never a new product: the sheet offers Productos search', async () => {
    state.replies.resolve_scan = {
      kind: 'unknown',
      code: 'funda roja',
      prefill: { barcode: 'funda roja', can_create: true },
    }
    const done = openScan()
    await mount(ScanSheet)
    type('#shell-scan-code', 'funda roja')
    submit('[data-scan-read]')
    await flush()
    expect($('[data-scan-alta]')).toBeNull()
    expect($('[data-scan-problem]').textContent).toContain(
      'No product has the code «funda roja».',
    )
    $('[data-scan-search]').click()
    await flush()
    expect(router.currentRoute.value.fullPath).toBe('/productos?q=funda+roja')
    expect(await done).toBeNull()
  })

  it('a page that claims scans takes the code as read, with no lookup', async () => {
    const counted = vi.fn()
    const release = claimScans(counted)
    try {
      openScan()
      await mount(ScanSheet)
      expect(text()).toContain('The code goes to this page.')
      type('#shell-scan-code', '7501')
      submit('[data-scan-read]')
      await flush()
      expect(counted).toHaveBeenCalledWith('7501')
      expect(state.calls).toEqual([])
      expect(scan.open).toBe(false)
    } finally {
      release()
    }
  })

  it('a new request over the open sheet starts from its own code', async () => {
    state.replies.resolve_scan = (args) => ({
      kind: 'item',
      via: 'code',
      item_code: args.code,
      item_name: args.code,
    })
    const first = openScan()
    await mount(ScanSheet)
    const onItem = vi.fn()
    openScan({ code: 'SKU-9', onItem })
    await flush()
    expect(await first).toBeNull()
    expect(state.calls).toEqual([['resolve_scan', { code: 'SKU-9' }]])
    expect(onItem).toHaveBeenCalledWith(
      expect.objectContaining({ item_code: 'SKU-9' }),
    )
  })

  it('closing the sheet settles the scan with nothing', async () => {
    const done = openScan()
    await mount(ScanSheet)
    $('[data-sheet-close]').click()
    expect(await done).toBeNull()
    expect(scan.open).toBe(false)
  })
})

describe("a document's items take a scanned code", () => {
  const editor = async (doctype = 'Purchase Order') => {
    const rows = []
    await mount(ItemsEditor, {
      modelValue: [],
      doctype,
      'onUpdate:modelValue': (list) => rows.push(list),
    })
    return rows
  }
  const enter = async (value) => {
    type('[data-testid="documentos-item-search"]', value)
    $('[data-testid="documentos-item-search"]').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    )
    await flush()
  }

  it('a code its product carries goes on as a line, in one call', async () => {
    state.replies.resolve_scan = {
      kind: 'item',
      via: 'barcode',
      item_code: 'FUN-12',
      item_name: 'Funda roja',
    }
    const rows = await editor()
    await enter('7501031311309')
    expect(state.calls[0]).toEqual([
      'resolve_scan',
      { code: '7501031311309', ctx: { doctype: 'Purchase Order' } },
    ])
    expect(rows.at(-1)).toEqual([
      expect.objectContaining({ item_code: 'FUN-12', qty: 1 }),
    ])
    expect(text()).toContain('Agregado: Funda roja')
  })

  it('a code nobody has opens the scan sheet for this document', async () => {
    state.replies.resolve_scan = {
      kind: 'unknown',
      code: '750100',
      prefill: { barcode: '750100', can_create: true },
    }
    state.replies.search_link = []
    await editor()
    await enter('750100')
    expect(scan.open).toBe(true)
    expect(scan.options.doctype).toBe('Purchase Order')
    expect(scan.options.resolved).toMatchObject({ kind: 'unknown' })
    expect(typeof scan.options.onItem).toBe('function')
  })

  it('a model lists its variants instead of going on a line', async () => {
    state.replies.resolve_scan = {
      kind: 'item',
      via: 'code',
      item_code: 'FUNDA',
      item_name: 'Funda',
      has_variants: 1,
    }
    state.replies.search_link = [
      { value: 'FUNDA-R', description: 'Funda roja' },
      { value: 'FUNDA-A', description: 'Funda azul' },
    ]
    const rows = await editor()
    await enter('FUNDA-01')
    expect(rows).toEqual([])
    expect(text()).toContain('Funda es un modelo: elige su variante.')
    expect(text()).toContain('Funda roja')
    expect(state.calls.at(-1)[1]).toMatchObject({
      doctype: 'Item',
      txt: 'Funda',
    })
  })
})
