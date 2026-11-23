// «Solicitudes de clientes» (/negocio/solicitudes-clientes): the page over the
// cell's queue (doco.docoutils.storefront_support_staff). What staff see, the
// queue chips with «Todas» first, a row that opens its sheet (and ?id= from a
// bell notice), a step that tells the customer, a refusal without its reason,
// scheduling a pickup, the closed requests and the door on /negocio/app-clientes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  call: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  rail: vi.fn(),
  counts: vi.fn(),
}))
vi.mock('frappe-ui', () => ({
  // FilterChips' «Filtros» sheet button (never shown here).
  Button: { props: ['label'], render: () => null },
  call: (...args) => mocks.call(...args),
  frappeRequest: (...args) => mocks.request(...args),
  toast: {
    success: (...args) => mocks.success(...args),
    error: (...args) => mocks.error(...args),
  },
}))
// A step reads the badges again: the rail's and the Ventas section's.
vi.mock('@/composables/shellRail', () => ({
  refreshRailCounts: (...args) => mocks.rail(...args),
}))
vi.mock('@/components/solicitudesClientes/counts', () => ({
  refreshSolicitudesCounts: (...args) => mocks.counts(...args),
}))
vi.mock('@/composables/muelleShell', async () => {
  const { ref } = await import('vue')
  return { shellBoot: ref(null) }
})
vi.mock('@/components/ui', async (importOriginal) => {
  const { h } = await import('vue')
  return {
    ...(await importOriginal()),
    AppBar: {
      props: ['title', 'count', 'scopes', 'scope', 'back', 'loading'],
      emits: ['update:scope', 'back'],
      setup: (props) => () =>
        h('header', { 'data-atras': props.back ? '' : undefined }, [
          h('h1', props.title),
          props.count !== undefined
            ? h('span', { 'data-cuenta': '' }, String(props.count))
            : null,
        ]),
    },
    BottomSheet: {
      props: ['open', 'title', 'subtitle'],
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h('section', { role: 'dialog', 'aria-label': props.title }, [
                h('h2', props.title),
                h('p', { 'data-subtitulo': '' }, props.subtitle),
                slots.default?.(),
                slots.actions?.(),
              ])
            : null,
    },
    DateField: {
      props: ['modelValue', 'id'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h('input', {
            id: props.id,
            value: props.modelValue,
            'data-fecha': '',
            onInput: (event) => emit('update:modelValue', event.target.value),
          }),
    },
  }
})

import SolicitudesClientes from '@/pages/SolicitudesClientes.vue'
import SolicitudesDoor from '@/components/solicitudesClientes/SolicitudesDoor.vue'

const API = 'doco.docoutils.storefront_support_staff.'

const item = (extra = {}) => ({
  id: 'rr:abc123',
  queue: 'devoluciones',
  kind: 'devolucion',
  reason: 'defectuoso',
  who: 'Ana López',
  date: '2026-11-21T10:00:00',
  due: null,
  overdue: false,
  state: 'open',
  ref: { doctype: 'Sales Order', name: 'SAL-ORD-0001' },
  amount: 1250,
  currency: 'MXN',
  ...extra,
})

const BOARD = (extra = {}) => ({
  profile: null,
  profiles: [{ name: 'Tienda Centro', label: 'Centro' }],
  queues: [
    { key: 'todas', count: 3, overdue: 1 },
    { key: 'devoluciones', count: 1, overdue: 0 },
    { key: 'garantias', count: 0, overdue: 0 },
    { key: 'datos', count: 1, overdue: 1 },
    { key: 'pagos', count: 1, overdue: 0 },
  ],
  items: [
    item({
      id: 'ld:lead1',
      queue: 'datos',
      kind: 'acceso',
      reason: null,
      who: 'Beto',
      due: '2020-01-10',
      amount: null,
      ref: null,
    }),
    item(),
    item({
      id: 'dp:SFDP-1',
      queue: 'pagos',
      kind: 'pago',
      reason: 'unbooked',
      who: 'Carla',
      amount: 900,
      ref: { doctype: 'Storefront Debt Payment', name: 'SFDP-1' },
    }),
  ],
  closed: false,
  ...extra,
})

const DETAIL = (extra = {}) => ({
  ...item(),
  words: 'La pantalla parpadea',
  contact: { email: 'ana@example.com', phone: '+52 55 1234 5678' },
  customer: { name: 'CUST-0001', label: 'Ana López' },
  documents: [],
  history: [
    { date: '2026-11-21T10:05:00', text: 'Pidió desde la app', who: '' },
  ],
  actions: ['aceptar', 'programar', 'rechazar', 'resolver'],
  citas: { contact: 'CONT-1', contact_label: 'Ana López' },
  scheduled: null,
  notifies: true,
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
async function mount(
  component = SolicitudesClientes,
  query = {},
  path = '/negocio/solicitudes-clientes',
) {
  host = document.createElement('div')
  document.body.appendChild(host)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/negocio/solicitudes-clientes',
        name: 'SolicitudesClientes',
        component: { render: () => null },
      },
      {
        path: '/ventas/solicitudes-clientes',
        name: 'VentasSolicitudesClientes',
        component: { render: () => null },
      },
      { path: '/:all(.*)*', component: { render: () => null } },
    ],
  })
  await router.push({ path, query })
  app = createApp({ render: () => h(component) })
  app.config.globalProperties.__ = globalThis.__
  app.use(router)
  app.mount(host)
  await flush()
}
const $ = (selector) => host.querySelector(selector)
const $$ = (selector) => [...host.querySelectorAll(selector)]
async function waitFor(selector) {
  for (let i = 0; i < 100 && !$(selector); i++) await flush(1)
  return $(selector)
}
const text = (el) => el?.textContent.replace(/\s+/g, ' ').trim()

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  globalThis.__ = (value, args) =>
    String(value).replace(/\{(\d+)\}/g, (m, i) => args?.[i] ?? m)
})
afterEach(() => {
  app?.unmount()
  host?.remove()
  app = null
})

describe('its two homes', () => {
  it('in Ventas it is a section, with no way back of its own', async () => {
    mocks.request.mockResolvedValueOnce(copy(BOARD()))
    await mount(SolicitudesClientes, {}, '/ventas/solicitudes-clientes')
    expect($('[data-solicitudes-lista]')).not.toBeNull()
    expect($('header').hasAttribute('data-atras')).toBe(false)
  })

  it('outside Ventas (the accounts staff) it keeps the way back', async () => {
    mocks.request.mockResolvedValueOnce(copy(BOARD()))
    await mount()
    expect($('[data-solicitudes-lista]')).not.toBeNull()
    expect($('header').hasAttribute('data-atras')).toBe(true)
  })
})

describe('what staff see', () => {
  it('reads the queue by GET, «Todas» first with its counts, overdue first', async () => {
    mocks.request.mockResolvedValueOnce(copy(BOARD()))
    await mount()
    expect(mocks.request).toHaveBeenCalledWith({
      url: API + 'queue',
      method: 'GET',
      params: {},
    })
    expect(text($('h1'))).toBe('Customer requests')
    expect(text($('[data-cuenta]'))).toBe('3')
    const chips = $$('[data-ui-filter-chips] [data-chip]')
    expect(chips.map((chip) => chip.getAttribute('data-chip'))).toEqual([
      '',
      'devoluciones',
      'garantias',
      'datos',
      'pagos',
    ])
    expect(chips[0].querySelector('.whitespace-nowrap').textContent).toBe('All')
    expect(chips[0].querySelector('.tabular-nums').textContent).toBe('3')
    expect(chips[0].getAttribute('aria-pressed')).toBe('true')
    expect(
      $$('[data-solicitud]').map((row) => row.getAttribute('data-solicitud')),
    ).toEqual(['ld:lead1', 'rr:abc123', 'dp:SFDP-1'])
    const late = $('[data-solicitud="ld:lead1"]')
    expect(text(late)).toContain('Beto')
    expect(
      late.querySelector('[data-ui-status]').getAttribute('data-tone'),
    ).toBe('danger')
    expect(text($('[data-solicitud="rr:abc123"]'))).toContain('$1,250.00')
  })

  it('a chip keeps its queue in the URL and lists only its rows', async () => {
    mocks.request.mockResolvedValueOnce(copy(BOARD()))
    await mount()
    $('[data-chip="pagos"]').click()
    await flush()
    expect(router.currentRoute.value.query.cola).toBe('pagos')
    expect(
      $$('[data-solicitud]').map((row) => row.getAttribute('data-solicitud')),
    ).toEqual(['dp:SFDP-1'])
    expect(mocks.request).toHaveBeenCalledTimes(1) // the queue filters what it already has
  })

  it('nothing waiting: the empty state', async () => {
    mocks.request.mockResolvedValueOnce(
      copy(
        BOARD({ items: [], queues: [{ key: 'todas', count: 0, overdue: 0 }] }),
      ),
    )
    await mount()
    expect(text($('[data-solicitudes-vacia]'))).toContain('Nothing waiting')
  })

  it('a person who reads no queue reads why', async () => {
    mocks.request.mockRejectedValueOnce(
      new Error(
        'Customer requests are for the shop’s managers, sales and accounts staff. Ask the owner for access.',
      ),
    )
    await mount()
    expect(text($('[data-solicitudes-problema]'))).toContain(
      'Ask the owner for access',
    )
  })

  it('the closed requests are one tap away', async () => {
    mocks.request.mockResolvedValueOnce(copy(BOARD()))
    await mount()
    mocks.request.mockResolvedValueOnce(
      copy(BOARD({ closed: true, items: [item({ state: 'resolved' })] })),
    )
    $('[data-solicitudes-cerradas]').click()
    await flush()
    expect(router.currentRoute.value.query.cerradas).toBe('1')
    expect(mocks.request).toHaveBeenLastCalledWith({
      url: API + 'queue',
      method: 'GET',
      params: { closed: 1 },
    })
    expect(text($('[data-solicitud="rr:abc123"] [data-ui-status]'))).toBe(
      'Resolved',
    )
    expect(text($('[data-solicitudes-cerradas]'))).toBe('See what waits')
  })
})

describe('the sheet', () => {
  async function openSheet(detail = DETAIL()) {
    mocks.request.mockResolvedValueOnce(copy(BOARD()))
    await mount()
    mocks.request.mockResolvedValueOnce(copy(detail))
    $('[data-solicitud="rr:abc123"]').click()
    await waitFor('[data-solicitud-hoja]')
  }

  it('a row opens its request: words, facts as links, ways to reach, history', async () => {
    await openSheet()
    expect(router.currentRoute.value.query.id).toBe('rr:abc123')
    expect(mocks.request).toHaveBeenLastCalledWith({
      url: API + 'request',
      method: 'GET',
      params: { id: 'rr:abc123' },
    })
    expect(text($('[role="dialog"] h2'))).toBe('Ana López')
    expect(text($('[data-subtitulo]'))).toBe('Return, defective')
    expect(text($('[data-solicitud-palabras]'))).toBe('La pantalla parpadea')
    const order = $('[data-dato="ref"] a')
    expect(text(order)).toBe('SAL-ORD-0001')
    expect(order.getAttribute('href')).toBe('/documentos/pedidos/SAL-ORD-0001')
    expect($('[data-dato="customer"] a').getAttribute('href')).toBe(
      '/contactos/customer/CUST-0001',
    )
    expect(
      $$('[data-solicitud-contacto]').map((link) =>
        link.getAttribute('data-solicitud-contacto'),
      ),
    ).toEqual(['llamar', 'whatsapp', 'correo'])
    expect(text($('[data-solicitud-actividad]'))).toContain(
      'Pidió desde la app',
    )
    expect(
      $$('[data-solicitud-paso]').map((button) =>
        button.getAttribute('data-solicitud-paso'),
      ),
    ).toEqual(['rechazar', 'programar', 'resolver', 'aceptar'])
  })

  it('?id= from a bell notice opens the sheet at once', async () => {
    mocks.request.mockResolvedValueOnce(copy(BOARD()))
    mocks.request.mockResolvedValueOnce(copy(DETAIL()))
    await mount(SolicitudesClientes, { id: 'rr:abc123' })
    await waitFor('[data-solicitud-hoja]')
    expect(text($('[role="dialog"] h2'))).toBe('Ana López')
  })

  it('accepting with a message tells the customer and the row follows', async () => {
    await openSheet()
    $('[data-solicitud-mensaje]').value = 'Tráelo cuando puedas'
    $('[data-solicitud-mensaje]').dispatchEvent(new Event('input'))
    mocks.call.mockResolvedValueOnce(
      copy({
        ...DETAIL({
          state: 'in_progress',
          actions: ['programar', 'rechazar', 'resolver'],
        }),
        notified: true,
      }),
    )
    mocks.request.mockResolvedValueOnce(copy(BOARD()))
    $('[data-solicitud-paso="aceptar"]').click()
    await flush()
    expect(mocks.call).toHaveBeenCalledWith(API + 'act', {
      id: 'rr:abc123',
      action: 'aceptar',
      reason: 'Tráelo cuando puedas',
    })
    expect(mocks.success).toHaveBeenCalledWith(
      'Accepted. The customer sees it in their app.',
    )
    expect(text($('[data-solicitud-estado]'))).toBe('In progress')
    expect($('[data-solicitud-mensaje]').value).toBe('')
  })

  it('a refusal without its reason is not sent', async () => {
    await openSheet()
    $('[data-solicitud-paso="rechazar"]').click()
    await flush(2)
    expect(mocks.call).not.toHaveBeenCalled()
    expect(text($('[data-solicitud-problema]'))).toBe(
      'Write why: the customer reads it.',
    )
  })

  it('a refusal the cell takes back says why and keeps the sheet', async () => {
    await openSheet()
    $('[data-solicitud-mensaje]').value = 'Daño por agua'
    $('[data-solicitud-mensaje]').dispatchEvent(new Event('input'))
    mocks.call.mockRejectedValueOnce(
      new Error(
        'This request is already rejected: that step is no longer possible.',
      ),
    )
    $('[data-solicitud-paso="rechazar"]').click()
    await flush()
    expect(mocks.error).toHaveBeenCalledWith(
      'This request is already rejected: that step is no longer possible.',
    )
    expect($('[data-solicitud-hoja]')).not.toBeNull()
  })

  it('scheduling a pickup opens in place, with the appointments link', async () => {
    await openSheet()
    $('[data-solicitud-paso="programar"]').click()
    await flush(2)
    expect($('[data-solicitud-citas]').getAttribute('href')).toBe(
      '/agenda?new_cita=1&contact=CONT-1&contact_label=Ana+L%C3%B3pez',
    )
    $('[data-solicitud-paso="programar"]').click()
    await flush(2)
    expect(text($('[data-solicitud-problema]'))).toBe('Choose pickup or visit.')
    $('[data-solicitud-modo="recoleccion"]').click()
    const when = $('[data-fecha]')
    when.value = '2026-11-25 10:30:00'
    when.dispatchEvent(new Event('input'))
    mocks.call.mockResolvedValueOnce(
      copy({
        ...DETAIL({
          state: 'in_progress',
          scheduled: { mode: 'recoleccion', when: '2026-11-25T10:30' },
        }),
        notified: false,
      }),
    )
    mocks.request.mockResolvedValueOnce(copy(BOARD()))
    $('[data-solicitud-paso="programar"]').click()
    await flush()
    expect(mocks.call).toHaveBeenCalledWith(API + 'act', {
      id: 'rr:abc123',
      action: 'programar',
      mode: 'recoleccion',
      when: '2026-11-25T10:30',
    })
    expect(mocks.success).toHaveBeenCalledWith(
      'Scheduled. Tell the customer by WhatsApp or email.',
    )
    expect(text($('[data-dato="scheduled"]'))).toContain('25 nov, 10:30')
  })

  it('a hand-over at the shop takes a note the customer reads with the date', async () => {
    await openSheet(DETAIL({ notifies: false }))
    $('[data-solicitud-paso="programar"]').click()
    await flush(2)
    expect(
      $$('[data-solicitud-modo]').map((b) => b.dataset.solicitudModo),
    ).toEqual(['recoleccion', 'visita', 'entrega_en_tienda'])
    // no Avisos: the note has its own box in the form (no message box below)
    expect($('[data-solicitud-mensaje]')).toBeNull()
    $('[data-solicitud-modo="entrega_en_tienda"]').click()
    const note = $('[data-solicitud-nota]')
    note.value = 'Trae tu ticket'
    note.dispatchEvent(new Event('input'))
    const when = $('[data-fecha]')
    when.value = '2026-11-26 17:00:00'
    when.dispatchEvent(new Event('input'))
    mocks.call.mockResolvedValueOnce(
      copy({
        ...DETAIL({
          notifies: false,
          state: 'in_progress',
          scheduled: {
            mode: 'entrega_en_tienda',
            when: '2026-11-26T17:00',
            note: 'Trae tu ticket',
          },
        }),
        notified: false,
      }),
    )
    mocks.request.mockResolvedValueOnce(copy(BOARD()))
    $('[data-solicitud-paso="programar"]').click()
    await flush()
    expect(mocks.call).toHaveBeenCalledWith(API + 'act', {
      id: 'rr:abc123',
      action: 'programar',
      mode: 'entrega_en_tienda',
      when: '2026-11-26T17:00',
      reason: 'Trae tu ticket',
    })
    expect(text($('[data-dato="scheduled"]'))).toContain(
      'Hand-over at the shop',
    )
    expect(text($('[data-dato="scheduled-note"]'))).toContain('Trae tu ticket')
    // the Ventas section's badge and the rail read again
    expect(mocks.counts).toHaveBeenCalledWith({ force: true })
    expect(mocks.rail).toHaveBeenCalledWith({ force: true })
  })

  it('a customer without notices: no message box, a note to reach them', async () => {
    await openSheet(DETAIL({ notifies: false }))
    expect($('[data-solicitud-mensaje]')).toBeNull()
    expect($('[data-solicitud-sin-avisos]')).not.toBeNull()
  })

  it('money waiting for a person: the guide, retry as the next step', async () => {
    mocks.request.mockResolvedValueOnce(copy(BOARD()))
    await mount()
    mocks.request.mockResolvedValueOnce(
      copy(
        DETAIL({
          id: 'dp:SFDP-1',
          queue: 'pagos',
          kind: 'pago',
          reason: 'unbooked',
          words: '',
          ref: { doctype: 'Storefront Debt Payment', name: 'SFDP-1' },
          documents: [{ doctype: 'Sales Invoice', name: 'SINV-9' }],
          actions: ['resolver', 'reintentar'],
          citas: null,
          notifies: false,
        }),
      ),
    )
    $('[data-solicitud="dp:SFDP-1"]').click()
    await waitFor('[data-solicitud-hoja]')
    expect(text($('[data-solicitud-guia]'))).toContain('then retry')
    expect($('[data-solicitud-mensaje]')).toBeNull()
    expect($('[data-solicitud-sin-avisos]')).toBeNull()
    expect(
      $('[data-dato="doc:Sales Invoice:SINV-9"] a').getAttribute('href'),
    ).toBe('/documentos/facturas/SINV-9')
    const steps = $$('[data-solicitud-paso]')
    expect(steps.map((b) => b.getAttribute('data-solicitud-paso'))).toEqual([
      'resolver',
      'reintentar',
    ])
  })
})

describe('the door on /negocio/app-clientes', () => {
  it('shows what waits and opens the queue', async () => {
    mocks.request.mockResolvedValueOnce({ count: 4, urgent: true })
    await mount(SolicitudesDoor)
    expect(mocks.request).toHaveBeenCalledWith({
      url: API + 'counts',
      method: 'GET',
    })
    const door = $('[data-testid="solicitudes-puerta"]')
    expect(door.getAttribute('href')).toBe('/negocio/solicitudes-clientes')
    expect(text($('[data-solicitudes-puerta-cuenta]'))).toBe('4')
    expect(text($('[data-solicitudes-puerta-linea]'))).toBe('4 waiting')
  })

  it('nobody who reads no queue sees a door', async () => {
    mocks.request.mockResolvedValueOnce(null)
    await mount(SolicitudesDoor)
    expect($('[data-testid="solicitudes-puerta-bloque"]')).toBeNull()
    mocks.request.mockRejectedValueOnce(new Error('403'))
    app.unmount()
    host.remove()
    await mount(SolicitudesDoor)
    expect($('[data-testid="solicitudes-puerta-bloque"]')).toBeNull()
  })
})
