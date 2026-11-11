// Mi cuenta's payment door (components/cuenta/pagos.js) keeps Mi plan's payment
// semantics (doco tests/miplan-payments.test.cjs): holds, the activation lock,
// polling, «Revisar estado», provisioning, continuations. Reads, payments,
// redirects and timers are recorded, never real.
import { describe, expect, it, vi } from 'vitest'
import {
  POLL_MS,
  checkoutUrl,
  createPagos,
  safeContinuation,
  validateTopup,
} from '@/components/cuenta/pagos'

function boatState(status, overrides = {}) {
  return {
    status,
    reason:
      status === 'checkout' ? 'checkout_open_unpaid' : 'no_pending_capture',
    message:
      status === 'checkout'
        ? 'Tu pago todavía no se completa.'
        : 'No hay un pago en proceso.',
    next_action:
      status === 'checkout'
        ? 'continue_checkout'
        : status === 'ready'
          ? 'pay'
          : 'refresh_or_support',
    checkout_url: null,
    invoice: 'INV-1',
    checkout_session:
      status === 'checkout'
        ? { status: 'open', payment_status: 'unpaid', capture_safe: true }
        : null,
    support_url: 'https://support.test/payments',
    authoritative: true,
    ...overrides,
  }
}

function boatEnvelope(state) {
  return {
    ...state,
    site_status: 'Active',
    is_trial: true,
    invoices: {
      [state.invoice || 'INV-1']: {
        ...state,
        next_action: state.status === 'ready' ? 'pay' : state.next_action,
        invoice_status: 'Draft',
        amount_mxn: 348,
      },
    },
  }
}

function setup(result, options = {}) {
  const calls = []
  const reads = []
  const redirects = []
  const timers = new Map()
  let timerId = 0
  let support = 0
  const bootstrap = options.bootstrap || {
    site: { name: 'trial-a', plan: 'Pro', is_trial: true },
    meters: { billing: { is_trial: true, monthly_price_mxn: 300 } },
    payment_state: boatEnvelope(
      boatState('ready', { next_action: 'activate' }),
    ),
  }
  const door = createPagos({
    read: async (method, params) => {
      reads.push({ method, params })
      if (method === 'payment_methods') return { ok: true, cards: [] }
      if (method === 'activation_quote')
        return options.quote ?? { ok: false, reason: 'unavailable' }
      if (options.readReject) throw new Error(options.readReject)
      if (method === 'payment_state') {
        const state = options.paymentState || bootstrap.payment_state
        return typeof state === 'function' ? state() : state
      }
      return typeof options.bootstrap === 'function'
        ? options.bootstrap()
        : bootstrap
    },
    mutate: async (method, params) => {
      calls.push({ method, params })
      if (options.reject) throw new Error(options.reject)
      return typeof result === 'function' ? result() : result
    },
    navigate: (url) => redirects.push(url),
    openSupport: () => {
      support++
      return options.support !== false
    },
    timers: {
      set: (fn) => {
        const id = ++timerId
        timers.set(id, fn)
        return id
      },
      clear: (id) => timers.delete(id),
    },
  })
  if (!options.initial) {
    door.boot.value = bootstrap
    door.loading.value = false
    door.resolvePaymentState(bootstrap.payment_state)
  }
  return {
    ...door,
    calls,
    reads,
    redirects,
    timers,
    support: () => support,
    poll: async () => {
      const [id, fn] = timers.entries().next().value
      timers.delete(id)
      await fn()
    },
  }
}

describe('checkout links', () => {
  it('only plain https leaves for the processor', () => {
    expect(checkoutUrl('https://pay.test/c')).toBe('https://pay.test/c')
    expect(checkoutUrl('http://pay.test/c')).toBe('')
    expect(checkoutUrl('https://user:pw@pay.test/c')).toBe('')
    expect(checkoutUrl('javascript:alert(1)')).toBe('')
  })

  it('a continuation needs Boat to say the same session is safe', () => {
    const state = boatState('checkout', { checkout_url: 'https://pay.test/s' })
    expect(safeContinuation(state)).toBe('https://pay.test/s')
    expect(safeContinuation({ ...state, authoritative: false })).toBe('')
    expect(
      safeContinuation({
        ...state,
        checkout_session: { ...state.checkout_session, capture_safe: false },
      }),
    ).toBe('')
  })

  it('a top-up amount must sit inside the platform bounds', () => {
    expect(validateTopup('', 50, 1000).ok).toBe(false)
    expect(validateTopup('20', 50, 1000, (v) => `$${v}`).error).toBe(
      'The minimum amount is $50.',
    )
    expect(validateTopup('2000', 50, 1000, (v) => `$${v}`).error).toBe(
      'The maximum amount is $1000.',
    )
    expect(validateTopup('200', 50, 1000)).toEqual({ ok: true, error: '' })
  })
})

describe('activation', () => {
  it('starts blocked and asks Boat for a fresh bootstrap first', async () => {
    const ui = setup(null, { initial: true })
    expect(ui.activationLocked.value).toBe(true)
    await ui.activatePlan()
    expect(ui.calls).toHaveLength(0)
    await ui.load()
    expect(ui.reads[0]).toEqual({
      method: 'bootstrap',
      params: { require_fresh: 1 },
    })
    expect(ui.activationLocked.value).toBe(false)
  })

  it('a hosted checkout opens once, returns to Mi cuenta and never resubmits', async () => {
    const ui = setup({ checkout_url: 'https://provider.test/checkout' })
    await ui.activatePlan()
    await ui.activatePlan()
    expect(ui.redirects).toEqual(['https://provider.test/checkout'])
    expect(ui.calls).toEqual([
      {
        method: 'activate_plan',
        params: { use_saved_card: 0, panel: 'cuenta' },
      },
    ])
  })

  it('sends the saved-card choice once and holds a captured payment', async () => {
    const ui = setup({ ok: false, code: 'captured_unsettled' })
    ui.chooseMethod('saved')
    await ui.activatePlan()
    await ui.activatePlan()
    expect(ui.calls).toHaveLength(1)
    expect(ui.calls[0].params.use_saved_card).toBe(1)
    expect(ui.activationLocked.value).toBe(true)
    expect(ui.activationMessage.value).toBe('Payment received, confirming…')
    expect(ui.redirects).toEqual([])
  })

  it('a declined card keeps the server reason and lets the owner choose again', async () => {
    const ui = setup({
      card_declined: true,
      error: 'Banco rechazó la tarjeta',
      checkout_url: 'https://provider.test/checkout',
    })
    await ui.activatePlan()
    expect(ui.activationLocked.value).toBe(false)
    expect(ui.redirects).toEqual([])
    expect(ui.activationMessage.value).toMatch(
      /Banco rechazó la tarjeta.*another payment method/,
    )
  })

  it('a legacy in_flight URL is discarded when Boat reports a capture hold', async () => {
    const held = boatEnvelope(
      boatState('captured_unsettled', { reason: 'capture_hold' }),
    )
    const ui = setup(
      { in_flight: true, checkout_url: 'https://provider.test/unsafe' },
      { paymentState: held },
    )
    await ui.activatePlan()
    expect(ui.activationCheckoutUrl.value).toBe('')
    expect(ui.activationMessage.value).toBe('Payment received, confirming…')
    ui.resumeActivation()
    await ui.activatePlan()
    expect(ui.redirects).toEqual([])
    expect(ui.calls).toHaveLength(1)
    expect(ui.reads.at(-1).method).toBe('payment_state')
  })

  it('a lost response keeps the lock through a fresh bootstrap', async () => {
    const ui = setup(null, {
      reject: 'Sin conexión',
      bootstrap: {
        site: { name: 'trial-a', plan: 'Pro', is_trial: true },
        payment_state: { status: 'indeterminate', message: 'Sin conexión' },
      },
    })
    await ui.activatePlan()
    await ui.load()
    expect(ui.activationLocked.value).toBe(true)
    expect(ui.activationMessage.value).toMatch(
      /Sin conexión.*before paying again/,
    )
  })

  it('an open session is continued, never minted again', async () => {
    const url = 'https://checkout.test/pay/cs_fixture'
    const ui = setup(null, {
      initial: true,
      bootstrap: {
        site: { name: 'trial-a', plan: 'Pro', is_trial: true },
        invoices: [{ name: 'INV-1', status: 'Draft' }],
        payment_state: boatEnvelope(
          boatState('checkout', { checkout_url: url }),
        ),
      },
    })
    await ui.load()
    expect(ui.activationLocked.value).toBe(true)
    expect(ui.activationCheckoutUrl.value).toBe(url)
    expect(ui.paymentBlockReason.value).toMatch(/Continue the same payment/)
    ui.resumeActivation()
    await ui.activatePlan()
    await ui.payInvoice({ name: 'INV-1', status: 'Draft' })
    expect(ui.redirects).toEqual([url, url])
    expect(ui.calls).toHaveLength(0)
  })

  it('a stale bootstrap cannot authorize a payment', async () => {
    const ui = setup(null, {
      bootstrap: {
        site: { name: 'trial-a', plan: 'Pro', is_trial: true },
        stale: true,
        payment_state: { status: 'ready' },
      },
    })
    await ui.load()
    expect(ui.activationLocked.value).toBe(true)
    expect(ui.error.value).toMatch(/Check status/)
    await ui.activatePlan()
    expect(ui.calls).toHaveLength(0)
  })

  it('unknown or missing payment status fails closed with a reason', async () => {
    for (const payment_state of [{ status: 'future_status' }, undefined]) {
      const ui = setup(null, {
        initial: true,
        bootstrap: {
          site: { name: 'trial-a', plan: 'Pro', is_trial: true },
          payment_state,
        },
      })
      await ui.load()
      expect(ui.activationLocked.value).toBe(true)
      expect(ui.paymentBlockReason.value).not.toBe('')
      expect(ui.activationCheckoutUrl.value).toBe('')
    }
  })

  it('a validation refusal allows an intentional retry; another refusal holds', async () => {
    const ui = setup({
      ok: false,
      code: 'validation_error',
      error: 'Elige plan',
    })
    await ui.activatePlan()
    expect(ui.activationLocked.value).toBe(false)
    expect(ui.activationMessage.value).toMatch(/Elige plan/)
    await ui.activatePlan()
    expect(ui.calls).toHaveLength(2)
    const held = setup({ ok: false, error: 'No pudimos confirmar' })
    await held.activatePlan()
    await held.activatePlan()
    expect(held.activationLocked.value).toBe(true)
    expect(held.calls).toHaveLength(1)
  })

  it('opening the sheet reads the cards and Boat’s quote', async () => {
    const quote = { ok: true, amount_mxn: 579.84, lines: [] }
    const ui = setup(null, { quote })
    expect(await ui.openActivation()).toBe(true)
    expect(ui.activationOpen.value).toBe(true)
    expect(ui.quote.value).toEqual(quote)
    expect(ui.quoteLoading.value).toBe(false)
    expect(ui.reads.map((r) => r.method)).toEqual([
      'payment_methods',
      'activation_quote',
    ])
    const fallback = setup(null)
    await fallback.openActivation()
    expect(fallback.quote.value).toBeNull()
  })
})

describe('provisioning and contract holds', () => {
  it('a site being prepared shuts every payment door until Boat says otherwise', async () => {
    const ui = setup(null, {
      bootstrap: {
        site: { name: 'trial-a', status: 'Pending', is_trial: true },
        payment_state: {
          status: 'provisioning',
          authoritative: true,
          site_status: 'Pending',
          invoices: {},
        },
      },
    })
    expect(ui.isProvisioning.value).toBe(true)
    expect(ui.paymentActionsBlocked()).toBe(true)
    expect(await ui.openActivation()).toBe(false)
    expect(ui.openTopup()).toBe(false)
    expect(ui.provisioningMessage.value).toMatch(/preparing your shop/)
  })

  it('a broken preparation leads with support', () => {
    const ui = setup(null, {
      bootstrap: {
        site: { name: 'trial-a', status: 'Broken' },
        payment_state: { status: 'provisioning', site_status: 'Broken' },
      },
    })
    expect(ui.provisioningBroken.value).toBe(true)
    expect(ui.provisioningMessage.value).toMatch(/needs help from support/)
  })

  it('a failed read keeps a known hold instead of inventing one', async () => {
    const ui = setup(null, {
      bootstrap: {
        site: { name: 'trial-a' },
        payment_state: { status: 'provisioning', site_status: 'Pending' },
      },
      readReject: 'down',
    })
    await ui.load()
    expect(ui.isProvisioning.value).toBe(true)
    expect(ui.error.value).not.toBe('')
  })

  it('an invalid contract blocks payments, and an uncertain read cannot lift it', () => {
    const ui = setup(null, {
      bootstrap: {
        site: { name: 'trial-a' },
        payment_state: {
          status: 'unconfirmed',
          reason: 'invalid_payment_state',
          authoritative: false,
          invoices: {},
        },
      },
    })
    expect(ui.paymentHold.value).toBe(true)
    ui.resolvePaymentState({ status: 'ready' })
    expect(ui.invalidPaymentState.value).toBe(true)
    ui.resolvePaymentState(boatEnvelope(boatState('ready')))
    expect(ui.paymentHold.value).toBe(false)
  })
})

describe('polling', () => {
  it('a captured payment polls read-only until Boat settles it', async () => {
    let state = boatEnvelope(boatState('captured_unsettled'))
    const ui = setup(null, {
      bootstrap: {
        site: { name: 'trial-a', plan: 'Pro', is_trial: true },
        meters: { billing: { is_trial: true } },
        invoices: [{ name: 'INV-1', status: 'Draft' }],
        payment_state: state,
      },
      paymentState: () => state,
    })
    expect(ui.timers.size).toBe(1)
    expect(POLL_MS).toBe(5000)
    state = {
      ...boatEnvelope(boatState('active')),
      is_trial: false,
      invoices: {
        'INV-1': {
          authoritative: true,
          status: 'paid',
          invoice_status: 'Paid',
        },
      },
    }
    await ui.poll()
    expect(ui.boot.value.invoices[0].status).toBe('Paid')
    expect(ui.boot.value.site.is_trial).toBe(false)
    expect(ui.boot.value.meters.billing.is_trial).toBe(false)
    expect(ui.timers.size).toBe(0)
    expect(ui.calls).toHaveLength(0)
  })

  it('leaving the page stops the poll and a late read cannot restart it', async () => {
    const ui = setup(null, {
      bootstrap: {
        site: { name: 'trial-a' },
        payment_state: boatEnvelope(boatState('in_flight')),
      },
    })
    expect(ui.timers.size).toBe(1)
    ui.dispose()
    expect(ui.timers.size).toBe(0)
    await ui.refreshPaymentState()
    expect(ui.timers.size).toBe(0)
  })
})

describe('invoices and top-ups', () => {
  const unpaid = {
    site: { name: 'shop', plan: 'Pro', is_trial: false },
    invoices: [{ name: 'INV-1', status: 'Overdue' }],
    payment_state: {
      ...boatEnvelope(boatState('ready')),
      is_trial: false,
    },
  }

  it('an invoice Boat calls ready opens its checkout; paid ones never pay', async () => {
    const ui = setup(
      { checkout_url: 'https://pay.test/inv' },
      { bootstrap: unpaid },
    )
    await ui.payInvoice({ name: 'INV-1', status: 'Overdue' })
    expect(ui.calls).toEqual([
      { method: 'pay_invoice', params: { invoice: 'INV-1' } },
    ])
    expect(ui.redirects).toEqual(['https://pay.test/inv'])
    await ui.payInvoice({ name: 'INV-1', status: 'Paid' })
    expect(ui.calls).toHaveLength(1)
  })

  it('a failed invoice payment explains the recovery and blocks a second charge', async () => {
    const ui = setup(null, { bootstrap: unpaid, reject: 'down' })
    const inv = { name: 'INV-1', status: 'Overdue' }
    await ui.payInvoice(inv)
    expect(ui.invoiceErrors.value['INV-1']).toMatch(/Check status/)
    expect(ui.invoiceBlocked(inv)).toBe(true)
    expect(ui.invoicePaymentReason(inv)).toMatch(/Check status/)
  })

  it('a top-up checks its bounds, then opens the processor with the way back', async () => {
    const ui = setup({ checkout_url: 'https://pay.test/topup' })
    ui.openTopup()
    ui.setTopupAmount('10')
    await ui.topup({ min: 50, max: 1000, money: (v) => `$${v}` })
    expect(ui.topupError.value).toBe(
      'The minimum amount is $50. Correct the amount and try again.',
    )
    expect(ui.calls).toHaveLength(0)
    ui.setTopupAmount(200)
    await ui.topup({ min: 50, max: 1000 })
    expect(ui.calls).toEqual([
      { method: 'topup_checkout', params: { amount: 200, panel: 'cuenta' } },
    ])
    expect(ui.redirects).toEqual(['https://pay.test/topup'])
  })

  it('support opens a report, else Boat’s support page, else says where', () => {
    const ui = setup(null)
    ui.contactSupport()
    expect(ui.support()).toBe(1)
    const none = setup(null, { support: false })
    none.contactSupport()
    expect(none.redirects).toEqual(['https://support.test/payments'])
    const nothing = setup(null, {
      support: false,
      bootstrap: {
        site: { name: 'x' },
        payment_state: { status: 'ready', authoritative: true },
      },
    })
    nothing.contactSupport()
    expect(nothing.supportError.value).toMatch(/Report a problem/)
  })
})

// Facturación and Tienda through the same door: the ledger, cards, add-ons and
// plan requests keep Mi plan's guards (nothing runs while a payment is held).
function door(replies = {}, options = {}) {
  const calls = []
  const reads = []
  const redirects = []
  const bootstrap = {
    site: { name: 'shop', plan: 'pro', is_trial: false },
    store: { plans: [], addons: [] },
    payment_state: { ...boatEnvelope(boatState('ready')), is_trial: false },
  }
  const pagos = createPagos({
    read: async (method, params) => {
      reads.push({ method, params })
      const reply = replies[method]
      if (reply instanceof Error) throw reply
      if (typeof reply === 'function') return reply(params)
      if (reply !== undefined) return reply
      if (method === 'bootstrap') return bootstrap
      return { ok: true, cards: [] }
    },
    mutate: async (method, params) => {
      calls.push({ method, params })
      const reply = replies[method]
      if (reply instanceof Error) throw reply
      return typeof reply === 'function' ? reply(params) : reply
    },
    navigate: (url) => redirects.push(url),
    openSupport: options.openSupport || (() => true),
    timers: { set: () => 0, clear: () => {} },
    tab: options.tab,
  })
  pagos.boot.value = bootstrap
  pagos.loading.value = false
  pagos.resolvePaymentState(options.state || bootstrap.payment_state)
  return { ...pagos, calls, reads, redirects }
}
const refusal = (message) =>
  Object.assign(
    new Error('doco.docoutils.miplan.topup_checkout ValidationError'),
    {
      exc_type: 'ValidationError',
      messages: [message],
    },
  )
const held = {
  status: 'provisioning',
  authoritative: true,
  site_status: 'Pending',
  invoices: {},
}

describe('the way back after paying', () => {
  it('a top-up names the panel only: Boat appends its own query to the path', async () => {
    const ui = door(
      { topup_checkout: { checkout_url: 'https://pay.test/t' } },
      { tab: () => 'facturacion' },
    )
    ui.setTopupAmount(500)
    await ui.topup({ min: 50, max: 1000 })
    expect(ui.calls).toEqual([
      { method: 'topup_checkout', params: { amount: 500, panel: 'cuenta' } },
    ])
    expect(ui.redirects).toEqual(['https://pay.test/t'])
  })

  it('an activation names the section the owner paid from', async () => {
    const ui = door(
      { activate_plan: { checkout_url: 'https://pay.test/a' } },
      {
        tab: () => 'tienda',
        state: {
          ...boatEnvelope(boatState('ready')),
          is_trial: true,
          next_action: 'activate',
        },
      },
    )
    await ui.activatePlan()
    expect(ui.calls[0]).toEqual({
      method: 'activate_plan',
      params: { use_saved_card: 0, panel: 'cuenta', tab: 'tienda' },
    })
  })
})

describe('asking support', () => {
  it('writes the request into the report when the page names it', () => {
    const seen = []
    const ui = door({}, { openSupport: (text) => seen.push(text) > 0 })
    ui.contactSupport('Quiero pasar mi plan Pro al ciclo anual.')
    ui.contactSupport()
    expect(seen).toEqual(['Quiero pasar mi plan Pro al ciclo anual.', ''])
    expect(ui.supportError.value).toBe('')
  })
})

describe('a top-up Boat refuses', () => {
  it('says Boat’s reason when the wallet’s service is not ready, and opens nothing', async () => {
    const ui = door({
      topup_checkout: {
        status: 'provisioning',
        reason: 'wallet_service_not_delivered',
        message: 'Tu complemento aún se está preparando.',
        checkout_url: null,
      },
    })
    ui.setTopupAmount(200)
    await ui.topup({ min: 50, max: 1000 })
    expect(ui.topupError.value).toBe(
      'Tu complemento aún se está preparando. Check the status later or ask support.',
    )
    expect(ui.redirects).toEqual([])
    // A refusal is not a payment hold: the other doors stay as Boat left them.
    expect(ui.paymentHold.value).toBe(false)
  })

  it('a refusal Boat answered reads as Boat wrote it; a lost answer sends to the movements', async () => {
    const ui = door({
      topup_checkout: refusal('El monto mínimo de recarga es $50 MXN.'),
    })
    ui.setTopupAmount(200)
    await ui.topup({ min: 1, max: 1000 })
    expect(ui.topupError.value).toBe('El monto mínimo de recarga es $50 MXN.')
    const lost = door({ topup_checkout: new Error('Failed to fetch') })
    lost.setTopupAmount(200)
    await lost.topup({ min: 1, max: 1000 })
    expect(lost.topupError.value).toMatch(/Check the wallet movements/)
  })
})

describe('wallet movements', () => {
  it('reads 20 at a time from the newest and stops at a short page', async () => {
    const page = (n, from) =>
      Array.from({ length: n }, (_, i) => ({ name: `T${from + i}` }))
    const ui = door({
      wallet_txns: ({ start }) => (start === 0 ? page(20, 0) : page(3, 20)),
    })
    await ui.loadTxns({ reset: true })
    expect(ui.txns.value).toHaveLength(20)
    expect(ui.txnsDone.value).toBe(false)
    await ui.loadTxns()
    expect(ui.txns.value).toHaveLength(23)
    expect(ui.txnsDone.value).toBe(true)
    expect(ui.reads.map((r) => r.params)).toEqual([
      { limit: 20, start: 0 },
      { limit: 20, start: 20 },
    ])
  })

  it('a failed read says so and keeps what was there', async () => {
    const ui = door({ wallet_txns: new Error('Failed to fetch') })
    await ui.loadTxns({ reset: true })
    expect(ui.txnsError.value).toMatch(/could not read the wallet movements/)
    expect(ui.txnsLoaded.value).toBe(false)
  })
})

describe('saved cards', () => {
  it('removes one card through the relay, then reads the list again', async () => {
    const ui = door({
      remove_payment_method: { ok: true, id: 'pm_1' },
      payment_methods: { ok: true, cards: [] },
    })
    expect(await ui.removeCard({ id: 'pm_1' })).toBe(true)
    expect(ui.calls).toEqual([
      { method: 'remove_payment_method', params: { source_id: 'pm_1' } },
    ])
    expect(ui.reads.map((r) => r.method)).toEqual(['payment_methods'])
    expect(ui.busy.value).toBe('')
  })

  it('Boat’s refusal stays beside the card; a held payment removes nothing', async () => {
    const ui = door({
      remove_payment_method: {
        ok: false,
        error: 'Es tu única tarjeta y tienes cargos automáticos activos.',
      },
    })
    expect(await ui.removeCard({ id: 'pm_1' })).toBe(false)
    expect(ui.cardError.value).toBe(
      'Es tu única tarjeta y tienes cargos automáticos activos.',
    )
    const hold = door({}, { state: held })
    expect(await hold.removeCard({ id: 'pm_1' })).toBe(false)
    expect(hold.calls).toEqual([])
  })
})

describe('add-ons and plan requests', () => {
  it('an add-on changes through the toggle relay and the account is read again', async () => {
    const ui = door({
      toggle_addon: {
        status: 'Active',
        note: 'Solicitado. Se cobrará cuando esté listo.',
      },
    })
    const out = await ui.toggleAddon(
      { service_key: 'cfdi_timbres' },
      'activate',
    )
    expect(out).toEqual({
      ok: true,
      note: 'Solicitado. Se cobrará cuando esté listo.',
    })
    expect(ui.calls).toEqual([
      {
        method: 'toggle_addon',
        params: { service_key: 'cfdi_timbres', action: 'activate' },
      },
    ])
    expect(ui.reads.at(-1)).toEqual({
      method: 'bootstrap',
      params: { require_fresh: 1 },
    })
  })

  it('a plan change is a request; a reply with a checkout leaves for it', async () => {
    const ui = door({
      request_plan: {
        requested_plan: 'premium',
        note: 'Recibimos tu solicitud.',
      },
    })
    expect(await ui.requestPlan('premium')).toEqual({
      ok: true,
      note: 'Recibimos tu solicitud.',
    })
    expect(ui.calls).toEqual([
      { method: 'request_plan', params: { target_plan: 'premium' } },
    ])
    const pay = door({
      toggle_addon: { checkout_url: 'https://pay.test/addon' },
    })
    await pay.toggleAddon({ service_key: 'whatsapp_waba' }, 'activate')
    expect(pay.redirects).toEqual(['https://pay.test/addon'])
  })

  it('a refusal comes back as words; a held payment changes nothing', async () => {
    const ui = door({
      request_plan: refusal('Ya tienes ese plan.'),
    })
    expect(await ui.requestPlan('pro')).toEqual({
      ok: false,
      error: 'Ya tienes ese plan.',
    })
    const hold = door({}, { state: held })
    expect(await hold.toggleAddon({ service_key: 'x' }, 'activate')).toEqual({
      ok: false,
    })
    expect(await hold.requestPlan('premium')).toEqual({ ok: false })
    expect(hold.calls).toEqual([])
  })
})

describe('the browser’s timers', () => {
  it('a poll schedules with setTimeout called plainly, never as a method', () => {
    // A browser throws «Illegal invocation» for setTimeout called on another object.
    const spy = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation(function () {
        if (this && this !== globalThis)
          throw new TypeError('Illegal invocation')
        return 1
      })
    try {
      const pagos = createPagos({
        read: async () => ({}),
        mutate: async () => ({}),
      })
      pagos.loading.value = false
      expect(() =>
        pagos.resolvePaymentState(
          boatEnvelope(boatState('captured_unsettled')),
        ),
      ).not.toThrow()
      expect(spy).toHaveBeenCalledTimes(1)
      pagos.dispose()
    } finally {
      spy.mockRestore()
    }
  })
})
