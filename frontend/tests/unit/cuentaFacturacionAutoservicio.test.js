// Mi cuenta › Facturación where Boat offers self-service (bootstrap
// capabilities): Datos fiscales read «Listo para facturar» or what is missing
// and save from a sheet whose régimenes follow the RFC (the password again only
// to replace an RFC on file); «Agregar tarjeta» loads Stripe's field only then
// and sends Muelle the SetupIntent id alone, stepping aside while the bank's
// 3-D Secure window runs; each paid invoice and top-up offers «Comprobante
// (PDF)», a failure said under its own row; support opens only once a sheet is
// closed. Without the capabilities none of it shows and the card line is the
// honest one it was.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  seam: vi.fn(),
  toast: vi.fn(),
  support: [],
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: vi.fn(),
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
vi.mock('@/components/cuenta/api', async (importOriginal) => ({
  ...(await importOriginal()),
  seam: (...args) => state.seam(...args),
  mutate: (...args) => state.mutate(...args),
}))

import { createPagos } from '@/components/cuenta/pagos'
import CuentaFacturacion from '@/components/cuenta/CuentaFacturacion.vue'

const OPTIONS = {
  regimenes: [
    {
      code: '601',
      label: 'General de Ley Personas Morales',
      personas: ['moral'],
    },
    {
      code: '612',
      label: 'Personas Físicas con Actividades Empresariales',
      personas: ['fisica'],
    },
  ],
  usos: [
    { code: 'G03', label: 'Gastos en general', regimenes: ['601', '612'] },
  ],
}
const PROFILE = {
  ok: true,
  fiscal_ready: false,
  can_save: true,
  profile: { rfc: '', razon_social: '', regimen: '', cp: '', uso_cfdi: '' },
  options: OPTIONS,
}

let app, root
const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
// An async chunk's first import can take a while on a busy machine.
async function find(selector) {
  for (let i = 0; i < 600; i++) {
    const found = document.querySelector(selector)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return null
}
const button = (text, scope = document) =>
  [...scope.querySelectorAll('button')].find((b) =>
    b.textContent.trim().startsWith(text),
  )
function type(input, value) {
  input.value = value
  input.dispatchEvent(new Event('input'))
}
function choose(select, value) {
  select.value = value
  select.dispatchEvent(new Event('change'))
}

beforeEach(() => {
  state.read.mockReset()
  state.mutate.mockReset()
  state.seam.mockReset()
  state.toast.mockReset()
  state.support.length = 0
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
  state.read.mockImplementation(async (fn) =>
    fn === 'payment_methods' ? { ok: true, cards: [] } : [],
  )
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
  delete window.Stripe
  vi.unstubAllGlobals()
})

function boot(capabilities, overrides = {}) {
  return {
    site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 0 },
    meters: {
      billing: { is_trial: false, monthly_price_mxn: 499 },
      saldo: { balance_mxn: 500, status: 'healthy' },
    },
    store: { addons: [] },
    invoices: [
      {
        name: 'INV-09',
        status: 'Paid',
        period_start: '2026-09-01',
        amount_mxn: 499,
        payment_date: '2026-09-03',
        receipt: true,
      },
    ],
    payment_state: { status: 'ready', authoritative: true, invoices: {} },
    ...(capabilities ? { capabilities } : {}),
    ...overrides,
  }
}
function readyDoor(data) {
  const pagos = createPagos({
    read: (...args) => state.read(...args),
    mutate: (...args) => state.mutate(...args),
    navigate: vi.fn(),
    // What support was asked, and whether a sheet was still on screen then.
    openSupport: (text) =>
      state.support.push({
        text,
        sheet: Boolean(document.querySelector('[role="dialog"]')),
      }) > 0,
    timers: { set: () => 0, clear: () => {} },
  })
  pagos.boot.value = data
  pagos.loading.value = false
  pagos.resolvePaymentState(data.payment_state)
  return pagos
}
function mount(pagos, props = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  app = createApp({
    render: () => h(CuentaFacturacion, { door: pagos, ...props }),
  })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
}

describe('Facturación without self-service capabilities', () => {
  it('no Datos fiscales, no «Agregar tarjeta», no receipt; the card line stays honest', async () => {
    mount(readyDoor(boot()))
    await flush()
    expect(root.querySelector('[data-testid="cuenta-fiscal"]')).toBeNull()
    expect(root.querySelector('[data-testid="factura-comprobante"]')).toBeNull()
    expect(root.textContent).toContain(
      'Adding or replacing a card is not done here yet',
    )
    expect(button('Add a card')).toBeUndefined()
    expect(state.seam).not.toHaveBeenCalled()
  })
})

describe('Datos fiscales', () => {
  it('empty: says what to do; the form filters the régimen by the RFC and saves through Boat', async () => {
    state.seam.mockImplementation(async (method) => {
      if (method === 'billing_profile') return PROFILE
      if (method === 'set_billing_profile')
        return {
          ok: true,
          fiscal_ready: true,
          message: 'Datos guardados. Reintentaremos las facturas pendientes.',
        }
      return null
    })
    mount(readyDoor(boot(['billing_profile'])))
    const section = await find('[data-testid="cuenta-fiscal"]')
    await flush()
    expect(
      section.querySelector('[data-testid="fiscal-estado"]').textContent,
    ).toContain('Add your tax details so we can issue your CFDI.')
    section.querySelector('[data-testid="fiscal-agregar"]').click()
    const form = await find('[data-testid="fiscal-form"]')
    await flush()
    const save = document.querySelector('[data-testid="fiscal-guardar"]')
    expect(save.disabled).toBe(true)
    expect(form.textContent).toContain(
      'Fill in RFC, business name, tax regime, postal code.',
    )
    type(form.querySelector('[data-testid="fiscal-rfc"]'), 'gode561231gr8')
    await flush()
    const regimen = form.querySelector('[data-testid="fiscal-regimen"]')
    // A 13-character RFC is a person's: only personas físicas régimenes.
    expect(
      [...regimen.options].filter((o) => o.value).map((o) => o.value),
    ).toEqual(['612'])
    choose(regimen, '612')
    type(form.querySelector('[data-testid="fiscal-razon"]'), 'Dulces Godínez')
    type(form.querySelector('[data-testid="fiscal-cp"]'), '82000')
    await flush()
    expect(form.querySelector('[data-testid="fiscal-password"]')).toBeNull()
    expect(save.disabled).toBe(false)
    save.click()
    await flush()
    expect(state.seam).toHaveBeenCalledWith(
      'set_billing_profile',
      {
        rfc: 'GODE561231GR8',
        razon_social: 'Dulces Godínez',
        regimen: '612',
        cp: '82000',
        uso_cfdi: 'G03',
      },
      {},
    )
    expect(state.toast).toHaveBeenCalledWith('Tax details saved')
    expect(section.textContent).toContain(
      'Datos guardados. Reintentaremos las facturas pendientes.',
    )
  })

  it('ready: «Listo para facturar»; replacing the RFC on file asks for the password again', async () => {
    const stored = {
      ...PROFILE,
      fiscal_ready: true,
      profile: {
        rfc: 'GODE561231GR8',
        razon_social: 'Dulces Godínez',
        regimen: '612',
        cp: '82000',
        uso_cfdi: 'G03',
      },
    }
    state.seam.mockImplementation(async (method, payload, options) => {
      if (method === 'billing_profile') return stored
      if (method === 'set_billing_profile')
        return options?.password === 'secreto'
          ? { ok: true, fiscal_ready: true, message: 'Datos guardados.' }
          : {
              ok: false,
              reason: 'wrong_password',
              message: 'That password is not right. Type it again.',
              next: 'password',
            }
      return null
    })
    mount(readyDoor(boot(['billing_profile'])))
    const section = await find('[data-testid="cuenta-fiscal"]')
    await flush()
    expect(
      section.querySelector('[data-testid="fiscal-estado"]').textContent,
    ).toContain('Ready to invoice')
    expect(section.textContent).toContain(
      'Personas Físicas con Actividades Empresariales',
    )
    section.querySelector('[data-testid="fiscal-editar"]').click()
    const form = await find('[data-testid="fiscal-form"]')
    await flush()
    type(form.querySelector('[data-testid="fiscal-rfc"]'), 'GOMA700101AB1')
    await flush()
    const password = form.querySelector('[data-testid="fiscal-password"]')
    expect(password).not.toBeNull()
    expect(
      form.querySelector('[data-testid="olvido-contrasena"]').textContent,
    ).toContain('Forgot your password?')
    const save = document.querySelector('[data-testid="fiscal-guardar"]')
    expect(save.disabled).toBe(true)
    expect(form.textContent).toContain('Type your password to change the RFC.')
    type(password, 'otra')
    await flush()
    save.click()
    await flush()
    expect(
      form.querySelector('[data-testid="fiscal-error"]').textContent,
    ).toContain('That password is not right. Type it again.')
    type(form.querySelector('[data-testid="fiscal-password"]'), 'secreto')
    await flush()
    save.click()
    await flush()
    const [, payload, options] = state.seam.mock.calls.at(-2)
    expect(payload.rfc).toBe('GOMA700101AB1')
    // The password travels beside the payload, never inside it.
    expect(payload).not.toHaveProperty('password')
    expect(options).toEqual({ password: 'secreto' })
    expect(state.toast).toHaveBeenCalledWith('Tax details saved')
  })

  it('Boat’s own check of the RFC is said in its words; Boat unreachable offers to retry', async () => {
    state.seam.mockImplementation(async (method) => {
      if (method === 'billing_profile') return PROFILE
      throw Object.assign(
        new Error('doco.docoutils.miplan.call ValidationError'),
        {
          exc_type: 'ValidationError',
          messages: ['Revisa tu RFC: el dígito verificador no corresponde.'],
        },
      )
    })
    mount(readyDoor(boot(['billing_profile'])))
    const section = await find('[data-testid="cuenta-fiscal"]')
    await flush()
    section.querySelector('[data-testid="fiscal-agregar"]').click()
    const form = await find('[data-testid="fiscal-form"]')
    await flush()
    type(form.querySelector('[data-testid="fiscal-rfc"]'), 'GODE561231GR9')
    await flush()
    choose(form.querySelector('[data-testid="fiscal-regimen"]'), '612')
    type(form.querySelector('[data-testid="fiscal-razon"]'), 'Dulces')
    type(form.querySelector('[data-testid="fiscal-cp"]'), '82000')
    await flush()
    document.querySelector('[data-testid="fiscal-guardar"]').click()
    await flush()
    expect(
      form.querySelector('[data-testid="fiscal-error"]').textContent,
    ).toContain('Revisa tu RFC: el dígito verificador no corresponde.')
    app.unmount()
    root.remove()
    state.seam.mockRejectedValue(
      Object.assign(new Error('x'), {
        messages: ['No se pudo contactar la plataforma.'],
      }),
    )
    mount(readyDoor(boot(['billing_profile'])))
    const again = await find('[data-testid="cuenta-fiscal"]')
    await flush()
    expect(again.textContent).toContain('No se pudo contactar la plataforma.')
    expect(button('Try again', again)).toBeDefined()
  })
})

// Stripe.js as the sheet uses it. `answers`: what each confirmCardSetup call
// answers in turn (the last one repeats); `calls` keeps what each was asked
// and whether the sheet was on screen then.
function fakeStripe(answers = [{ id: 'seti_ABC123', status: 'succeeded' }]) {
  const seen = {
    key: '',
    mounted: null,
    mounts: 0,
    secret: '',
    destroyed: 0,
    calls: [],
  }
  const card = {
    on: vi.fn(),
    mount: (el) => {
      seen.mounted = el
      seen.mounts++
    },
    destroy: () => seen.destroyed++,
  }
  window.Stripe = vi.fn((key) => {
    seen.key = key
    return {
      elements: () => ({ create: () => card }),
      confirmCardSetup: vi.fn(async (secret, data, options) => {
        seen.secret = secret
        seen.calls.push({
          data,
          options,
          sheet: Boolean(
            document.querySelector('[data-testid="tarjeta-alta"]'),
          ),
        })
        const answer = answers[Math.min(seen.calls.length, answers.length) - 1]
        return answer.error ? { error: answer.error } : { setupIntent: answer }
      }),
    }
  })
  return seen
}
const SETUP = {
  ok: true,
  mode: 'stripe',
  client_secret: 'seti_0000_secret_0000',
  publishable_key: 'pk_test_123',
}

describe('Agregar tarjeta', () => {
  it('Stripe’s field in a sheet; Muelle gets the SetupIntent id, never the secret', async () => {
    const seen = fakeStripe()
    state.mutate.mockImplementation(async (fn) =>
      fn === 'start_card_setup'
        ? {
            ok: true,
            mode: 'stripe',
            client_secret: 'seti_0000_secret_0000',
            publishable_key: 'pk_test_123',
          }
        : null,
    )
    state.seam.mockResolvedValue({
      ok: true,
      card: { brand: 'visa', last4: '4242' },
    })
    mount(readyDoor(boot(['card_setup'])))
    await flush()
    const cards = root.querySelector('[data-testid="cuenta-tarjetas"]')
    expect(cards.textContent).not.toContain(
      'Adding or replacing a card is not done here yet',
    )
    expect(window.Stripe).not.toHaveBeenCalled()
    button('Add a card', cards).click()
    const sheet = await find('[data-testid="tarjeta-alta"]')
    await flush()
    expect(state.mutate).toHaveBeenCalledWith('start_card_setup')
    expect(seen.key).toBe('pk_test_123')
    expect(seen.mounted).toBe(
      sheet.querySelector('[data-testid="tarjeta-campo"]'),
    )
    document.querySelector('[data-testid="tarjeta-guardar"]').click()
    await flush()
    expect(seen.secret).toBe('seti_0000_secret_0000')
    expect(state.seam).toHaveBeenCalledWith('confirm_card_setup', {
      setup_intent: 'seti_ABC123',
    })
    expect(JSON.stringify(state.seam.mock.calls)).not.toContain('secret')
    expect(state.toast).toHaveBeenCalledWith('Card saved')
    // The list is read again with the new card.
    expect(
      state.read.mock.calls.filter(([fn]) => fn === 'payment_methods'),
    ).toHaveLength(2)
  })

  it('a rail Boat cannot take cards on says so and offers support; nothing loads', async () => {
    fakeStripe()
    state.mutate.mockResolvedValue({
      ok: false,
      reason: 'rail_unsupported',
      message:
        'Por ahora no puedes agregar tu tarjeta desde el panel. Escríbenos desde Ayuda y te ayudamos.',
    })
    mount(readyDoor(boot(['card_setup'])))
    await flush()
    button('Add a card').click()
    const refused = await find('[data-testid="tarjeta-negado"]')
    await flush()
    expect(refused.textContent).toContain(
      'Por ahora no puedes agregar tu tarjeta desde el panel.',
    )
    button('Ask support about my card', refused).click()
    await flush()
    // The sheet closes first: support's dialog never opens under it.
    expect(state.support).toEqual([{ text: '', sheet: false }])
    expect(document.querySelector('[data-testid="tarjeta-alta"]')).toBeNull()
    expect(window.Stripe).not.toHaveBeenCalled()
  })

  it('a bank that asks for 3-D Secure: the sheet steps aside for its window, then saves', async () => {
    const seen = fakeStripe([
      { id: 'seti_ABC123', status: 'requires_action' },
      { id: 'seti_ABC123', status: 'succeeded' },
    ])
    state.mutate.mockResolvedValue(SETUP)
    state.seam.mockResolvedValue({ ok: true })
    mount(readyDoor(boot(['card_setup'])))
    await flush()
    button('Add a card').click()
    await find('[data-testid="tarjeta-alta"]')
    await flush()
    document.querySelector('[data-testid="tarjeta-guardar"]').click()
    await flush()
    // First Stripe hands the check back (handleActions false) inside the sheet;
    // then it runs the bank's window with the sheet out of the way.
    expect(seen.calls).toEqual([
      {
        data: { payment_method: { card: expect.any(Object) } },
        options: { handleActions: false },
        sheet: true,
      },
      { data: undefined, options: undefined, sheet: false },
    ])
    expect(state.seam).toHaveBeenCalledWith('confirm_card_setup', {
      setup_intent: 'seti_ABC123',
    })
    expect(state.toast).toHaveBeenCalledWith('Card saved')
  })

  it('a bank check that fails brings the sheet back with a new field and why', async () => {
    const seen = fakeStripe([
      { id: 'seti_ABC123', status: 'requires_action' },
      {
        error: {
          code: 'setup_intent_authentication_failure',
          message: 'No pudimos autenticar tu tarjeta.',
        },
      },
    ])
    state.mutate.mockResolvedValue(SETUP)
    mount(readyDoor(boot(['card_setup'])))
    await flush()
    button('Add a card').click()
    await find('[data-testid="tarjeta-alta"]')
    await flush()
    expect(seen.mounts).toBe(1)
    document.querySelector('[data-testid="tarjeta-guardar"]').click()
    await flush()
    const sheet = document.querySelector('[data-testid="tarjeta-alta"]')
    expect(sheet).not.toBeNull()
    expect(sheet.textContent).toContain('No pudimos autenticar tu tarjeta.')
    // The old field left the page with the sheet: a new one is mounted.
    expect(seen.mounts).toBe(2)
    expect(seen.mounted).toBe(
      sheet.querySelector('[data-testid="tarjeta-campo"]'),
    )
    expect(
      document.querySelector('[data-testid="tarjeta-guardar"]').disabled,
    ).toBe(false)
    expect(state.seam).not.toHaveBeenCalled()
  })

  it('Stripe never answering lets go of «Guardando» instead of locking the sheet', async () => {
    const timers = []
    fakeStripe()
    window.Stripe.mockImplementation(() => ({
      elements: () => ({
        create: () => ({ on: vi.fn(), mount: vi.fn(), destroy: vi.fn() }),
      }),
      confirmCardSetup: vi.fn(() => new Promise(() => {})),
    }))
    state.mutate.mockResolvedValue(SETUP)
    const { default: TarjetaSheet } = await import(
      '@/components/cuenta/TarjetaSheet.vue'
    )
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({
      render: () =>
        h(TarjetaSheet, {
          open: true,
          timers: {
            set: (fn, ms) => timers.push([fn, ms]) && timers.length,
            clear: () => {},
          },
        }),
    })
    app.config.globalProperties.__ = (...args) => window.__(...args)
    app.mount(root)
    await find('[data-testid="tarjeta-alta"]')
    await flush()
    document.querySelector('[data-testid="tarjeta-guardar"]').click()
    await flush()
    expect(
      document.querySelector('[data-testid="tarjeta-guardar"]').disabled,
    ).toBe(true)
    expect(timers.at(-1)[1]).toBe(45000)
    timers.at(-1)[0]()
    await flush()
    expect(
      document.querySelector('[data-testid="tarjeta-guardar"]').disabled,
    ).toBe(false)
    expect(document.body.textContent).toContain(
      'The connection dropped while we checked your card. Try again.',
    )
  })
})

describe('Comprobante', () => {
  it('each paid invoice and top-up offers «Comprobante (PDF)» through the receipt relay', async () => {
    state.read.mockImplementation(async (fn) => {
      if (fn === 'payment_methods') return { ok: true, cards: [] }
      if (fn === 'wallet_txns')
        return [
          {
            name: 'TX-1',
            txn_type: 'Top-up',
            amount_mxn: 500,
            creation: '2026-11-10 10:00:00',
          },
          {
            name: 'TX-2',
            txn_type: 'Debit',
            amount_mxn: -3,
            service_key: 'cfdi_timbres',
            creation: '2026-11-10 11:00:00',
          },
        ]
      return null
    })
    const save = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => 'application/pdf' },
        blob: async () => new Blob(['%PDF']),
      })),
    )
    mount(readyDoor(boot(['receipts'])), { saveFile: save })
    await flush()
    const invoice = root.querySelector('[data-testid="factura-comprobante"]')
    expect(invoice.textContent.trim()).toBe('Receipt (PDF)')
    expect(invoice.textContent).not.toMatch(/factura/i)
    const topups = root.querySelectorAll('[data-testid="recarga-comprobante"]')
    expect(topups).toHaveLength(1)
    invoice.click()
    await flush()
    expect(fetch.mock.calls[0][0]).toBe(
      '/api/method/doco.docoutils.miplan.download_receipt?invoice=INV-09',
    )
    expect(save.mock.calls[0][1]).toBe('Comprobante-INV-09.pdf')
    topups[0].click()
    await flush()
    expect(fetch.mock.calls[1][0]).toBe(
      '/api/method/doco.docoutils.miplan.download_receipt?txn=TX-1',
    )
  })

  it('a receipt that fails says so under the row that was tapped', async () => {
    state.read.mockImplementation(async (fn) => {
      if (fn === 'payment_methods') return { ok: true, cards: [] }
      if (fn === 'wallet_txns')
        return [
          {
            name: 'TX-1',
            txn_type: 'Top-up',
            amount_mxn: 500,
            creation: '2026-11-10 10:00:00',
          },
        ]
      return null
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        json: async () => ({
          exception: 'Comprobante no encontrado',
          _server_messages: JSON.stringify([
            JSON.stringify({ message: 'Comprobante no encontrado' }),
          ]),
        }),
        text: async () => 'Comprobante no encontrado',
      })),
    )
    mount(readyDoor(boot(['receipts'])), { saveFile: vi.fn() })
    await flush()
    const ledger = root.querySelector('[data-testid="cuenta-movimientos"]')
    ledger.querySelector('[data-testid="recarga-comprobante"]').click()
    await flush()
    const failed = root.querySelectorAll('[data-testid="comprobante-error"]')
    expect(failed).toHaveLength(1)
    expect(ledger.contains(failed[0])).toBe(true)
    expect(failed[0].textContent.trim()).not.toBe('')
    const invoices = root.querySelector(
      '[data-testid="cuenta-facturas-pagadas"]',
    )
    expect(
      invoices.querySelector('[data-testid="comprobante-error"]'),
    ).toBeNull()
    button('Ask support for help', failed[0]).click()
    expect(state.support).toEqual([{ text: '', sheet: false }])
  })
})
