// Mi cuenta › Tienda where Boat offers self-service (bootstrap capabilities):
// «Agregar 1 usuario» is two taps (the stepper, then the button named after
// the change over Boat's quote, which must answer the count on screen), a
// refusal says Boat's reason with its next step (support for «desactiva»),
// «Activar Taller» is three taps and its row follows the install,
// «Desactivar» is two taps in place with Boat's note, a plan change reads
// Boat's quote and applies at once, and a change Boat scheduled shows under
// the plan with the way to cancel it. Without the capabilities Tienda is what
// it was: no seats, no apps, the plan button a request Muelle confirms.
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
    // The shell's boot, read again after the plan.
    call: vi.fn(async () => ({
      user: { name: 'owner@example.test' },
      modules: {},
      account: { cuenta: true, plan: null },
    })),
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
  read: (...args) => state.read(...args),
  mutate: (...args) => state.mutate(...args),
  seam: (...args) => state.seam(...args),
}))

import { createMemoryHistory, createRouter } from 'vue-router'
import { createPagos } from '@/components/cuenta/pagos'
import CuentaTienda from '@/components/cuenta/CuentaTienda.vue'
import Cuenta from '@/pages/Cuenta.vue'
import { shellBoot } from '@/composables/muelleShell'

const STORE = {
  current_plan: 'pro',
  requested_plan: null,
  plans: [
    { name: 'basico', plan_name: 'Básico', monthly_price_mxn: 299 },
    { name: 'pro', plan_name: 'Pro', monthly_price_mxn: 499 },
    { name: 'premium', plan_name: 'Premium', monthly_price_mxn: 899 },
  ],
  addons: [],
}
const SEATS = {
  ok: true,
  changed: false,
  users: {
    included: 2,
    extra: 0,
    extra_target: 0,
    unit_price_mxn: 99,
    max_total: 5,
    scheduled_extra: null,
  },
  sucursales: {
    included: 1,
    extra: 0,
    extra_target: 0,
    unit_price_mxn: 149,
    max_total: 3,
    scheduled_extra: null,
  },
  pending: null,
  message: 'No hay cambios.',
}
const APPS = {
  ok: true,
  unavailable_reason: null,
  apps: [
    {
      app: 'taller',
      title_es: 'Taller',
      blurb_es: 'Órdenes de reparación',
      description_es: 'Recibe equipos, diagnostica y entrega.',
      features_es: ['Órdenes con fotos'],
      status: 'available',
      seed_options: ['clean', 'sample'],
    },
    {
      app: 'hrms',
      title_es: 'RRHH',
      status: 'active',
      can_deactivate: true,
      deactivate_note:
        'Se quita del menú del Escritorio. Tus datos se quedan y puedes volver a activarla cuando quieras.',
    },
  ],
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

beforeEach(() => {
  state.read.mockReset()
  state.mutate.mockReset()
  state.seam.mockReset()
  state.toast.mockReset()
  state.support.length = 0
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
})

function boot(capabilities, overrides = {}) {
  return {
    site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 0 },
    meters: {
      billing: { is_trial: false, monthly_price_mxn: 499 },
      seats: { max_users: 2, max_sucursales: 1 },
    },
    seats_local: { users_used: 2, sucursales_used: 1 },
    invoices: [],
    store: STORE,
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
    openSupport: (text) => state.support.push(text) > 0,
    timers: { set: () => 0, clear: () => {} },
  })
  pagos.boot.value = data
  pagos.loading.value = false
  pagos.resolvePaymentState(data.payment_state)
  return pagos
}
function mount(pagos) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const events = []
  app = createApp({
    render: () =>
      h(CuentaTienda, { door: pagos, onAct: (key) => events.push(key) }),
  })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
  return events
}

describe('Tienda without self-service capabilities', () => {
  it('shows no users, cajas or apps and asks Boat nothing new; a plan change stays a request', async () => {
    state.mutate.mockResolvedValue({ note: 'Recibimos tu solicitud.' })
    state.read.mockResolvedValue(boot())
    mount(readyDoor(boot()))
    await flush()
    expect(root.querySelector('[data-testid="cuenta-usuarios"]')).toBeNull()
    expect(root.querySelector('[data-testid="cuenta-apps"]')).toBeNull()
    expect(state.seam).not.toHaveBeenCalled()
    root.querySelector('[data-testid="plan-cambiar"]').click()
    await find('[data-testid="cuenta-confirmar"]')
    expect(document.body.textContent).toContain('Muelle confirms the change')
    expect(document.querySelector('[data-testid="plan-cambio"]')).toBeNull()
  })
})

describe('Usuarios y cajas', () => {
  it('reads Boat’s counts; «+» then «Confirmar» adds one user over Boat’s quote', async () => {
    state.seam.mockImplementation(async (method, payload) => {
      if (method === 'seats_quote' && payload.extra_users === 0) return SEATS
      if (method === 'seats_quote')
        return {
          ...SEATS,
          users: { ...SEATS.users, extra_target: payload.extra_users },
          changed: true,
          increase: ['users'],
          decrease: [],
          charge_now_mxn: 66,
          charge_on: 'next_invoice',
          monthly_delta_mxn: 99,
          message:
            'Agregas 1 usuario por $99.00 al mes, IVA incluido. Tu próxima factura suma $66.00 por los días que faltan de este mes.',
        }
      if (method === 'set_seats')
        return { ok: true, changed: true, applied: ['users'], scheduled: [] }
      return null
    })
    state.read.mockResolvedValue(boot(['seats']))
    const pagos = readyDoor(boot(['seats']))
    mount(pagos)
    const users = await find('[data-testid="usuarios-users"]')
    await flush()
    expect(state.seam).toHaveBeenCalledWith('seats_quote', { extra_users: 0 })
    expect(users.textContent).toContain('Your plan includes 2')
    expect(users.textContent).toContain('2 in use')
    expect(users.textContent).toContain(
      '$99.00 a month for each extra user, IVA included',
    )
    users.querySelector('[data-testid="usuarios-mas"]').click()
    const sheet = await find('[data-testid="usuarios-cambio"]')
    await flush()
    expect(document.querySelector('[role="dialog"] h2').textContent).toBe(
      'Add 1 user',
    )
    expect(state.seam).toHaveBeenLastCalledWith('seats_quote', {
      extra_users: 1,
    })
    expect(
      sheet.querySelector('[data-testid="cambio-monto"]').textContent.trim(),
    ).toBe('$66.00')
    expect(sheet.textContent).toContain(
      'Added to your next invoice for the rest of this month, IVA included',
    )
    expect(sheet.textContent).toContain('The increase applies today.')
    expect(sheet.textContent).toContain('Agregas 1 usuario por $99.00')
    expect(sheet.textContent).not.toMatch(/\+\s*IVA/)
    const confirm = document.querySelector('[data-testid="cambio-confirmar"]')
    // The button says what happens; its toast repeats the verb.
    expect(confirm.textContent).toBe('Add 1 user')
    confirm.click()
    await flush()
    const [, payload] = state.seam.mock.calls.find(([m]) => m === 'set_seats')
    expect(payload.extra_users).toBe(1)
    expect(typeof payload.idempotency_key).toBe('string')
    expect(payload.idempotency_key.length).toBeGreaterThan(0)
    expect(state.toast).toHaveBeenCalledWith('You added 1 user')
    // The account is read again, and with it the counts.
    expect(state.read).toHaveBeenCalledWith('bootstrap', { require_fresh: 1 })
  })

  it('a decrease Boat refuses says its reason and offers support, never Equipo', async () => {
    // 2 included + 2 extra, 4 active: «no extras» is refused, which names the extras.
    const inUse = (cap) => ({
      ok: false,
      reason: 'seats_in_use',
      message: `Tienes 4 usuarios activos. Desactiva ${4 - cap} para bajar a ${cap}.`,
      next: 'deactivate',
      deactivate: { users: 4 - cap },
      active: 4,
    })
    state.seam.mockImplementation(async (method, payload) => {
      if (method !== 'seats_quote') return null
      if (payload.extra_users === 2)
        return {
          ...SEATS,
          users: { ...SEATS.users, extra: 2, extra_target: 2 },
        }
      return inUse(2 + payload.extra_users)
    })
    const data = boot(['seats'], {
      meters: {
        billing: { is_trial: false, monthly_price_mxn: 499 },
        seats: { max_users: 4, max_sucursales: 1 },
      },
      seats_local: { users_used: 4, sucursales_used: 1 },
    })
    const events = mount(readyDoor(data))
    const users = await find('[data-testid="usuarios-users"]')
    await flush()
    expect(users.textContent).toContain(
      'Your plan includes 2, plus 2 users extra',
    )
    users.querySelector('[data-testid="usuarios-menos"]').click()
    const refused = await find('[data-testid="cambio-negado"]')
    await flush()
    expect(state.seam).toHaveBeenLastCalledWith('seats_quote', {
      extra_users: 1,
    })
    expect(refused.textContent).toContain(
      'Tienes 4 usuarios activos. Desactiva 1 para bajar a 3.',
    )
    expect(
      document.querySelector('[data-testid="cambio-confirmar"]').disabled,
    ).toBe(true)
    expect(button('Open Equipo', refused)).toBeUndefined()
    button('Ask support for help', refused).click()
    await flush()
    // The sheet closes first; the page then opens support.
    expect(events).toEqual(['support'])
    expect(document.querySelector('[data-testid="usuarios-cambio"]')).toBeNull()
    expect(state.seam).not.toHaveBeenCalledWith('set_seats', expect.anything())
  })

  it('a quote still answering an earlier tap never confirms the count on screen', async () => {
    const asked = []
    state.seam.mockImplementation((method, payload) => {
      if (method === 'seats_quote' && payload.extra_users === 0)
        return Promise.resolve(SEATS)
      if (method === 'seats_quote')
        return new Promise((resolve) =>
          asked.push({ target: payload.extra_users, resolve }),
        )
      if (method === 'set_seats')
        return Promise.resolve({ ok: true, applied: ['users'], scheduled: [] })
      return Promise.resolve(null)
    })
    const quote = (n) => ({
      ...SEATS,
      users: { ...SEATS.users, extra_target: n },
      changed: true,
      increase: ['users'],
      decrease: [],
      charge_now_mxn: 66 * n,
      charge_on: 'next_invoice',
      monthly_delta_mxn: 99 * n,
      message: `Agregas ${n} usuarios.`,
    })
    const { default: UsuariosCajas } = await import(
      '@/components/cuenta/UsuariosCajas.vue'
    )
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({
      render: () =>
        h(UsuariosCajas, { door: readyDoor(boot(['seats'])), debounceMs: 20 }),
    })
    app.config.globalProperties.__ = (...args) => window.__(...args)
    app.mount(root)
    const users = await find('[data-testid="usuarios-users"]')
    await flush()
    users.querySelector('[data-testid="usuarios-mas"]').click()
    const sheet = await find('[data-testid="usuarios-cambio"]')
    await flush()
    expect(asked.map((a) => a.target)).toEqual([1])
    // «+» again (2), and the quote for 1 lands inside the wait.
    sheet.querySelector('[data-testid="cambio-mas"]').click()
    await flush()
    asked[0].resolve(quote(1))
    await flush()
    const confirm = () =>
      document.querySelector('[data-testid="cambio-confirmar"]')
    expect(
      sheet.querySelector('[data-testid="cambio-cantidad"]').textContent,
    ).toBe('2')
    expect(confirm().disabled).toBe(true)
    expect(sheet.querySelector('[data-testid="cambio-monto"]')).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 40))
    await flush()
    expect(asked.map((a) => a.target)).toEqual([1, 2])
    asked[1].resolve(quote(2))
    await flush()
    expect(
      sheet.querySelector('[data-testid="cambio-monto"]').textContent.trim(),
    ).toBe('$132.00')
    expect(confirm().disabled).toBe(false)
    expect(confirm().textContent).toBe('Add 2 users')
    confirm().click()
    await flush()
    const [, payload] = state.seam.mock.calls.find(([m]) => m === 'set_seats')
    expect(payload.extra_users).toBe(2)
    expect(state.toast).toHaveBeenCalledWith('You added 2 users')
  })

  it('with a decrease scheduled, «+» reads as a change to that decrease', async () => {
    const scheduled = {
      ...SEATS,
      users: { ...SEATS.users, extra: 3, extra_target: 1, scheduled_extra: 1 },
      pending: { seats: { extra_users: 1, effective_date: '2026-12-01' } },
    }
    state.seam.mockImplementation(async (method, payload) => {
      if (method !== 'seats_quote') return null
      if (payload.extra_users === 0) return scheduled
      return {
        ...scheduled,
        users: { ...scheduled.users, extra_target: payload.extra_users },
        changed: true,
        increase: [],
        decrease: ['users'],
        decrease_effective_date: '2099-12-01',
        monthly_delta_mxn: -99,
        message: 'Bajas a 2 usuarios extra desde el 1 de diciembre.',
      }
    })
    mount(readyDoor(boot(['seats'])))
    const users = await find('[data-testid="usuarios-users"]')
    await flush()
    expect(users.textContent).toContain('Goes down to 1 extra on')
    users.querySelector('[data-testid="usuarios-mas"]').click()
    await find('[data-testid="usuarios-cambio"]')
    await flush()
    expect(state.seam).toHaveBeenLastCalledWith('seats_quote', {
      extra_users: 2,
    })
    expect(document.querySelector('[role="dialog"] h2').textContent).toBe(
      'Go down to 2 users extra',
    )
    expect(
      document.querySelector('[data-testid="cambio-confirmar"]').textContent,
    ).toBe('Schedule the decrease')
  })

  it('a trial reads Boat’s refusal with «Activar tu plan»; Boat unreachable offers to retry', async () => {
    state.seam.mockResolvedValueOnce({
      ok: false,
      reason: 'trial',
      message: 'Activa tu plan para agregar usuarios o cajas.',
      next: 'activate_plan',
    })
    const events = mount(readyDoor(boot(['seats'])))
    const refused = await find('[data-testid="usuarios-negado"]')
    await flush()
    expect(refused.textContent).toContain(
      'Activa tu plan para agregar usuarios o cajas.',
    )
    button('Activate your plan', refused).click()
    expect(events).toEqual(['activate'])
    app.unmount()
    root.remove()
    state.seam.mockRejectedValueOnce(
      Object.assign(
        new Error('doco.docoutils.miplan.call PlatformUnavailable'),
        {
          messages: [
            'No se pudo contactar la plataforma. Intenta de nuevo en unos minutos.',
          ],
        },
      ),
    )
    mount(readyDoor(boot(['seats'])))
    const section = await find('[data-testid="cuenta-usuarios"]')
    await flush()
    expect(section.textContent).toContain('No se pudo contactar la plataforma.')
    expect(button('Try again', section)).toBeDefined()
  })
})

describe('Aplicaciones', () => {
  it('«Activar», «con datos de ejemplo», «Activar»: three taps, then the row follows the install', async () => {
    const polls = []
    let installing = false
    state.seam.mockImplementation(async (method, payload) => {
      if (method === 'my_apps')
        return installing
          ? {
              ...APPS,
              apps: [
                {
                  ...APPS.apps[0],
                  status: 'active',
                },
                APPS.apps[1],
              ],
            }
          : APPS
      if (method === 'activate_app') {
        installing = true
        return {
          ok: true,
          dispatched: true,
          app: payload.app,
          status: 'installing',
          progress: {
            phase: 'queued',
            label_es: 'En cola; empieza en un momento',
            step: 0,
            steps: 3,
          },
        }
      }
      return null
    })
    mount(readyDoor(boot(['apps'])))
    const taller = await find('[data-testid="app-taller"]')
    await flush()
    expect(taller.textContent).toContain('Taller')
    expect(taller.textContent).not.toMatch(/\$/)
    expect(root.textContent).toContain(
      'They come with your plan at no extra cost.',
    )
    const hrms = root.querySelector('[data-testid="app-hrms"]')
    expect(hrms.textContent).toContain('Active app')
    taller.querySelector('[data-testid="app-activar"]').click()
    const sheet = await find('[data-testid="app-activacion"]')
    expect(document.querySelector('[role="dialog"] h2').textContent).toBe(
      'Turn on Taller',
    )
    expect(sheet.textContent).toContain(
      'Recibe equipos, diagnostica y entrega.',
    )
    const start = sheet.querySelector('[data-testid="app-inicio"]')
    expect(start.querySelector('[role="radiogroup"]')).not.toBeNull()
    expect(start.textContent).toContain('You start with your own data.')
    button('With sample data', start).click()
    await flush()
    expect(start.textContent).toContain(
      'To try it before you use it with your own data.',
    )
    document.querySelector('[data-testid="app-confirmar"]').click()
    await flush()
    expect(state.seam).toHaveBeenCalledWith('activate_app', {
      app: 'taller',
      seed_choice: 'sample',
    })
    expect(state.toast).toHaveBeenCalledWith(
      'We are installing it; it takes a few minutes.',
    )
    const row = root.querySelector('[data-testid="app-taller"]')
    expect(row.dataset.status).toBe('installing')
    expect(row.textContent).toContain('En cola; empieza en un momento')
    polls.push(state.seam.mock.calls.filter(([m]) => m === 'my_apps').length)
    expect(polls[0]).toBe(1)
  })

  it('a poll asks Boat again while an app installs, and stops once it is active', async () => {
    const timers = []
    state.seam
      .mockResolvedValueOnce({
        ...APPS,
        apps: [
          {
            ...APPS.apps[0],
            status: 'installing',
            progress: { label_es: 'Instalando Taller', step: 1, steps: 3 },
          },
        ],
      })
      .mockResolvedValueOnce({
        ...APPS,
        apps: [{ ...APPS.apps[0], status: 'active' }],
      })
    const { default: Aplicaciones } = await import(
      '@/components/cuenta/Aplicaciones.vue'
    )
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({
      render: () =>
        h(Aplicaciones, {
          door: readyDoor(boot(['apps'])),
          timers: {
            set: (fn) => timers.push(fn) && timers.length,
            clear: () => {},
          },
        }),
    })
    app.config.globalProperties.__ = (...args) => window.__(...args)
    app.mount(root)
    await flush()
    const row = root.querySelector('[data-testid="app-taller"]')
    expect(row.textContent).toContain('Instalando Taller, step 1 of 3')
    expect(
      row.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),
    ).toBe('33')
    expect(timers).toHaveLength(1)
    timers[0]()
    await flush()
    expect(
      root.querySelector('[data-testid="app-taller"]').dataset.status,
    ).toBe('active')
    expect(timers).toHaveLength(1)
  })

  it('«Desactivar» is two taps in place with Boat’s note about what it hides', async () => {
    state.seam.mockImplementation(async (method, payload) => {
      if (method === 'my_apps') return APPS
      if (method === 'deactivate_app')
        return {
          ok: true,
          changed: true,
          app: payload.app,
          status: 'available',
          note: 'Se quita del menú del Escritorio. Tus datos se quedan y puedes volver a activarla cuando quieras.',
        }
      return null
    })
    mount(readyDoor(boot(['apps'])))
    const hrms = await find('[data-testid="app-hrms"]')
    await flush()
    hrms.querySelector('[data-testid="app-desactivar"]').click()
    await flush()
    expect(state.seam).not.toHaveBeenCalledWith(
      'deactivate_app',
      expect.anything(),
    )
    const sure = hrms.querySelector('[data-testid="app-desactivar-si"]')
    expect(sure.textContent.trim()).toBe('Turn off RRHH')
    expect(hrms.textContent).toContain('Tus datos se quedan')
    sure.click()
    await flush()
    expect(state.seam).toHaveBeenCalledWith('deactivate_app', { app: 'hrms' })
    expect(state.toast).toHaveBeenCalledWith(
      'Se quita del menú del Escritorio. Tus datos se quedan y puedes volver a activarla cuando quieras.',
    )
  })

  it('a seam Boat answers as disabled hides the block', async () => {
    state.seam.mockResolvedValue({ ok: false, reason: 'disabled' })
    mount(readyDoor(boot(['apps'])))
    await flush()
    await flush()
    expect(root.querySelector('[data-testid="cuenta-apps"]')).toBeNull()
  })
})

describe('Cambiar de plan', () => {
  const QUOTE = {
    ok: true,
    changed: true,
    action: 'change',
    target: { plan: 'premium', plan_name: 'Premium', cycle: 'Mensual' },
    applies: 'now',
    plan_effective_date: '2099-01-01',
    charge_now_mxn: 266.67,
    charge_on: 'next_invoice',
    new_price_mxn: 899,
    new_cycle: 'Mensual',
    message:
      'Cambias a Premium desde hoy. Precio: $899.00 al mes, IVA incluido.',
  }

  it('the plan’s button opens Boat’s quote; «Cambiar de plan» applies it', async () => {
    state.seam.mockImplementation(async (method) => {
      if (method === 'plan_change_quote') return QUOTE
      if (method === 'change_plan') return { ...QUOTE, consent: 'PC-1' }
      return null
    })
    state.read.mockResolvedValue(boot(['plan_change']))
    mount(readyDoor(boot(['plan_change'])))
    await flush()
    const [, premium] = root.querySelectorAll('[data-testid="plan-cambiar"]')
    premium.click()
    const sheet = await find('[data-testid="plan-cambio"]')
    await flush()
    expect(state.seam).toHaveBeenCalledWith('plan_change_quote', {
      target_plan: 'premium',
      cycle: 'Mensual',
    })
    expect(
      sheet
        .querySelector('[data-testid="plan-cambio-monto"]')
        .textContent.trim(),
    ).toBe('$266.67')
    expect(sheet.textContent).toContain('Then $899.00 a month, IVA included')
    expect(sheet.textContent).toContain(
      'Your plan changes on 1 de enero de 2099.',
    )
    expect(document.body.textContent).not.toContain(
      'Muelle confirms the change',
    )
    document.querySelector('[data-testid="plan-cambio-confirmar"]').click()
    await flush()
    const [, payload] = state.seam.mock.calls.find(([m]) => m === 'change_plan')
    expect(payload).toMatchObject({ target_plan: 'premium', cycle: 'Mensual' })
    expect(payload.idempotency_key).toBeTruthy()
    expect(state.toast).toHaveBeenCalledWith('Plan changed')
    expect(state.mutate).not.toHaveBeenCalledWith(
      'request_plan',
      expect.anything(),
    )
  })

  it('«Pagar por año» quotes the yearly cycle; Boat sending it to Muelle keeps the request', async () => {
    state.seam.mockResolvedValue({
      ok: false,
      reason: 'support_only',
      message: 'Este cambio de plan lo hace soporte. Solicítalo y te avisamos.',
      next: 'request_plan',
    })
    mount(readyDoor(boot(['plan_change'])))
    await flush()
    const current = root.querySelector('[data-current="true"]')
    // Boat quotes the yearly price in the sheet: none of ours beside the button.
    expect(current.textContent).not.toContain('$4,990')
    current.querySelector('[data-testid="plan-anual"]').click()
    const refused = await find('[data-testid="plan-cambio-negado"]')
    await flush()
    expect(state.seam).toHaveBeenCalledWith('plan_change_quote', {
      target_plan: 'pro',
      cycle: 'Anual',
    })
    expect(refused.textContent).toContain(
      'Este cambio de plan lo hace soporte.',
    )
    // A request carries the plan, never the cycle: the cycle goes to support.
    button('Request the change', refused).click()
    await flush()
    expect(state.support).toEqual([
      'I want to switch my plan Pro to the yearly cycle.',
    ])
    // Another plan Boat sends to Muelle keeps the request it always was.
    const [basico] = root.querySelectorAll('[data-testid="plan-cambiar"]')
    basico.click()
    const again = await find('[data-testid="plan-cambio-negado"]')
    await flush()
    button('Request the change', again).click()
    const confirm = await find('[data-testid="cuenta-confirmar"]')
    expect(confirm.textContent).toContain('Muelle confirms the change')
  })
})

describe('a plan change Boat scheduled', () => {
  it('shows under the current plan and «Cancelar el cambio programado» undoes it', async () => {
    const scheduledQuote = {
      ok: true,
      changed: true,
      action: 'cancel',
      current: { plan: 'pro', plan_name: 'Pro', cycle: 'Mensual' },
      target: { plan: 'pro', plan_name: 'Pro', cycle: 'Mensual' },
      pending: {
        plan: {
          plan: 'basico',
          cycle: null,
          effective_date: '2099-12-01',
          blocked: null,
          installing: false,
        },
      },
      message: 'Cancelas el cambio programado; tu plan sigue igual.',
    }
    let pendingOn = true
    state.seam.mockImplementation(async (method, payload) => {
      if (method === 'plan_change_quote' && payload.target_plan === 'pro')
        return pendingOn
          ? scheduledQuote
          : { ok: false, reason: 'same_plan', message: 'Ya tienes ese plan.' }
      if (method === 'change_plan') {
        pendingOn = false
        return { ok: true, changed: true, action: 'cancel' }
      }
      return null
    })
    state.read.mockResolvedValue(boot(['plan_change']))
    mount(readyDoor(boot(['plan_change'])))
    const line = await find('[data-testid="plan-programado"]')
    await flush()
    expect(state.seam).toHaveBeenCalledWith('plan_change_quote', {
      target_plan: 'pro',
      cycle: 'Mensual',
    })
    expect(line.closest('[data-current="true"]')).not.toBeNull()
    expect(line.textContent).toContain(
      'You switch to Básico on 1 de diciembre de 2099.',
    )
    const [basico] = root.querySelectorAll('#cuenta-planes ~ ul > li')
    expect(basico.textContent).toContain('Scheduled for 1 de diciembre de 2099')
    expect(basico.querySelector('[data-testid="plan-cambiar"]')).toBeNull()
    line.querySelector('[data-testid="plan-programado-cancelar"]').click()
    const sheet = await find('[data-testid="plan-cambio"]')
    await flush()
    expect(document.querySelector('[role="dialog"] h2').textContent).toBe(
      'Cancel the scheduled change',
    )
    // Today's plan and cycle: no cycle to pick.
    expect(sheet.querySelector('[role="radiogroup"]')).toBeNull()
    expect(sheet.textContent).toContain('Cancelas el cambio programado')
    const confirm = document.querySelector(
      '[data-testid="plan-cambio-confirmar"]',
    )
    expect(confirm.textContent).toBe('Cancel the scheduled change')
    confirm.click()
    await flush()
    const [, payload] = state.seam.mock.calls.find(([m]) => m === 'change_plan')
    expect(payload).toMatchObject({ target_plan: 'pro', cycle: 'Mensual' })
    expect(state.toast).toHaveBeenCalledWith('Scheduled change cancelled')
    await flush()
    expect(root.querySelector('[data-testid="plan-programado"]')).toBeNull()
  })

  it('a scheduled switch to the yearly cycle hides «Pagar cada año» and offers the undo', async () => {
    state.seam.mockImplementation(async (method, payload) =>
      method === 'plan_change_quote' && payload.target_plan === 'pro'
        ? {
            ok: true,
            changed: true,
            action: 'cancel',
            pending: {
              plan: {
                plan: null,
                cycle: 'Anual',
                effective_date: '2099-12-01',
              },
            },
            message: 'Cancelas el cambio programado; tu plan sigue igual.',
          }
        : null,
    )
    mount(readyDoor(boot(['plan_change'])))
    const line = await find('[data-testid="plan-programado"]')
    await flush()
    expect(line.textContent).toContain(
      'You pay yearly from 1 de diciembre de 2099.',
    )
    const current = root.querySelector('[data-current="true"]')
    expect(current.querySelector('[data-testid="plan-anual"]')).toBeNull()
    expect(
      current.querySelector('[data-testid="plan-programado-cancelar"]'),
    ).not.toBeNull()
  })
})

describe('Cambiar de plan on a trial', () => {
  it('Boat changes plans only once activated: a trial keeps the request', async () => {
    const data = boot(['plan_change'], {
      site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 1 },
      meters: { billing: { is_trial: true, monthly_price_mxn: 499 } },
    })
    mount(readyDoor(data))
    await flush()
    root.querySelector('[data-testid="plan-cambiar"]').click()
    const confirm = await find('[data-testid="cuenta-confirmar"]')
    expect(confirm.textContent).toContain('Muelle confirms the change')
    expect(state.seam).not.toHaveBeenCalled()
  })
})

describe('the Cuenta page with self-service', () => {
  it('?tab=tienda opens users and cajas; Boat’s «desactiva» step asks support, never Equipo', async () => {
    shellBoot.value = {
      user: { name: 'owner@example.test' },
      account: { cuenta: true, plan: null },
    }
    state.read.mockImplementation(async (fn) =>
      fn === 'bootstrap' ? boot(['seats']) : null,
    )
    state.seam.mockResolvedValue({
      ok: false,
      reason: 'seats_in_use',
      message: 'Tienes 3 usuarios activos. Desactiva 1 para bajar a 2.',
      next: 'deactivate',
      deactivate: { users: 1 },
      active: 3,
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/cuenta', component: Cuenta, meta: { app: 'cuenta' } },
        { path: '/equipo', name: 'Equipo', component: { render: () => null } },
      ],
    })
    await router.push('/cuenta?tab=tienda')
    await router.isReady()
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ render: () => h(Cuenta) })
    app.config.globalProperties.__ = (...args) => window.__(...args)
    app.use(router)
    app.mount(root)
    const refused = await find('[data-testid="usuarios-negado"]')
    await flush()
    expect(refused.textContent).toContain('Desactiva 1 para bajar a 2.')
    button('Ask support for help', refused).click()
    await flush()
    expect(router.currentRoute.value.path).toBe('/cuenta')
    // No support window on this test page: Tienda says where help is.
    expect(root.textContent).toContain('Open Help and choose Report a problem.')
  })

  it('«Ver planes» from a refusal brings the plans into view: users and apps sit above them', async () => {
    shellBoot.value = {
      user: { name: 'owner@example.test' },
      account: { cuenta: true, plan: null },
    }
    state.read.mockImplementation(async (fn) =>
      fn === 'bootstrap' ? boot(['seats']) : null,
    )
    state.seam.mockImplementation(async (method, payload) => {
      if (method === 'seats_quote' && payload.extra_users === 0) return SEATS
      return {
        ok: false,
        reason: 'over_plan_total',
        message:
          'Tu plan Pro permite máximo 2 usuarios en total. Cambia de plan para tener más.',
        next: 'plan_change',
        max_total: 2,
      }
    })
    const scrolled = []
    Element.prototype.scrollIntoView = function () {
      scrolled.push(this.id)
    }
    try {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/cuenta', component: Cuenta, meta: { app: 'cuenta' } },
        ],
      })
      await router.push('/cuenta?tab=tienda')
      await router.isReady()
      root = document.createElement('div')
      document.body.appendChild(root)
      app = createApp({ render: () => h(Cuenta) })
      app.config.globalProperties.__ = (...args) => window.__(...args)
      app.use(router)
      app.mount(root)
      const users = await find('[data-testid="usuarios-users"]')
      await flush()
      users.querySelector('[data-testid="usuarios-mas"]').click()
      const refused = await find('[data-testid="cambio-negado"]')
      await flush()
      expect(refused.textContent).toContain('máximo 2 usuarios en total')
      button('See plans', refused).click()
      await flush()
      // The sheet closes and the plans' title comes up under the bar.
      expect(
        document.querySelector('[data-testid="usuarios-cambio"]'),
      ).toBeNull()
      for (let i = 0; i < 40 && !scrolled.includes('cuenta-planes'); i++)
        await new Promise((resolve) => setTimeout(resolve, 25))
      expect(scrolled).toContain('cuenta-planes')
      expect(router.currentRoute.value.query.tab).toBe('tienda')
      // The closed sheet hands focus back to «+», which scrolls to it: the
      // plans come back under the bar.
      const plus = root.querySelector('[data-testid="usuarios-mas"]')
      scrolled.length = 0
      plus.focus()
      plus.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(scrolled).toContain('cuenta-planes')
      // Once the owner touches the page, it is theirs.
      root.firstElementChild.dispatchEvent(
        new Event('pointerdown', { bubbles: true }),
      )
      scrolled.length = 0
      plus.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(scrolled).toEqual([])
    } finally {
      delete Element.prototype.scrollIntoView
    }
  })
})
