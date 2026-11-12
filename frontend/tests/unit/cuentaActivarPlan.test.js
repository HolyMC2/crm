// «Activar plan» with the plan and cycle chosen inside the sheet (Boat's
// capability «activation_choice»): without it the sheet is today's; with it the
// owner reads Boat's plans, picks one and Mensual or Anual, every move asks Boat
// for the total again, and «Pagar $X» sends the choice with the total on screen.
// A total Boat no longer backs comes back as a new quote, nothing charged.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({ read: vi.fn(), mutate: vi.fn() }))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled'],
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

import { createPagos } from '@/components/cuenta/pagos'
import ActivarSheet from '@/components/cuenta/ActivarSheet.vue'
import {
  cycleChoices,
  cycleNote,
  planCards,
  sameChoice,
} from '@/components/cuenta/activarPlan'

const READY = {
  status: 'ready',
  next_action: 'activate',
  authoritative: true,
  site_status: 'Active',
  is_trial: true,
  invoices: {},
}
const OPTIONS = [
  {
    plan: 'Basico',
    plan_name: 'Básico',
    current: true,
    monthly_price_mxn: 299,
    yearly_price_mxn: 2990,
    yearly_saving_mxn: 598,
    users: 2,
    cajas: 1,
    storage_gb: 5,
    apps: [],
    available: true,
    message: null,
  },
  {
    plan: 'Pro',
    plan_name: 'Pro',
    current: false,
    monthly_price_mxn: 499,
    yearly_price_mxn: 4990,
    yearly_saving_mxn: 998,
    users: 5,
    cajas: 3,
    storage_gb: 15,
    apps: ['Taller'],
    available: true,
    message: null,
  },
  {
    plan: 'Esencial',
    plan_name: 'Esencial',
    current: false,
    monthly_price_mxn: 199,
    yearly_price_mxn: null,
    yearly_saving_mxn: null,
    users: 1,
    cajas: 1,
    storage_gb: 2,
    apps: [],
    available: false,
    message: 'Tienes 2 usuarios activos y el plan Esencial permite 1.',
  },
]
const PRICES = { 'Basico|Mensual': 448, 'Pro|Mensual': 648, 'Pro|Anual': 5139 }

function quoteFor(plan = 'Basico', cycle = 'Mensual', extra = {}) {
  const amount = PRICES[`${plan}|${cycle}`]
  return {
    ok: true,
    amount_mxn: amount,
    lines: [
      {
        label: cycle === 'Anual' ? `Plan ${plan} — anualidad` : `Plan ${plan}`,
        amount_mxn: amount - 149,
        kind: 'base_fee',
      },
      { label: 'Servicio Tienda en línea', amount_mxn: 149, kind: 'addon' },
    ],
    period: { start: '2026-11-01', end: '2026-11-30' },
    billing_cycle: cycle,
    choice: { plan, plan_name: plan, billing_cycle: cycle, pending: false },
    options: OPTIONS,
    ...extra,
  }
}

function boot(capabilities = ['activation_choice']) {
  return {
    site: { name: 'shop', status: 'Active', plan: 'Basico', is_trial: 1 },
    meters: {
      billing: { is_trial: true, monthly_price_mxn: 299, trial_days_left: 5 },
    },
    capabilities,
    payment_state: READY,
  }
}

let app, root
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
function mount(door) {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({ render: () => h(ActivarSheet, { door, open: true }) })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
}
const pay = () => root.querySelector('[data-testid="activar-pagar"]')
const radio = (plan) =>
  root.querySelector(`[data-plan="${plan}"] input[type="radio"]`)
const segment = (label) =>
  [...root.querySelectorAll('[role="radio"]')].find(
    (b) => b.textContent.trim() === label,
  )

function door(capabilities) {
  const d = createPagos({
    read: (...args) => state.read(...args),
    mutate: (...args) => state.mutate(...args),
    navigate: vi.fn(),
  })
  d.boot.value = boot(capabilities)
  d.loading.value = false
  d.resolvePaymentState(READY)
  return d
}

function boatQuotes() {
  state.read.mockImplementation(async (fn, params) => {
    if (fn === 'payment_methods') return { cards: [] }
    if (fn !== 'activation_quote') return {}
    return params?.plan
      ? quoteFor(params.plan, params.billing_cycle)
      : quoteFor()
  })
}

beforeEach(() => {
  state.read.mockReset()
  state.mutate.mockReset()
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
})

describe('the plan cards and the cycle, in the owner’s words', () => {
  it('reads Boat’s plans with what each includes and why one does not fit', () => {
    const cards = planCards(OPTIONS, { plan: 'Pro', cycle: 'Mensual' })
    expect(cards.map((c) => [c.name, c.price, c.per, c.selected])).toEqual([
      ['Básico', '$299.00', 'a month, IVA included', false],
      ['Pro', '$499.00', 'a month, IVA included', true],
      ['Esencial', '$199.00', 'a month, IVA included', false],
    ])
    expect(cards[1].includes).toBe('5 users, 3 registers and 15 GB')
    expect(cards[1].apps).toBe('Includes Taller')
    expect(cards[0].current).toBe(true)
    expect(cards[2].available).toBe(false)
    expect(cards[2].reason).toBe(
      'Tienes 2 usuarios activos y el plan Esencial permite 1.',
    )
    expect(planCards(null, null)).toEqual([])
  })

  it('offers yearly only where Boat prices it, with its saving', () => {
    expect(cycleChoices(OPTIONS[1]).map((c) => c.value)).toEqual([
      'Mensual',
      'Anual',
    ])
    expect(cycleChoices(OPTIONS[2])).toEqual([])
    expect(cycleNote(OPTIONS[1], 'Anual')).toBe(
      '$4,990.00 a year, IVA included. You save $998.00 compared with paying monthly.',
    )
    expect(cycleNote(OPTIONS[1], 'Mensual')).toBe(
      'Paying yearly: $4,990.00, IVA included; you save $998.00.',
    )
    expect(cycleNote({ ...OPTIONS[1], yearly_saving_mxn: 0 }, 'Mensual')).toBe(
      'Paying yearly: $4,990.00, IVA included.',
    )
    expect(cycleNote(OPTIONS[2], 'Mensual')).toBe(
      'This plan is paid monthly only.',
    )
    expect(
      sameChoice(
        { plan: 'Pro', cycle: 'Anual' },
        { plan: 'Pro', cycle: 'Anual' },
      ),
    ).toBe(true)
    expect(sameChoice({ plan: 'Pro', cycle: 'Anual' }, null)).toBe(false)
  })
})

describe('ActivarSheet without «activation_choice»', () => {
  it('is today’s sheet: one quote read, no cards, «Pay» sends no choice', async () => {
    state.read.mockImplementation(async (fn) =>
      fn === 'activation_quote'
        ? {
            ok: true,
            amount_mxn: 448,
            lines: [{ label: 'Plan Basico', amount_mxn: 448 }],
          }
        : { cards: [] },
    )
    state.mutate.mockResolvedValue({ checkout_url: 'https://pay.test/c' })
    const d = door([])
    await d.openActivation()
    mount(d)
    await flush()
    expect(state.read).toHaveBeenCalledWith('activation_quote')
    expect(
      state.read.mock.calls.find(([fn]) => fn === 'activation_quote'),
    ).toHaveLength(1)
    expect(root.querySelector('[data-testid="activar-planes"]')).toBeNull()
    expect(pay().textContent).toBe('Pay')
    pay().click()
    await flush()
    expect(state.mutate).toHaveBeenCalledWith('activate_plan', {
      use_saved_card: 0,
      panel: 'cuenta',
    })
  })
})

describe('ActivarSheet with «activation_choice»', () => {
  it('opens on the trial’s plan, then Pro, then yearly, and pays that total', async () => {
    boatQuotes()
    state.mutate.mockResolvedValue({ checkout_url: 'https://pay.test/c' })
    const d = door()
    await d.openActivation()
    mount(d)
    await flush()
    expect(state.read).toHaveBeenCalledWith('activation_quote', { choose: 1 })
    expect(root.querySelector('h2').textContent).toBe('Activate plan Básico')
    expect(radio('Basico').checked).toBe(true)
    expect(radio('Esencial').disabled).toBe(true)
    // Every card's price says IVA; a plan that does not fit reads muted.
    for (const price of root.querySelectorAll(
      '[data-testid="activar-plan-precio"]',
    ))
      expect(price.textContent).toContain('a month, IVA included')
    const esencial = root.querySelector('[data-plan="Esencial"]')
    expect(esencial.getAttribute('aria-disabled')).toBe('true')
    expect(esencial.className).toContain('border-dashed')
    expect(esencial.querySelector('.text-ink-gray-5').textContent).toBe(
      'Esencial',
    )
    expect(
      root.querySelector('[data-plan="Pro"]').getAttribute('aria-disabled'),
    ).toBeNull()
    expect(root.textContent).toContain(
      'Tienes 2 usuarios activos y el plan Esencial permite 1.',
    )
    expect(pay().textContent).toBe('Pay $448.00')

    radio('Pro').click()
    await flush()
    expect(state.read).toHaveBeenCalledWith('activation_quote', {
      plan: 'Pro',
      billing_cycle: 'Mensual',
      choose: 1,
    })
    expect(root.querySelector('h2').textContent).toBe('Activate plan Pro')
    expect(pay().textContent).toBe('Pay $648.00')

    segment('Yearly').click()
    await flush()
    expect(state.read).toHaveBeenCalledWith('activation_quote', {
      plan: 'Pro',
      billing_cycle: 'Anual',
      choose: 1,
    })
    expect(
      root.querySelector('[data-testid="activar-monto"]').textContent,
    ).toBe('$5,139.00')
    expect(root.textContent).toContain('IVA included')
    expect(root.textContent).toContain('The annual fee covers 12 months')
    expect(
      root.querySelector('[data-testid="activar-ciclo-nota"]').textContent,
    ).toContain('You save $998.00')
    expect(pay().textContent).toBe('Pay $5,139.00')

    pay().click()
    await flush()
    expect(state.mutate).toHaveBeenCalledWith('activate_plan', {
      use_saved_card: 0,
      panel: 'cuenta',
      plan: 'Pro',
      billing_cycle: 'Anual',
      amount_mxn: '5139',
    })
    expect(d.boot.value).toBeTruthy()
  })

  it('a moved total comes back as the new quote and nothing is charged', async () => {
    boatQuotes()
    const d = door()
    await d.openActivation()
    mount(d)
    await flush()
    state.mutate.mockResolvedValue({
      ok: false,
      reason: 'quote_changed',
      code: 'quote_changed',
      message: 'El importe cambió. Revisa el nuevo total antes de pagar.',
      quote: {
        ...quoteFor(),
        amount_mxn: 460,
        lines: [{ label: 'Plan Basico', amount_mxn: 460 }],
      },
    })
    pay().click()
    await flush()
    expect(root.textContent).toContain(
      'El importe cambió. Revisa el nuevo total antes de pagar.',
    )
    expect(pay().textContent).toBe('Pay $460.00')
    expect(pay().disabled).toBe(false)
    expect(d.activationLocked.value).toBe(false)
  })

  it('a plan Boat refuses says Boat’s words and keeps «Pay» off', async () => {
    state.read.mockImplementation(async (fn, params) => {
      if (fn === 'payment_methods') return { cards: [] }
      if (params?.plan === 'Pro')
        return {
          ok: false,
          reason: 'capacity',
          message: 'Este cambio necesita más capacidad en tu servidor.',
          options: OPTIONS,
        }
      return quoteFor()
    })
    const d = door()
    await d.openActivation()
    mount(d)
    await flush()
    radio('Pro').click()
    await flush()
    expect(
      root.querySelector('[data-testid="activar-eleccion-aviso"]').textContent,
    ).toContain('Este cambio necesita más capacidad en tu servidor.')
    expect(root.querySelector('[data-testid="activar-monto"]')).toBeNull()
    expect(pay().disabled).toBe(true)
    pay().click()
    await flush()
    expect(state.mutate).not.toHaveBeenCalled()
  })

  it('only the answer to the latest choice counts', async () => {
    let releasePro
    state.read.mockImplementation(async (fn, params) => {
      if (fn === 'payment_methods') return { cards: [] }
      if (params?.plan === 'Pro' && params.billing_cycle === 'Mensual')
        return new Promise((resolve) => {
          releasePro = () => resolve(quoteFor('Pro', 'Mensual'))
        })
      return params?.plan
        ? quoteFor(params.plan, params.billing_cycle)
        : quoteFor()
    })
    const d = door()
    await d.openActivation()
    mount(d)
    await flush()
    radio('Pro').click()
    await flush()
    d.choosePlan('Basico')
    await flush()
    releasePro()
    await flush()
    expect(d.activationChoice.value).toEqual({
      plan: 'Basico',
      cycle: 'Mensual',
    })
    expect(pay().textContent).toBe('Pay $448.00')
  })

  it('an open payment for the earlier choice continues it, another choice pays anew', async () => {
    state.read.mockImplementation(async (fn, params) => {
      if (fn === 'payment_methods') return { cards: [] }
      return params?.plan
        ? quoteFor(params.plan, params.billing_cycle)
        : quoteFor('Pro', 'Mensual', {
            choice: {
              plan: 'Pro',
              plan_name: 'Pro',
              billing_cycle: 'Mensual',
              pending: true,
            },
          })
    })
    state.mutate.mockResolvedValue({ checkout_url: 'https://pay.test/new' })
    const d = door()
    d.resolvePaymentState({
      ...READY,
      status: 'checkout',
      next_action: 'continue_checkout',
      checkout_url: 'https://pay.test/open',
      checkout_session: {
        status: 'open',
        payment_status: 'unpaid',
        capture_safe: true,
      },
    })
    await d.openActivation()
    mount(d)
    await flush()
    expect(
      root.querySelector('[data-testid="activar-continuar"]'),
    ).not.toBeNull()
    expect(pay()).toBeNull()
    expect(root.querySelector('[data-testid="activar-cambio"]')).toBeNull()
    segment('Yearly').click()
    await flush()
    expect(root.querySelector('[data-testid="activar-continuar"]')).toBeNull()
    expect(pay().disabled).toBe(false)
    // One sentence about the open page, none of the lock's buttons, and the
    // way to pay free again.
    const cambio = root.querySelector('[data-testid="activar-cambio"]')
    expect(cambio.textContent).toContain(
      'we close the payment left open for your earlier choice; nothing is charged twice',
    )
    expect(pay().getAttribute('aria-describedby')).toBe('cuenta-activar-cambio')
    expect(root.querySelector('#cuenta-activar-motivo')).toBeNull()
    expect(root.textContent).not.toContain('Continue the same payment')
    const labels = [...root.querySelectorAll('button')].map((b) =>
      b.textContent.trim(),
    )
    expect(labels).not.toContain('Check status')
    expect(labels).not.toContain('Check the payment with support')
    pay().click()
    await flush()
    expect(state.mutate).toHaveBeenCalledWith(
      'activate_plan',
      expect.objectContaining({
        plan: 'Pro',
        billing_cycle: 'Anual',
        amount_mxn: '5139',
      }),
    )
  })

  it('a page just opened for one choice is never continued for another', async () => {
    boatQuotes()
    state.mutate.mockResolvedValue({ checkout_url: 'https://pay.test/pro' })
    const d = door()
    await d.openActivation()
    mount(d)
    await flush()
    radio('Pro').click()
    await flush()
    pay().click()
    await flush()
    // Back from the processor's page without paying: it continues Pro mensual.
    expect(
      root.querySelector('[data-testid="activar-continuar"]'),
    ).not.toBeNull()
    expect(root.querySelector('[data-testid="activar-cambio"]')).toBeNull()
    segment('Yearly').click()
    await flush()
    // Pro anual is a new choice: no «Continue» to the Pro mensual page, the
    // sentence about closing it, and «Pay» the new total.
    expect(root.querySelector('[data-testid="activar-continuar"]')).toBeNull()
    expect(root.querySelector('[data-testid="activar-cambio"]')).not.toBeNull()
    expect(pay().textContent).toBe('Pay $5,139.00')
    expect(pay().disabled).toBe(false)
    state.mutate.mockClear()
    pay().click()
    await flush()
    expect(state.mutate).toHaveBeenCalledWith(
      'activate_plan',
      expect.objectContaining({
        plan: 'Pro',
        billing_cycle: 'Anual',
        amount_mxn: '5139',
      }),
    )
  })

  it('a saved card can pay the new choice while the earlier one’s page is open', async () => {
    state.read.mockImplementation(async (fn, params) => {
      if (fn === 'payment_methods')
        return { cards: [{ id: 'card-1', brand: 'Visa', last4: '4242' }] }
      return params?.plan
        ? quoteFor(params.plan, params.billing_cycle)
        : quoteFor('Pro', 'Mensual', {
            choice: {
              plan: 'Pro',
              plan_name: 'Pro',
              billing_cycle: 'Mensual',
              pending: true,
            },
          })
    })
    state.mutate.mockResolvedValue({ converted: true, ok: true })
    const d = door()
    d.resolvePaymentState({
      ...READY,
      status: 'checkout',
      next_action: 'continue_checkout',
      checkout_url: 'https://pay.test/open',
      checkout_session: {
        status: 'open',
        payment_status: 'unpaid',
        capture_safe: true,
      },
    })
    await d.openActivation()
    mount(d)
    await flush()
    const saved = root.querySelector('input[value="saved"]')
    expect(saved.disabled).toBe(true)
    segment('Yearly').click()
    await flush()
    expect(saved.disabled).toBe(false)
    saved.click()
    await flush()
    pay().click()
    await flush()
    expect(state.mutate).toHaveBeenCalledWith(
      'activate_plan',
      expect.objectContaining({ use_saved_card: 1, billing_cycle: 'Anual' }),
    )
  })

  it('paid with the saved card, the sheet closes and says the plan and cycle once', async () => {
    let converted = false
    state.read.mockImplementation(async (fn, params) => {
      if (fn === 'payment_methods')
        return { cards: [{ id: 'card-1', brand: 'Visa', last4: '4242' }] }
      if (fn === 'bootstrap')
        return converted
          ? {
              ...boot([]),
              site: { name: 'shop', status: 'Active', plan: 'Pro' },
              meters: { billing: { is_trial: false, billing_cycle: 'Anual' } },
              payment_state: { ...READY, is_trial: false },
            }
          : boot()
      return params?.plan
        ? quoteFor(params.plan, params.billing_cycle)
        : quoteFor()
    })
    state.mutate.mockImplementation(async () => {
      converted = true
      return { ok: true, converted: true }
    })
    const { toast } = await import('frappe-ui')
    toast.success.mockClear()
    const d = door()
    await d.openActivation()
    mount(d)
    await flush()
    radio('Pro').click()
    await flush()
    segment('Yearly').click()
    await flush()
    root.querySelector('input[value="saved"]').click()
    await flush()
    pay().click()
    await flush()
    expect(state.mutate).toHaveBeenCalledWith(
      'activate_plan',
      expect.objectContaining({
        use_saved_card: 1,
        plan: 'Pro',
        billing_cycle: 'Anual',
        amount_mxn: '5139',
      }),
    )
    expect(d.activationOpen.value).toBe(false)
    expect(d.activated.value).toBe('Your plan Pro is active, paid yearly.')
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(
      'Your plan Pro is active, paid yearly.',
    )
  })

  it('a payment that did not convert leaves the sheet open and says nothing', async () => {
    boatQuotes()
    state.mutate.mockResolvedValue({ ok: true, converted: true })
    const { toast } = await import('frappe-ui')
    toast.success.mockClear()
    const d = door()
    await d.openActivation()
    mount(d)
    await flush()
    // Boat's account still reads a trial (the read failed or lags): no claim.
    state.read.mockImplementation(async (fn) =>
      fn === 'bootstrap' ? boot() : quoteFor(),
    )
    pay().click()
    await flush()
    expect(d.activationOpen.value).toBe(true)
    expect(d.activated.value).toBe('')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('a first read that fails offers «Volver a intentar» and reads again', async () => {
    let fail = true
    state.read.mockImplementation(async (fn, params) => {
      if (fn === 'payment_methods') return { cards: [] }
      if (fail) throw new Error('timeout')
      return params?.plan
        ? quoteFor(params.plan, params.billing_cycle)
        : quoteFor()
    })
    const d = door()
    await d.openActivation()
    mount(d)
    await flush()
    expect(root.querySelector('[data-testid="activar-planes"]')).toBeNull()
    expect(
      root.querySelector('[data-testid="activar-eleccion-aviso"]').textContent,
    ).toContain('We could not work out the amount.')
    expect(pay().disabled).toBe(true)
    fail = false
    root.querySelector('[data-testid="activar-reintentar"]').click()
    await flush()
    expect(state.read).toHaveBeenLastCalledWith('activation_quote', {
      choose: 1,
    })
    expect(root.querySelector('[data-testid="activar-reintentar"]')).toBeNull()
    expect(root.querySelector('[data-testid="activar-planes"]')).not.toBeNull()
    expect(pay().textContent).toBe('Pay $448.00')
  })

  it('a failed read for the chosen card retries that same choice', async () => {
    let failPro = true
    state.read.mockImplementation(async (fn, params) => {
      if (fn === 'payment_methods') return { cards: [] }
      if (params?.plan === 'Pro' && failPro) return { ok: false }
      return params?.plan
        ? quoteFor(params.plan, params.billing_cycle)
        : quoteFor()
    })
    const d = door()
    await d.openActivation()
    mount(d)
    await flush()
    radio('Pro').click()
    await flush()
    expect(pay().disabled).toBe(true)
    // Tapping the same card again changes nothing; the button reads again.
    radio('Pro').click()
    await flush()
    expect(
      state.read.mock.calls.filter(([, p]) => p?.plan === 'Pro'),
    ).toHaveLength(1)
    failPro = false
    root.querySelector('[data-testid="activar-reintentar"]').click()
    await flush()
    expect(state.read).toHaveBeenLastCalledWith('activation_quote', {
      plan: 'Pro',
      billing_cycle: 'Mensual',
      choose: 1,
    })
    expect(pay().textContent).toBe('Pay $648.00')
  })

  it('a refusal Boat means is said without «Volver a intentar»', async () => {
    state.read.mockImplementation(async (fn, params) => {
      if (fn === 'payment_methods') return { cards: [] }
      if (params?.plan === 'Pro')
        return {
          ok: false,
          reason: 'capacity',
          message: 'Este cambio necesita más capacidad en tu servidor.',
          options: OPTIONS,
        }
      return quoteFor()
    })
    const d = door()
    await d.openActivation()
    mount(d)
    await flush()
    radio('Pro').click()
    await flush()
    expect(root.querySelector('[data-testid="activar-reintentar"]')).toBeNull()
  })

  it('switched off while open, the sheet becomes today’s without asking to reload', async () => {
    boatQuotes()
    const d = door()
    await d.openActivation()
    mount(d)
    await flush()
    state.mutate.mockResolvedValue({
      ok: false,
      reason: 'disabled',
      code: 'disabled',
      message: 'Elegir el plan al activar aún no está disponible.',
    })
    state.read.mockImplementation(async (fn) => {
      if (fn === 'bootstrap') return boot([])
      if (fn === 'payment_methods') return { cards: [] }
      if (fn === 'activation_quote')
        return {
          ok: true,
          amount_mxn: 448,
          lines: [{ label: 'Plan Basico', amount_mxn: 448 }],
        }
      return {}
    })
    pay().click()
    await flush()
    expect(state.read).toHaveBeenCalledWith('bootstrap', { require_fresh: 1 })
    expect(state.read).toHaveBeenLastCalledWith('activation_quote')
    expect(root.querySelector('[data-testid="activar-planes"]')).toBeNull()
    expect(root.textContent).not.toContain('Elegir el plan al activar')
    expect(pay().textContent).toBe('Pay')
    expect(pay().disabled).toBe(false)
  })
})
