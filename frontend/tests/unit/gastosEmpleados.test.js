// Gastos «De empleados»: the pure helpers, the queue and the claim record with
// a mocked doco.workspaces.claims transport.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('frappe-ui', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import Gastos from '@/pages/Gastos.vue'
import GastoEmpleado from '@/pages/GastoEmpleado.vue'
import {
  gastosBoot,
  normalizeSegment,
  visibleSegments,
} from '@/composables/useGastos'
import {
  advanceText,
  claimBack,
  claimChips,
  claimMissing,
  claimsSegmentShown,
  defaultSegment,
  nextClaim,
  normalizeClaimChip,
  normalizeScope,
  pendingOperation,
  reimburseMissing,
  rowAmount,
  runOnce,
  stateLabel,
} from '@/composables/useGastosEmpleados'
import { referenceTarget } from '@/composables/usePendientes'
import { accesos } from '@/composables/useHoy'

const BILLS = { read: true, submit: true, pay: true }
const claimsOn = (extra = {}) => ({
  enabled: true,
  file: true,
  decide: false,
  reimburse: false,
  chips: ['mios'],
  employee: { name: 'HR-EMP-1', employee_name: 'Juana' },
  ...extra,
})

describe('which lists a worker sees', () => {
  it('bill readers keep Por pagar; a claim-only employee lands on De empleados', () => {
    const both = { capabilities: BILLS, claims: claimsOn() }
    const claimOnly = { capabilities: { read: false }, claims: claimsOn() }
    expect(defaultSegment(both)).toBe('por-pagar')
    expect(defaultSegment(claimOnly)).toBe('empleados')
    expect(visibleSegments(claimOnly).map((s) => s.value)).toEqual([
      'empleados',
    ])
    expect(visibleSegments(both).map((s) => s.value)).toEqual([
      'por-pagar',
      'por-registrar',
      'empleados',
    ])
    expect(normalizeSegment('por-pagar', claimOnly)).toBe('empleados')
    expect(normalizeSegment('empleados', both)).toBe('empleados')
    expect(normalizeSegment(undefined)).toBe('por-pagar')
  })

  it('without HRMS the segment stays to explain why; an accountant never sees it', () => {
    const noHrms = {
      capabilities: BILLS,
      claims: { enabled: false, code: 'no_hrms' },
    }
    const accountant = {
      capabilities: BILLS,
      claims: { enabled: false, code: 'no_employee' },
    }
    expect(claimsSegmentShown(noHrms)).toBe(true)
    expect(claimsSegmentShown(accountant)).toBe(false)
    expect(visibleSegments(accountant).map((s) => s.value)).not.toContain(
      'empleados',
    )
  })

  it('chips follow the service; the scope only for Por aprobar', () => {
    const decider = claimsOn({ chips: ['mios', 'por-aprobar', 'adelantos'] })
    expect(claimChips(decider).map((c) => c.value)).toEqual([
      'mios',
      'por-aprobar',
      'adelantos',
    ])
    expect(normalizeClaimChip('por-reembolsar', decider)).toBe('')
    expect(normalizeClaimChip('por-aprobar', decider)).toBe('por-aprobar')
    expect(normalizeScope('por-aprobar', 'all')).toBe('all')
    expect(normalizeScope('mios', 'all')).toBe('')
  })
})

describe('claim states in shop words', () => {
  beforeEach(() => {
    window.__ = (text, values) =>
      String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
  })
  const row = (extra) => ({ currency: 'MXN', total: 300, advance: 0, ...extra })
  it("a claim is «Pagado», never the bills' «Pagada»: its own translation context", () => {
    const seen = []
    window.__ = (text, values, context) => {
      seen.push([text, context])
      return text
    }
    stateLabel(row({ state: 'paid' }))
    stateLabel(row({ state: 'cancelled' }))
    expect(seen).toEqual([
      ['Paid', 'Gastos de empleados'],
      ['Cancelled', 'Gastos de empleados'],
    ])
  })
  it('names who decides, what is still owed and how it was settled', () => {
    expect(stateLabel(row({ state: 'to_approve', approver_name: 'Ana' }))).toBe(
      'To approve · Ana',
    )
    expect(stateLabel(row({ state: 'to_fix' }))).toBe('To correct')
    expect(stateLabel(row({ state: 'to_reimburse' }))).toBe(
      'Approved · to reimburse',
    )
    expect(
      stateLabel(row({ state: 'partly_reimbursed', reimbursed: 100 })),
    ).toMatch(/Reimbursed .*100.* of .*300/)
    expect(stateLabel(row({ state: 'by_advance', mine: true }))).toBe(
      'Discounted from your advance',
    )
    expect(stateLabel(row({ state: 'by_advance' }))).toBe(
      'Discounted from the advance',
    )
    expect(stateLabel(row({ state: 'rejected' }))).toBe('Rejected')
    expect(
      rowAmount(row({ state: 'partly_reimbursed', outstanding: 200 })),
    ).toBe(200)
    expect(rowAmount(row({ state: 'to_approve' }))).toBe(300)
    expect(advanceText({ remaining: 200, currency: 'MXN' }, true)).toMatch(
      /Discounted from your advance · .*200.* left/,
    )
  })
})

describe('the way back and the next claim', () => {
  it('a caller with return_to gets «Volver a …»; else the list it came from', () => {
    expect(
      claimBack({ return_to: '/crm/pendientes', return_label: 'Pendientes' }),
    ).toEqual({
      href: '/crm/pendientes',
      route: '/pendientes',
      label: 'Pendientes',
    })
    expect(claimBack({ return_to: 'https://evil.invalid/x' }).label).toBe(
      'Gastos',
    )
    expect(
      claimBack({ list: '/gastos?segment=empleados&chip=por-aprobar' }).route,
    ).toBe('/gastos?segment=empleados&chip=por-aprobar')
    expect(claimBack({}).route).toBe('/gastos?segment=empleados')
  })

  it('«Siguiente» follows the same chip and skips decided claims', async () => {
    const api = vi.fn(async () => ({
      chip: 'por-aprobar',
      rows: [
        { doctype: 'Expense Claim', name: 'HR-EXP-1', state: 'to_approve' },
        { doctype: 'Expense Claim', name: 'HR-EXP-2', state: 'to_reimburse' },
        { doctype: 'Expense Claim', name: 'HR-EXP-3', state: 'to_approve' },
      ],
    }))
    const list = '/gastos?segment=empleados&chip=por-aprobar&scope=mine'
    expect(await nextClaim(api, list, 'HR-EXP-1')).toBe('HR-EXP-3')
    expect(api.mock.calls[0][1]).toMatchObject({
      chip: 'por-aprobar',
      scope: 'mine',
    })
    expect(await nextClaim(api, '/gastos?segment=por-pagar', 'X')).toBeNull()
  })

  it('Pendientes opens bills and expenses in Gastos and comes back', () => {
    expect(
      referenceTarget({
        reference_type: 'Expense Claim',
        reference_name: 'HR-EXP-1',
      }),
    ).toEqual({
      to: {
        name: 'GastoEmpleado',
        params: { name: 'HR-EXP-1' },
        query: { return_to: '/crm/pendientes', return_label: 'Pendientes' },
      },
    })
    expect(
      referenceTarget({
        reference_type: 'Purchase Invoice',
        reference_name: 'PI-1',
      }).to.name,
    ).toBe('GastoFactura')
  })

  it('Hoy offers «File an expense» to whoever may file one', () => {
    const boot = {
      modules: {
        gastos: { enabled: true, capabilities: { claims: true, claim: true } },
      },
    }
    const items = accesos(boot)
    expect(items.map((item) => item.key)).toEqual(['gastos.claim'])
    expect(items[0].to).toContain('nuevo=1')
  })
})

describe('what blocks a step', () => {
  it('sending needs the photo and the approver; reimbursing needs a bank reference', () => {
    const form = {
      expense_type: 'Taxi',
      amount: '300',
      expense_date: '2026-10-13',
    }
    expect(claimMissing(form)).toEqual([])
    expect(claimMissing(form, { sending: true })).toEqual(['approver', 'photo'])
    expect(
      claimMissing({ ...form, approver: 'ana' }, { sending: true, photos: 1 }),
    ).toEqual([])
    const options = {
      accounts: [
        { account: 'Banco', type: 'Bank' },
        { account: 'Caja chica', type: 'Cash' },
      ],
    }
    expect(
      reimburseMissing(
        { account: 'Banco', amount: 100, reference_date: 'x' },
        options,
      ),
    ).toEqual(['reference_no'])
    expect(
      reimburseMissing(
        { account: 'Caja chica', amount: 100, reference_date: 'x' },
        options,
      ),
    ).toEqual([])
    expect(
      reimburseMissing({ account: 'Cajón', amount: 100 }, options),
    ).toEqual(['account', 'reference_date'])
  })

  it('an unknown outcome keeps the request id; any answer ends it', async () => {
    sessionStorage.clear()
    const lost = Object.assign(new Error('x'), { offline: true })
    const api = vi
      .fn()
      .mockRejectedValueOnce(lost)
      .mockResolvedValueOnce({ ok: true })
    await expect(
      runOnce(api, 'reimburse', 'reimburse:HR-EXP-1', { amount: 100 }),
    ).rejects.toBe(lost)
    const kept = pendingOperation('reimburse:HR-EXP-1')
    expect(kept.data).toEqual({ amount: 100 })
    // The retry replays the same id and payload, even if the form changed.
    await runOnce(api, 'reimburse', 'reimburse:HR-EXP-1', { amount: 999 })
    expect(api.mock.calls[1][1]).toEqual({
      request_id: kept.request_id,
      amount: 100,
    })
    expect(pendingOperation('reimburse:HR-EXP-1')).toBeNull()
  })
})

// ── pages ────────────────────────────────────────────────────────────────

const calls = []
let answers
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
const claim = (extra = {}) => ({
  doctype: 'Expense Claim',
  name: 'HR-EXP-1',
  employee: 'HR-EMP-1',
  employee_name: 'Juana Pérez',
  company: 'Doco',
  date: '2026-10-13',
  currency: 'MXN',
  claimed: 300,
  sanctioned: 300,
  taxes: 0,
  advance: 0,
  reimbursed: 0,
  outstanding: 0,
  total: 300,
  state: 'to_approve',
  docstatus: 0,
  approver: 'ana@example.test',
  approver_name: 'Ana',
  type_label: 'Taxi',
  note: 'Al banco',
  mine: false,
  modified: '2026-10-13 10:00:00',
  ...extra,
})
const record = (doc = {}, actions = []) => ({
  document: claim(doc),
  expenses: [
    {
      type: 'Taxi',
      type_label: 'Taxi',
      date: '2026-10-13',
      description: 'Al banco',
      amount: 300,
      sanctioned: 300,
    },
  ],
  advance: null,
  photos: [
    {
      name: 'F-1',
      file_url: '/private/files/t.png',
      file_name: 't.png',
      is_image: true,
    },
  ],
  payments: [],
  history: [],
  assignments: [],
  actions,
})

let app, root
async function mountAt(path) {
  const router = createRouter({
    history: createMemoryHistory('/crm'),
    routes: [
      { path: '/gastos', name: 'Gastos', component: Gastos },
      {
        path: '/gastos/gasto/:name',
        name: 'GastoEmpleado',
        component: GastoEmpleado,
        props: true,
      },
      { path: '/pendientes', name: 'Pendientes', component: Gastos },
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
const buttons = () =>
  [...document.body.querySelectorAll('button')].map((b) => b.textContent.trim())
const click = async (label) => {
  ;[...document.body.querySelectorAll('button')]
    .find((b) => b.textContent.trim() === label)
    .click()
  await flush()
}

beforeEach(() => {
  calls.length = 0
  sessionStorage.clear()
  gastosBoot.value = null
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (match, i) => values?.[i] ?? match)
  answers = {
    get_capabilities: {
      enabled: true,
      today: '2026-10-13',
      capabilities: { read: false },
      claims: claimsOn(),
    },
  }
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

describe('De empleados queue', () => {
  it('a claim-only employee lands on her own claims with their state', async () => {
    answers.queue = {
      chip: 'mios',
      scope: null,
      rows: [claim({ mine: true, state: 'to_approve' })],
      has_more: false,
      counts: { mios: 1, capped: false, totals: [] },
      guard: null,
    }
    await mountAt('/gastos')
    expect(calls.some(([m]) => m === 'queue')).toBe(true)
    expect(root.textContent).toContain('From employees')
    expect(root.textContent).toContain('To approve · Ana')
    expect(buttons()).toContain('New expense')
    const link = root.querySelector('a[href*="/gastos/gasto/HR-EXP-1"]')
    expect(decodeURIComponent(link.getAttribute('href'))).toContain(
      'list=/gastos?segment=empleados&chip=mios',
    )
  })

  it('without HRMS a bill reader gets the reason and «Continue with bills»', async () => {
    answers.get_capabilities = {
      enabled: true,
      capabilities: BILLS,
      claims: {
        enabled: false,
        code: 'no_hrms',
        reason:
          'Employee expenses use the staff module, which this system does not have.',
        actions: [
          { key: 'request_setup', what: 'hrms', label: 'Ask to turn it on' },
          { key: 'bills', label: 'Continue with bills' },
        ],
      },
    }
    await mountAt('/gastos?segment=empleados')
    expect(root.textContent).toContain('staff module')
    expect(buttons()).toEqual(
      expect.arrayContaining(['Ask to turn it on', 'Continue with bills']),
    )
    expect(calls.some(([m]) => m === 'queue')).toBe(false)
  })
})

describe('the claim record', () => {
  it('a decider approves with one tap, then asks for the reimbursement and goes back', async () => {
    answers.get_capabilities.claims = claimsOn({
      decide: true,
      chips: ['mios', 'por-aprobar'],
    })
    answers.claim = record({}, [{ key: 'decide', allowed: true }])
    answers.decide = {
      ok: true,
      code: 'approved',
      message: 'Expense approved',
      state: 'to_reimburse',
      actions: [{ key: 'ask_reimburse', label: 'Ask for it to be reimbursed' }],
    }
    await mountAt(
      '/gastos/gasto/HR-EXP-1?return_to=%2Fcrm%2Fpendientes&return_label=Pendientes',
    )
    expect(buttons()).toEqual(
      expect.arrayContaining([
        'Approve',
        'Approve less',
        'Reject',
        'Ask for a correction',
      ]),
    )
    expect(root.textContent).toContain('Back to Pendientes')
    await click('Approve')
    const sent = calls.find(([m]) => m === 'decide')[1]
    expect(sent).toMatchObject({
      name: 'HR-EXP-1',
      decision: 'approve',
      modified: '2026-10-13 10:00:00',
    })
    expect(sent.request_id).toBeTruthy()
    const next = root.querySelector('[data-testid="claim-next"]').textContent
    expect(next).toContain('Expense approved')
    expect(next).toContain('Ask for it to be reimbursed')
    expect(buttons()).toContain('Back to Pendientes')
  })

  it('a late decider gets who decided and the record as it stands now', async () => {
    answers.get_capabilities.claims = claimsOn({
      decide: true,
      chips: ['mios', 'por-aprobar'],
    })
    answers.claim = record({}, [{ key: 'decide', allowed: true }])
    answers.decide = {
      ok: false,
      code: 'already_decided',
      message: 'Ana López already approved it.',
      actions: [{ key: 'next', label: 'Next' }],
    }
    await mountAt('/gastos/gasto/HR-EXP-1')
    const before = calls.filter(([m]) => m === 'claim').length
    answers.claim = record(
      { state: 'to_reimburse', docstatus: 1, outstanding: 300 },
      [
        {
          key: 'reimburse',
          allowed: false,
          reason: 'Ask',
          fallback: 'reimburse',
        },
      ],
    )
    await click('Approve')
    expect(root.textContent).toContain('Ana López already approved it.')
    expect(calls.filter(([m]) => m === 'claim').length).toBe(before + 1)
    expect(buttons()).not.toContain('Approve')
    expect(root.textContent).toContain('Approved · to reimburse')
  })

  it('the employee waits on her approver: no decision buttons', async () => {
    answers.claim = record({ mine: true }, [
      { key: 'edit', allowed: true },
      { key: 'send', allowed: true, resend: true },
    ])
    await mountAt('/gastos/gasto/HR-EXP-1')
    expect(root.textContent).toContain('Waiting for Ana to decide.')
    expect(buttons()).not.toContain('Approve')
    expect(buttons()).toContain('Change who approves it')
  })

  it('who cannot pay gets the reason and «Ask for it to be reimbursed»', async () => {
    answers.claim = record(
      { state: 'to_reimburse', docstatus: 1, outstanding: 300 },
      [
        {
          key: 'reimburse',
          allowed: false,
          reason: 'Reimbursements are made by an accounts administrator.',
          fallback: 'reimburse',
        },
      ],
    )
    await mountAt('/gastos/gasto/HR-EXP-1')
    expect(root.textContent).toContain(
      'Reimbursements are made by an accounts administrator.',
    )
    expect(buttons()).toContain('Ask for it to be reimbursed')
    expect(buttons()).not.toContain('Reimburse')
  })

  it('a payer never gets a cash register account to pay from', async () => {
    answers.claim = record(
      { state: 'to_reimburse', docstatus: 1, outstanding: 300 },
      [{ key: 'reimburse', allowed: true }],
    )
    answers.reimburse_options = {
      name: 'HR-EXP-1',
      outstanding: 300,
      currency: 'MXN',
      today: '2026-10-13',
      accounts: [
        { account: 'Banco - D', label: 'Banco', type: 'Bank', currency: 'MXN' },
      ],
      other_currency: [],
      held_by_pos: [{ account: 'Cajón - D', label: 'Cajón' }],
      held_reason: 'That cash belongs to a register.',
      refusal: null,
      can_pay: true,
      needs_setup: false,
    }
    await mountAt('/gastos/gasto/HR-EXP-1')
    await click('Reimburse')
    const dialog = document.body.querySelector(
      '[data-testid="reimburse-dialog"]',
    )
    expect(dialog.textContent).toContain('That cash belongs to a register.')
    expect(dialog.textContent).toContain('Owed to Juana Pérez')
  })
})
