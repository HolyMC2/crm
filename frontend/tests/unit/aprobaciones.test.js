// Pendientes «Por aprobar» / «Esperando respuesta»: URL state, the way into an
// owner screen and back with `done`, and the list and bill screens against a
// mocked doco.pendientes.aprobaciones / doco.workspaces.payables transport.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import ApprovalAsk from '@/components/pendientes/ApprovalAsk.vue'
import ApprovalList from '@/components/pendientes/ApprovalList.vue'
import GastoFactura from '@/pages/GastoFactura.vue'
import { gastosBoot } from '@/composables/useGastos'
import {
  parseQuery,
  referenceTarget,
  segmentEntries,
  toQuery,
} from '@/composables/usePendientes'
import {
  approvalTarget,
  completeTo,
  doneOf,
  listPath,
  ownerReturn,
  requestText,
  rowActions,
} from '@/composables/useAprobaciones'

describe('Aprobaciones URL state', () => {
  it('keeps the approval lists and their kind chip in the URL', () => {
    const state = parseQuery({ segment: 'approve', kind: 'gastos', q: 'renta' })
    expect(state).toMatchObject({
      segment: 'approve',
      kind: 'gastos',
      q: 'renta',
    })
    expect(toQuery(state)).toEqual({
      segment: 'approve',
      kind: 'gastos',
      q: 'renta',
    })
    expect(parseQuery({ segment: 'waiting' }).segment).toBe('waiting')
    // A kind means nothing outside the approval lists, and junk is dropped.
    expect(
      parseQuery({ segment: 'today', kind: 'gastos' }).kind,
    ).toBeUndefined()
    expect(
      parseQuery({ segment: 'approve', kind: '<script>' }).kind,
    ).toBeUndefined()
  })
  it('shows «Por aprobar» only to possible deciders', () => {
    const values = (caps) => segmentEntries(caps).map((entry) => entry.value)
    expect(values()).not.toContain('approve')
    expect(values()).not.toContain('waiting')
    expect(values({ approve: true, waiting: true }).slice(0, 3)).toEqual([
      'mine',
      'approve',
      'waiting',
    ])
  })
  it('opens bills and purchases in their modules, vacations in Asistencia', () => {
    expect(
      referenceTarget({
        reference_type: 'Purchase Invoice',
        reference_name: 'PI-1',
      }),
    ).toEqual({ to: { name: 'GastoFactura', params: { name: 'PI-1' } } })
    expect(
      referenceTarget({
        reference_type: 'Leave Application',
        reference_name: 'HR-LAP-1',
      }),
    ).toEqual({ href: '/app/asistencia?v=ausencias&request=HR-LAP-1' })
  })
})

describe('Into the owner screen and back', () => {
  const state = parseQuery({ segment: 'approve', kind: 'gastos' })
  it('a row opens its owner with the way back to this exact list', () => {
    const target = approvalTarget(
      { url: '/crm/gastos/factura/ACC-PINV-1' },
      state,
    )
    const url = new URL(target.to, 'https://x.invalid')
    expect(url.pathname).toBe('/gastos/factura/ACC-PINV-1')
    expect(url.searchParams.get('return_to')).toBe(
      '/crm/pendientes?segment=approve&kind=gastos',
    )
    expect(url.searchParams.get('return_label')).toBe('To approve')
    const desk = approvalTarget(
      { url: '/app/asistencia?v=ausencias&request=HR-LAP-1' },
      state,
    )
    expect(desk.href).toMatch(
      /^\/app\/asistencia\?v=ausencias&request=HR-LAP-1&/,
    )
    expect(
      new URL(desk.href, 'https://x.invalid').searchParams.get('return_to'),
    ).toBe(listPath(state))
  })
  it('never opens an unsafe or missing target', () => {
    for (const url of [
      'https://evil.invalid/crm/',
      '//evil.invalid/crm/x',
      '/crm/../api/method/x',
      '/api/method/frappe.client.delete',
      '',
      null,
    ])
      expect(approvalTarget({ url }, state), String(url)).toBeNull()
  })
  it('comes back with done, replacing an older one', () => {
    expect(
      completeTo(
        '/crm/pendientes?segment=approve&done=X%3AY',
        'Purchase Invoice',
        'PI 1',
      ),
    ).toBe('/crm/pendientes?segment=approve&done=Purchase+Invoice%3API+1')
    expect(completeTo('https://evil.invalid/crm/', 'A', 'B')).toBeNull()
    expect(doneOf({ done: 'Purchase Invoice:PI 1' })).toEqual({
      doctype: 'Purchase Invoice',
      name: 'PI 1',
    })
    expect(doneOf({ done: 'nothing' })).toBeNull()
  })
  it('reads the way back only inside Muelle, with a short label', () => {
    expect(
      ownerReturn({
        return_to: '/crm/pendientes?segment=approve',
        return_label: 'Por aprobar',
      }),
    ).toEqual({ to: '/crm/pendientes?segment=approve', label: 'Por aprobar' })
    expect(ownerReturn({ return_to: '/crm/hoy' }).label).toBe('Hoy')
    expect(ownerReturn({ return_to: '//evil.invalid/crm/' })).toBeNull()
    expect(ownerReturn({ return_to: '/app/user' })).toBeNull()
  })
  it('says who asked or who decides', () => {
    const row = {
      requested_by_name: 'Ana',
      decider: 'Juan y Pedro',
      requested_at: '',
    }
    expect(requestText(row, 'approve')).toBe('Asked by Ana')
    expect(requestText(row, 'waiting')).toBe('Waiting for Juan y Pedro')
  })
  it('offers «No aprobar» only on a pending ask of mine', () => {
    const keys = (row, segment = 'approve') =>
      rowActions(row, segment).map((action) => action.key)
    expect(keys({ ask: 'T1', state: 'pending' })).toEqual(['decline'])
    expect(keys({ ask: 'T1', state: 'pending', settle: true })).toEqual([
      'settle',
      'decline',
    ])
    expect(keys({ ask: 'T1', state: 'resolved' })).toEqual([])
    expect(keys({ state: 'pending' })).toEqual([])
    expect(
      keys({ ask: 'T1', state: 'pending', guard: { code: 'no_access' } }),
    ).toEqual([])
    expect(keys({ ask: 'T1', state: 'pending' }, 'waiting')).toEqual([])
  })
})

const calls = []
let answers
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((done) => setTimeout(done, 0))
    await nextTick()
  }
}
let app, root
async function mount(path, component, routes = []) {
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/pendientes', name: 'Pendientes', component },
      {
        path: '/gastos/factura/:name',
        name: 'GastoFactura',
        component: GastoFactura,
        props: true,
      },
      { path: '/gastos', name: 'Gastos', component: { template: '<div />' } },
      {
        path: '/compras/orden/:name',
        name: 'CompraOrden',
        component: { template: '<div />' },
      },
      ...routes,
    ],
  })
  router.push(path)
  await router.isReady()
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ template: '<RouterView />' })
  app.use(router)
  app.config.globalProperties.__ = window.__
  app.mount(root)
  await flush()
  return router
}

beforeEach(() => {
  calls.length = 0
  gastosBoot.value = null
  sessionStorage.clear()
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
  answers = {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const method = String(url).split('.').pop()
      calls.push([method, JSON.parse(init.body)])
      const answer = answers[method]
      return {
        ok: answer !== undefined,
        status: answer !== undefined ? 200 : 417,
        json: async () =>
          answer !== undefined ? { message: answer } : { exc_type: 'x' },
      }
    }),
  )
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.unstubAllGlobals()
})

const bill = {
  doctype: 'Purchase Invoice',
  name: 'PI-1',
  title: 'Renta Local · F-77',
  detail: 'Pagar · $1,000.00',
  requested_by: 'ana@example.test',
  requested_by_name: 'Ana',
  requested_at: '2026-10-13 09:00:00',
  url: '/crm/gastos/factura/PI-1',
  state: 'pending',
  guard: null,
  ask: 'TODO-1',
  settle: false,
  kind: 'gastos',
  kind_label: 'Facturas',
}

function page(
  rows,
  kinds = [{ key: 'gastos', label: 'Facturas', count: rows.length }],
) {
  return {
    view: 'decide',
    kinds,
    rows,
    has_more: false,
    count: { value: rows.length, capped: false },
  }
}

const List = {
  components: { ApprovalList },
  template: '<ApprovalList :state="state" />',
  computed: {
    state() {
      return parseQuery(this.$route.query)
    },
  },
}

describe('Por aprobar list', () => {
  it('lists what waits on me and opens it with the way back', async () => {
    answers.queue = page([bill])
    await mount('/pendientes?segment=approve', List)
    expect(calls.find(([m]) => m === 'queue')[1]).toMatchObject({
      view: 'decide',
    })
    expect(root.textContent).toContain('Renta Local · F-77')
    expect(root.textContent).toContain('Asked by Ana')
    const link = root.querySelector('a[href*="/gastos/factura/PI-1"]')
    const url = new URL(link.getAttribute('href'), 'https://x.invalid')
    expect(url.searchParams.get('return_to')).toBe(
      '/crm/pendientes?segment=approve',
    )
    const labels = [...root.querySelectorAll('button')].map((b) =>
      b.textContent.trim(),
    )
    expect(labels).toContain("Don't approve")
  })
  it('back from a decided bill: «Listo», the next row and no `done` left in the URL', async () => {
    sessionStorage.setItem(
      'muelle:aprobaciones:opened',
      JSON.stringify({
        key: 'Purchase Invoice:PI-1',
        index: 0,
        title: bill.title,
      }),
    )
    answers.queue = page([{ ...bill, name: 'PI-2', title: 'Luz · F-2' }])
    const router = await mount(
      '/pendientes?segment=approve&done=Purchase%20Invoice%3API-1',
      List,
    )
    expect(root.textContent).toContain(`Done: ${bill.title}`)
    expect(router.currentRoute.value.query).toEqual({ segment: 'approve' })
  })
  it('a kind that failed says so and keeps the rest', async () => {
    answers.queue = page(
      [bill],
      [
        { key: 'gastos', label: 'Facturas', count: 1 },
        { key: 'x', label: 'Vacaciones', count: 0, failed: true },
      ],
    )
    await mount('/pendientes?segment=approve', List)
    expect(root.textContent).toContain('We could not check Vacaciones.')
    expect(root.textContent).toContain('Renta Local · F-77')
  })
  it('an empty list says so and points to what I asked for', async () => {
    answers.queue = page([], [])
    // Its own definition: a spread of List would copy List's compiled render.
    const router = await mount('/pendientes?segment=approve', {
      components: { ApprovalList },
      template: '<ApprovalList :state="state" @segment="go" />',
      computed: {
        state() {
          return parseQuery(this.$route.query)
        },
      },
      methods: {
        go(segment) {
          this.$router.push({ name: 'Pendientes', query: { segment } })
        },
      },
    })
    expect(root.textContent).toContain('You have nothing to approve')
    ;[...root.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'See what you asked for')
      .click()
    await flush()
    expect(router.currentRoute.value.query).toEqual({ segment: 'waiting' })
  })
  it('a settled ask leaves my list with «Quitar de la lista»', async () => {
    answers.queue = page([
      {
        ...bill,
        state: 'resolved',
        guard: {
          code: 'settled',
          message: 'Ya la pagó Pedro.',
          actions: [
            {
              label: 'Quitar de la lista',
              kind: 'call',
              target: 'doco.pendientes.aprobaciones.dismiss',
              args: { todo: 'TODO-1' },
            },
          ],
        },
      },
    ])
    answers.dismiss = { todo: 'TODO-1', status: 'Closed' }
    await mount('/pendientes?segment=approve', List)
    expect(root.textContent).toContain('Ya la pagó Pedro.')
    ;[...root.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Quitar de la lista')
      .click()
    await flush()
    const dismiss = calls.find(([m]) => m === 'dismiss')[1]
    expect(dismiss.todo).toBe('TODO-1')
    expect(dismiss.request_id).toBeTruthy()
  })
})

describe('A bill opened from Por aprobar', () => {
  beforeEach(() => {
    answers.get_capabilities = {
      enabled: true,
      user: 'juan@example.test',
      today: '2026-10-13',
      capabilities: { read: true, pay: true },
    }
    answers.invoice = {
      document: {
        doctype: 'Purchase Invoice',
        name: 'PI-1',
        party: 'Renta Local',
        currency: 'MXN',
        total: 1000,
        paid: 0,
        outstanding_amount: 1000,
        docstatus: 1,
        modified: '2026-10-13 10:00:00',
        items: [],
        item_count: 0,
      },
      schedule: [],
      orders: [],
      payments: [],
      assignments: [],
      actions: [{ key: 'pay', allowed: true }],
    }
    answers.asks = {
      asks: [
        {
          todo: 'TODO-1',
          kind: 'gastos.pay',
          requested_by_name: 'Ana',
          requested_at: '2026-10-13 09:00:00',
          text: 'Pagar la factura PI-1 de Renta Local',
          note: 'Vence mañana',
        },
      ],
    }
  })
  const opened =
    '/gastos/factura/PI-1?return_to=%2Fcrm%2Fpendientes%3Fsegment%3Dapprove&return_label=Por+aprobar'

  it('shows who asked, and «Volver a Por aprobar» goes back without deciding', async () => {
    const router = await mount(opened, List)
    expect(root.textContent).toContain(
      'Ana asked you: Pagar la factura PI-1 de Renta Local',
    )
    expect(root.textContent).toContain('Vence mañana')
    const backButton = [...root.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Back to Por aprobar'),
    )
    backButton.click()
    await flush()
    expect(router.currentRoute.value.fullPath).toBe(
      '/pendientes?segment=approve',
    )
  })
  it('«No aprobar» needs a reason, then goes back with done', async () => {
    answers.decline = { todo: 'TODO-1', status: 'Cancelled' }
    const router = await mount(opened, List)
    const find = (text) =>
      [...document.body.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === text,
      )
    find("Don't approve").click()
    await flush()
    const dialogButtons = [...document.body.querySelectorAll('button')].filter(
      (b) => b.textContent.trim() === "Don't approve",
    )
    dialogButtons.at(-1).click()
    await flush()
    expect(calls.some(([m]) => m === 'decline')).toBe(false)
    expect(document.body.textContent).toContain(
      'Write why, so they know what to change.',
    )
    const reason = document.body.querySelector('textarea')
    reason.value = 'Falta el XML'
    reason.dispatchEvent(new Event('input'))
    await flush()
    ;[...document.body.querySelectorAll('button')]
      .filter((b) => b.textContent.trim() === "Don't approve")
      .at(-1)
      .click()
    await flush()
    const decline = calls.find(([m]) => m === 'decline')[1]
    expect(decline).toMatchObject({ todo: 'TODO-1', reason: 'Falta el XML' })
    expect(router.currentRoute.value.query).toEqual({
      segment: 'approve',
      done: 'Purchase Invoice:PI-1',
    })
  })
})

describe('A purchase to review (review F4)', () => {
  const review = {
    todo: 'TODO-9',
    kind: 'compras.review',
    requested_by_name: 'Ana',
    requested_at: '2026-10-13 09:00:00',
    text: 'Revisar la compra PO-1',
    note: 'No llegó completa',
  }
  async function banner(asks) {
    answers.asks = { asks }
    const settled = vi.fn()
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp(ApprovalAsk, {
      doctype: 'Purchase Order',
      name: 'PO-1',
      settleKinds: ['compras.review'],
      settleLabel: 'Reviewed',
      onSettled: settled,
    })
    app.config.globalProperties.__ = window.__
    app.mount(root)
    await flush()
    return settled
  }
  const find = (text) =>
    [...root.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === text,
    )

  it('«Revisada» answers the review without confirming the purchase', async () => {
    answers.settle = { todo: 'TODO-9', status: 'Closed' }
    const settled = await banner([review])
    expect(root.textContent).toContain('Ana asked you: Revisar la compra PO-1')
    find('Reviewed').click()
    await flush()
    const call = calls.find(([m]) => m === 'settle')[1]
    expect(call.todo).toBe('TODO-9')
    expect(call.request_id).toBeTruthy()
    expect(calls.some(([m]) => m === 'confirm_order')).toBe(false)
    expect(settled).toHaveBeenCalledWith(
      expect.objectContaining({ todo: 'TODO-9' }),
    )
    expect(root.querySelector('[data-approval-ask]')).toBeNull()
  })
  it('a refused answer stays on screen with the reason, and the ask with it', async () => {
    const settled = await banner([review])
    find('Reviewed').click()
    await flush()
    expect(settled).not.toHaveBeenCalled()
    expect(
      root.querySelector('[data-approval-ask] [role="alert"]'),
    ).not.toBeNull()
    expect(find('Reviewed')).toBeDefined()
  })
  it('an ask to confirm has no «Revisada»: confirming is the answer', async () => {
    await banner([{ ...review, kind: 'compras.confirm' }])
    expect(find('Reviewed')).toBeUndefined()
    expect(find("Don't approve")).toBeDefined()
  })
})

describe('es-MX catalog', () => {
  it('has an entry for every string the approval screens show', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const po = readFileSync(resolve(here, '../../../crm/locale/es.po'), 'utf8')
    const catalog = new Set(
      [
        ...po.matchAll(
          /^msgid "((?:[^"\\]|\\.)*)"\nmsgstr "(?:[^"\\]|\\.)+"/gm,
        ),
      ].map((m) => m[1]),
    )
    const files = [
      '../../src/components/pendientes/ApprovalList.vue',
      '../../src/components/pendientes/ApprovalAsk.vue',
      '../../src/components/pendientes/DeclineDialog.vue',
      '../../src/composables/useAprobaciones.js',
    ]
    const strings = files.flatMap((file) =>
      [
        ...readFileSync(resolve(here, file), 'utf8').matchAll(
          /\b(?:__|t)\(\s*(['"`])((?:(?!\1).)+)\1/gs,
        ),
      ].map((m) => m[2]),
    )
    expect(strings.length).toBeGreaterThan(20)
    for (const text of strings) expect(catalog.has(text), text).toBe(true)
  })
})
