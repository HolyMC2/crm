// Tickets de compra in Por explicar (crm docs/DINERO_EN_ORDEN.md §3f): the
// helpers' words, and the page's flows: a ticket booked in one tap with its
// store's answer and undone, the offer to book a store's tickets by
// themselves, the invitation when no mailbox reads tickets, a card movement
// showing what its ticket bought, «Lo de siempre» in «Gasté en efectivo», and
// the page following tickets live.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({
  call: vi.fn(),
  query: {},
  push: vi.fn(),
  live: null,
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    Button: {
      props: ['label', 'variant', 'loading', 'disabled', 'type'],
      emits: ['click'],
      setup:
        (props, { emit, attrs }) =>
        () =>
          h(
            'button',
            {
              ...attrs,
              type: props.type || 'button',
              disabled: props.disabled,
              onClick: () => emit('click'),
            },
            props.label,
          ),
    },
  }
})
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  return {
    AppBar: {
      props: ['title'],
      setup:
        (p, { slots }) =>
        () =>
          h('div', [h('h1', p.title), slots.actions?.()]),
    },
    EmptyState: {
      props: ['title', 'message'],
      setup: (p) => () => h('p', { 'data-empty': '' }, p.title),
    },
    Segmented: {
      props: ['modelValue', 'options', 'label'],
      emits: ['update:modelValue'],
      setup:
        (p, { emit }) =>
        () =>
          h(
            'div',
            p.options.map((o) =>
              h(
                'button',
                {
                  type: 'button',
                  'aria-pressed': String(p.modelValue === o.value),
                  onClick: () => emit('update:modelValue', o.value),
                },
                o.label,
              ),
            ),
          ),
    },
    BottomSheet: {
      props: ['open', 'title'],
      setup:
        (p, { slots }) =>
        () =>
          p.open
            ? h('div', { 'data-sheet': p.title }, [
                h('h2', p.title),
                slots.default?.(),
                slots.actions?.(),
              ])
            : null,
    },
  }
})
vi.mock('@/composables/liveList', async () => {
  const { ref } = await import('vue')
  return {
    useLiveList: (doctypes, refresh, options) => {
      const fresh = ref(new Set())
      state.live = { doctypes, refresh, options }
      return { fresh, mark: () => {} }
    },
  }
})
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: state.query, params: {} }),
  useRouter: () => ({ push: state.push }),
}))

import {
  aloneOffer,
  doneTitle,
  effectText,
  frequentChips,
  oneTap,
  quickOnes,
  suggestionText,
  tapLine,
  ticketDetail,
  ticketsCount,
  wayText,
  whenText,
} from '@/components/dinero/tickets'
import PorExplicar from '@/pages/PorExplicar.vue'
// the sheets the section opens on demand, loaded once here so their first open is immediate
import '@/components/dinero/TicketSheet.vue'
import '@/components/dinero/TicketsAjustesSheet.vue'

// the sheets load on their first open (defineAsyncComponent): a macrotask lets the import land
const flush = async () => {
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve()
      await nextTick()
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const NOW = new Date('2026-11-22T12:00:00')
const NAMES = { 'Cafe - E': 'Café y comida', 'Caja Fuerte - E': 'Caja fuerte' }

function ticket(over = {}) {
  return {
    name: 'TCK-2026-00001',
    tienda: 'OXXO',
    sucursal: 'Centro',
    fecha: '2026-11-22 09:14:00',
    total: 42,
    forma_pago: 'Cash',
    tarjeta: '',
    estado: 'To record',
    origen: 'Mail',
    archivo: '',
    movimiento: '',
    poliza: '',
    cuenta: '',
    caja: '',
    etiquetas: [],
    registrado_solo: 0,
    motivo: '',
    articulos: [
      { descripcion: 'CAFE AMERICANO', cantidad: 1, importe: 25 },
      { descripcion: 'GALLETAS', cantidad: 1, importe: 17 },
    ],
    articulos_texto: 'CAFE AMERICANO, GALLETAS',
    sugerencia: {
      cuenta: 'Cafe - E',
      caja: 'Caja Fuerte - E',
      etiquetas: [],
      veces: 2,
      solo: 0,
    },
    ofrecer_solo: false,
    inusual: false,
    ...over,
  }
}

describe('ticket words', () => {
  it('says how it was paid and when, without a midnight time', () => {
    expect(wayText('Cash')).toBe('Efectivo')
    expect(wayText('nada')).toBe('No dice cómo se pagó')
    expect(whenText('2026-11-22 09:14:00', NOW)).toBe('hoy 09:14')
    expect(whenText('2026-11-21 00:00:00', NOW)).toBe('ayer')
    expect(ticketDetail(ticket(), NOW)).toBe(
      'CAFE AMERICANO, GALLETAS · hoy 09:14',
    )
  })

  it('says the store’s answer, or what is missing', () => {
    expect(suggestionText(ticket(), NAMES)).toBe(
      'Va a Café y comida, de Caja fuerte, como los últimos 2.',
    )
    expect(suggestionText(ticket({ sugerencia: {} }), NAMES)).toBe(
      '¿En qué fue? Dilo una vez y la tienda lo recuerda.',
    )
    expect(suggestionText(ticket({ forma_pago: 'Card' }), NAMES)).toContain(
      'espera su cargo del banco',
    )
    expect(suggestionText(ticket({ inusual: true }), NAMES)).toContain(
      'más de lo de siempre',
    )
  })

  it('books in one tap only what it knows and what is usual', () => {
    expect(oneTap(ticket())).toBe(true)
    expect(oneTap(ticket({ forma_pago: 'Card' }))).toBe(false)
    expect(oneTap(ticket({ inusual: true }))).toBe(false)
    expect(oneTap(ticket({ sugerencia: { cuenta: 'Cafe - E' } }))).toBe(false)
    expect(quickOnes([ticket(), ticket({ inusual: true })])).toHaveLength(1)
  })

  it('says what a tap books and what it did', () => {
    const fmt = (n) => `$${Number(n).toFixed(2)}`
    expect(effectText(42, 'Cafe - E', 'Caja Fuerte - E', NAMES, fmt)).toBe(
      'Salen $42.00 de Caja fuerte a Café y comida.',
    )
    expect(
      doneTitle('registrado', ticket({ cuenta: 'Cafe - E' }), NAMES, fmt),
    ).toBe('Registrado: OXXO $42.00 en Café y comida')
    expect(doneTitle('tarjeta', ticket(), NAMES, fmt)).toContain('con tarjeta')
    expect(
      aloneOffer({ tienda: 'OXXO', cuenta: 'Cafe - E', veces: 3 }, NAMES),
    ).toContain('Ya van 3 de OXXO a Café y comida.')
    expect(tapLine(3, 3)).toBe(
      'Un toque registra cada uno como gasto en efectivo.',
    )
    expect(tapLine(1, 0)).toBe('Di en qué fue y su tienda lo recuerda.')
    expect(tapLine(3, 2)).toBe(
      '2 van con su cuenta en un toque; los demás, di en qué fueron.',
    )
    expect(ticketsCount(1)).toBe('1 ticket')
    expect(ticketsCount(3)).toBe('3 tickets')
  })

  it('turns «lo de siempre» into what the sheet fills in', () => {
    const [chip] = frequentChips(
      [
        {
          tienda: 'OXXO',
          total: 42,
          cuenta: 'Cafe - E',
          caja: 'Caja Fuerte - E',
          etiquetas: ['Casa'],
          veces: 5,
          nota: 'OXXO: CAFE AMERICANO',
        },
      ],
      NAMES,
      (n) => `$${n}`,
    )
    expect(chip.label).toBe('OXXO $42')
    expect(chip.hint).toBe('Café y comida')
    expect(chip.fill).toEqual({
      amount: '42',
      account: 'Cafe - E',
      cash: 'Caja Fuerte - E',
      note: 'OXXO: CAFE AMERICANO',
      tags: ['Casa'],
    })
  })
})

const CHOICES = {
  gasto: [{ account: 'Cafe - E', label: 'Café y comida', uses: 9 }],
  personal: [{ account: 'Retiros - E', label: 'Retiros del dueño', uses: 1 }],
  traspaso: [{ account: 'Caja Fuerte - E', label: 'Caja fuerte', uses: 2 }],
  ingreso: [],
}

function estado({
  waiting = [],
  hechos = [],
  porMovimiento = {},
  buzones = 1,
  groups = [],
  siempre = [],
} = {}) {
  return {
    company: 'Mi Empresa',
    currency: 'MXN',
    engine: 'erpnext',
    can_explain: true,
    cash_account: 'Caja Fuerte - E',
    summary: {
      count: groups.reduce((n, g) => n + g.count, 0),
      total: 0,
      guessed: 0,
      oldest: null,
    },
    truncated: false,
    groups,
    choices: CHOICES,
    efectivo: [
      {
        account: 'Caja Fuerte - E',
        label: 'Caja fuerte',
        balance: 12000,
        last_count: null,
      },
    ],
    can_book: true,
    recordatorio: { remind: 1, hour: 20, every: 7 },
    can_set: true,
    tickets: {
      company: 'Mi Empresa',
      currency: 'MXN',
      can_book: true,
      caja: 'Caja Fuerte - E',
      por_registrar: waiting,
      esperando_banco: [],
      por_movimiento: porMovimiento,
      hechos,
      lo_de_siempre: siempre,
      mes: [],
      resumen: {
        count: waiting.length,
        total: waiting.reduce((n, t) => n + t.total, 0),
        solas: 0,
        buzones,
      },
    },
  }
}

describe('Tickets in Por explicar', () => {
  let app
  let host
  beforeEach(() => {
    state.call.mockReset()
    state.query = {}
    host = document.createElement('div')
    document.body.appendChild(host)
  })
  afterEach(() => {
    app?.unmount()
    host.remove()
  })
  const mount = async () => {
    app = createApp({ render: () => h(PorExplicar) })
    app.mount(host)
    await flush()
  }
  const button = (text, root = host) =>
    [...root.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === text,
    )

  it('books a ticket in one tap with its store’s answer, offers to book them alone, and undoes', async () => {
    state.call.mockImplementation(async (method, args) => {
      if (method.endsWith('por_explicar.estado'))
        return estado({ waiting: [ticket()] })
      if (method.endsWith('tickets.registrar'))
        return {
          tickets: [
            {
              ticket: 'TCK-2026-00001',
              ok: true,
              poliza: 'JV-9',
              tienda: 'OXXO',
              cuenta: 'Cafe - E',
            },
          ],
          ofrecer_solo: [{ tienda: 'OXXO', cuenta: 'Cafe - E', veces: 3 }],
          estado: estado(),
        }
      if (method.endsWith('tickets.regla'))
        return { tienda: {}, estado: estado() }
      if (method.endsWith('tickets.deshacer'))
        return {
          tickets: [{ ticket: 'TCK-2026-00001', ok: true, tienda_sola: '' }],
          estado: estado({ waiting: [ticket()] }),
        }
      throw new Error(method + JSON.stringify(args))
    })
    await mount()
    const section = host.querySelector('[data-tickets]')
    expect(section.textContent).toContain('Tickets por registrar')
    expect(section.textContent).toContain(
      '1 ticket · $42.00. Un toque lo registra como gasto en efectivo.',
    )
    expect(section.textContent).toContain(
      'Va a Café y comida, de Caja fuerte, como los últimos 2.',
    )
    expect(state.live.doctypes).toContain('Ticket de Compra')

    host.querySelector('[data-ticket-registrar="TCK-2026-00001"]').click()
    await flush()
    expect(state.call).toHaveBeenCalledWith(
      'doco.workspaces.tickets.registrar',
      {
        company: 'Mi Empresa',
        tickets: JSON.stringify([{ ticket: 'TCK-2026-00001' }]),
      },
    )
    const hecho = section.querySelector('[data-por-explicar-hecho]')
    expect(hecho.textContent).toContain(
      'Registrado: OXXO $42.00 en Café y comida',
    )
    expect(hecho.textContent).toContain(
      'Salieron $42.00 de Caja fuerte a Café y comida.',
    )

    const offer = section.querySelector('[data-tickets-oferta]')
    expect(offer.textContent).toContain('Ya van 3 de OXXO a Café y comida.')
    offer.querySelector('[data-tickets-oferta-si]').click()
    await flush()
    expect(state.call).toHaveBeenCalledWith('doco.workspaces.tickets.regla', {
      company: 'Mi Empresa',
      tienda: 'OXXO',
      solo: 0 + 1,
    })
    expect(
      section.querySelector('[data-tickets-oferta]').textContent,
    ).toContain('se registran solos')

    button('Deshacer', section).click()
    await flush()
    expect(state.call).toHaveBeenCalledWith(
      'doco.workspaces.tickets.deshacer',
      {
        company: 'Mi Empresa',
        tickets: JSON.stringify(['TCK-2026-00001']),
      },
    )
    expect(section.querySelector('[data-por-explicar-hecho]')).toBeNull()
    expect(
      section.querySelector('[data-ticket-registrar="TCK-2026-00001"]'),
    ).not.toBeNull()
  })

  it('asks what it was when the store has no answer yet, in its sheet', async () => {
    const fresh = ticket({
      sugerencia: {
        cuenta: '',
        caja: 'Caja Fuerte - E',
        etiquetas: [],
        veces: 0,
        solo: 0,
      },
    })
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('por_explicar.estado'))
        return estado({ waiting: [fresh] })
      if (method.endsWith('tickets.registrar'))
        return {
          tickets: [
            {
              ticket: fresh.name,
              ok: true,
              poliza: 'JV-1',
              tienda: 'OXXO',
              cuenta: 'Cafe - E',
            },
          ],
          ofrecer_solo: [],
          estado: estado(),
        }
      throw new Error(method)
    })
    await mount()
    expect(host.querySelector('[data-ticket-registrar]')).toBeNull() // no one-tap answer yet
    host.querySelector(`[data-ticket-abrir="${fresh.name}"]`).click()
    await flush()
    const sheet = host.querySelector('[data-ticket-sheet]')
    expect(sheet).not.toBeNull()
    expect(sheet.textContent).toContain('CAFE AMERICANO')
    const save = host.querySelector('[data-ticket-guardar]')
    expect(save.disabled).toBe(true) // the account first
    sheet.querySelector('[data-ticket-cuenta="Cafe - E"]').click()
    await flush()
    expect(sheet.querySelector('[data-ticket-efecto]').textContent).toContain(
      'Salen $42.00 de Caja fuerte a Café y comida.',
    )
    host.querySelector('[data-ticket-guardar]').click()
    await flush()
    expect(state.call).toHaveBeenCalledWith(
      'doco.workspaces.tickets.registrar',
      {
        company: 'Mi Empresa',
        tickets: JSON.stringify([
          {
            ticket: fresh.name,
            cuenta: 'Cafe - E',
            caja: 'Caja Fuerte - E',
            etiquetas: [],
          },
        ]),
      },
    )
    const done = host.querySelector('[data-por-explicar-hecho]').textContent
    expect(done).toContain('Registrado: OXXO')
    expect(done).toContain('Salieron $42.00 de Caja fuerte a Café y comida.')
  })

  it('invites to read tickets from mail when no mailbox does, and keeps «Todo explicado» for when nothing waits', async () => {
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('por_explicar.estado')) return estado({ buzones: 0 })
      if (method.endsWith('tickets.ajustes'))
        return {
          company: 'Mi Empresa',
          can_edit: true,
          buzones: [],
          caja: 'Caja Fuerte - E',
          solo_conocidas: 0,
          avisar: 0,
          tiendas: [],
          como_activar: [
            {
              tienda: 'OXXO',
              pasos: 'Pide «quiero ticket digital».',
              url: 'https://example.org/oxxo',
            },
          ],
        }
      throw new Error(method)
    })
    await mount()
    expect(
      host.querySelector('[data-tickets-invitacion]').textContent,
    ).toContain('¿Te dan ticket por correo?')
    expect(host.querySelector('[data-empty]')).not.toBeNull()
    button('Leer tickets de mi correo').click()
    await flush()
    const sheet = host.querySelector('[data-tickets-ajustes]')
    expect(sheet.textContent).toContain(
      'Muelle todavía no lee ningún buzón tuyo.',
    )
    expect(sheet.textContent).toContain('Pide «quiero ticket digital».')
  })

  it('shows on a card movement what its ticket bought', async () => {
    const group = {
      id: 'Amex|Withdrawal|OXXO',
      bank_account: 'Amex',
      bank_label: 'Amex Platinum',
      direction: 'Withdrawal',
      label: 'OXXO',
      example: 'OXXO CENTRO',
      count: 1,
      total: 148,
      first: '2026-11-21',
      last: '2026-11-21',
      guess: null,
      tags: [],
      rows: [
        {
          name: 'BT5',
          date: '2026-11-21',
          description: 'OXXO CENTRO',
          amount: 148,
          twin: null,
        },
      ],
    }
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('por_explicar.estado'))
        return estado({
          groups: [group],
          porMovimiento: {
            BT5: ticket({
              total: 148,
              forma_pago: 'Card',
              estado: 'With the bank',
              movimiento: 'BT5',
            }),
          },
        })
      throw new Error(method)
    })
    await mount()
    const line = host.querySelector('[data-por-explicar-grupo-tickets]')
    expect(line.textContent).toContain('OXXO $148.00: CAFE AMERICANO, GALLETAS')
    // its ticket's store already has an answer: the charge comes with it, one tap
    const card = host.querySelector('[data-por-explicar-grupo="OXXO"]')
    expect(card.textContent).toContain('Parece:')
    expect(card.textContent).toContain('Café y comida')
    expect(card.textContent).toContain(
      'Su ticket es de OXXO, que registras en Café y comida.',
    )
  })

  it('fills «Gasté en efectivo» from «Lo de siempre» in one tap', async () => {
    state.call.mockImplementation(async (method, args) => {
      if (method.endsWith('por_explicar.estado'))
        return estado({
          siempre: [
            {
              tienda: 'OXXO',
              total: 42,
              cuenta: 'Cafe - E',
              caja: 'Caja Fuerte - E',
              etiquetas: [],
              veces: 4,
              nota: 'OXXO: CAFE',
            },
          ],
        })
      if (method.endsWith('por_explicar.gaste'))
        return { journal: 'JV-3', amount: 42, estado: estado() }
      throw new Error(method + JSON.stringify(args))
    })
    await mount()
    button('Gasté en efectivo').click()
    await flush()
    const chip = host.querySelector('[data-gasto-siempre]')
    expect(chip.textContent).toContain('OXXO $42.00')
    chip.click()
    await flush()
    host.querySelector('[data-gasto-guardar]').click()
    await flush()
    expect(state.call).toHaveBeenCalledWith(
      'doco.workspaces.por_explicar.gaste',
      expect.objectContaining({
        monto: 42,
        cuenta: 'Cafe - E',
        caja: 'Caja Fuerte - E',
        nota: 'OXXO: CAFE',
      }),
    )
  })
})
