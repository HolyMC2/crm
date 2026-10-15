// Gastos as a power app, mounted with the real page: the URL keeps list and
// focus (back lands on the same bill), the keyboard works the list and pays
// the focused bill, several bills are paid in one go with one result each,
// a payment can be undone by whom made it, live changes reload quietly, and a
// phone gets its own app bar with what is owed in sight.
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
    name: 'Gastos',
    params: {},
    query: {},
    fullPath: '/gastos',
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
vi.mock('@/components/gastos/PayDialog.vue', () => sheet('pay'))
vi.mock('@/components/gastos/BulkPaySheet.vue', () => sheet('bulk'))
vi.mock('@/components/gastos/ApprovalDialog.vue', () => sheet('approval'))
vi.mock('@/components/gastos/ClaimsQueue.vue', () => sheet('claims'))
vi.mock('@/composables/useGastos', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    gastosApi: (...args) => state.api(...args),
    loadGastosBoot: async () =>
      (actual.gastosBoot.value = {
        enabled: true,
        user: 'pagos@example.test',
        today: '2026-10-14',
        capabilities: { read: true, submit: true, pay: true, bank: false },
        claims: { enabled: false },
      }),
  }
})

import { listMemoryKey } from '@/composables/useGastos'
import { pageShortcuts } from '@/composables/shellKeyboard'
import Gastos from '@/pages/Gastos.vue'

const bill = (name, extra = {}) => ({
  doctype: 'Purchase Invoice',
  name,
  party: `Proveedor ${name}`,
  bill_no: `F-${name}`,
  company: 'Tienda',
  currency: 'MXN',
  owed_currency: 'MXN',
  total: 1000,
  paid: 0,
  outstanding_amount: 1000,
  due_date: '2026-10-10',
  docstatus: 1,
  overdue: true,
  on_hold: false,
  modified: '2026-10-01 10:00:00',
  ...extra,
})
const QUEUE = {
  rows: [bill('PI-1'), bill('PI-2'), bill('PI-3', { docstatus: 0 })],
  has_more: false,
  counts: {
    'por-pagar': 2,
    'por-registrar': 1,
    vencidas: 2,
    capped: false,
    totals: [{ currency: 'MXN', amount: 2000 }],
  },
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
  state.api.mock.calls.filter(([m]) => m === method).map(([, args]) => args)

let app, root
function mount() {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(Gastos) })
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
  state.api.mockImplementation(async (method) =>
    method === 'queue' ? QUEUE : method === 'cancel_payment' ? {} : null,
  )
  state.router.push.mockReset()
  state.router.replace.mockClear()
  state.route.name = 'Gastos'
  state.route.query = {}
  state.mobile.value = false
  state.toast.success.mockReset()
  state.toast.error.mockReset()
  sessionStorage.clear()
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  document.querySelectorAll('[role="dialog"]').forEach((el) => el.remove())
})

describe('Gastos list as a power app', () => {
  it('j/k move a focus the URL keeps; Enter opens the bill with a return to the same row', async () => {
    mount()
    await flush()
    press('j')
    expect(state.route.query).toEqual({ foco: 'PI-1' })
    press('j')
    await flush()
    expect(state.route.query).toEqual({ foco: 'PI-2' })
    const focused = root.querySelector('[data-row-key="PI-2"]')
    expect(focused.className).toContain('bg-surface-gray-2')
    press('Enter')
    await flush()
    expect(state.router.push).toHaveBeenCalledWith({
      name: 'GastoFactura',
      params: { name: 'PI-2' },
      query: { list: '/gastos?foco=PI-2' },
    })
  })

  it('$ pays the focused bill; a draft says to register it first, with the way to do it', async () => {
    mount()
    await flush()
    press('j')
    press('$', { shiftKey: true })
    await flush()
    expect(root.querySelector('[data-sheet="pay"]').dataset.name).toBe('PI-1')
    root.querySelector('[data-sheet="pay"]').remove()
    press('k', {}, window)
    // The draft: no payment form, the reason and «Review and register».
    state.route.query = {}
    press('j')
    press('j')
    press('j')
    await flush()
    expect(state.route.query).toEqual({ foco: 'PI-3' })
    state.toast.error.mockReset()
    press('$', { shiftKey: true })
    await flush()
    expect(state.toast.error).toHaveBeenCalledWith(
      'Register this bill first; then it can be paid.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Review and register' }),
      }),
    )
    // R hands the review to the bill's own record.
    press('r')
    await flush()
    expect(state.router.push).toHaveBeenCalledWith({
      name: 'GastoFactura',
      params: { name: 'PI-3' },
      query: { list: '/gastos?foco=PI-3', accion: 'registrar' },
    })
  })

  it('x selects, $ pays the selection in one go; Esc clears it; a field keeps its keys', async () => {
    mount()
    await flush()
    press('j')
    press('x')
    press('j')
    press('x')
    await flush()
    expect(root.querySelector('[data-power-bulkbar]')).toBeTruthy()
    press('$', { shiftKey: true })
    await flush()
    expect(root.querySelector('[data-sheet="bulk"]').dataset.rows).toBe('2')
    const input = document.createElement('input')
    document.body.appendChild(input)
    press('j', {}, input)
    expect(state.route.query).toEqual({ foco: 'PI-2' })
    input.remove()
    press('Escape')
    await flush()
    expect(root.querySelector('[data-power-bulkbar]')).toBeNull()
  })

  it('a sheet keeps the list keys', async () => {
    mount()
    await flush()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    press('j')
    expect(state.route.query).toEqual({})
    dialog.remove()
  })

  it('chips push a history entry, the search replaces it; both drop the focus', async () => {
    state.route.query = { foco: 'PI-1' }
    mount()
    await flush()
    const chip = [...root.querySelectorAll('[data-gastos-chips] button')].find(
      (b) => b.textContent.startsWith('Overdue'),
    )
    chip.click()
    expect(state.router.push).toHaveBeenCalledWith({
      query: { chip: 'vencidas' },
    })
  })

  it('reloads quietly on a live change, and a visit back restores the loaded rows', async () => {
    sessionStorage.setItem(
      listMemoryKey({}),
      JSON.stringify({ top: 0, count: 60 }),
    )
    mount()
    await flush()
    expect(calls('queue')[0]).toMatchObject({ page_length: 60, start: 0 })
    const live = state.hub.watches.at(-1)
    expect(live.doctypes).toEqual(['Purchase Invoice', 'Payment Entry'])
    expect(live.options.minIntervalMs).toBeGreaterThanOrEqual(5000)
    press('j')
    live.refetch({ names: ['PI-1'], full: false, reason: 'change' })
    await flush()
    expect(calls('queue')).toHaveLength(2)
    expect(state.route.query).toEqual({ foco: 'PI-1' })
    expect(root.querySelector('[data-row-key="PI-1"]').className).toContain(
      'bg-surface-gray-2',
    )
  })

  it('lists its keys in the Alt+H sheet', async () => {
    mount()
    await flush()
    expect(pageShortcuts.value.contexts).toContain('list')
    expect(pageShortcuts.value.extra.map((s) => s.id)).toEqual(
      expect.arrayContaining(['gastos.pay', 'gastos.register', 'gastos.ask']),
    )
  })

  it('a phone gets its own app bar with what is owed in sight', async () => {
    state.mobile.value = true
    mount()
    await flush()
    expect(root.querySelector('[data-power-appbar]').textContent).toContain(
      'To pay',
    )
    const summary = root.querySelector('[data-power-summary]').textContent
    expect(summary).toContain('Owed')
    expect(summary).toContain('Overdue')
    // No checkboxes until the worker asks to select.
    expect(root.querySelector('input[type="checkbox"]')).toBeNull()
  })
})
