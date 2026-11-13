// Mi cuenta › Tienda › «Tu tienda en línea» (Boat capability «storefront_address»):
// the store's address with Boat's word on it (Funcionando, Conectando…, Sin
// dirección); «Elegir dirección» opens a sheet that checks the name with Boat as
// it is typed and «Conectar» connects it once Boat says it is free; a connecting
// address is read again by itself until it works, with no button to press; and
// «Enciende tu tienda» lists what doco checks, each step with where it is
// fixed, turning the store on only when all pass, for the system's
// administrator, with Boat's refusal in its words. Without the capability Tienda
// shows none of it and asks nothing new.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({
  seam: vi.fn(),
  readiness: vi.fn(),
  turnOn: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
  toast: vi.fn(),
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
        (props, { emit, attrs }) =>
        () =>
          h(
            'button',
            {
              disabled: props.disabled,
              'data-variant': props.variant || 'subtle',
              'data-testid': attrs['data-testid'],
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
  storeReadiness: (...args) => state.readiness(...args),
  turnOnStore: (...args) => state.turnOn(...args),
}))

import { createMemoryHistory, createRouter } from 'vue-router'
import TiendaEnLinea from '@/components/cuenta/TiendaEnLinea.vue'
import CuentaTienda from '@/components/cuenta/CuentaTienda.vue'
import { createPagos } from '@/components/cuenta/pagos'
import {
  POLL_MS,
  addressView,
  checklistRows,
  stateChip,
  turnOnRefusal,
  turnOnView,
  typedName,
  verdictView,
} from '@/components/cuenta/tiendaEnLinea'

const ZONE = 'tiendas.example'
const NONE = {
  ok: true,
  zone: ZONE,
  address: null,
  url: null,
  state: 'none',
  slow: false,
  message: null,
  can_choose: true,
  blocked: null,
  suggested: 'acme',
  published: false,
}
const CONNECTING = {
  ...NONE,
  address: `acme.${ZONE}`,
  url: `https://acme.${ZONE}`,
  state: 'connecting',
  can_choose: false,
  suggested: null,
}
const LIVE = { ...CONNECTING, state: 'live' }
const ITEMS = [
  {
    key: 'address',
    required: true,
    ok: false,
    label: 'Your shop’s address works',
    hint: 'Choose your shop’s address above.',
    fix: { kind: 'address', label: 'Choose the address' },
  },
  {
    key: 'products',
    required: true,
    ok: false,
    label: 'At least one product published with a price and a photo',
    hint: 'Publish your products in the online shop from Productos.',
    fix: { kind: 'route', route: '/crm/productos', label: 'Open my products' },
  },
  {
    key: 'payment',
    required: true,
    ok: true,
    label: 'A way to take orders and be paid',
    hint: 'Buyers can order and pay.',
    fix: null,
  },
  {
    key: 'delivery',
    required: true,
    ok: false,
    label: 'Delivery or pickup at the store',
    hint: 'Offer delivery with its fee, or pickup at the store.',
    fix: {
      kind: 'route',
      route: '/desk/storefront-profile/Tienda#enable_shipping',
      label: 'Open delivery',
    },
  },
  {
    key: 'name',
    required: true,
    ok: false,
    label: 'Your shop’s name',
    hint: 'Give your shop the name buyers see.',
    fix: { kind: 'name', label: 'Save the name' },
  },
  {
    key: 'contact',
    required: true,
    ok: null,
    label: 'How buyers reach you',
    hint: '',
    fix: null,
  },
]
function readiness(over = {}) {
  return {
    ok: true,
    profile: 'Tienda',
    items: ITEMS,
    address: NONE,
    blocked: null,
    on: false,
    profile_on: false,
    published: false,
    can_turn_on: false,
    ready: false,
    owner: true,
    ...over,
  }
}
const READY = readiness({
  items: ITEMS.map((item) => ({ ...item, ok: true, fix: null })),
  address: LIVE,
  can_turn_on: true,
  ready: true,
})

let app, root
const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function find(selector) {
  for (let i = 0; i < 400; i++) {
    const found = document.querySelector(selector)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return null
}
const text = (selector) =>
  document.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim()

beforeEach(() => {
  for (const mock of Object.values(state)) mock.mockReset()
  window.__ = (value, values) =>
    String(value).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
  vi.useRealTimers()
})

function mount(component, props = {}) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
  })
  app = createApp({ render: () => h(component, props) })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.use(router)
  app.mount(root)
}

describe('the address and the checklist in the owner’s words', () => {
  it('one chip per state', () => {
    expect(stateChip('live')).toEqual({ label: 'Working', tone: 'success' })
    expect(stateChip('connecting')).toEqual({
      label: 'Connecting…',
      tone: 'warning',
    })
    expect(stateChip('none')).toEqual({ label: 'No address', tone: 'neutral' })
    expect(stateChip('stalled')).toEqual({
      label: 'Not opening',
      tone: 'danger',
    })
  })

  it('Boat’s answer as the address part shows it', () => {
    const live = addressView(LIVE)
    expect([live.state, live.address, live.url, live.canChoose]).toEqual([
      'live',
      `acme.${ZONE}`,
      `https://acme.${ZONE}`,
      false,
    ])
    expect(live.line).toBe('Buyers open your store at this address.')
    // Connecting has no link yet; Boat's «taking longer» sentence wins when it sends one.
    expect(addressView(CONNECTING).url).toBe(null)
    expect(
      addressView({ ...CONNECTING, slow: true, message: 'Está tardando más.' })
        .line,
    ).toBe('Está tardando más.')
    const none = addressView(NONE)
    expect([none.state, none.canChoose, none.suggested, none.zone]).toEqual([
      'none',
      true,
      'acme',
      ZONE,
    ])
    const off = addressView({
      ...NONE,
      can_choose: false,
      blocked: {
        reason: 'no_shop',
        message: 'Primero activa tu tienda en línea.',
        next: 'addons',
      },
    })
    expect(off.blocked).toEqual({
      text: 'Primero activa tu tienda en línea.',
      next: 'addons',
    })
    expect(addressView({ ok: false, reason: 'disabled' })).toEqual({
      hidden: true,
    })
    expect(addressView(null)).toBe(null)
    // An operator's host that does not answer: Boat's sentence, no link.
    const stalled = addressView({
      ...LIVE,
      state: 'stalled',
      message: 'La dirección de tu tienda no abre ahora.',
    })
    expect([stalled.state, stalled.url, stalled.line]).toEqual([
      'stalled',
      null,
      'La dirección de tu tienda no abre ahora.',
    ])
  })

  it('the name as typed: lower case, no accents, hyphens for spaces, no zone', () => {
    expect(typedName('Ferretería López')).toBe('ferreteria-lopez')
    expect(typedName('Mi_Tienda 3')).toBe('mi-tienda-3')
    expect(typedName(`acme.${ZONE}`, ZONE)).toBe('acme')
    expect(typedName('x'.repeat(80))).toHaveLength(63)
  })

  it('Boat’s verdict: Disponible, Ocupada, No válida, in Boat’s words', () => {
    expect(
      verdictView({
        ok: true,
        verdict: 'available',
        available: true,
        address: `acme.${ZONE}`,
        message: 'Está disponible.',
      }),
    ).toEqual({
      label: 'Available',
      tone: 'success',
      text: `Buyers will open your store at acme.${ZONE}.`,
      available: true,
    })
    const taken = verdictView({
      ok: true,
      verdict: 'taken',
      available: false,
      message: 'Esa dirección ya la usa otra tienda.',
    })
    expect([taken.label, taken.tone, taken.text]).toEqual([
      'Taken',
      'warning',
      'Esa dirección ya la usa otra tienda.',
    ])
    for (const verdict of ['reserved', 'invalid', 'own_system'])
      expect(verdictView({ ok: true, verdict, available: false }).label).toBe(
        'Not valid',
      )
    const unchecked = verdictView({
      ok: true,
      verdict: 'unverified',
      available: false,
      message: 'No pudimos revisar ese nombre.',
    })
    expect([unchecked.label, unchecked.text, unchecked.available]).toEqual([
      '',
      'No pudimos revisar ese nombre.',
      false,
    ])
    const limited = verdictView({
      ok: false,
      reason: 'rate_limited',
      message: 'Espera un minuto.',
    })
    expect([limited.label, limited.text, limited.available]).toEqual([
      '',
      'Espera un minuto.',
      false,
    ])
  })

  it('each step and where it is fixed', () => {
    const rows = checklistRows(readiness())
    expect(rows.map((row) => [row.key, row.state])).toEqual([
      ['address', 'missing'],
      ['products', 'missing'],
      ['payment', 'ok'],
      ['delivery', 'missing'],
      ['name', 'missing'],
      ['contact', 'unknown'],
    ])
    expect(rows[4].fix).toEqual({ kind: 'name', label: 'Save the name' })
    expect(rows[0].fix).toEqual({
      kind: 'address',
      label: 'Choose the address',
    })
    expect(rows[1].fix).toEqual({
      kind: 'shell',
      label: 'Open my products',
      to: '/productos',
    })
    expect(rows[3].fix).toEqual({
      kind: 'href',
      label: 'Open delivery',
      href: '/desk/storefront-profile/Tienda#enable_shipping',
    })
    expect(rows[2].fix).toBe(null)
  })

  it('«Encender tienda» says why it waits', () => {
    expect(turnOnView(readiness({ on: true })).on).toBe(true)
    expect(turnOnView(readiness({ owner: false })).reason).toBe(
      'Only whoever runs the system can turn the store on.',
    )
    expect(turnOnView(readiness()).reason).toBe(
      'Complete the steps above to turn it on.',
    )
    expect(turnOnView(READY)).toEqual({ on: false, can: true, reason: '' })
    expect(
      turnOnRefusal({
        ok: false,
        message: 'Muelle todavía pide:',
        missing: [{ label: 'Nombre de la tienda', hint: 'Ponle nombre.' }],
      }),
    ).toEqual({
      text: 'Muelle todavía pide:',
      missing: [{ label: 'Nombre de la tienda', hint: 'Ponle nombre.' }],
    })
  })
})

describe('choosing and connecting the address', () => {
  it('«Elegir dirección» checks the shop’s own name and connects it', async () => {
    state.readiness.mockResolvedValue(readiness())
    state.seam.mockImplementation(async (method, payload) => {
      if (method === 'storefront_address_check')
        return {
          ok: true,
          name: payload.name,
          address: `${payload.name}.${ZONE}`,
          verdict: 'available',
          available: true,
          message: 'Está disponible.',
        }
      return CONNECTING
    })
    mount(TiendaEnLinea)
    await flush()
    expect(text('[data-testid="tienda-direccion-estado"]')).toBe('No address')
    ;(await find('[data-testid="tienda-direccion-elegir"]')).click()
    const field = await find('[data-testid="direccion-nombre"]')
    await flush()
    expect(field.value).toBe('acme')
    expect(text('[data-testid="direccion-zona"]')).toBe(`.${ZONE}`)
    expect(state.seam).toHaveBeenCalledWith('storefront_address_check', {
      name: 'acme',
    })
    expect(text('[data-testid="direccion-veredicto"]')).toContain('Available')
    const connect = document.querySelector('[data-testid="direccion-conectar"]')
    expect(connect.disabled).toBe(false)
    state.readiness.mockResolvedValue(readiness({ address: CONNECTING }))
    connect.click()
    await flush()
    expect(state.seam).toHaveBeenCalledWith('storefront_address_connect', {
      name: 'acme',
    })
    expect(document.querySelector('[role="dialog"]')).toBe(null)
    expect(text('[data-testid="tienda-direccion-estado"]')).toBe('Connecting…')
    expect(text('[data-testid="tienda-direccion-linea"]')).toBe(
      'Muelle is connecting it. It takes a few minutes; you do not have to stay here.',
    )
    expect(state.toast).toHaveBeenCalledWith('Connecting your address')
  })

  it('a taken name says so in Boat’s words and «Conectar» waits', async () => {
    state.readiness.mockResolvedValue(
      readiness({ address: { ...NONE, suggested: null } }),
    )
    state.seam.mockImplementation(async (method, payload) =>
      method === 'storefront_address_check'
        ? {
            ok: true,
            name: payload.name,
            verdict: 'taken',
            available: false,
            message: 'Esa dirección ya la usa otra tienda.',
          }
        : null,
    )
    mount(TiendaEnLinea)
    await flush()
    ;(await find('[data-testid="tienda-direccion-elegir"]')).click()
    const field = await find('[data-testid="direccion-nombre"]')
    expect(text('[data-testid="direccion-veredicto"]')).toBe(
      'Type a name to check it.',
    )
    field.value = 'Otra Tienda'
    field.dispatchEvent(new Event('input'))
    expect(field.value).toBe('otra-tienda')
    await new Promise((resolve) => setTimeout(resolve, 450))
    await flush()
    expect(state.seam).toHaveBeenCalledWith('storefront_address_check', {
      name: 'otra-tienda',
    })
    const veredicto = document.querySelector(
      '[data-testid="direccion-veredicto"]',
    )
    expect(veredicto.querySelector('[data-ui-status]').textContent.trim()).toBe(
      'Taken',
    )
    expect(veredicto.textContent).toContain(
      'Esa dirección ya la usa otra tienda.',
    )
    expect(
      document.querySelector('[data-testid="direccion-conectar"]').disabled,
    ).toBe(true)
  })

  it('a name taken between the check and «Conectar» is refused there', async () => {
    state.readiness.mockResolvedValue(readiness())
    state.seam.mockImplementation(async (method) =>
      method === 'storefront_address_check'
        ? {
            ok: true,
            verdict: 'available',
            available: true,
            address: `acme.${ZONE}`,
          }
        : {
            ok: false,
            reason: 'taken',
            message: 'Esa dirección ya la usa otra tienda.',
          },
    )
    mount(TiendaEnLinea)
    await flush()
    ;(await find('[data-testid="tienda-direccion-elegir"]')).click()
    await find('[data-testid="direccion-nombre"]')
    await flush()
    document.querySelector('[data-testid="direccion-conectar"]').click()
    await flush()
    expect(document.querySelector('[role="dialog"]')).not.toBe(null)
    expect(text('[data-testid="direccion-veredicto"]')).toContain('Taken')
    expect(state.toast).not.toHaveBeenCalled()
  })

  it('a connecting address is read again by itself until it works', async () => {
    vi.useFakeTimers()
    state.readiness.mockResolvedValue(readiness({ address: CONNECTING }))
    state.seam.mockResolvedValue(CONNECTING)
    mount(TiendaEnLinea)
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()
    expect(text('[data-testid="tienda-direccion-estado"]')).toBe('Connecting…')
    expect(state.seam).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(state.seam).toHaveBeenCalledTimes(1)
    expect(state.seam).toHaveBeenCalledWith('storefront_address_state')
    state.seam.mockResolvedValue(LIVE)
    state.readiness.mockResolvedValue(readiness({ address: LIVE }))
    await vi.advanceTimersByTimeAsync(POLL_MS)
    await nextTick()
    expect(text('[data-testid="tienda-direccion-estado"]')).toBe('Working')
    expect(
      document.querySelector('[data-testid="tienda-direccion-url"]').href,
    ).toBe(`https://acme.${ZONE}/`)
    // Working: the checklist is read again and the reads stop.
    expect(state.readiness).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    expect(state.seam).toHaveBeenCalledTimes(2)
    // The page offers no button to check it again.
    expect(document.body.textContent).not.toMatch(/Refresh|Check status/)
  })

  it('a store not on yet says what comes first, with its way there', async () => {
    state.readiness.mockResolvedValue(
      readiness({
        address: {
          ...NONE,
          can_choose: false,
          suggested: null,
          blocked: {
            reason: 'no_shop',
            message: 'Primero activa tu tienda en línea en Complementos.',
            next: 'addons',
          },
        },
      }),
    )
    const acts = []
    mount(TiendaEnLinea, { onAct: (key) => acts.push(key) })
    await flush()
    expect(
      document.querySelector('[data-testid="tienda-direccion-elegir"]'),
    ).toBe(null)
    const negada = await find('[data-testid="tienda-direccion-negada"]')
    expect(negada.textContent).toContain('Primero activa tu tienda en línea')
    negada.querySelector('button').click()
    expect(acts).toEqual(['addons'])
  })
})

describe('«Enciende tu tienda»', () => {
  it('each step says what is missing and links to its fix', async () => {
    state.readiness.mockResolvedValue(readiness())
    mount(TiendaEnLinea)
    await flush()
    const steps = await find('[data-testid="tienda-pasos"]')
    expect(
      [...steps.querySelectorAll('li')].map((li) => li.dataset.state),
    ).toEqual(['missing', 'missing', 'ok', 'missing', 'missing', 'unknown'])
    const products = document.querySelector(
      '[data-testid="tienda-paso-products"] a',
    )
    expect([
      products.textContent.trim(),
      products.getAttribute('href'),
    ]).toEqual(['Open my products', '/productos'])
    const delivery = document.querySelector(
      '[data-testid="tienda-paso-delivery"] a',
    )
    expect(delivery.getAttribute('href')).toBe(
      '/desk/storefront-profile/Tienda#enable_shipping',
    )
    const button = document.querySelector(
      '[data-testid="tienda-encender-boton"]',
    )
    expect(button.disabled).toBe(true)
    expect(text('#tienda-encender-motivo')).toBe(
      'Complete the steps above to turn it on.',
    )
  })

  it('«Encender tienda» turns it on when every step passes', async () => {
    state.readiness.mockResolvedValue(READY)
    state.turnOn.mockResolvedValue({
      ...READY,
      ok: true,
      changed: true,
      on: true,
      published: true,
      profile_on: true,
    })
    mount(TiendaEnLinea)
    await flush()
    const button = await find('[data-testid="tienda-encender-boton"]')
    expect(button.disabled).toBe(false)
    button.click()
    await flush()
    expect(state.turnOn).toHaveBeenCalledTimes(1)
    expect(text('[data-testid="tienda-encendida"]')).toBe(
      'Your store is online. See my store',
    )
    expect(state.toast).toHaveBeenCalledWith('Your store is online.')
  })

  it('Boat’s refusal shows its words and what it still asks for', async () => {
    state.readiness.mockResolvedValue(READY)
    state.turnOn.mockResolvedValue({
      ...READY,
      ok: false,
      reason: 'platform_refused',
      message: 'Muelle todavía pide esto antes de poner tu tienda en línea:',
      missing: [
        { label: 'Nombre de la tienda', hint: 'Ponle nombre a tu tienda.' },
      ],
    })
    mount(TiendaEnLinea)
    await flush()
    ;(await find('[data-testid="tienda-encender-boton"]')).click()
    await flush()
    const negado = document.querySelector(
      '[data-testid="tienda-encender-negado"]',
    )
    expect(text('[data-testid="tienda-encender-negado"] p')).toBe(
      'Muelle todavía pide esto antes de poner tu tienda en línea:',
    )
    expect(
      [...negado.querySelectorAll('li')].map((li) => li.textContent.trim()),
    ).toEqual(['Nombre de la tienda: Ponle nombre a tu tienda.'])
    expect(state.toast).not.toHaveBeenCalled()
  })

  it('only the system’s administrator can turn it on; the sentence says so', async () => {
    state.readiness.mockResolvedValue({
      ...READY,
      owner: false,
      can_turn_on: false,
    })
    mount(TiendaEnLinea)
    await flush()
    const button = await find('[data-testid="tienda-encender-boton"]')
    expect(button.disabled).toBe(true)
    expect(text('#tienda-encender-motivo')).toBe(
      'Only whoever runs the system can turn the store on.',
    )
    button.click()
    await flush()
    expect(state.turnOn).not.toHaveBeenCalled()
  })

  it('a failed read offers to try again', async () => {
    state.readiness.mockRejectedValueOnce(new Error('network'))
    state.readiness.mockResolvedValue(readiness())
    mount(TiendaEnLinea)
    await flush()
    const retry = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Try again',
    )
    expect(retry).toBeTruthy()
    retry.click()
    await flush()
    expect(await find('[data-testid="tienda-pasos"]')).not.toBe(null)
  })
})

describe('what the block says when a step comes first', () => {
  it('the store not on in Muelle is said once, above, with «Ver complementos»', async () => {
    const blocked = {
      reason: 'no_shop',
      message: 'Primero activa tu tienda en línea en Complementos.',
      next: 'addons',
    }
    state.readiness.mockResolvedValue(
      readiness({
        items: [],
        address: { ...NONE, can_choose: false, suggested: null, blocked },
        blocked: {
          message: blocked.message,
          next: 'addons',
          reason: 'no_shop',
        },
      }),
    )
    mount(TiendaEnLinea)
    await flush()
    expect(await find('[data-testid="tienda-direccion-negada"]')).not.toBe(null)
    expect(document.querySelector('[data-testid="tienda-encender"]')).toBe(null)
    expect(
      document.body.textContent.split('Primero activa tu tienda').length - 1,
    ).toBe(1)
  })

  it('a store with no settings yet asks support, with its button', async () => {
    state.readiness.mockResolvedValue(
      readiness({
        items: [],
        profile: null,
        blocked: {
          message: 'Tu tienda todavía no tiene su configuración.',
          next: 'support',
          reason: 'no_profile',
        },
      }),
    )
    const acts = []
    mount(TiendaEnLinea, { onAct: (key) => acts.push(key) })
    await flush()
    const block = await find('[data-testid="tienda-encender-bloqueo"]')
    expect(block.textContent).toContain('Tu tienda todavía no tiene')
    block.querySelector('button').click()
    expect(acts).toEqual(['support'])
    expect(
      document.querySelector('[data-testid="tienda-encender-boton"]'),
    ).toBe(null)
  })

  it('the store’s name is saved in its step and the steps are read again', async () => {
    state.readiness.mockResolvedValue(readiness())
    state.seam.mockResolvedValue({ ok: true, shop_name: 'Ferretería Acme' })
    mount(TiendaEnLinea)
    await flush()
    const field = await find('[data-testid="tienda-nombre"]')
    const save = document.querySelector('[data-testid="tienda-nombre-guardar"]')
    expect(save.disabled).toBe(true)
    field.value = '  Ferretería Acme '
    field.dispatchEvent(new Event('input'))
    await flush()
    expect(save.disabled).toBe(false)
    save.click()
    await flush()
    expect(state.seam).toHaveBeenCalledWith('storefront_shop_name', {
      name: 'Ferretería Acme',
    })
    expect(state.readiness).toHaveBeenCalledTimes(2)
    expect(state.toast).toHaveBeenCalledWith('Name saved')
  })

  it('a refused name says Boat’s words in the step', async () => {
    state.readiness.mockResolvedValue(readiness())
    state.seam.mockResolvedValue({
      ok: false,
      reason: 'invalid_name',
      message: 'Escribe el nombre de tu tienda, de 1 a 80 letras.',
    })
    mount(TiendaEnLinea)
    await flush()
    const field = await find('[data-testid="tienda-nombre"]')
    field.value = 'Acme'
    field.dispatchEvent(new Event('input'))
    await flush()
    document.querySelector('[data-testid="tienda-nombre-guardar"]').click()
    await flush()
    expect(text('[data-testid="tienda-nombre-error"]')).toBe(
      'Escribe el nombre de tu tienda, de 1 a 80 letras.',
    )
    expect(state.readiness).toHaveBeenCalledTimes(1)
  })
})

describe('Boat switching the choice off', () => {
  it('doco passes Boat’s refusal on, so the block is not drawn', async () => {
    state.readiness.mockResolvedValue(
      readiness({ address: { ok: false, reason: 'disabled', message: 'No.' } }),
    )
    mount(TiendaEnLinea)
    await flush()
    expect(
      document.querySelector('[data-testid="cuenta-tienda-en-linea"]'),
    ).toBe(null)
  })

  it('a connecting tab stops reading and hides once Boat says it is off', async () => {
    vi.useFakeTimers()
    state.readiness.mockResolvedValue(readiness({ address: CONNECTING }))
    state.seam.mockResolvedValue({ ok: false, reason: 'disabled' })
    mount(TiendaEnLinea)
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()
    expect(
      document.querySelector('[data-testid="cuenta-tienda-en-linea"]'),
    ).not.toBe(null)
    await vi.advanceTimersByTimeAsync(POLL_MS)
    await nextTick()
    expect(state.seam).toHaveBeenCalledTimes(1)
    expect(
      document.querySelector('[data-testid="cuenta-tienda-en-linea"]'),
    ).toBe(null)
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    expect(state.seam).toHaveBeenCalledTimes(1)
  })

  it('any other refusal stops the reads and keeps the last answer', async () => {
    vi.useFakeTimers()
    state.readiness.mockResolvedValue(readiness({ address: CONNECTING }))
    state.seam.mockResolvedValue({ ok: false, reason: 'rate_limited' })
    mount(TiendaEnLinea)
    await vi.advanceTimersByTimeAsync(POLL_MS)
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    expect(state.seam).toHaveBeenCalledTimes(1)
    expect(text('[data-testid="tienda-direccion-estado"]')).toBe('Connecting…')
  })
})

describe('Tienda shows it only where Boat offers it', () => {
  function door(capabilities) {
    const data = {
      site: { name: 'shop', status: 'Active', plan: 'pro', is_trial: 0 },
      meters: { billing: { is_trial: false, monthly_price_mxn: 499 } },
      invoices: [],
      store: { current_plan: 'pro', plans: [], addons: [] },
      payment_state: { status: 'ready', authoritative: true, invoices: {} },
      ...(capabilities ? { capabilities } : {}),
    }
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

  it('without «storefront_address»: no block and nothing asked', async () => {
    state.seam.mockResolvedValue(null)
    mount(CuentaTienda, { door: door(['apps']) })
    await flush()
    expect(
      document.querySelector('[data-testid="cuenta-tienda-en-linea"]'),
    ).toBe(null)
    expect(state.readiness).not.toHaveBeenCalled()
    expect(state.seam.mock.calls.map((call) => call[0])).not.toContain(
      'storefront_address_state',
    )
  })

  it('with it: the block reads doco’s checklist once', async () => {
    state.seam.mockResolvedValue(null)
    state.readiness.mockResolvedValue(readiness())
    mount(CuentaTienda, { door: door(['storefront_address']) })
    expect(await find('[data-testid="cuenta-tienda-en-linea"]')).not.toBe(null)
    await flush()
    expect(state.readiness).toHaveBeenCalledTimes(1)
  })
})
