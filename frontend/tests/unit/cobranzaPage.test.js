// Cobranza as a power app, mounted with the real pages: the keyboard works the
// list and the record, the URL keeps filters and focus (back lands on the same
// row), live changes reload quietly, a visit back restores the loaded rows, the
// phone gets its own app bar and action bar, and every save offers «Deshacer».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

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
    name: 'Cobranza',
    params: {},
    query: {},
    fullPath: '/cobranza',
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
// Each sheet: a marker with what it was opened for.
function sheet(name) {
  return {
    default: {
      props: ['modelValue', 'invoice', 'rows', 'customer', 'focus'],
      setup: (props) => () =>
        props.modelValue
          ? h('div', {
              'data-sheet': name,
              'data-invoice':
                typeof props.invoice === 'string'
                  ? props.invoice
                  : props.invoice?.name || '',
              'data-rows': props.rows?.length ?? '',
              'data-customer': props.customer || '',
              'data-focus': props.focus || '',
            })
          : null,
    },
  }
}
vi.mock('@/components/cobranza/CobranzaSendSheet.vue', () => sheet('send'))
vi.mock('@/components/cobranza/AutoSetupSheet.vue', () => sheet('setup'))
vi.mock('@/components/cobranza/PromiseSheet.vue', () => sheet('promise'))
vi.mock('@/components/cobranza/CallSheet.vue', () => sheet('call'))
vi.mock('@/components/cobranza/PaymentSheet.vue', () => sheet('payment'))
vi.mock('@/components/cobranza/FollowupSheet.vue', () => sheet('followup'))
vi.mock('@/components/cobranza/BulkRemindSheet.vue', () => sheet('bulk'))
const CAPS = {
  read: true,
  remind: true,
  promise: true,
  call: true,
  collect: false,
  pay: true,
  assign: true,
}
vi.mock('@/composables/useCobranza', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    cobranzaApi: (...args) => state.api(...args),
    loadCobranzaBoot: async () =>
      (actual.cobranzaBoot.value = {
        enabled: true,
        companies: ['Tienda'],
        capabilities: {
          read: true,
          remind: true,
          promise: true,
          call: true,
          collect: false,
          pay: true,
          assign: true,
        },
      }),
  }
})

import { ACTIONS, listMemoryKey } from '@/composables/useCobranza'
import { useCobranzaUndo } from '@/composables/useCobranzaActions'
import { pageShortcuts } from '@/composables/shellKeyboard'
import Cobranza from '@/pages/Cobranza.vue'
import CobranzaCliente from '@/pages/CobranzaCliente.vue'

const row = (customer, extra = {}) => ({
  customer,
  customer_name: `${customer} S.A.`,
  company: 'Tienda',
  currency: 'MXN',
  outstanding: 1000,
  overdue_amount: 1000,
  company_currency: 'MXN',
  base_outstanding: 1000,
  base_overdue_amount: 1000,
  invoices: 1,
  overdue_invoices: 1,
  oldest_overdue_days: 40,
  aging: '31-60',
  target: {
    invoice: `SINV-${customer}`,
    currency: 'MXN',
    outstanding: 1000,
    overdue_days: 40,
  },
  promise: null,
  followup: null,
  last_reminder: null,
  auto: null,
  ...extra,
})
const QUEUE = {
  segment: 'vencidas',
  rows: [row('Laura'), row('Importadora')],
  has_more: false,
  counts: { vencidas: 2, hoy: 0, promesas: 0, mios: 0, todas: 2 },
  aging_counts: { '0-30': 0, '31-60': 2, '61-90': 0, '90+': 0 },
  capped: false,
  stats: {
    currency: 'MXN',
    outstanding: 3000,
    overdue: 2000,
    collected_today: 0,
    totals: [
      {
        currency: 'MXN',
        outstanding: 3000,
        overdue: 2000,
        collected_today: 0,
        foreign: [],
      },
    ],
  },
  today: '2026-10-14',
}
const invoice = (name, extra = {}) => ({
  name,
  posting_date: '2026-09-01',
  due_date: '2026-09-10',
  currency: 'MXN',
  total: 1000,
  outstanding: 1000,
  overdue_amount: 1000,
  base_outstanding: 1000,
  base_overdue_amount: 1000,
  overdue_days: 34,
  next_due: null,
  schedule: [],
  due_level: 3,
  due_label: 'Aviso final',
  current_dunning: 'DUNN-1',
  promise: null,
  ...extra,
})
const RECORD = {
  customer: 'Laura',
  customer_name: 'Laura S.A.',
  company: 'Tienda',
  companies: ['Tienda'],
  currency: 'MXN',
  outstanding: 1500,
  overdue_amount: 1500,
  company_currency: 'MXN',
  base_outstanding: 1500,
  base_overdue_amount: 1500,
  credit: { limit: null, store_credit: null },
  invoices: [invoice('SINV-1'), invoice('SINV-2', { outstanding: 500 })],
  timeline: [],
  phones: [],
  suppressed: null,
  followup: null,
  ladder_ready: true,
  capabilities: CAPS,
  today: '2026-10-14',
}

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
  state.api.mock.calls
    .filter(([m]) => m.endsWith(method))
    .map(([, args]) => args)

let app, root
function mount(component, props = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(component, reactive({ ...props })) })
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
  state.api.mockReset()
  state.router.push.mockReset()
  state.router.replace.mockClear()
  state.route.name = 'Cobranza'
  state.route.query = {}
  state.mobile.value = false
  state.toast.success.mockReset()
  sessionStorage.clear()
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
})

describe('Cobranza list as a power app', () => {
  beforeEach(() => {
    state.api.mockImplementation(async (method) =>
      method.endsWith('get_queue') ? QUEUE : null,
    )
  })

  it('j/k move a focus the URL keeps; Enter opens it with a return to the same row', async () => {
    mount(Cobranza)
    await flush()
    press('j')
    expect(state.route.query).toEqual({ cliente: 'Laura' })
    press('j')
    await flush()
    expect(state.route.query).toEqual({ cliente: 'Importadora' })
    const focused = root.querySelector(
      '[data-row-key="Importadora:Tienda:MXN"]',
    )
    expect(focused.getAttribute('aria-selected')).toBe('false')
    expect(focused.className).toContain('inset_3px')
    press('Enter')
    expect(state.router.push).toHaveBeenCalledWith({
      name: 'CobranzaCliente',
      params: { customer: 'Importadora' },
      query: { company: 'Tienda', list: '/cobranza?cliente=Importadora' },
    })
  })

  it('x selects, r sends the selection, Esc clears it; a sheet or a field keeps its keys', async () => {
    mount(Cobranza)
    await flush()
    press('j')
    press('x')
    await flush()
    expect(root.querySelector('[data-cobranza-bulkbar]')).toBeTruthy()
    expect(
      root
        .querySelector('[data-row-key="Laura:Tienda:MXN"]')
        .getAttribute('aria-selected'),
    ).toBe('true')
    press('r')
    await flush()
    expect(root.querySelector('[data-sheet="bulk"]').dataset.rows).toBe('1')
    // A sheet is open (role=dialog in the real page): the list keys wait.
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    press('j')
    expect(state.route.query).toEqual({ cliente: 'Laura' })
    dialog.remove()
    press('Escape')
    await flush()
    expect(root.querySelector('[data-cobranza-bulkbar]')).toBeNull()
    const input = document.createElement('input')
    document.body.appendChild(input)
    press('j', {}, input)
    expect(state.route.query).toEqual({ cliente: 'Laura' })
    input.remove()
  })

  it('p, l, $ and s open their sheet on the focused customer’s target invoice', async () => {
    mount(Cobranza)
    await flush()
    press('j')
    press('p')
    await flush()
    expect(root.querySelector('[data-sheet="promise"]').dataset.invoice).toBe(
      'SINV-Laura',
    )
    press('l')
    await flush()
    expect(root.querySelector('[data-sheet="call"]').dataset.invoice).toBe(
      'SINV-Laura',
    )
    press('$', { shiftKey: true })
    await flush()
    expect(root.querySelector('[data-sheet="payment"]').dataset.customer).toBe(
      'Laura',
    )
    press('s')
    await flush()
    expect(root.querySelector('[data-sheet="followup"]').dataset.focus).toBe(
      'followup',
    )
  })

  it('aging chips push a history entry; the list reloads from the URL', async () => {
    mount(Cobranza)
    await flush()
    const chip = [
      ...root.querySelectorAll('[data-cobranza-aging] button'),
    ].find((b) => b.textContent.includes('31–60'))
    expect(chip.textContent).toContain('2')
    chip.click()
    expect(state.router.push).toHaveBeenCalledWith({ query: { edad: '31-60' } })
    state.route.query = { edad: '31-60' }
    await flush()
    expect(calls('get_queue').at(-1)).toMatchObject({
      aging: '31-60',
      start: 0,
    })
  })

  it('reloads quietly on a live change, and a visit back restores the loaded rows', async () => {
    sessionStorage.setItem(
      listMemoryKey({}),
      JSON.stringify({ top: 0, count: 60 }),
    )
    mount(Cobranza)
    await flush()
    expect(calls('get_queue')[0]).toMatchObject({ page_length: 60 })
    const live = state.hub.watches.at(-1)
    expect(live.doctypes).toEqual([
      'Sales Invoice',
      'Payment Entry',
      'Dunning',
      'ToDo',
      'Comment',
    ])
    expect(live.options.minIntervalMs).toBeGreaterThanOrEqual(5000)
    press('j')
    live.refetch({ names: ['SINV-1'], full: false, reason: 'change' })
    await flush()
    expect(calls('get_queue')).toHaveLength(2)
    expect(state.route.query).toEqual({ cliente: 'Laura' })
    expect(
      root.querySelector('[data-row-key="Laura:Tienda:MXN"]').className,
    ).toContain('inset_3px')
  })

  it('lists its keys in the Alt+H sheet', async () => {
    mount(Cobranza)
    await flush()
    expect(pageShortcuts.value.contexts).toContain('list')
    expect(pageShortcuts.value.extra.map((s) => s.id)).toEqual(
      expect.arrayContaining([
        'cobranza.remind',
        'cobranza.promise',
        'cobranza.call',
        'cobranza.pay',
        'cobranza.assign',
        'cobranza.followup',
      ]),
    )
  })

  it('a phone gets its own app bar and what is owed in sight', async () => {
    state.mobile.value = true
    mount(Cobranza)
    await flush()
    expect(root.querySelector('[data-cobranza-appbar]').textContent).toContain(
      'Overdue',
    )
    const summary = root.querySelector('[data-cobranza-summary]').textContent
    expect(summary).toContain('Not due yet')
    expect(root.querySelector('dl')).toBeNull()
  })
})

describe('Cobranza record as a power app', () => {
  beforeEach(() => {
    state.route.name = 'CobranzaCliente'
    state.route.query = { company: 'Tienda', list: '/cobranza?segment=todas' }
    state.api.mockImplementation(async (method) => {
      if (method.endsWith('get_customer')) return RECORD
      if (method.endsWith('get_queue'))
        return { ...QUEUE, rows: [row('Laura'), row('Siguiente')] }
      return null
    })
  })

  it('j moves the focused invoice (in the URL); p promises on it', async () => {
    mount(CobranzaCliente, { customer: 'Laura' })
    await flush()
    press('j')
    await flush()
    expect(state.route.query.factura).toBe('SINV-2')
    press('p')
    await flush()
    expect(root.querySelector('[data-sheet="promise"]').dataset.invoice).toBe(
      'SINV-2',
    )
  })

  it('an action handed over by the list opens on its invoice and leaves the URL', async () => {
    state.route.query = {
      company: 'Tienda',
      factura: 'SINV-2',
      accion: 'pagar',
    }
    mount(CobranzaCliente, { customer: 'Laura' })
    await flush()
    expect(root.querySelector('[data-sheet="payment"]').dataset.invoice).toBe(
      'SINV-2',
    )
    expect(state.route.query).toEqual({ company: 'Tienda', factura: 'SINV-2' })
  })

  it('n opens the next customer and going back lands on them', async () => {
    mount(CobranzaCliente, { customer: 'Laura' })
    await flush()
    press('n')
    await flush()
    expect(calls('get_queue')[0]).toMatchObject({ segment: 'todas' })
    expect(state.router.push).toHaveBeenCalledWith({
      name: 'CobranzaCliente',
      params: { customer: 'Siguiente' },
      query: {
        company: 'Tienda',
        list: '/cobranza?segment=todas&cliente=Siguiente',
      },
    })
  })

  it('a phone gets the focused invoice’s actions at the thumb', async () => {
    state.mobile.value = true
    mount(CobranzaCliente, { customer: 'Laura' })
    await flush()
    const bar = root.querySelector('[data-cobranza-actionbar]')
    expect(bar.textContent).toContain('SINV-1')
    const buttons = [...bar.querySelectorAll('button')]
    expect(buttons.length).toBe(4)
    expect(buttons[0].className).toContain('bg-surface-gray-9')
  })
})

describe('Cobranza «Deshacer»', () => {
  it('a saved promise offers its undo; undo asks the server and reloads', async () => {
    const reload = vi.fn()
    state.api.mockResolvedValue({ todo: 'TODO-1', restored: [] })
    const undo = useCobranzaUndo({ reload })
    undo.promiseSaved({ todo: 'TODO-1', invoice: 'SINV-1' })
    const [message, options] = state.toast.success.mock.calls.at(-1)
    expect(message).toBe('Promise saved')
    expect(options.action.label).toBe('Undo')
    await options.action.onClick()
    await flush()
    const [method, args] = state.api.mock.calls.at(-1)
    expect(method).toBe(`${ACTIONS}.undo_promise`)
    expect(args).toMatchObject({ todo: 'TODO-1' })
    expect(args.request_id).toBeTruthy()
    expect(reload).toHaveBeenCalled()
  })

  it('a payment the worker may not cancel is never offered an undo', () => {
    const undo = useCobranzaUndo({ reload: vi.fn() })
    undo.paymentSaved({ payment_entry: 'PE-1', can_cancel: false })
    expect(state.toast.success.mock.calls.at(-1)).toEqual([
      'Payment PE-1 registered',
    ])
  })

  it('a follow-up undo puts back the previous collector and day', async () => {
    state.api.mockResolvedValue({})
    const undo = useCobranzaUndo({ reload: vi.fn() })
    undo.followupSaved(
      {
        customer: 'Laura',
        previous: { collector: 'ana@x', date: '2026-10-01' },
      },
      'Follow-up saved: Yo',
    )
    await state.toast.success.mock.calls.at(-1)[1].action.onClick()
    const [method, args] = state.api.mock.calls.at(-1)
    expect(method).toBe(`${ACTIONS}.set_followup`)
    expect(args).toMatchObject({
      customer: 'Laura',
      collector: 'ana@x',
      date: '2026-10-01',
      undo: 1,
    })
  })
})
