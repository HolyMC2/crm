// Mi cuenta › Tienda › CFDI (Boat capability «stamp_packages»): the row reads
// the package and this month's stamps («Paquete de 150 timbres al mes», «87 de
// 150 timbres este mes»); «Cambiar paquete» opens Boat's packages (stamps a
// month, monthly price, price per stamp), its quote for the one chosen (today's
// charge and on which invoice, from when, the consent), what a stamp beyond the
// package costs and the rules, and «Confirmar» sends that package once through
// toggle_addon with its key. Turning CFDI on opens the same sheet. Without the
// capability the row and its switch are what they were, and Boat is asked
// nothing new.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  seam: vi.fn(),
  toast: vi.fn(),
  // The sheet's scrolling box (null: nothing scrolls, as in happy-dom).
  box: null,
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: vi.fn(async () => ({})),
    toast: { success: (...args) => state.toast(...args), error: vi.fn() },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled', 'theme'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'button',
            {
              disabled: props.disabled,
              'data-variant': props.variant || 'subtle',
              onClick: () => emit('click'),
            },
            props.label,
          ),
    },
  }
})
vi.mock('@/components/ui', async (importOriginal) => {
  const { h } = await import('vue')
  return {
    ...(await importOriginal()),
    BottomSheet: {
      props: ['open', 'title'],
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h('section', { role: 'dialog', 'aria-label': props.title }, [
                h('h2', props.title),
                slots.default?.(),
                slots.actions?.(),
              ])
            : null,
    },
  }
})
vi.mock('@/utils/scrollWithin', async (importOriginal) => ({
  ...(await importOriginal()),
  scrollParent: () => state.box,
}))
vi.mock('@/components/cuenta/api', async (importOriginal) => ({
  ...(await importOriginal()),
  read: (...args) => state.read(...args),
  mutate: (...args) => state.mutate(...args),
  seam: (...args) => state.seam(...args),
}))

import { createPagos } from '@/components/cuenta/pagos'
import CuentaTienda from '@/components/cuenta/CuentaTienda.vue'
import {
  ladderRows,
  startingPackage,
  stampsAction,
  stampsQuoteView,
  stampsRow,
} from '@/components/cuenta/timbres'

const NOW = new Date(2026, 10, 16, 10, 0)
const LADDER = [
  {
    qty: 50,
    monthly_mxn: 150,
    per_stamp_mxn: 3,
    included: 50,
    available: true,
    note: null,
  },
  {
    qty: 150,
    monthly_mxn: 375,
    per_stamp_mxn: 2.5,
    included: 150,
    available: true,
    note: null,
  },
  {
    qty: 400,
    monthly_mxn: 800,
    per_stamp_mxn: 2,
    included: 400,
    available: true,
    note: null,
  },
  {
    qty: 1000,
    monthly_mxn: 2000,
    per_stamp_mxn: 2,
    included: 1000,
    available: false,
    note: 'Tu plan permite hasta 500 timbres al mes',
  },
]
const EXTRA =
  'Pasando tu paquete, cada timbre cuesta $3.00, IVA incluido, y se descuenta de tu saldo cada noche.'
const RULES = [
  'Cada CFDI que timbras usa 1 timbre: una factura, una factura global o un complemento de pago.',
  'Un intento rechazado no gasta timbre.',
]
// Boat's answers: its catalog's packages and prices, never figures of ours.
const HELD = {
  ok: true,
  changed: false,
  state: 'active',
  delivered: true,
  package_qty: 150,
  monthly_mxn: 375,
  included: 150,
  plan_included: 0,
  used: 87,
  kept_until: null,
  scheduled: null,
  ladder: LADDER,
  extra_stamp: { price_mxn: 3, gated: false, message: EXTRA },
  rules: RULES,
  is_trial: false,
  message: 'Tu paquete: 150 timbres al mes.',
}
const UP = {
  ...HELD,
  changed: true,
  direction: 'increase',
  package_target: 400,
  included_target: 400,
  monthly_now_mxn: 375,
  monthly_target_mxn: 800,
  monthly_delta_mxn: 425,
  charge_now_mxn: 425,
  charge_on: 'next_invoice',
  first_month_mxn: null,
  decrease_effective_date: null,
  keeps_until: null,
  next_month: '2026-12-01',
}
const DOWN = {
  ...UP,
  direction: 'decrease',
  package_target: 50,
  included_target: 50,
  monthly_target_mxn: 150,
  monthly_delta_mxn: -225,
  charge_now_mxn: 0,
  charge_on: null,
  decrease_effective_date: '2026-12-01',
  keeps_until: '2026-11-30',
}
const OFF = {
  ...HELD,
  state: 'off',
  delivered: false,
  package_qty: null,
  monthly_mxn: 0,
  used: 0,
  included: 0,
}
const ACTIVATE = {
  ...OFF,
  changed: true,
  direction: 'activate',
  package_target: 150,
  included_target: 150,
  monthly_now_mxn: 0,
  monthly_target_mxn: 375,
  monthly_delta_mxn: 375,
  charge_now_mxn: 0,
  charge_on: 'delivery',
  first_month_mxn: 375,
  next_month: '2026-12-01',
}
// CFDI 400 turned off on 16 November, still running to the 30th.
const KEPT = {
  ...HELD,
  state: 'kept',
  package_qty: 400,
  monthly_mxn: 800,
  included: 400,
  used: 120,
  kept_until: '2026-11-30',
  message:
    'Tu paquete: 400 timbres al mes. Se apaga el 30 de noviembre de 2026.',
}
const KEPT_DOWN = {
  ...KEPT,
  changed: true,
  direction: 'decrease',
  resumes: true,
  package_target: 150,
  included_target: 150,
  monthly_now_mxn: 800,
  monthly_target_mxn: 375,
  monthly_delta_mxn: 375,
  charge_now_mxn: 0,
  charge_on: null,
  decrease_effective_date: '2026-12-01',
  keeps_until: '2026-11-30',
  next_month: '2026-12-01',
}
const KEPT_UP = {
  ...KEPT,
  package_qty: 150,
  monthly_mxn: 375,
  included: 150,
  changed: true,
  direction: 'increase',
  resumes: true,
  package_target: 400,
  included_target: 400,
  monthly_now_mxn: 375,
  monthly_target_mxn: 800,
  monthly_delta_mxn: 800,
  charge_now_mxn: 425,
  charge_on: 'next_invoice',
  decrease_effective_date: null,
  keeps_until: null,
  next_month: '2026-12-01',
}
const KEPT_RESUME = {
  ...KEPT,
  changed: true,
  direction: 'resume',
  resumes: true,
  package_target: 400,
  charge_now_mxn: 0,
  charge_on: null,
  message: 'Reanudas CFDI con 400 timbres al mes.',
}
// 400 held, 150 scheduled for 1 December.
const SCHEDULED = {
  ...HELD,
  package_qty: 400,
  monthly_mxn: 800,
  included: 400,
  scheduled: {
    package_qty: 150,
    effective_date: '2026-12-01',
    keeps_until: '2026-11-30',
    lands_now: false,
    waits: null,
  },
}
const CFDI_ADDON = {
  service_key: 'cfdi_timbres',
  service_name: 'CFDI',
  unit_price_mxn: 150,
  pricing_mode: 'flat',
  meter_unit: 'month',
  status: 'disponible',
  packages: [{ qty: 50, price: 150 }],
}
const STORE = {
  current_plan: 'pro',
  requested_plan: null,
  plans: [{ name: 'pro', plan_name: 'Pro', monthly_price_mxn: 499 }],
}

let app, root
const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function find(selector) {
  for (let i = 0; i < 600; i++) {
    const found = document.querySelector(selector)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return null
}

beforeEach(() => {
  state.read.mockReset()
  state.mutate.mockReset()
  state.seam.mockReset()
  state.toast.mockReset()
  state.box = null
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
})

// Boat's bootstrap: with «stamp_packages» the CFDI row's package and stamps.
function boot(capabilities, { active = true, stamps = null } = {}) {
  return {
    ...(capabilities?.includes('stamp_packages')
      ? {
          stamp_packages: stamps || {
            state: active ? 'active' : 'off',
            package_qty: active ? 150 : null,
            included: active ? 150 : 0,
            used: active ? 87 : 0,
            scheduled: null,
            kept_until: null,
          },
        }
      : {}),
    site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 0 },
    meters: { billing: { is_trial: false, monthly_price_mxn: 499 } },
    invoices: [],
    store: { ...STORE, addons: [{ ...CFDI_ADDON, active }] },
    payment_state: { status: 'ready', authoritative: true, invoices: {} },
    ...(capabilities ? { capabilities } : {}),
  }
}
function readyDoor(data) {
  const pagos = createPagos({
    read: (...args) => state.read(...args),
    mutate: (...args) => state.mutate(...args),
    navigate: vi.fn(),
    openSupport: () => true,
    timers: { set: () => 0, clear: () => {} },
  })
  pagos.boot.value = data
  pagos.loading.value = false
  pagos.resolvePaymentState(data.payment_state)
  return pagos
}
function mountTienda(pagos, props = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({
    render: () => h(CuentaTienda, { door: pagos, debounceMs: 0, ...props }),
  })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
}
function seams({ held = HELD, quote = UP } = {}) {
  state.seam.mockImplementation(async (method, payload) => {
    if (method !== 'stamp_package_quote') return null
    if (payload.package_qty === undefined) return held
    if (typeof quote === 'function') return quote(payload)
    return payload.package_qty === held.package_qty
      ? { ...held, message: 'No hay cambios: ya tienes 150 timbres al mes.' }
      : quote
  })
}
function choose(qty) {
  const input = document.querySelector(
    `[data-testid="timbres-paquetes"] [data-qty="${qty}"] input`,
  )
  input.checked = true
  input.dispatchEvent(new Event('change'))
}

describe('the row and the sheet in the owner’s words', () => {
  it('«Paquete de 150 timbres al mes» and «87 de 150 timbres este mes»', () => {
    const row = stampsRow(boot(['stamp_packages']).stamp_packages)
    expect(row.package).toBe('Package of 150 stamps a month')
    expect(row.use).toBe('87 of 150 stamps this month')
    expect([row.held, row.warn, row.scheduled]).toEqual([true, false, ''])
    // From 80 % of the month's stamps the line turns amber.
    expect(
      stampsRow({ state: 'active', package_qty: 150, included: 150, used: 120 })
        .warn,
    ).toBe(true)
    const later = stampsRow(
      {
        state: 'active',
        package_qty: 400,
        included: 400,
        used: 20,
        scheduled: {
          package_qty: 150,
          effective_date: '2026-12-01',
          lands_now: false,
          waits: null,
        },
      },
      NOW,
    )
    expect(later.scheduled).toBe(
      'Goes down to 150 stamps a month on 1 de diciembre',
    )
    expect(later.warn).toBe(false)
    expect(stampsRow({ state: 'off', package_qty: null }).held).toBe(false)
    expect(stampsRow(null)).toBeNull()
  })

  it('the ladder: stamps a month, the price and the price per stamp, the one held', () => {
    const rows = ladderRows(HELD)
    expect(rows.map((r) => [r.label, r.price, r.perStamp, r.current])).toEqual([
      ['50 stamps a month', '$150.00 a month', '$3.00 per stamp', false],
      ['150 stamps a month', '$375.00 a month', '$2.50 per stamp', true],
      ['400 stamps a month', '$800.00 a month', '$2.00 per stamp', false],
      ['1,000 stamps a month', '$2,000.00 a month', '$2.00 per stamp', false],
    ])
    expect(rows[3].available).toBe(false)
    expect(rows[3].note).toContain('hasta 500 timbres')
    expect(startingPackage(HELD)).toBe(150)
    expect(startingPackage(HELD, 400)).toBe(400)
    expect(startingPackage(HELD, 1000)).toBe(150) // Boat does not sell it here
    expect(startingPackage(OFF)).toBe(50)
    // Opening never arms a change: a scheduled one opens on itself, and a
    // CFDI turned off that still runs opens with nothing chosen.
    expect(startingPackage(SCHEDULED)).toBe(150)
    expect(startingPackage(KEPT)).toBeNull()
    expect(startingPackage(KEPT, 150)).toBe(150)
  })

  it('a CFDI turned off: another size turns it on again, with its consent', () => {
    const down = stampsQuoteView(KEPT_DOWN, NOW)
    expect(down.lines).toEqual([
      'CFDI turns back on: it no longer turns off on 30 de noviembre.',
      'You keep 400 stamps until 30 de noviembre; from 1 de diciembre you have 150 a month.',
      'From 1 de diciembre: $375.00 a month, IVA included.',
    ])
    expect(down.nothingToday).toBe(true)
    expect(down.consent).toContain('you agree to pay $375.00 a month')
    expect(down.lines.join(' ')).not.toContain('save')
    expect(down.lines.join(' ')).not.toContain('refunded')
    expect(stampsAction(KEPT_DOWN, NOW)).toEqual({
      label: 'Resume with 150 stamps',
      done: 'CFDI resumed with 150 stamps a month',
    })
    const up = stampsQuoteView(KEPT_UP, NOW)
    expect(up.lines[0]).toBe(
      'CFDI turns back on: it no longer turns off on 30 de noviembre.',
    )
    expect(up.amount).toBe('$425.00')
    expect(up.consent).toContain('you agree to pay $800.00 a month')
    expect(stampsAction(KEPT_UP, NOW).label).toBe('Resume with 400 stamps')
    // Its own package is the store's resume: no new consent.
    const same = stampsQuoteView(KEPT_RESUME, NOW)
    expect([same.consent, same.message]).toEqual([
      '',
      'Reanudas CFDI con 400 timbres al mes.',
    ])
    expect(stampsAction(KEPT_RESUME, NOW).label).toBe('Resume CFDI')
  })

  it('more stamps: what goes back to the saldo, and the gate’s at the month’s close', () => {
    const view = stampsQuoteView(
      { ...UP, saldo_back_mxn: 90, saldo_back_stamps: 30, gate_back: true },
      NOW,
    )
    expect(view.lines).toContain(
      'We return $90.00 to your saldo: 30 extra stamps already charged this month now fall inside your package.',
    )
    expect(view.lines).toContain(
      'Extra stamps charged to your saldo when stamped that now fall inside your package come back when the month closes.',
    )
    expect(stampsQuoteView(UP, NOW).lines.join(' ')).not.toContain('saldo')
  })

  it('verbs and the quote: today’s charge, from when, the consent', () => {
    expect(stampsAction(UP, NOW)).toEqual({
      label: 'Go up to 400 stamps',
      done: 'You went up to 400 stamps a month',
    })
    const up = stampsQuoteView(UP, NOW)
    expect([up.amount, up.per]).toEqual([
      '$425.00',
      'Added to your next invoice: this month’s difference, IVA included',
    ])
    expect(up.lines).toEqual([
      '400 stamps a month from today; the ones you already used this month count.',
      'From 1 de diciembre: $800.00 a month, IVA included.',
    ])
    expect(up.consent).toContain('you agree to pay $800.00 a month')
    expect(stampsQuoteView({ ...UP, charge_on: 'this_invoice' }, NOW).per).toBe(
      'Added to this month’s invoice, IVA included',
    )
    expect(stampsAction(DOWN, NOW)).toEqual({
      label: 'Schedule the change',
      done: 'Change scheduled',
    })
    const down = stampsQuoteView(DOWN, NOW)
    expect([down.amount, down.nothingToday]).toEqual(['', true])
    expect(down.lines).toEqual([
      'You keep 150 stamps until 30 de noviembre; from 1 de diciembre you have 50 a month.',
      'You save $225.00 a month, IVA included',
      'The month in progress is not refunded.',
    ])
    // Before this month's invoice it lands today.
    const now = {
      ...DOWN,
      decrease_effective_date: '2026-11-01',
      keeps_until: null,
    }
    expect(stampsAction(now, NOW).label).toBe('Go down to 50 stamps')
    expect(stampsQuoteView(now, NOW).lines[0]).toBe(
      'It goes down to 50 stamps a month today.',
    )
    expect(stampsAction(ACTIVATE, NOW)).toEqual({
      label: 'Turn on CFDI',
      done: 'CFDI turned on',
    })
    const on = stampsQuoteView(ACTIVATE, NOW)
    expect(on.nothingToday).toBe(true)
    expect(on.lines).toEqual([
      'The month it is ready is charged whole, $375.00, because its stamps count whole that month.',
      'Then $375.00 a month, IVA included.',
    ])
    const trial = stampsQuoteView(
      { ...ACTIVATE, is_trial: true, charge_on: null },
      NOW,
    )
    expect(trial.lines[0]).toContain('Nothing is charged during your trial')
    expect(trial.consent).toBe('')
    expect(stampsAction({ ...HELD, changed: false }, NOW)).toBeNull()
  })
})

describe('Tienda › CFDI', () => {
  it('without the capability the row is today’s, and its switch is today’s confirm', async () => {
    seams()
    mountTienda(readyDoor(boot(null, { active: false })))
    await find('[data-testid="cuenta-complementos"]')
    await flush()
    expect(root.querySelector('[data-testid="timbres-paquete"]')).toBeNull()
    expect(root.querySelector('[data-testid="timbres-cambiar"]')).toBeNull()
    root.querySelector('[data-testid="complemento-cfdi_timbres"]').click()
    const confirm = await find('[data-testid="cuenta-confirmar"]')
    expect(confirm).not.toBeNull()
    expect(document.querySelector('[data-testid="timbres-cambio"]')).toBeNull()
    expect(state.seam).not.toHaveBeenCalled()
  })

  it('«Cambiar paquete», 400, «Confirmar»: one change with its key', async () => {
    seams()
    state.mutate.mockResolvedValue({
      ...UP,
      ok: true,
      consent: 'PC-1',
      applied: true,
    })
    state.read.mockResolvedValue(boot(['stamp_packages']))
    mountTienda(readyDoor(boot(['stamp_packages'])))
    const pkg = await find('[data-testid="timbres-paquete"]')
    expect(pkg.textContent).toContain('Package of 150 stamps a month')
    expect(
      root.querySelector('[data-testid="timbres-uso-mes"]').textContent,
    ).toContain('87 of 150 stamps this month')
    root.querySelector('[data-testid="timbres-cambiar"]').click()
    const sheet = await find('[data-testid="timbres-cambio"]')
    await flush()
    expect(state.seam).toHaveBeenCalledWith('stamp_package_quote', {})
    expect(state.seam).toHaveBeenCalledWith('stamp_package_quote', {
      package_qty: 150,
    })
    expect(sheet.textContent).toContain('$2.50 per stamp')
    expect(sheet.textContent).toContain('Your package')
    expect(
      document.querySelector('[data-testid="timbres-extra"]').textContent,
    ).toBe(EXTRA)
    expect(
      document.querySelector('[data-testid="timbres-reglas"]').textContent,
    ).toContain('complemento de pago')
    const confirm = document.querySelector('[data-testid="timbres-confirmar"]')
    expect(confirm.disabled).toBe(true) // the package held: nothing to change
    expect(confirm.textContent).toBe('Choose another package')
    choose(400)
    await flush()
    expect(state.seam).toHaveBeenCalledWith('stamp_package_quote', {
      package_qty: 400,
    })
    expect(
      document.querySelector('[data-testid="timbres-monto"]').textContent,
    ).toContain('$425.00')
    expect(
      document.querySelector('[data-testid="timbres-consentimiento"]')
        .textContent,
    ).toContain('$800.00 a month, IVA included')
    expect(confirm.textContent).toBe('Go up to 400 stamps')
    expect(confirm.disabled).toBe(false)
    confirm.click()
    await flush()
    expect(state.mutate).toHaveBeenCalledTimes(1)
    const [method, body] = state.mutate.mock.calls[0]
    expect(method).toBe('toggle_addon')
    expect(body).toMatchObject({
      service_key: 'cfdi_timbres',
      action: 'activate',
      package_qty: 400,
    })
    expect(body.idempotency_key.length).toBeGreaterThan(8)
    expect(state.toast).toHaveBeenCalledWith(
      'You went up to 400 stamps a month',
    )
    expect(state.read).toHaveBeenCalled()
  })

  it('a lost answer goes again with the same key', async () => {
    seams()
    state.mutate
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ ...UP, ok: true, replayed: true })
    state.read.mockResolvedValue(boot(['stamp_packages']))
    mountTienda(readyDoor(boot(['stamp_packages'])))
    ;(await find('[data-testid="timbres-cambiar"]')).click()
    await find('[data-testid="timbres-cambio"]')
    await flush()
    choose(400)
    await flush()
    const confirm = document.querySelector('[data-testid="timbres-confirmar"]')
    confirm.click()
    await flush()
    confirm.click()
    await flush()
    const keys = state.mutate.mock.calls.map(([, body]) => body.idempotency_key)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('Boat’s refusal of a smaller package says why and changes nothing', async () => {
    seams({
      quote: {
        ok: false,
        reason: 'stamps_in_use',
        message:
          'Este mes ya usaste 200 timbres y con el paquete de 50 tendrías 50. Elige uno más grande, o bájalo a partir del 1 de diciembre de 2026.',
        next: null,
      },
    })
    mountTienda(readyDoor(boot(['stamp_packages'])))
    ;(await find('[data-testid="timbres-cambiar"]')).click()
    await find('[data-testid="timbres-cambio"]')
    await flush()
    choose(50)
    await flush()
    const refused = await find('[data-testid="timbres-negado"]')
    expect(refused.textContent).toContain('Este mes ya usaste 200 timbres')
    // Next to the packages, before the rules: in sight of the choice.
    expect(refused.closest('[data-testid="timbres-resultado"]')).not.toBeNull()
    const rules = document.querySelector('[data-testid="timbres-reglas"]')
    expect(
      refused.compareDocumentPosition(rules) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    const confirm = document.querySelector('[data-testid="timbres-confirmar"]')
    expect(confirm.disabled).toBe(true)
    expect(confirm.textContent).toBe('Choose another package')
    expect(state.mutate).not.toHaveBeenCalled()
  })

  it('Boat’s package line replaces «Se mide por timbre», which stays without the capability', async () => {
    const perStamp = (caps) => {
      const data = boot(caps)
      data.store.addons = [{ ...CFDI_ADDON, meter_unit: 'stamp', active: true }]
      return data
    }
    seams()
    mountTienda(readyDoor(perStamp(['stamp_packages'])))
    await find('[data-testid="timbres-paquete"]')
    const row = () =>
      root.querySelector('[data-testid="cuenta-complementos"] li').textContent
    expect(row()).not.toContain('Measured per')
    app.unmount()
    root.remove()
    mountTienda(readyDoor(perStamp(null)))
    await find('[data-testid="cuenta-complementos"]')
    await flush()
    expect(row()).toContain('Measured per')
  })

  it('a tapped package’s answer comes into the sheet’s view; nothing moves when it shows', async () => {
    seams({
      quote: (payload) =>
        payload.package_qty === 50
          ? {
              ok: false,
              reason: 'stamps_in_use',
              message: 'Este mes ya usaste 87 timbres.',
              next: null,
            }
          : UP,
    })
    const scrollTo = vi.fn()
    state.box = {
      clientHeight: 300,
      scrollTop: 40,
      getBoundingClientRect: () => ({ top: 100 }),
      scrollTo,
    }
    mountTienda(readyDoor(boot(['stamp_packages'])))
    ;(await find('[data-testid="timbres-cambiar"]')).click()
    await find('[data-testid="timbres-cambio"]')
    await flush()
    const outcome = document.querySelector('[data-testid="timbres-resultado"]')
    let top = 600
    outcome.getBoundingClientRect = () => ({ top })
    Object.defineProperty(outcome, 'offsetHeight', { value: 400 })
    // Opening on the package held reads Boat's answer without moving the sheet.
    expect(scrollTo).not.toHaveBeenCalled()
    choose(400)
    await flush()
    // Its first 140 px rise to the sheet's foot: 40 + (500 + 140) - 300 + 16.
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo.mock.calls[0][0].top).toBe(396)
    // Already in sight: the refusal of a smaller one shows where it is.
    top = 120
    choose(50)
    await flush()
    expect(await find('[data-testid="timbres-negado"]')).not.toBeNull()
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it('a confirm that does not go through is brought into view, with the same key kept', async () => {
    seams()
    state.mutate.mockRejectedValueOnce(new Error('timeout'))
    const scrollTo = vi.fn()
    state.box = {
      clientHeight: 300,
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 0 }),
      scrollTo,
    }
    mountTienda(readyDoor(boot(['stamp_packages'])))
    ;(await find('[data-testid="timbres-cambiar"]')).click()
    await find('[data-testid="timbres-cambio"]')
    await flush()
    choose(400)
    await flush()
    const outcome = document.querySelector('[data-testid="timbres-resultado"]')
    // The charge shows; the alert that follows it lands under the sheet's foot.
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        return { top: this.getAttribute('role') === 'alert' ? 700 : 0 }
      })
    document.querySelector('[data-testid="timbres-confirmar"]').click()
    await flush()
    rect.mockRestore()
    // The lost call says so under the packages, not past the rules.
    expect(outcome.querySelector('[role="alert"]').textContent).toContain(
      'timeout',
    )
    expect(scrollTo).toHaveBeenCalled()
    expect(state.mutate).toHaveBeenCalledTimes(1)
  })

  it('a package Boat does not sell here cannot be chosen and says why', async () => {
    seams()
    mountTienda(readyDoor(boot(['stamp_packages'])))
    ;(await find('[data-testid="timbres-cambiar"]')).click()
    const sheet = await find('[data-testid="timbres-cambio"]')
    await flush()
    const row = sheet.querySelector('[data-qty="1000"]')
    expect(row.querySelector('input').disabled).toBe(true)
    expect(row.getAttribute('aria-disabled')).toBe('true')
    expect(row.textContent).toContain(
      'Tu plan permite hasta 500 timbres al mes',
    )
  })

  it('turning CFDI on opens the same sheet and sends the package chosen', async () => {
    seams({
      held: OFF,
      quote: (payload) => ({
        ...ACTIVATE,
        package_target: payload.package_qty,
      }),
    })
    state.mutate.mockResolvedValue({
      site: 'shop',
      service_key: 'cfdi_timbres',
      status: 'Active',
      package_qty: 50,
      note: 'Solicitado.',
      consent: 'PC-2',
    })
    state.read.mockResolvedValue(boot(['stamp_packages'], { active: false }))
    mountTienda(readyDoor(boot(['stamp_packages'], { active: false })))
    ;(await find('[data-testid="complemento-cfdi_timbres"]')).click()
    const sheet = await find('[data-testid="timbres-cambio"]')
    await flush()
    expect(
      document.querySelector('[data-testid="cuenta-confirmar"]'),
    ).toBeNull()
    expect(sheet.closest('[role="dialog"]').getAttribute('aria-label')).toBe(
      'Turn on CFDI',
    )
    expect(sheet.textContent).toContain('Nothing is charged today.')
    expect(sheet.textContent).toContain(
      'The month it is ready is charged whole',
    )
    const confirm = document.querySelector('[data-testid="timbres-confirmar"]')
    expect(confirm.textContent).toBe('Turn on CFDI')
    confirm.click()
    await flush()
    expect(state.mutate).toHaveBeenCalledWith(
      'toggle_addon',
      expect.objectContaining({ action: 'activate', package_qty: 50 }),
    )
    expect(state.toast).toHaveBeenCalledWith('CFDI turned on')
  })

  it('a CFDI turned off opens with nothing chosen; a smaller size names the resume and its consent', async () => {
    seams({
      held: KEPT,
      quote: (payload) =>
        payload.package_qty === 400
          ? KEPT_RESUME
          : payload.package_qty === 150
            ? KEPT_DOWN
            : { ...KEPT_UP, package_target: payload.package_qty },
    })
    state.mutate.mockResolvedValue({ ...KEPT_DOWN, consent: 'PC-3' })
    state.read.mockResolvedValue(boot(['stamp_packages']))
    const kept = {
      state: 'kept',
      package_qty: 400,
      included: 400,
      used: 120,
      scheduled: null,
      kept_until: '2026-11-30',
    }
    mountTienda(readyDoor(boot(['stamp_packages'], { stamps: kept })))
    ;(await find('[data-testid="timbres-cambiar"]')).click()
    const sheet = await find('[data-testid="timbres-cambio"]')
    await flush()
    expect(state.seam).toHaveBeenCalledTimes(1) // nothing quoted before a tap
    const confirm = document.querySelector('[data-testid="timbres-confirmar"]')
    expect(confirm.disabled).toBe(true)
    expect(confirm.textContent).toBe('Choose a package')
    expect(sheet.querySelector('input:checked')).toBeNull()
    choose(400)
    await flush()
    expect(confirm.textContent).toBe('Resume CFDI')
    expect(
      document.querySelector('[data-testid="timbres-consentimiento"]'),
    ).toBeNull()
    choose(150)
    await flush()
    expect(sheet.textContent).toContain(
      'CFDI turns back on: it no longer turns off on',
    )
    expect(sheet.textContent).not.toContain('You save')
    expect(
      document.querySelector('[data-testid="timbres-consentimiento"]')
        .textContent,
    ).toContain('$375.00 a month, IVA included')
    expect(confirm.textContent).toBe('Resume with 150 stamps')
    confirm.click()
    await flush()
    expect(state.mutate).toHaveBeenCalledWith(
      'toggle_addon',
      expect.objectContaining({ action: 'activate', package_qty: 150 }),
    )
    expect(state.toast).toHaveBeenCalledWith(
      'CFDI resumed with 150 stamps a month',
    )
  })

  it('a smaller package scheduled: the row says when, and the sheet opens on it with nothing to confirm', async () => {
    seams({
      held: SCHEDULED,
      quote: (payload) =>
        payload.package_qty === 150
          ? {
              ...SCHEDULED,
              message:
                'Ese cambio ya está programado para el 1 de diciembre de 2026.',
            }
          : payload.package_qty === 400
            ? {
                ...SCHEDULED,
                changed: true,
                direction: 'cancel',
                package_target: 400,
                message:
                  'Cancelas el cambio programado; sigues con 400 timbres al mes.',
              }
            : UP,
    })
    mountTienda(
      readyDoor(
        boot(['stamp_packages'], {
          stamps: {
            state: 'active',
            package_qty: 400,
            included: 400,
            used: 20,
            scheduled: SCHEDULED.scheduled,
            kept_until: null,
          },
        }),
      ),
    )
    const line = await find('[data-testid="timbres-programado"]')
    expect(line.textContent).toContain('Goes down to 150 stamps a month on')
    root.querySelector('[data-testid="timbres-cambiar"]').click()
    const sheet = await find('[data-testid="timbres-cambio"]')
    await flush()
    expect(state.seam).toHaveBeenCalledWith('stamp_package_quote', {
      package_qty: 150,
    })
    expect(sheet.querySelector('[data-qty="150"] input').checked).toBe(true)
    expect(sheet.textContent).toContain('Ese cambio ya está programado')
    const confirm = document.querySelector('[data-testid="timbres-confirmar"]')
    expect(confirm.disabled).toBe(true)
    // Keeping the package held is its own words, never a second «Cancelar».
    choose(400)
    await flush()
    expect(confirm.textContent).toBe('Keep 400 stamps')
    expect(confirm.disabled).toBe(false)
    expect(state.mutate).not.toHaveBeenCalled()
  })

  it('Boat’s seam switched off closes the sheet', async () => {
    state.seam.mockResolvedValue({
      ok: false,
      reason: 'disabled',
      message: 'x',
    })
    mountTienda(readyDoor(boot(['stamp_packages'])))
    ;(await find('[data-testid="timbres-cambiar"]')).click()
    await flush()
    expect(document.querySelector('[data-testid="timbres-cambio"]')).toBeNull()
    expect(state.mutate).not.toHaveBeenCalled()
  })
})
