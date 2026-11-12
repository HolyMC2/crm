// Mi cuenta's saldo (lane wallet-visible-return): the wallet at $0.00 where Boat
// says the site can hold saldo (bootstrap.wallet, capability «wallet_return»),
// «¿Para qué sirve?» and its sheet, a refused top-up in Boat's words, and the
// way back from the processor's page: «Recarga acreditada: $X» once Boat's
// wallet holds it, else «Tu pago está en proceso…», with no reload button.
// Without the capability every screen is as before.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const state = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  call: vi.fn(),
  seam: vi.fn(),
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
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
// The kit's sheet is reka's dialog; here it renders its slots while open.
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
vi.mock('@/components/cuenta/api', () => ({
  read: (...args) => state.read(...args),
  mutate: (...args) => state.mutate(...args),
  seam: (...args) => state.seam(...args),
  exportStatus: vi.fn(async () => ({ export: null, can_request: true })),
  requestExport: vi.fn(),
  exportDownloadPath: (name) => `/zip/${name}`,
  downloadPath: () => '',
  receiptPath: () => '',
}))

import { walletHelp, walletView } from '@/components/cuenta/cuenta'
import { createPagos } from '@/components/cuenta/pagos'
import {
  RETURN_POLL_MS,
  RETURN_READS,
  createRecargaReturn,
  topupReference,
} from '@/components/cuenta/recarga'
import CuentaFacturacion from '@/components/cuenta/CuentaFacturacion.vue'
import CuentaResumen from '@/components/cuenta/CuentaResumen.vue'
import RecargarSheet from '@/components/cuenta/RecargarSheet.vue'
import Cuenta from '@/pages/Cuenta.vue'
import { shellBoot } from '@/composables/muelleShell'

function boot(overrides = {}) {
  return {
    site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 0 },
    meters: {
      billing: { is_trial: false, monthly_price_mxn: 499 },
      cfdi: { used: 10, monthly_cap: 50, remaining: 40 },
    },
    store: {
      topup_min: 50,
      topup_max: 10000,
      addons: [{ service_key: 'cfdi_timbres', service_name: 'Timbres CFDI' }],
    },
    invoices: [],
    capabilities: ['wallet_return'],
    wallet: { balance_mxn: 0, holds_saldo: true },
    payment_state: {
      status: 'ready',
      authoritative: true,
      is_trial: false,
      invoices: {},
    },
    ...overrides,
  }
}
// Today's Boat, or the flag off: no capability, no `wallet`, no saldo meter.
function todays(overrides = {}) {
  const data = boot(overrides)
  delete data.wallet
  data.capabilities = []
  return data
}

describe('the wallet before its first movement', () => {
  it('reads $0.00 where Boat says the site can hold saldo', () => {
    expect(walletView(boot())).toMatchObject({ balance: 0, text: '$0.00' })
  })

  it('stays hidden where it cannot, or where Boat says nothing (as before)', () => {
    expect(
      walletView(boot({ wallet: { balance_mxn: 0, holds_saldo: false } })),
    ).toBeNull()
    expect(walletView(todays())).toBeNull()
    expect(walletView(boot({ wallet: { holds_saldo: 'yes' } }))).toBeNull()
  })

  it('a wallet with movements reads its meter, as before', () => {
    const data = boot()
    data.meters.saldo = { balance_mxn: 1250, status: 'healthy' }
    data.wallet = { balance_mxn: 0, holds_saldo: false }
    expect(walletView(data).text).toBe('$1,250.00')
  })
})

describe('«¿Para qué sirve?»', () => {
  it('says what the saldo pays and how to top it up, within Boat’s bounds', () => {
    const help = walletHelp(boot())
    expect(help.pays).toEqual([
      'The stamps you issue beyond the ones your plan and package include.',
    ])
    expect(help.topUp).toBe(
      'To add balance, tap Top up, choose an amount from $50.00 to $10,000.00 and pay on the secure payment page. You will see it here once the payment arrives.',
    )
    // Nothing about the saldo expiring: Boat's policy says nothing of it.
    expect(JSON.stringify(help)).not.toMatch(/expire|never/i)
  })

  it('names the extra stamp’s price where Boat shows it, and airtime only where it is sold', () => {
    const data = boot()
    data.store.addons[0].extra_stamp_price_mxn = 3
    data.meters.saldo = { balance_mxn: 80, recarga_spend_30d: 400 }
    expect(walletHelp(data).pays).toEqual([
      'The stamps you issue beyond the ones your plan and package include: $3.00 each, IVA included.',
      'The airtime you sell.',
    ])
  })
})

let app, root
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function until(selector) {
  for (let i = 0; i < 100; i++) {
    const found = document.querySelector(selector)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return null
}
function mount(component, props = {}, router) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const events = []
  app = createApp({
    render: () => h(component, { ...props, onAct: (key) => events.push(key) }),
  })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  if (router) app.use(router)
  app.mount(root)
  return events
}
const button = (text, scope = document) =>
  [...scope.querySelectorAll('button')].find((b) =>
    b.textContent.trim().startsWith(text),
  )
beforeEach(() => {
  for (const fn of Object.values(state)) fn.mockReset()
  state.read.mockImplementation(async (fn) =>
    fn === 'wallet_txns' ? [] : { ok: true, cards: [] },
  )
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
  shellBoot.value = null
})

function readyDoor(data = boot(), extra = {}) {
  const door = createPagos({
    read: (...args) => state.read(...args),
    mutate: (...args) => state.mutate(...args),
    navigate: vi.fn(),
    openSupport: () => true,
    timers: { set: () => 0, clear: () => {} },
    ...extra,
  })
  door.boot.value = data
  door.loading.value = false
  door.resolvePaymentState(data.payment_state)
  return door
}

describe('Facturación and Resumen show the $0 wallet', () => {
  it('Facturación: $0.00, «Recargar» and «¿Para qué sirve?», whose sheet tops up', async () => {
    const events = mount(CuentaFacturacion, { door: readyDoor() })
    await flush()
    const block = root.querySelector('[data-testid="cuenta-saldo"]')
    expect(block.querySelector('[data-testid="saldo-monto"]').textContent).toBe(
      '$0.00',
    )
    expect(button('Top up', block)).toBeDefined()
    // The ledger is read once: nothing yet.
    expect(state.read).toHaveBeenCalledWith('wallet_txns', {
      limit: 20,
      start: 0,
    })
    expect(block.textContent).toContain('No movements yet.')
    block.querySelector('[data-testid="saldo-para-que"]').click()
    const sheet = await until('[data-testid="cuenta-saldo-ayuda"]')
    expect(sheet).not.toBeNull()
    const dialog = sheet.closest('[role="dialog"]')
    expect(dialog.getAttribute('aria-label')).toBe('What is the balance for?')
    expect(dialog.textContent).toContain('With your balance you pay for:')
    expect(dialog.textContent).toContain(
      'The stamps you issue beyond the ones your plan and package include.',
    )
    dialog.querySelector('[data-testid="saldo-ayuda-recargar"]').click()
    await flush()
    expect(events).toEqual(['topup'])
    expect(
      document.querySelector('[data-testid="cuenta-saldo-ayuda"]'),
    ).toBeNull()
  })

  it('the sheet’s «Recargar» waits while a payment request is in flight, and says why', async () => {
    const door = readyDoor()
    const events = mount(CuentaFacturacion, { door })
    await flush()
    root.querySelector('[data-testid="saldo-para-que"]').click()
    await until('[data-testid="cuenta-saldo-ayuda"]')
    door.busy.value = 'pay:INV-1'
    await flush()
    const go = document.querySelector('[data-testid="saldo-ayuda-recargar"]')
    expect(go.disabled).toBe(true)
    expect(
      document.querySelector('#cuenta-saldo-ayuda-motivo').textContent,
    ).toContain('A request is in progress.')
    expect(events).toEqual([])
  })

  it('Resumen: the wallet line reads $0.00', async () => {
    mount(CuentaResumen, { door: readyDoor(), actions: ['topup'] })
    await flush()
    const line = root.querySelector('[data-testid="cuenta-monedero"]')
    expect(line.textContent).toContain('Wallet balance')
    expect(line.textContent).toContain('$0.00')
  })

  it('without Boat’s word (flag off) neither shows a wallet, as before', async () => {
    mount(CuentaFacturacion, { door: readyDoor(todays()) })
    await flush()
    expect(root.querySelector('[data-testid="cuenta-saldo"]')).toBeNull()
    expect(state.read).not.toHaveBeenCalledWith(
      'wallet_txns',
      expect.anything(),
    )
    app.unmount()
    root.remove()
    mount(CuentaResumen, { door: readyDoor(todays()), actions: ['topup'] })
    await flush()
    expect(root.querySelector('[data-testid="cuenta-monedero"]')).toBeNull()
  })

  it('flag off, a site with saldo: its balance and «Recargar» as before, no «¿Para qué sirve?»', async () => {
    const data = todays()
    data.meters.saldo = { balance_mxn: 320, status: 'healthy' }
    mount(CuentaFacturacion, { door: readyDoor(data) })
    await flush()
    const block = root.querySelector('[data-testid="cuenta-saldo"]')
    expect(block.querySelector('[data-testid="saldo-monto"]').textContent).toBe(
      '$320.00',
    )
    expect(button('Top up', block)).toBeDefined()
    expect(block.querySelector('[data-testid="saldo-para-que"]')).toBeNull()
    expect(block.textContent).not.toContain('What is it for?')
  })
})

describe('a top-up Boat refuses says Boat’s reason', () => {
  async function refused(answer) {
    const door = readyDoor()
    const navigate = vi.fn()
    const ui = createPagos({
      read: async () => ({}),
      mutate: async () => {
        if (answer instanceof Error) throw answer
        return answer
      },
      navigate,
      openSupport: () => true,
      timers: { set: () => 0, clear: () => {} },
    })
    ui.boot.value = door.boot.value
    ui.loading.value = false
    ui.resolvePaymentState(door.boot.value.payment_state)
    ui.setTopupAmount(200)
    await ui.topup({ min: 50, max: 10000 })
    expect(navigate).not.toHaveBeenCalled()
    return ui.topupError.value
  }
  const thrown = (message) =>
    Object.assign(
      new Error('doco.docoutils.miplan.topup_checkout ValidationError'),
      { exc_type: 'ValidationError', messages: [message] },
    )

  it('suspended and payment rail off: Boat’s sentence alone', async () => {
    expect(
      await refused({
        ok: false,
        reason: 'suspended',
        message:
          'Tu sitio está suspendido y por ahora no recibe recargas. En Resumen ves qué hacer para reactivarlo.',
        checkout_url: null,
      }),
    ).toBe(
      'Tu sitio está suspendido y por ahora no recibe recargas. En Resumen ves qué hacer para reactivarlo.',
    )
    expect(
      await refused({
        ok: false,
        reason: 'rail_off',
        message:
          'Por ahora no podemos recibir recargas en línea. <b>Escríbenos</b> desde Ayuda y lo resolvemos contigo.',
      }),
    ).toBe(
      'Por ahora no podemos recibir recargas en línea. Escríbenos desde Ayuda y lo resolvemos contigo.',
    )
  })

  it('the amount bounds Boat throws read as Boat wrote them', async () => {
    expect(
      await refused(thrown('El monto mínimo de recarga es $50 MXN.')),
    ).toBe('El monto mínimo de recarga es $50 MXN.')
    expect(
      await refused(thrown('El monto máximo de recarga es $10000 MXN.')),
    ).toBe('El monto máximo de recarga es $10000 MXN.')
  })

  it('a refusal holds «Continuar» until the amount changes; Boat is not asked again', async () => {
    const mutate = vi.fn(async () => ({
      ok: false,
      reason: 'rail_off',
      message: 'Por ahora no podemos recibir recargas en línea.',
    }))
    const ui = readyDoor(boot(), { mutate })
    ui.setTopupAmount(500)
    await ui.topup({ min: 50, max: 10000 })
    expect(ui.topupRefused.value).toBe(true)
    // The «Elige Continuar…» hint goes: Continuar would only repeat the refusal.
    expect(ui.topupActionReason.value).toBe('')
    await ui.topup({ min: 50, max: 10000 })
    expect(mutate).toHaveBeenCalledTimes(1)
    ui.setTopupAmount(500)
    expect(ui.topupRefused.value).toBe(true)
    ui.setTopupAmount(600)
    expect(ui.topupRefused.value).toBe(false)
    expect(ui.topupActionReason.value).toBe(
      'Choose Continue to open the secure top-up payment.',
    )
    // A state that clears by itself (the service still being prepared) does not hold it.
    mutate.mockResolvedValueOnce({
      status: 'provisioning',
      reason: 'wallet_service_not_delivered',
      message: 'Tu complemento aún se está preparando.',
      checkout_url: null,
    })
    await ui.topup({ min: 50, max: 10000 })
    expect(ui.topupRefused.value).toBe(false)
    // Opening the sheet again starts clean.
    ui.setTopupAmount(700)
    await ui.topup({ min: 50, max: 10000 })
    expect(ui.topupRefused.value).toBe(true)
    ui.closeTopup()
    expect(ui.openTopup()).toBe(true)
    expect(ui.topupRefused.value).toBe(false)
    expect(ui.topupError.value).toBe('')
  })

  it('the sheet says the reason first, as an alert, and holds «Continuar»', async () => {
    const door = readyDoor(boot(), {
      mutate: async () => ({
        ok: false,
        reason: 'suspended',
        message:
          'Tu sitio está suspendido y por ahora no recibe recargas. En Resumen ves qué hacer para reactivarlo.',
      }),
    })
    mount(RecargarSheet, { door, open: true })
    await flush()
    const go = document.querySelector('[data-testid="recarga-continuar"]')
    expect(go.getAttribute('aria-describedby')).toBe('cuenta-recarga-motivo')
    door.setTopupAmount(500)
    go.click()
    await flush()
    const said = document.querySelector('[data-testid="recarga-error"]')
    expect(said.getAttribute('role')).toBe('alert')
    expect(said.textContent.trim()).toBe(
      'Tu sitio está suspendido y por ahora no recibe recargas. En Resumen ves qué hacer para reactivarlo.',
    )
    // Above the amounts, so the narrowest phone shows it over the actions.
    const chips = document.querySelector('[aria-label="Common amounts"]')
    expect(
      said.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(document.querySelector('#cuenta-recarga-motivo')).toBeNull()
    expect(go.disabled).toBe(true)
    expect(go.getAttribute('aria-describedby')).toBe('cuenta-recarga-error')
    expect(button('Check the top-up with support')).toBeDefined()
    // A new amount lets the owner ask once more.
    door.setTopupAmount(600)
    await flush()
    expect(go.disabled).toBe(false)
  })

  it('asks Boat for the way back to Mi cuenta only with wallet_return', async () => {
    for (const [data, params] of [
      [boot(), { amount: 200, panel: 'cuenta', wallet_return: 1 }],
      [todays(), { amount: 200, panel: 'cuenta' }],
    ]) {
      const mutate = vi.fn(async () => ({
        checkout_url: 'https://checkout.stripe.test/c/1',
      }))
      const navigate = vi.fn()
      const ui = readyDoor(data, { mutate, navigate })
      ui.setTopupAmount(200)
      await ui.topup({ min: 50, max: 10000 })
      expect(mutate).toHaveBeenCalledWith('topup_checkout', params)
      expect(navigate).toHaveBeenCalledWith('https://checkout.stripe.test/c/1')
    }
  })

  it('a raw or empty message never reaches the screen', async () => {
    for (const message of [
      'ValidationError: Stripe API key not configured',
      'Traceback (most recent call last): ...',
      '',
      undefined,
    ])
      expect(await refused({ ok: false, reason: 'rail_off', message })).toBe(
        'We could not open the top-up payment. Check the wallet movements before trying again or ask support.',
      )
  })
})

describe('the way back from a top-up', () => {
  it('takes only a processor reference from the address', () => {
    expect(topupReference({ recarga: 'cs_test_a1B2' })).toBe('cs_test_a1B2')
    for (const recarga of [
      undefined,
      '',
      'pi_123',
      'cs_',
      'cs_a/../b',
      'javascript:alert(1)',
      ['cs_test_1'],
      `cs_${'a'.repeat(253)}`,
    ])
      expect(topupReference({ recarga })).toBe('')
  })

  function controller(answers) {
    const pending = new Map()
    let id = 0
    const done = vi.fn()
    const credited = vi.fn()
    const reads = []
    const ui = createRecargaReturn({
      read: async (reference) => {
        reads.push(reference)
        const next = answers.length > 1 ? answers.shift() : answers[0]
        if (next instanceof Error) throw next
        return next
      },
      onCredited: credited,
      onDone: done,
      timers: {
        set: (fn, ms) => {
          id += 1
          pending.set(id, { fn, ms })
          return id
        },
        clear: (key) => pending.delete(key),
      },
    })
    const timers = () => [...pending.values()]
    const tick = async () => {
      const [key, next] = pending.entries().next().value || []
      if (!next) return null
      pending.delete(key)
      next.fn()
      await flush()
      return next
    }
    return { ui, timers, done, credited, reads, tick }
  }

  it('«Recarga acreditada» once Boat’s wallet holds it, then the page reads again', async () => {
    const c = controller([
      { ok: true, state: 'processing', notice: false },
      { ok: true, state: 'credited', amount_mxn: 500 },
    ])
    expect(c.ui.start('cs_test_1')).toBe(true)
    expect(c.ui.view.value).toEqual({
      tone: 'checking',
      text: 'Checking your top-up…',
    })
    await flush()
    expect(c.timers()[0].ms).toBe(RETURN_POLL_MS)
    await c.tick()
    expect(c.ui.view.value).toEqual({
      tone: 'credited',
      text: 'Top-up credited: $500.00',
    })
    expect(c.credited).toHaveBeenCalledTimes(1)
    expect(c.done).toHaveBeenCalledTimes(1)
    expect(c.timers()).toEqual([])
    expect(c.reads).toEqual(['cs_test_1', 'cs_test_1'])
  })

  it('still not there after a short while: «en proceso», with «te avisamos» only where Boat mails', async () => {
    for (const [notice, text] of [
      [
        true,
        'Your payment is being processed; we will let you know when it arrives.',
      ],
      [
        false,
        'Your payment is being processed; you will see it in your balance when it arrives.',
      ],
    ]) {
      const c = controller([{ ok: true, state: 'processing', notice }])
      c.ui.start('cs_test_1')
      await flush()
      while (await c.tick());
      expect(c.reads).toHaveLength(RETURN_READS)
      expect(c.ui.view.value).toEqual({ tone: 'processing', text })
      expect(c.credited).not.toHaveBeenCalled()
      expect(c.done).toHaveBeenCalledTimes(1)
    }
  })

  it('a lost answer or Boat unable to ask is no verdict: it keeps reading', async () => {
    const c = controller([
      new Error('Failed to fetch'),
      { ok: false, reason: 'unavailable', message: 'No pudimos consultar…' },
      { ok: true, state: 'credited', amount_mxn: 80 },
    ])
    c.ui.start('cs_test_1')
    await flush()
    await c.tick()
    await c.tick()
    expect(c.ui.view.value.text).toBe('Top-up credited: $80.00')
  })

  it('a reference Boat does not know for this site, an expired one or the seam off shows nothing', async () => {
    for (const answer of [
      {
        ok: false,
        reason: 'not_found',
        message: 'No encontramos esa recarga.',
      },
      { ok: true, state: 'expired' },
      { ok: false, reason: 'disabled', message: '…' },
      { ok: true },
    ]) {
      const c = controller([answer])
      c.ui.start('cs_test_1')
      await flush()
      expect(c.ui.view.value).toBeNull()
      expect(c.timers()).toEqual([])
      expect(c.done).toHaveBeenCalledTimes(1)
    }
  })

  it('stops reading when the page goes away', async () => {
    const c = controller([{ ok: true, state: 'processing' }])
    c.ui.start('cs_test_1')
    await flush()
    c.ui.dispose()
    await c.tick()
    expect(c.reads).toHaveLength(1)
    expect(c.ui.start('cs_test_2')).toBe(false)
  })
})

describe('the Cuenta page after a top-up', () => {
  async function page(path, data) {
    shellBoot.value = {
      user: { name: 'owner@example.test' },
      account: { cuenta: true, plan: null },
    }
    state.call.mockResolvedValue({
      user: { name: 'owner@example.test' },
      modules: {},
      account: { cuenta: true, plan: null },
    })
    let bootstraps = 0
    state.read.mockImplementation(async (fn) => {
      if (fn === 'bootstrap') {
        bootstraps += 1
        return bootstraps > 1
          ? {
              ...data,
              meters: {
                ...data.meters,
                saldo: { balance_mxn: 500, status: 'healthy' },
              },
            }
          : data
      }
      return fn === 'wallet_txns' ? [] : { ok: true, cards: [] }
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/cuenta', component: Cuenta, meta: { app: 'cuenta' } }],
    })
    await router.push(path)
    await router.isReady()
    mount({ render: () => h(Cuenta) }, {}, router)
    await flush()
    return { router, bootstraps: () => bootstraps }
  }

  it('lands on Facturación and says «Recarga acreditada»; the balance is read again and the address cleaned', async () => {
    state.seam.mockResolvedValue({
      ok: true,
      state: 'credited',
      amount_mxn: 500,
    })
    const { router, bootstraps } = await page(
      '/cuenta?tab=facturacion&recarga=cs_test_1',
      boot(),
    )
    const status = await until('[data-testid="cuenta-recarga-estado"]')
    await flush()
    expect(state.seam).toHaveBeenCalledWith('topup_state', {
      reference: 'cs_test_1',
    })
    expect(status.textContent.trim()).toBe('Top-up credited: $500.00')
    expect(status.getAttribute('role')).toBe('status')
    expect(bootstraps()).toBe(2)
    expect(router.currentRoute.value.query).toEqual({ tab: 'facturacion' })
    expect((await until('[data-testid="saldo-monto"]')).textContent).toBe(
      '$500.00',
    )
    // No reload button next to the word.
    expect(status.querySelector('button')).toBeNull()
  })

  it('flag off: the address is not read and nothing new shows', async () => {
    const { router } = await page(
      '/cuenta?tab=facturacion&recarga=cs_test_1',
      todays(),
    )
    expect(state.seam).not.toHaveBeenCalledWith(
      'topup_state',
      expect.anything(),
    )
    expect(
      root.querySelector('[data-testid="cuenta-recarga-estado"]'),
    ).toBeNull()
    expect(router.currentRoute.value.query.recarga).toBe('cs_test_1')
  })

  it('a reference that is not one is dropped without a read', async () => {
    const { router } = await page(
      '/cuenta?tab=facturacion&recarga=javascript:alert(1)',
      boot(),
    )
    expect(state.seam).not.toHaveBeenCalledWith(
      'topup_state',
      expect.anything(),
    )
    expect(router.currentRoute.value.query).toEqual({ tab: 'facturacion' })
  })
})
