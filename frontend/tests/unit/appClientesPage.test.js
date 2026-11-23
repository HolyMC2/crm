// «App de tus clientes» (/negocio/app-clientes): the page over the cell's
// state (doco.docoutils.storefront_customer_app_admin). What the owner sees,
// what a tap sends, a refusal that puts the switch back, the rules and legal
// sheets, the shop picker, read-only mode, and the doors from Fidelidad.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  call: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => mocks.call(...args),
    frappeRequest: (...args) => mocks.request(...args),
    toast: {
      success: (...args) => mocks.success(...args),
      error: (...args) => mocks.error(...args),
    },
    // EmptyState's button.
    Button: {
      props: ['label'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'button',
            { type: 'button', onClick: () => emit('click') },
            props.label,
          ),
    },
  }
})
vi.mock('@/composables/breakpoint', async () => {
  const { ref } = await import('vue')
  return { isMobile: ref(true), isWide: ref(false), isNarrow: ref(true) }
})
vi.mock('@/components/ui', async (importOriginal) => {
  const { h } = await import('vue')
  return {
    ...(await importOriginal()),
    AppBar: {
      props: ['title', 'scopes', 'scope', 'scopeTitle', 'back', 'loading'],
      emits: ['update:scope', 'back'],
      setup:
        (props, { emit }) =>
        () =>
          h('header', [
            h('h1', props.title),
            ...(props.scopes || []).map((one) =>
              h(
                'button',
                {
                  type: 'button',
                  'data-scope': one.value,
                  'aria-pressed': String(one.value === props.scope),
                  onClick: () => emit('update:scope', one.value),
                },
                one.label,
              ),
            ),
          ]),
    },
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

// The door to «Solicitudes de clientes» makes its own read
// (solicitudesClientesPage.test.js covers it).
vi.mock('@/components/solicitudesClientes/SolicitudesDoor.vue', async () => {
  const { h } = await import('vue')
  return {
    __esModule: true,
    default: { render: () => h('div', { 'data-puerta-solicitudes': '' }) },
  }
})

import AppClientes from '@/pages/AppClientes.vue'
import AppClientesDoor from '@/components/appClientes/AppClientesDoor.vue'
import { forgetState } from '@/components/appClientes/api'

const API = 'doco.docoutils.storefront_customer_app_admin.'

const section = (key, extra = {}) => ({
  key,
  label:
    {
      puntos: 'Puntos',
      cupones: 'Cupones',
      recargas: 'Recargas',
      reparaciones: 'Reparaciones',
    }[key] || key,
  help: `Ayuda de ${key}`,
  on: false,
  available: true,
  blocked: null,
  params: [],
  ...extra,
})

const STATE = (extra = {}) => ({
  profile: 'Tienda Centro',
  profiles: [{ name: 'Tienda Centro', label: 'Centro' }],
  can_change: true,
  login: { channels: ['whatsapp'], ok: true, fix: null },
  enabled: true,
  sections: [
    section('puntos', { on: true }),
    section('cupones', {
      params: [
        { key: 'online', label: 'En línea', type: 'bool', value: false },
      ],
    }),
    section('reparaciones'),
    section('recargas', {
      available: false,
      blocked: {
        text: 'Necesita las recargas conectadas.',
        fix: { label: 'Ver tu tienda', route: '/crm/cuenta?tab=tienda' },
      },
    }),
  ],
  tabs: ['inicio', 'promos', 'mas'],
  store_url: 'https://tienda.example.com',
  kpis: { accounts: 12, active_30d: 5, cards: null },
  ...extra,
})
const copy = (value) => JSON.parse(JSON.stringify(value))

let app
let host
let router
const flush = async (n = 8) => {
  for (let i = 0; i < n; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
async function mount(component = AppClientes, query = {}) {
  host = document.createElement('div')
  document.body.appendChild(host)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:all(.*)*', component: { render: () => null } }],
  })
  await router.push({ path: '/negocio/app-clientes', query })
  app = createApp({ render: () => h(component) })
  app.config.globalProperties.__ = globalThis.__
  app.use(router)
  app.mount(host)
  await flush()
}
const $ = (selector) => host.querySelector(selector)
// A sheet is an async component: its first open waits for its module.
async function waitFor(selector) {
  for (let i = 0; i < 100 && !$(selector); i++) await flush(1)
  return $(selector)
}
const $$ = (selector) => [...host.querySelectorAll(selector)]
const text = (el) => el?.textContent.replace(/\s+/g, ' ').trim()
const switchOf = (key) =>
  $(`[data-app-clientes-seccion="${key}"] [role="switch"]`)

beforeEach(() => {
  forgetState()
  for (const mock of Object.values(mocks)) mock.mockReset()
  globalThis.__ = (value, args) =>
    String(value).replace(/\{(\d+)\}/g, (m, i) => args?.[i] ?? m)
})
afterEach(() => {
  app?.unmount()
  host?.remove()
  app = null
})

describe('what the owner sees', () => {
  it('reads the default shop by GET: the master and the preview first, the parts, then «Cómo va»', async () => {
    mocks.request.mockResolvedValueOnce(copy(STATE()))
    await mount()
    expect(mocks.request).toHaveBeenCalledWith({
      url: API + 'state',
      method: 'GET',
      params: undefined,
    })
    expect(text($('h1'))).toBe('Your customers’ app')
    // the owner comes to switch things: the master and the preview lead, the
    // parts follow, and the figures come after them
    const order = [
      '[data-app-clientes-principal]',
      '[data-app-clientes-vista]',
      '[data-app-clientes-grupo]',
      '[data-app-clientes-cifras]',
    ].map((selector) => $(selector))
    for (const [i, el] of order.entries()) {
      expect(el, String(i)).not.toBeNull()
      if (i)
        expect(
          order[i - 1].compareDocumentPosition(el) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy()
    }
    expect(text($('#app-clientes-como-va'))).toBe('How it is going')
    expect(
      $$('[data-cifra]').map((tile) => tile.getAttribute('data-cifra')),
    ).toEqual(['accounts', 'active_30d'])
    const accounts = $('[data-cifra="accounts"]').children
    expect([...accounts].map((el) => text(el))).toEqual([
      '12',
      'Customer accounts',
    ])
    expect($('[data-app-clientes-cifras-vacio]')).toBeNull()
    expect(text($('[data-app-clientes-vista-linea]'))).toBe('They see: Puntos.')
    expect($('[data-app-clientes-ver]').getAttribute('href')).toBe(
      'https://tienda.example.com/cuenta',
    )
    expect($('[data-app-clientes-ver]').getAttribute('target')).toBe('_blank')
    expect(
      $$('[data-app-clientes-grupo]').map((group) => [
        group.getAttribute('data-app-clientes-grupo'),
        [...group.querySelectorAll('[data-app-clientes-seccion]')].map((row) =>
          row.getAttribute('data-app-clientes-seccion'),
        ),
      ]),
    ).toEqual([
      ['lealtad', ['puntos', 'cupones']],
      ['servicio', ['reparaciones', 'recargas']],
    ])
    expect(switchOf('puntos').getAttribute('aria-checked')).toBe('true')
    // Only a part with rules has the pencil.
    expect(
      $$('[data-app-clientes-reglas-abrir]').map((b) =>
        b.getAttribute('data-app-clientes-reglas-abrir'),
      ),
    ).toEqual(['cupones'])
  })

  it('a part the shop cannot offer: disabled, its reason and a link to the /crm page that fixes it', async () => {
    mocks.request.mockResolvedValueOnce(copy(STATE()))
    await mount()
    const row = $('[data-app-clientes-seccion="recargas"]')
    expect(row.getAttribute('data-state')).toBe('blocked')
    expect(switchOf('recargas').disabled).toBe(true)
    expect(text(row.querySelector('[data-app-clientes-bloqueo]'))).toBe(
      'Necesita las recargas conectadas.',
    )
    const fix = row.querySelector('a[data-app-clientes-arreglar]')
    expect(text(fix)).toBe('Ver tu tienda')
    expect(fix.getAttribute('href')).toBe('/cuenta?tab=tienda')
  })

  it('no login channel: the master is off, disabled, with why and the fix', async () => {
    mocks.request.mockResolvedValueOnce(
      copy(
        STATE({
          enabled: false,
          login: {
            channels: [],
            ok: false,
            fix: { label: 'Conectar correo', route: '/crm/negocio' },
          },
        }),
      ),
    )
    await mount()
    const master = $('#app-clientes-enabled')
    expect(master.disabled).toBe(true)
    expect(master.getAttribute('aria-describedby')).toBe('app-clientes-motivo')
    expect(text($('[data-app-clientes-motivo] p'))).toBe(
      'Your customers sign in with a code by email or WhatsApp. Connect one so they can.',
    )
    const fix = $('[data-app-clientes-motivo] a[data-app-clientes-arreglar]')
    expect(text(fix)).toBe('Conectar correo')
    expect(fix.getAttribute('href')).toBe('/negocio')
    // Off: no figures, and the parts can be got ready.
    expect($('[data-app-clientes-cifras]')).toBeNull()
    expect($('[data-app-clientes-preparar]')).not.toBeNull()
  })

  it('every figure still at zero: one short line, no zero tiles', async () => {
    mocks.request.mockResolvedValueOnce(
      copy(STATE({ kpis: { accounts: 0, active_30d: 0, cards: null } })),
    )
    await mount()
    expect(text($('[data-app-clientes-cifras-vacio]'))).toBe(
      'No activity yet: here you will see how many customers use the app.',
    )
    expect($$('[data-cifra]')).toHaveLength(0)
  })

  it('read-only: says so, every switch is disabled', async () => {
    mocks.request.mockResolvedValueOnce(copy(STATE({ can_change: false })))
    await mount()
    expect(text($('[data-app-clientes-solo-ver]'))).toBe(
      'You see what your customers see. Whoever runs the system can change it.',
    )
    expect($$('[role="switch"]').every((one) => one.disabled)).toBe(true)
  })

  it('no online store: says so and sends the owner to turn it on', async () => {
    mocks.request.mockResolvedValueOnce({ profile: null, profiles: [] })
    await mount()
    expect($('[data-app-clientes-sin-tienda]')).not.toBeNull()
    expect(text($('[data-app-clientes-sin-tienda]'))).toContain(
      'Your online store is not ready yet',
    )
  })

  it('a read that fails says why and offers to try again', async () => {
    mocks.request.mockRejectedValueOnce(
      Object.assign(new Error('x'), { messages: ['No tienes permiso.'] }),
    )
    await mount()
    expect(text($('[data-app-clientes-problema] p'))).toBe('No tienes permiso.')
    mocks.request.mockResolvedValueOnce(copy(STATE()))
    $('[data-app-clientes-problema] button').click()
    await flush()
    expect($('[data-app-clientes-grupo]')).not.toBeNull()
  })
})

describe('a tap', () => {
  it('shows at once, sends the one change, and the server’s answer replaces the screen', async () => {
    mocks.request.mockResolvedValueOnce(copy(STATE()))
    await mount()
    let answer
    mocks.call.mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve)),
    )
    switchOf('reparaciones').click()
    await flush(2)
    expect(switchOf('reparaciones').getAttribute('aria-checked')).toBe('true')
    expect(mocks.call).toHaveBeenCalledWith(API + 'save', {
      storefront: 'Tienda Centro',
      changes: { sections: { reparaciones: true } },
    })
    const next = STATE()
    next.sections[2].on = true
    answer(next)
    await flush()
    expect(switchOf('reparaciones').getAttribute('aria-checked')).toBe('true')
    expect(text($('[data-app-clientes-vista-linea]'))).toBe(
      'They see: Puntos, Reparaciones.',
    )
    expect(mocks.success).toHaveBeenCalledWith(
      'Your customers now see Reparaciones.',
    )
  })

  it('a refusal puts it back and says why', async () => {
    mocks.request.mockResolvedValueOnce(copy(STATE()))
    await mount()
    mocks.call.mockRejectedValueOnce(
      Object.assign(new Error('x'), {
        messages: ['Solo quien administra puede cambiarlo.'],
      }),
    )
    switchOf('puntos').click()
    await flush()
    expect(switchOf('puntos').getAttribute('aria-checked')).toBe('true')
    expect(mocks.error).toHaveBeenCalledWith(
      'Solo quien administra puede cambiarlo.',
    )
  })

  it('the master sends enabled', async () => {
    mocks.request.mockResolvedValueOnce(copy(STATE()))
    await mount()
    mocks.call.mockResolvedValueOnce(copy(STATE({ enabled: false })))
    $('#app-clientes-enabled').click()
    await flush()
    expect(mocks.call).toHaveBeenCalledWith(API + 'save', {
      storefront: 'Tienda Centro',
      changes: { enabled: false },
    })
    expect($('#app-clientes-enabled').getAttribute('aria-checked')).toBe(
      'false',
    )
    expect(mocks.success).toHaveBeenCalledWith(
      'The app is off. Your store keeps its usual account.',
    )
  })

  it('two quick taps go one after the other', async () => {
    mocks.request.mockResolvedValueOnce(copy(STATE()))
    await mount()
    const order = []
    mocks.call.mockImplementation(async (method, args) => {
      order.push(args.changes.sections)
      const next = STATE()
      for (const one of next.sections)
        if (one.key in args.changes.sections)
          one.on = args.changes.sections[one.key]
      return next
    })
    switchOf('reparaciones').click()
    switchOf('cupones').click()
    await flush()
    expect(order).toEqual([{ reparaciones: true }, { cupones: true }])
  })
})

describe('the rules of a part', () => {
  it('the pencil opens them; «Guardar cambios» sends only what changed', async () => {
    mocks.request.mockResolvedValueOnce(copy(STATE()))
    await mount()
    $('[data-app-clientes-reglas-abrir="cupones"]').click()
    const sheet = await waitFor('[role="dialog"]')
    expect(sheet.getAttribute('aria-label')).toBe('Cupones')
    const save = sheet.querySelector('[data-app-clientes-reglas-guardar]')
    expect(save.disabled).toBe(true)
    sheet.querySelector('[data-param="online"] [role="switch"]').click()
    await flush(2)
    expect(save.disabled).toBe(false)
    const next = STATE()
    next.sections[1].params[0].value = true
    mocks.call.mockResolvedValueOnce(next)
    sheet.querySelector('form').requestSubmit()
    await flush()
    expect(mocks.call).toHaveBeenCalledWith(API + 'save', {
      storefront: 'Tienda Centro',
      changes: { params: { cupones: { online: true } } },
    })
    expect(mocks.call).toHaveBeenCalledTimes(1)
    expect($('[role="dialog"]')).toBeNull()
    expect(mocks.success).toHaveBeenCalledWith('Changes saved')
    expect(
      text(
        $(
          '[data-app-clientes-seccion="cupones"] [data-app-clientes-reglas-linea]',
        ),
      ),
    ).toBe('En línea: Yes')
  })
})

describe('the Cupones rules say whether the online store takes coupons', () => {
  it('a shop that sells online at list prices: the line and its way to change it', async () => {
    mocks.request.mockResolvedValueOnce(copy(STATE({ online_coupons: false })))
    await mount()
    $('[data-app-clientes-reglas-abrir="cupones"]').click()
    const sheet = await waitFor('[role="dialog"]')
    const note = sheet.querySelector('[data-app-clientes-nota]')
    expect(note.getAttribute('data-app-clientes-nota')).toBe('no')
    expect(text(note.querySelector('p'))).toBe(
      'Your online store takes no coupons: it sells at list prices. Coupons work only at the register.',
    )
    const link = note.querySelector('[data-app-clientes-nota-cambiar]')
    expect(text(link)).toBe('Change it in Business settings')
    expect(link.getAttribute('href')).toBe(
      '/negocio?ajuste=doco.online_coupons',
    )
    // «Also at online checkout» would do nothing: locked, with why
    const online = sheet.querySelector('[data-param="online"]')
    expect(online.querySelector('[role="switch"]').disabled).toBe(true)
    expect(
      text(online.querySelector('[data-app-clientes-reglas-bloqueada]')),
    ).toBe('It can be turned on once your online store takes coupons.')
  })

  it('a shop that takes them says so; an older cell says nothing', async () => {
    mocks.request.mockResolvedValueOnce(copy(STATE({ online_coupons: true })))
    await mount()
    $('[data-app-clientes-reglas-abrir="cupones"]').click()
    const sheet = await waitFor('[role="dialog"]')
    expect(
      sheet
        .querySelector('[data-app-clientes-nota]')
        .getAttribute('data-app-clientes-nota'),
    ).toBe('si')
    // the owner changes «Also at online checkout» as before
    const online = sheet.querySelector('[data-param="online"]')
    expect(online.querySelector('[role="switch"]').disabled).toBe(false)
    expect(online.querySelector('[data-app-clientes-reglas-bloqueada]')).toBe(
      null,
    )
    app.unmount()
    host.remove()
    forgetState()
    mocks.request.mockResolvedValueOnce(copy(STATE()))
    await mount()
    $('[data-app-clientes-reglas-abrir="cupones"]').click()
    await waitFor('[role="dialog"]')
    expect($('[data-app-clientes-nota]')).toBeNull()
  })
})

describe('the legal texts', () => {
  it('read on open, the suggested text in grey and one tap to use it, saved whole', async () => {
    mocks.request.mockResolvedValueOnce(copy(STATE()))
    await mount()
    mocks.request.mockResolvedValueOnce({
      terms_text: '',
      returns_policy_text: 'Mis devoluciones',
      warranty_policy_text: '',
      privacy_notice: 'Aviso',
      return_window_days: 30,
      builtin: { terms: 'Términos sugeridos', returns: 'Dev', warranty: 'Gar' },
    })
    $('[data-app-clientes-legales-abrir]').click()
    await waitFor('form[data-app-clientes-legales]')
    expect(mocks.request).toHaveBeenLastCalledWith({
      url: API + 'legal_texts',
      method: 'GET',
      params: { storefront: 'Tienda Centro' },
    })
    const terms = $('#app-clientes-terms_text')
    expect(terms.getAttribute('placeholder')).toBe('Términos sugeridos')
    expect($('#app-clientes-privacy_notice').getAttribute('placeholder')).toBe(
      null,
    )
    $('[data-legal-sugerido="terms_text"]').click()
    await flush(2)
    expect(terms.value).toBe('Términos sugeridos')
    mocks.call.mockResolvedValueOnce({})
    $('form[data-app-clientes-legales]').requestSubmit()
    await flush()
    expect(mocks.call).toHaveBeenCalledWith(API + 'save_legal_texts', {
      storefront: 'Tienda Centro',
      texts: {
        terms_text: 'Términos sugeridos',
        returns_policy_text: 'Mis devoluciones',
        warranty_policy_text: '',
        privacy_notice: 'Aviso',
        return_window_days: 30,
      },
    })
    expect(mocks.success).toHaveBeenCalledWith('Texts saved')
  })
})

describe('the days to answer a privacy request', () => {
  it('shown where the cell offers them; the legal figure in one tap; saved with the texts', async () => {
    mocks.request.mockResolvedValueOnce(copy(STATE()))
    await mount()
    expect($('[data-puerta-solicitudes]')).not.toBeNull()
    mocks.request.mockResolvedValueOnce({
      terms_text: '',
      returns_policy_text: '',
      warranty_policy_text: '',
      privacy_notice: '',
      return_window_days: 30,
      arco_response_days: 15,
      arco_days_default: 20,
      arco_days_max: 20,
      builtin: { terms: 'T', returns: 'D', warranty: 'G' },
    })
    $('[data-app-clientes-legales-abrir]').click()
    await waitFor('form[data-app-clientes-legales]')
    const days = $('#app-clientes-arco')
    expect(days.value).toBe('15')
    days.value = '25'
    days.dispatchEvent(new Event('input'))
    await flush(2)
    expect(text($('#app-clientes-arco-problema'))).toBe(
      'Write the days as a whole number from 1 to 20.',
    )
    expect($('[data-app-clientes-legales-guardar]').disabled).toBe(true)
    $('[data-legal-arco-ley]').click()
    await flush(2)
    expect(days.value).toBe('20')
    expect($('#app-clientes-arco-problema')).toBeNull()
    mocks.call.mockResolvedValueOnce({})
    $('form[data-app-clientes-legales]').requestSubmit()
    await flush()
    expect(mocks.call).toHaveBeenCalledWith(API + 'save_legal_texts', {
      storefront: 'Tienda Centro',
      texts: {
        terms_text: '',
        returns_policy_text: '',
        warranty_policy_text: '',
        privacy_notice: '',
        return_window_days: 30,
        arco_response_days: 20,
      },
    })
  })
})

describe('several shops', () => {
  it('the title picks the shop, kept in the URL; the next read names it', async () => {
    const state = STATE({
      profiles: [
        { name: 'Tienda Centro', label: 'Centro' },
        { name: 'Tienda Norte', label: 'Norte' },
      ],
    })
    mocks.request.mockResolvedValueOnce(copy(state))
    await mount()
    mocks.request.mockResolvedValueOnce(
      copy({ ...state, profile: 'Tienda Norte' }),
    )
    $('[data-scope="Tienda Norte"]').click()
    await flush()
    expect(router.currentRoute.value.query.tienda).toBe('Tienda Norte')
    expect(mocks.request).toHaveBeenLastCalledWith({
      url: API + 'state',
      method: 'GET',
      params: { storefront: 'Tienda Norte' },
    })
    expect($('[data-scope="Tienda Norte"]').getAttribute('aria-pressed')).toBe(
      'true',
    )
  })
})

describe('the door from Fidelidad', () => {
  it('shows what is on and opens the page', async () => {
    mocks.request.mockResolvedValueOnce(copy(STATE()))
    await mount(AppClientesDoor)
    const door = $('[data-testid="app-clientes-puerta"]')
    expect(text(door.querySelector('[data-ui-list-row-title]'))).toBe(
      'What your customers see in their app',
    )
    expect(text(door)).toContain('On: Puntos')
    expect(door.getAttribute('href')).toBe('/negocio/app-clientes')
  })

  it('no online store, or no right to read it: no door', async () => {
    mocks.request.mockRejectedValueOnce(new Error('403'))
    await mount(AppClientesDoor)
    expect($('[data-testid="app-clientes-puerta"]')).toBeNull()
  })
})
