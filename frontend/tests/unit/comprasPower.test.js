// Compras as a power app, mounted with the real page: the URL keeps list and
// focus, the keyboard starts each step of the chain from the list (confirm →
// receive in Escáner → register the supplier's bill) and says what comes first
// when a step is early, several prepared purchases are confirmed in one go,
// a bill registered in Gastos comes back to the same row, live changes reload
// quietly, and a phone gets its own app bar with the queues in sight.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({
  api: vi.fn(),
  route: null,
  router: null,
  mobile: null,
  hub: null,
  toast: null,
}))
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  state.route = reactive({
    name: 'Compras',
    params: {},
    query: {},
    fullPath: '/compras',
  })
  state.router = {
    push: vi.fn(),
    replace: vi.fn(({ query }) => {
      state.route.query = { ...query }
    }),
    back: vi.fn(),
  }
  return { useRoute: () => state.route, useRouter: () => state.router }
})
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  state.mobile = ref(false)
  return { isMobile: state.mobile }
})
vi.mock('@/composables/useHoy', () => ({
  hoyLive: () => {
    state.hub = {
      watches: [],
      watch(doctypes, refetch, options) {
        this.watches.push({ doctypes, refetch, options })
        return () => {}
      },
    }
    return state.hub
  },
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  const labelled = (tag) => ({
    props: ['label', 'theme', 'variant', 'loading', 'disabled'],
    setup: (props) => () => h(tag, props.label),
  })
  state.toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return {
    Badge: labelled('span'),
    Button: labelled('button'),
    BottomSheet: { render: () => null },
    Dialog: { render: () => null },
    FeatherIcon: { render: () => null },
    FormControl: { render: () => null },
    toast: state.toast,
  }
})
vi.mock('@/components/shell/ModuleLayout.vue', () => ({
  default: {
    setup:
      (_p, { slots }) =>
      () =>
        h('div', slots.default?.()),
  },
}))
function sheet(name) {
  return {
    default: {
      props: ['modelValue', 'name', 'rows', 'action'],
      setup: (props) => () =>
        props.modelValue
          ? h('div', {
              'data-sheet': name,
              'data-name': props.name || '',
              'data-rows': props.rows?.length ?? '',
              'data-action': props.action || '',
            })
          : null,
    },
  }
}
vi.mock('@/components/compras/BulkConfirmSheet.vue', () => sheet('bulk'))
vi.mock('@/components/compras/HandoffDialog.vue', () => sheet('handoff'))
vi.mock('@/composables/useCompras', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    comprasApi: (...args) => state.api(...args),
    loadComprasBoot: async () =>
      (actual.comprasBoot.value = {
        enabled: true,
        user: 'compras@example.test',
        today: '2026-10-14',
        capabilities: {
          orders: true,
          requests: true,
          create: true,
          confirm: true,
          receive: true,
        },
        scanner: { ready: true },
      }),
  }
})

import {
  QUEUE_KEYS,
  RECORD_KEYS,
  bulkConfirmPlan,
  listMemoryKey,
  queueShortcuts,
  recordShortcuts,
  rowStep,
  scannerReceiptUrl,
} from '@/composables/useCompras'
import { pageShortcuts } from '@/composables/shellKeyboard'
import { KEYMAP, RESERVED_COMBOS } from '@/vendor/muelle-shell/contracts'
import Compras from '@/pages/Compras.vue'

const order = (name, extra = {}) => ({
  doctype: 'Purchase Order',
  kind: 'orden',
  name,
  title: name,
  party: `Proveedor ${name}`,
  company: 'Tienda',
  currency: 'MXN',
  grand_total: 500,
  docstatus: 1,
  status: 'To Receive and Bill',
  per_received: 0,
  per_billed: 0,
  modified: '2026-10-01 10:00:00',
  due_date: '2026-10-20',
  ...extra,
})
const request = (name) => ({
  doctype: 'Material Request',
  kind: 'solicitud',
  name,
  title: name,
  party: null,
  docstatus: 1,
  modified: '2026-10-01 09:00:00',
})
let QUEUE
const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const press = (key, extra = {}, target = window) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...extra,
    }),
  )
const calls = (method) =>
  state.api.mock.calls.filter(([m]) => m === method).map(([, args]) => args)

let app, root, assign
function mount() {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(Compras) })
  app.config.globalProperties.__ = globalThis.__
  app.component('RouterLink', {
    setup:
      (_p, { slots }) =>
      () =>
        h('a', slots.default?.()),
  })
  app.mount(root)
}
beforeEach(() => {
  QUEUE = {
    rows: [
      order('PO-1', { docstatus: 0, status: 'Draft' }),
      order('PO-2', { per_received: 100, status: 'To Bill' }),
      order('PO-3'),
      request('MR-1'),
    ],
    has_more: false,
    counts: {
      'por-comprar': 2,
      'por-recibir': 1,
      'por-facturar': 1,
      capped: false,
    },
  }
  state.api.mockReset()
  state.api.mockImplementation(async (method, args) => {
    if (method === 'queue') return QUEUE
    if (method === 'start_receipt') return { receipt: 'PR-9', order: args.name }
    if (method === 'start_bill')
      return { bill: 'PINV-7', order: args.name, reused: false }
    return null
  })
  state.router.push.mockReset()
  state.router.replace.mockClear()
  state.route.name = 'Compras'
  state.route.query = {}
  state.mobile.value = false
  state.toast.success.mockReset()
  state.toast.error.mockReset()
  sessionStorage.clear()
  assign = vi.fn()
  vi.stubGlobal('location', { ...window.location, assign })
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.unstubAllGlobals()
})

describe('Compras list as a power app', () => {
  it('j/k move a focus the URL keeps; Enter opens the purchase with a return to the same row', async () => {
    mount()
    await flush()
    press('j')
    press('j')
    await flush()
    expect(state.route.query).toEqual({ foco: 'PO-2' })
    expect(
      root.querySelector('[data-row-key="Purchase Order:PO-2"]').className,
    ).toContain('bg-surface-gray-2')
    press('Enter')
    await flush()
    expect(state.router.push).toHaveBeenCalledWith({
      name: 'CompraOrden',
      params: { name: 'PO-2' },
      query: { list: '/compras?foco=PO-2' },
    })
  })

  it('r receives the focused order in Escáner, with the way back to the order and this row', async () => {
    state.route.query = { segment: 'por-recibir', foco: 'PO-3' }
    mount()
    await flush()
    press('r')
    await flush()
    expect(calls('start_receipt')[0]).toMatchObject({ name: 'PO-3' })
    const url = new URL(assign.mock.calls[0][0], 'https://x.test')
    expect(url.pathname).toBe('/scan/docs/PR/PR-9')
    const back = new URL(url.searchParams.get('return_to'), 'https://x.test')
    expect(back.pathname).toBe('/crm/compras/orden/PO-3')
    expect(back.searchParams.get('list')).toBe(
      '/compras?segment=por-recibir&foco=PO-3',
    )
  })

  it('f registers the bill of what arrived in Gastos; back lands on the same row', async () => {
    state.route.query = { segment: 'por-facturar', foco: 'PO-2' }
    mount()
    await flush()
    press('f')
    await flush()
    expect(calls('start_bill')[0]).toMatchObject({ name: 'PO-2' })
    expect(state.router.push).toHaveBeenCalledWith({
      name: 'GastoFactura',
      params: { name: 'PINV-7' },
      query: {
        return_to: '/crm/compras?segment=por-facturar&foco=PO-2',
        return_label: 'Compras',
      },
    })
  })

  it('a step taken too early says what comes first and offers it', async () => {
    state.route.query = { foco: 'PO-3' }
    mount()
    await flush()
    press('f')
    await flush()
    expect(calls('start_bill')).toHaveLength(0)
    expect(state.toast.error).toHaveBeenCalledWith(
      'Nothing has arrived yet. Receive it in Escáner first.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Receive in Escáner' }),
      }),
    )
    // A request is prepared as a purchase first: the reason and «Open purchase».
    state.route.query = { foco: 'MR-1' }
    await flush()
    press('r')
    expect(state.toast.error).toHaveBeenLastCalledWith(
      'A purchase request becomes a purchase first. Open it to prepare one.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Open purchase' }),
      }),
    )
  })

  it('o opens the order’s own review; with a selection, o confirms them in one go', async () => {
    state.route.query = { foco: 'PO-1' }
    mount()
    await flush()
    press('o')
    await flush()
    expect(state.router.push).toHaveBeenCalledWith({
      name: 'CompraOrden',
      params: { name: 'PO-1' },
      query: { list: '/compras?foco=PO-1', accion: 'confirmar' },
    })
    press('x')
    press('j')
    press('x')
    await flush()
    expect(root.querySelector('[data-power-bulkbar]')).toBeTruthy()
    press('o')
    await flush()
    expect(root.querySelector('[data-sheet="bulk"]').dataset.rows).toBe('2')
  })

  it('back from Gastos says the bill is registered, and the URL forgets it', async () => {
    state.route.query = {
      segment: 'por-facturar',
      foco: 'PO-2',
      done: 'Purchase Invoice:PINV-7',
    }
    mount()
    await flush()
    expect(root.textContent).toContain('Bill PINV-7 registered')
    expect(state.route.query).toEqual({ segment: 'por-facturar', foco: 'PO-2' })
    expect(
      root.querySelector('[data-row-key="Purchase Order:PO-2"]').className,
    ).toContain('bg-surface-gray-2')
  })

  it('reloads quietly on a live change, and a visit back restores the loaded rows', async () => {
    sessionStorage.setItem(
      listMemoryKey({}),
      JSON.stringify({ top: 0, count: 45 }),
    )
    mount()
    await flush()
    expect(calls('queue')[0]).toMatchObject({ page_length: 45 })
    const live = state.hub.watches.at(-1)
    expect(live.doctypes).toEqual([
      'Purchase Order',
      'Material Request',
      'Purchase Receipt',
      'Purchase Invoice',
    ])
    expect(live.options.minIntervalMs).toBeGreaterThanOrEqual(5000)
    live.refetch({ full: true, reason: 'change' })
    await flush()
    expect(calls('queue')).toHaveLength(2)
  })

  it('lists its keys in the Alt+H sheet; a phone gets its app bar with the queues in sight', async () => {
    state.mobile.value = true
    mount()
    await flush()
    expect(pageShortcuts.value.extra.map((s) => s.id)).toEqual(
      expect.arrayContaining([
        'compras.confirm',
        'compras.receive',
        'compras.bill',
      ]),
    )
    expect(root.querySelector('[data-power-appbar]').textContent).toContain(
      'To buy',
    )
    const summary = root.querySelector('[data-power-summary]').textContent
    expect(summary).toContain('To receive')
    expect(summary).toContain('To bill')
  })
})

describe('Compras chain, pure parts', () => {
  it('says what each step needs first', () => {
    const caps = { confirm: true, receive: true }
    expect(
      rowStep(order('A', { docstatus: 0 }), 'confirm', { caps }).kind,
    ).toBe('go')
    expect(rowStep(order('A'), 'confirm', { caps }).kind).toBe('done')
    expect(
      rowStep(order('A', { docstatus: 0 }), 'receive', { caps }).kind,
    ).toBe('confirm')
    expect(rowStep(order('A'), 'receive', { caps }).kind).toBe('go')
    expect(
      rowStep(order('A'), 'receive', {
        caps,
        scanner: { ready: false, reason: 'El Escáner está desactivado.' },
      }),
    ).toMatchObject({ kind: 'handoff', text: 'El Escáner está desactivado.' })
    expect(rowStep(order('A'), 'receive', { caps: {} }).kind).toBe('handoff')
    expect(rowStep(order('A'), 'bill', { caps }).kind).toBe('receive')
    expect(
      rowStep(order('A', { per_received: 40 }), 'bill', { caps }).kind,
    ).toBe('go')
    expect(
      rowStep(order('A', { per_received: 100, per_billed: 100 }), 'bill', {
        caps,
      }).kind,
    ).toBe('bills')
    expect(rowStep(request('MR'), 'bill', { caps }).kind).toBe('open')
  })

  it('confirms only prepared purchases and says why the rest are left out', () => {
    const plan = bulkConfirmPlan([
      order('A', { docstatus: 0 }),
      order('B'),
      request('MR'),
    ])
    expect(plan.ready.map((r) => r.name)).toEqual(['A'])
    expect(plan.skipped.map((s) => s.row.name)).toEqual(['B', 'MR'])
  })

  it('Escáner returns to the order and the queue it came from', () => {
    const url = new URL(
      scannerReceiptUrl('PR 1', 'PO/1', '/compras?segment=por-recibir'),
      'https://x.test',
    )
    expect(url.pathname).toBe('/scan/docs/PR/PR%201')
    expect(url.searchParams.get('return_to')).toBe(
      '/crm/compras/orden/PO%2F1?list=%2Fcompras%3Fsegment%3Dpor-recibir',
    )
    // A list from elsewhere is never carried.
    expect(
      new URL(
        scannerReceiptUrl('PR', 'PO', '//evil'),
        'https://x.test',
      ).searchParams.get('return_to'),
    ).toBe('/crm/compras/orden/PO')
  })

  it('never claims a reserved combo or a global key', () => {
    const globalKeys = new Set(
      KEYMAP.filter((s) => s.context === 'global').flatMap((s) => s.keys),
    )
    const listKeys = new Set(
      KEYMAP.filter((s) => s.context === 'list').flatMap((s) => s.keys),
    )
    const all = { confirm: true, receive: true }
    const own = [...queueShortcuts(all), ...recordShortcuts(all)]
      .filter((s) => s.id !== 'compras.back')
      .flatMap((s) => s.keys)
    for (const combo of own) {
      expect(RESERVED_COMBOS).not.toContain(combo)
      expect(globalKeys.has(combo)).toBe(false)
      expect(listKeys.has(combo)).toBe(false)
      expect(combo.startsWith('g')).toBe(false)
    }
    for (const s of queueShortcuts(all))
      for (const combo of s.keys) expect(QUEUE_KEYS[combo]).toBeTruthy()
    for (const s of recordShortcuts(all))
      for (const combo of s.keys) expect(RECORD_KEYS[combo]).toBeTruthy()
  })
})
