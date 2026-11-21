// Por explicar (crm docs/DINERO_EN_ORDEN.md §3d): the helpers' words, and the
// page's flows: a group answered with its guess in one tap, undo, «¿Qué fue?»
// with an answer and an account, and the empty state.
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
// The page's live list, driven by hand: `state.live.refresh()` is a change elsewhere.
vi.mock('@/composables/liveList', async () => {
  const { ref } = await import('vue')
  return {
    useLiveList: (doctypes, refresh, options) => {
      const fresh = ref(new Set())
      state.live = { doctypes, refresh, options }
      return {
        fresh,
        mark: (before, after) =>
          (fresh.value = new Set(after.filter((k) => !before.includes(k)))),
      }
    },
  }
})
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: state.query, params: {} }),
  useRouter: () => ({ push: state.push }),
}))

import {
  accountNames,
  accountState,
  accountsFor,
  answerText,
  dayOf,
  differenceText,
  effectLines,
  everyText,
  hourText,
  journalsOf,
  kindsFor,
  lastCountText,
  ownBalances,
  rangeText,
  receiptText,
  stillWaiting,
  whyText,
} from '@/components/dinero/porExplicar'
import PorExplicar from '@/pages/PorExplicar.vue'

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

const CHOICES = {
  gasto: [
    { account: 'Software - E', label: 'Software', uses: 9 },
    { account: 'Gasolina - E', label: 'Gasolina', uses: 4 },
  ],
  personal: [{ account: 'Retiros - E', label: 'Retiros del dueño', uses: 1 }],
  traspaso: [
    { account: 'Amex - E', label: 'Amex Platinum', uses: 3 },
    { account: 'Caja Fuerte - E', label: 'Caja fuerte', uses: 2 },
  ],
  ingreso: [{ account: 'Ventas - E', label: 'Ventas', uses: 50 }],
}

function estado(groups) {
  const count = groups.reduce((n, g) => n + g.count, 0)
  return {
    company: 'Mi Empresa',
    currency: 'MXN',
    engine: 'erpnext',
    can_explain: true,
    cash_account: 'Caja Fuerte - E',
    summary: {
      count,
      total: groups.reduce((n, g) => n + g.total, 0),
      guessed: groups.filter((g) => g.guess).reduce((n, g) => n + g.count, 0),
      oldest: '2026-10-23',
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
  }
}

const ANTHROPIC = {
  id: 'Amex|Withdrawal|ANTHROPIC',
  bank_account: 'Amex',
  bank_label: 'Amex Platinum',
  direction: 'Withdrawal',
  label: 'ANTHROPIC',
  example: 'ANTHROPIC* CLAUDE SUB',
  count: 2,
  total: 7275.29,
  first: '2026-11-04',
  last: '2026-11-13',
  guess: { kind: 'gasto', account: 'Software - E', why: 'antes', times: 3 },
  rows: [
    {
      name: 'BT1',
      date: '2026-11-13',
      description: 'ANTHROPIC* CLAUDE SUB',
      amount: 3449,
      twin: null,
    },
    {
      name: 'BT2',
      date: '2026-11-04',
      description: 'ANTHROPIC* CLAUDE SUB',
      amount: 3826.29,
      twin: null,
    },
  ],
}
const PETRO = {
  id: 'Amex|Withdrawal|PETROPLAZAS',
  bank_account: 'Amex',
  bank_label: 'Amex Platinum',
  direction: 'Withdrawal',
  label: 'PETROPLAZAS',
  example: 'PETROPLAZAS 4711',
  count: 1,
  total: 479.8,
  first: '2026-11-06',
  last: '2026-11-06',
  guess: null,
  rows: [
    {
      name: 'BT7',
      date: '2026-11-06',
      description: 'PETROPLAZAS 4711',
      amount: 479.8,
      twin: null,
    },
  ],
}

describe('porExplicar helpers', () => {
  it('offers the answers that fit each side, in words', () => {
    expect(kindsFor('Withdrawal').map((k) => k.kind)).toEqual([
      'gasto',
      'personal',
      'traspaso',
    ])
    const deposit = kindsFor('Deposit')
    expect(deposit.map((k) => k.kind)).toEqual([
      'traspaso',
      'ingreso',
      'personal',
      'gasto',
    ])
    expect(deposit.find((k) => k.kind === 'personal').label).toBe(
      'Dinero que tú pusiste',
    )
  })

  it('says why the guess and what it books', () => {
    const names = accountNames(CHOICES)
    expect(answerText('gasto', 'Software - E', 'Withdrawal', names)).toBe(
      'Gasto del negocio · Software',
    )
    expect(whyText({ why: 'antes', times: 1 }, names)).toBe(
      'Así lo explicaste la vez pasada.',
    )
    expect(whyText({ why: 'pareja', account: 'Amex - E' }, names)).toContain(
      'Amex Platinum',
    )
    expect(
      whyText({ why: 'efectivo', account: 'Caja Fuerte - E' }, names),
    ).toBe('Depósito en efectivo: sale de Caja fuerte.')
  })

  it('finds an account by any word, without accents', () => {
    expect(
      accountsFor(CHOICES, 'personal', 'dueno').map((a) => a.account),
    ).toEqual(['Retiros - E'])
    expect(accountsFor(CHOICES, 'gasto', '')).toHaveLength(2)
  })

  it('counts a pair as two movements and lists each entry once', () => {
    const done = {
      results: [
        { name: 'BT4', ok: true, journal: 'JV-1', twin: 'BT3' },
        { name: 'BT9', ok: false, message: 'Este mes está cerrado.' },
      ],
    }
    expect(receiptText(done, 'PAGO TARJETA')).toBe(
      'Listo: 2 movimientos de PAGO TARJETA explicados. 1 no se pudo: Este mes está cerrado.',
    )
    expect(journalsOf(done)).toEqual(['JV-1'])
    expect(rangeText('2026-11-06', '2026-11-06')).not.toContain('al')
  })
})

describe('cash and reminder helpers', () => {
  const fmt = (n) => `$${n.toFixed(2)}`
  it('says the hour, the days and the difference in words', () => {
    expect(hourText(20)).toBe('8 de la noche')
    expect(hourText(18)).toBe('6 de la tarde')
    expect(everyText(7)).toBe('Cada 7 días')
    expect(everyText(0)).toBe('Nunca')
    expect(differenceText(-1200, fmt)).toBe('Faltan $1200.00')
    expect(differenceText(200, fmt)).toBe('Sobran $200.00')
    expect(differenceText(0, fmt)).toBe('Cuadra con tus libros')
  })

  it('says when the cash was counted and which day was picked', () => {
    const today = new Date('2026-11-17T10:00:00')
    expect(lastCountText(null, today)).toBe('Nunca contada')
    expect(lastCountText('2026-11-17', today)).toBe('Contada hoy')
    expect(lastCountText('2026-11-08', today)).toBe('Contada hace 9 días')
    expect(dayOf('hoy', today)).toBe('2026-11-17')
    expect(dayOf('ayer', today)).toBe('2026-11-16')
  })
})

describe('what a tap does, and where each account lands', () => {
  const fmt = (n) =>
    `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  const DEPOSITOS = {
    id: 'BBVA|Deposit|DEPOSITO EFECTIVO',
    bank_account: 'BBVA',
    bank_label: 'BBVA Débito',
    direction: 'Deposit',
    label: 'DEPOSITO EFECTIVO',
    count: 3,
    total: 900,
    rows: [
      { name: 'BT30', amount: 500 },
      { name: 'BT31', amount: 300 },
    ],
    guess: { kind: 'traspaso', account: 'Caja Fuerte - E', why: 'efectivo' },
  }
  const ctx = {
    fmt,
    names: accountNames(CHOICES),
    own: ownBalances(
      [
        {
          cuenta: 'Amex',
          label: 'Amex Platinum',
          kind: 'tarjeta',
          ledger: 'Amex - E',
          balance: 20000,
        },
      ],
      [{ account: 'Caja Fuerte - E', label: 'Caja fuerte', balance: 12000 }],
    ),
  }

  it('says where the money goes and where the other account lands', () => {
    expect(effectLines(DEPOSITOS, 'traspaso', 'Caja Fuerte - E', ctx)).toEqual([
      'Pasan $800.00 de Caja fuerte a BBVA Débito.',
      'Caja fuerte queda en $11,200.00 en tus libros.',
      'Toma los 2 más recientes; el otro sigue aquí.',
    ])
    const pago = {
      ...DEPOSITOS,
      direction: 'Withdrawal',
      count: 1,
      rows: [{ name: 'BT32', amount: 5000 }],
    }
    expect(effectLines(pago, 'traspaso', 'Amex - E', ctx)).toEqual([
      'Se pagan $5,000.00 de Amex Platinum desde BBVA Débito.',
      'Tu deuda de Amex Platinum queda en $15,000.00 en tus libros.',
    ])
    expect(effectLines(pago, 'personal', 'Retiros - E', ctx, true)).toEqual([
      'Salió $5,000.00 de BBVA Débito como dinero tuyo (Retiros del dueño), no como gasto.',
    ])
  })

  it('tells whether explaining what waits makes the account agree with its bank', () => {
    const bank = { kind: 'banco', diferencia: 800 }
    expect(accountState(bank, { count: 2, net: 800 }, fmt)).toMatchObject({
      known: true,
      agrees: false,
      figure: '$800.00',
      line: '2 movimientos por explicar: al explicarlos, cuadra con el banco.',
    })
    expect(accountState(bank, { count: 2, net: 300 }, fmt).line).toBe(
      '2 movimientos por explicar. Al explicarlos quedan $500.00 sin cuadrar: toca para ver por qué.',
    )
    // a card: what waits is a charge (the ledger owes more), the bank says it is owed
    const card = { kind: 'tarjeta', diferencia: 400 }
    expect(accountState(card, { count: 1, net: -400 }, fmt).line).toContain(
      'cuadra con el banco',
    )
    expect(
      accountState({ kind: 'banco', diferencia: 0 }, null, fmt),
    ).toMatchObject({
      agrees: true,
      figure: 'Cuadra',
      line: 'Cuadra con el banco.',
    })
    expect(accountState(null, { count: 3, net: 0 }, fmt).known).toBe(false)
  })

  it('finds which movements still wait after a call that never answered', () => {
    const page = {
      groups: [{ rows: [{ name: 'BT1' }] }],
      facturas: [{ name: 'BT9' }],
    }
    expect(stillWaiting(page, ['BT1', 'BT2', 'BT9'])).toEqual(['BT1', 'BT9'])
  })
})

describe('PorExplicar page', () => {
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
  const button = (text) =>
    [...host.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === text,
    )

  it('books a group with its guess in one tap and undoes it', async () => {
    state.call.mockImplementation(async (method, args) => {
      if (method.endsWith('.estado')) return estado([ANTHROPIC, PETRO])
      if (method.endsWith('.explicar'))
        return {
          results: [
            { name: 'BT1', ok: true, journal: 'JV-1', twin: null },
            { name: 'BT2', ok: true, journal: 'JV-2', twin: null },
          ],
          explained: 2,
          estado: estado([PETRO]),
        }
      if (method.endsWith('.deshacer'))
        return { estado: estado([ANTHROPIC, PETRO]) }
      throw new Error(method + JSON.stringify(args))
    })
    await mount()
    expect(host.textContent).toContain('3 movimientos')
    expect(host.textContent).toContain('Parece: Gasto del negocio · Software')
    expect(host.textContent).toContain('Así lo explicaste las últimas 3 veces.')

    button('Sí, es eso').click()
    await flush()
    expect(state.call).toHaveBeenCalledWith(
      'doco.workspaces.por_explicar.explicar',
      {
        company: 'Mi Empresa',
        movimientos: JSON.stringify(['BT1', 'BT2']),
        tipo: 'gasto',
        cuenta: 'Software - E',
      },
    )
    // the result stays where the group was, with what it booked
    const hecho = host.querySelector('[data-por-explicar-hecho]')
    expect(hecho.textContent).toContain('ANTHROPIC: 2 movimientos explicados')
    expect(hecho.textContent).toContain(
      'Salió $7,275.29 de Amex Platinum como gasto en Software.',
    )
    expect(
      host.querySelector('[data-por-explicar-grupos] li').contains(hecho),
    ).toBe(true)
    expect(
      host.querySelector('[data-por-explicar-grupo="ANTHROPIC"]'),
    ).toBeNull()

    button('Deshacer').click()
    await flush()
    const undos = state.call.mock.calls.filter(([m]) => m.endsWith('.deshacer'))
    expect(undos).toHaveLength(1)
    expect(undos[0][1].polizas).toBe(JSON.stringify(['JV-1', 'JV-2']))
    expect(
      host.querySelector('[data-por-explicar-grupo="ANTHROPIC"]'),
    ).not.toBeNull()
  })

  it('asks what it was, then which account, and books it', async () => {
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.estado')) return estado([PETRO])
      if (method.endsWith('.explicar'))
        return {
          results: [{ name: 'BT7', ok: true, journal: 'JV-7', twin: null }],
          explained: 1,
          estado: estado([]),
        }
      throw new Error(method)
    })
    await mount()
    button('¿Qué fue?').click()
    await flush()
    const save = host.querySelector('[data-por-explicar-guardar]')
    expect(save.disabled).toBe(true)
    host.querySelector('[data-por-explicar-tipo="gasto"]').click()
    await flush()
    // the most used account of that answer comes chosen; the person picks another
    host.querySelector('[data-por-explicar-cuenta="Gasolina - E"]').click()
    await flush()
    expect(save.textContent).toBe('Explicar 1 movimiento')
    save.click()
    await flush()
    const [, args] = state.call.mock.calls.find(([m]) =>
      m.endsWith('.explicar'),
    )
    expect(args.tipo).toBe('gasto')
    expect(args.cuenta).toBe('Gasolina - E')
    expect(host.querySelector('[data-empty]').textContent).toBe(
      'Todo explicado',
    )
  })

  it('shows what waits but no buttons to whoever may not book', async () => {
    state.call.mockResolvedValue({ ...estado([ANTHROPIC]), can_explain: false })
    await mount()
    expect(host.querySelector('[data-por-explicar-solo-ver]')).not.toBeNull()
    expect(button('Sí, es eso')).toBeUndefined()
    expect(button('Ver movimientos')).toBeDefined()
  })

  const type = async (selector, value) => {
    const input = host.querySelector(selector)
    input.value = value
    input.dispatchEvent(new Event('input'))
    await flush()
  }

  it('books cash spent in three taps and undoes it', async () => {
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.estado')) return estado([])
      if (method.endsWith('.gaste'))
        return { journal: 'JV-9', amount: 350, estado: estado([]) }
      if (method.endsWith('.deshacer_efectivo')) return { estado: estado([]) }
      throw new Error(method)
    })
    await mount()
    expect(
      host.querySelector('[data-por-explicar-efectivo]').textContent,
    ).toContain('Nunca contada')
    button('Gasté en efectivo').click()
    await flush()
    await type('[data-gasto-monto]', '350')
    host.querySelector('[data-gasto-cuenta="Gasolina - E"]').click()
    await flush()
    host.querySelector('[data-gasto-guardar]').click()
    await flush()
    const [, args] = state.call.mock.calls.find(([m]) => m.endsWith('.gaste'))
    expect(args).toMatchObject({
      company: 'Mi Empresa',
      monto: 350,
      cuenta: 'Gasolina - E',
      caja: 'Caja Fuerte - E',
    })
    expect(
      host.querySelector('[data-por-explicar-recibo]').textContent,
    ).toContain('en efectivo, en tus libros')
    button('Deshacer').click()
    await flush()
    const undo = state.call.mock.calls.find(([m]) =>
      m.endsWith('.deshacer_efectivo'),
    )
    expect(undo[1].poliza).toBe('JV-9')
  })

  it('counts the safe, says what is missing and books the answer', async () => {
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.estado')) return estado([])
      if (method.endsWith('.ajustar'))
        return { journal: 'JV-10', difference: -1000, estado: estado([]) }
      throw new Error(method)
    })
    await mount()
    button('Contar caja').click()
    await flush()
    await type('[data-conteo-monto]', '11,000')
    expect(
      host.querySelector('[data-conteo-diferencia]').textContent,
    ).toContain('Faltan')
    const save = host.querySelector('[data-conteo-guardar]')
    expect(save.disabled).toBe(true)
    host.querySelector('[data-conteo-tipo="personal"]').click()
    await flush()
    expect(save.disabled).toBe(false)
    save.click()
    await flush()
    const [, args] = state.call.mock.calls.find(([m]) => m.endsWith('.ajustar'))
    expect(args).toMatchObject({
      caja: 'Caja Fuerte - E',
      contado: 11000,
      tipo: 'personal',
      cuenta: 'Retiros - E',
    })
  })

  it('saves the reminder from the bell', async () => {
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.estado')) return estado([])
      if (method.endsWith('.recordatorio_guardar'))
        return {
          ...estado([]),
          recordatorio: { remind: 1, hour: 21, every: 14 },
        }
      throw new Error(method)
    })
    await mount()
    host.querySelector('[data-por-explicar-recordatorio]').click()
    await flush()
    host.querySelector('[data-recordatorio-hora="21"]').click()
    host.querySelector('[data-recordatorio-cada="14"]').click()
    await flush()
    host.querySelector('[data-recordatorio-guardar]').click()
    await flush()
    const [, args] = state.call.mock.calls.find(([m]) =>
      m.endsWith('.recordatorio_guardar'),
    )
    expect(args).toMatchObject({ activo: 1, hora: 21, contar_cada: 14 })
  })

  const YA = [
    {
      name: 'BT20',
      date: '2026-11-06',
      description: 'PETROPLAZAS 4711',
      amount: 480,
      direction: 'Withdrawal',
      bank_label: 'Amex Platinum',
      entry: {
        doctype: 'Journal Entry',
        name: 'JV-30',
        word: 'Póliza',
        party: '',
        ligable: true,
      },
    },
    {
      name: 'BT21',
      date: '2026-11-07',
      description: 'SPEI RECIBIDO',
      amount: 900,
      direction: 'Deposit',
      bank_label: 'BBVA Débito',
      entry: {
        doctype: 'Sales Invoice',
        name: 'SINV-4',
        word: 'Venta',
        party: 'Mostrador',
        ligable: false,
      },
    },
  ]
  const FACTURAS = [
    {
      name: 'BT22',
      date: '2026-11-05',
      description: 'GASOLINERA',
      amount: 615,
      direction: 'Withdrawal',
      bank_label: 'Amex Platinum',
      invoice: {
        doctype: 'Purchase Invoice',
        name: 'PINV-7',
        party: 'Gasolinera Sur',
      },
    },
  ]

  it('links what is already in the books and never books it again', async () => {
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.estado')) return { ...estado([]), ya: YA }
      if (method.endsWith('.ligar'))
        return {
          results: [{ name: 'BT20', ok: true }],
          explained: 1,
          estado: { ...estado([]), ya: [YA[1]] },
        }
      if (method.endsWith('.deshacer_ligados'))
        return { estado: { ...estado([]), ya: YA } }
      throw new Error(method)
    })
    await mount()
    const list = host.querySelector('[data-lista-pareada="ya"]')
    expect(list.textContent).toContain('Ya están en tus libros')
    expect(list.textContent).toContain('no lo registres otra vez') // the sale
    host.querySelector('[data-lista-pareada-accion="ya"]').click()
    await flush()
    const [, args] = state.call.mock.calls.find(([m]) => m.endsWith('.ligar'))
    expect(JSON.parse(args.pares)).toEqual([
      { movimiento: 'BT20', doctype: 'Journal Entry', name: 'JV-30' },
    ])
    expect(
      host.querySelector('[data-por-explicar-recibo]').textContent,
    ).toContain('1 movimiento ligado')
    button('Deshacer').click()
    await flush()
    const undo = state.call.mock.calls.find(([m]) =>
      m.endsWith('.deshacer_ligados'),
    )
    expect(JSON.parse(undo[1].pares)[0].name).toBe('JV-30')
    expect(undo[1].cancelar).toBe(0)
  })

  it('pays an open invoice from the charge and undoes the payment', async () => {
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.estado'))
        return { ...estado([]), facturas: FACTURAS }
      if (method.endsWith('.pagar'))
        return {
          results: [{ name: 'BT22', ok: true, payment: 'PE-5' }],
          explained: 1,
          estado: estado([]),
        }
      if (method.endsWith('.deshacer_ligados'))
        return { estado: { ...estado([]), facturas: FACTURAS } }
      throw new Error(method)
    })
    await mount()
    expect(
      host.querySelector('[data-lista-pareada="facturas"]').textContent,
    ).toContain('Pago de la factura de Gasolinera Sur')
    host.querySelector('[data-lista-pareada-accion="facturas"]').click()
    await flush()
    const [, args] = state.call.mock.calls.find(([m]) => m.endsWith('.pagar'))
    expect(JSON.parse(args.pares)).toEqual([
      { movimiento: 'BT22', doctype: 'Purchase Invoice', name: 'PINV-7' },
    ])
    button('Deshacer').click()
    await flush()
    const undo = state.call.mock.calls.find(([m]) =>
      m.endsWith('.deshacer_ligados'),
    )
    expect(JSON.parse(undo[1].pares)).toEqual([
      { movimiento: 'BT22', doctype: 'Payment Entry', name: 'PE-5' },
    ])
    expect(undo[1].cancelar).toBe(1)
  })

  it('shows each account against its bank and where it lands', async () => {
    state.push.mockReset()
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('por_explicar.estado'))
        return {
          ...estado([ANTHROPIC]),
          cuentas: [
            {
              bank_account: 'Amex',
              label: 'Amex Platinum',
              ledger: 'Amex - E',
              count: 2,
              net: -7275.29,
            },
          ],
        }
      if (method === 'crm.api.bancos.cuentas')
        return {
          cards: [
            {
              cuenta: 'Amex',
              label: 'Amex Platinum',
              kind: 'tarjeta',
              ledger: 'Amex - E',
              balance: 10000,
              bank_balance: { amount: 17275.29 },
              diferencia: 7275.29,
            },
          ],
        }
      throw new Error(method)
    })
    await mount()
    const row = host.querySelector('[data-cuenta-contra-banco="Amex"]')
    expect(row.textContent).toContain('$7,275.29')
    expect(row.textContent).toContain(
      '2 movimientos por explicar: al explicarlos, cuadra con el banco.',
    )
    row.click()
    expect(state.push).toHaveBeenCalledWith({
      name: 'BancoCuenta',
      params: { cuenta: 'Amex' },
      query: { cuadre: '1' },
    })
  })

  it('reads the page again when a payment never answers, and says it was kept', async () => {
    let paid = false
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.estado'))
        return { ...estado([]), facturas: paid ? [] : FACTURAS }
      if (method.endsWith('.pagar')) {
        paid = true // the server kept it; the phone lost the answer
        throw new Error('NetworkError when attempting to fetch resource.')
      }
      throw new Error(method)
    })
    await mount()
    host.querySelector('[data-lista-pareada-accion="facturas"]').click()
    await flush()
    const list = host.querySelector('[data-lista-pareada="facturas"]')
    expect(
      list.querySelector('[data-lista-pareada-fila="BT22"]').textContent,
    ).toContain('La respuesta no llegó, pero quedó guardado.')
    expect(
      host.querySelector('[data-lista-pareada-accion="facturas"]'),
    ).toBeNull()
  })

  it('says a payment made by an earlier tap was not made twice', async () => {
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.estado'))
        return { ...estado([]), facturas: FACTURAS }
      if (method.endsWith('.pagar'))
        return {
          results: [{ name: 'BT22', ok: true, payment: 'PE-5', already: true }],
          explained: 1,
          estado: estado([]),
        }
      throw new Error(method)
    })
    await mount()
    host.querySelector('[data-lista-pareada-accion="facturas"]').click()
    await flush()
    expect(
      host.querySelector('[data-lista-pareada-fila="BT22"]').textContent,
    ).toContain('Ya estaba registrado: no se hizo otro pago.')
    const list = host.querySelector('[data-lista-pareada="facturas"]')
    expect(list.textContent).toContain('Uno ya estaba hecho')
    expect(list.textContent).not.toContain('pagos registrados')
    expect(button('Deshacer')).toBeUndefined() // not this tap's payment
  })

  const TAGS = [
    { label: 'Muelle (software)', grupo: 'Business' },
    { label: 'Remodelación', grupo: 'Project' },
  ]

  it('books a group with its suggested tags, and a tag typed in the sheet', async () => {
    const tagged = { ...ANTHROPIC, tags: ['Muelle (software)'] }
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.estado'))
        return { ...estado([tagged, PETRO]), etiquetas: TAGS }
      if (method.endsWith('.explicar'))
        return {
          results: [{ name: 'BT7', ok: true, journal: 'JV-8', twin: null }],
          explained: 1,
          estado: { ...estado([tagged, PETRO]), etiquetas: TAGS },
        }
      throw new Error(method)
    })
    await mount()
    expect(
      host.querySelector('[data-por-explicar-grupo-etiquetas]').textContent,
    ).toContain('Muelle (software)')
    button('Sí, es eso').click()
    await flush()
    const first = state.call.mock.calls.find(([m]) => m.endsWith('.explicar'))
    expect(JSON.parse(first[1].etiquetas)).toEqual(['Muelle (software)'])

    button('¿Qué fue?').click() // PETRO: no guess, no tags
    await flush()
    host.querySelector('[data-por-explicar-tipo="gasto"]').click()
    await flush()
    host.querySelector('[data-etiqueta="Remodelación"]').click()
    await type('[data-etiqueta-nueva]', 'Taller')
    host
      .querySelector('[data-etiqueta-nueva]')
      .form.dispatchEvent(new Event('submit'))
    await flush()
    host.querySelector('[data-por-explicar-guardar]').click()
    await flush()
    const second = state.call.mock.calls.filter(([m]) =>
      m.endsWith('.explicar'),
    )[1]
    expect(JSON.parse(second[1].etiquetas)).toEqual(['Remodelación', 'Taller'])
  })

  it('creates the starter tags for this business in one tap', async () => {
    state.call.mockImplementation(async (method, args) => {
      if (method.endsWith('.estado')) return { ...estado([]), etiquetas: [] }
      if (method.endsWith('.etiquetas_sugeridas'))
        return [
          { label: 'Taller', grupo: 'Business', palabras: [] },
          { label: 'Casa', grupo: 'Personal', palabras: [] },
        ]
      if (method.endsWith('.etiquetas_crear'))
        return {
          ...estado([]),
          etiquetas: JSON.parse(args.etiquetas_nuevas).map((t) => ({
            label: t.label,
            grupo: t.grupo,
          })),
        }
      throw new Error(method)
    })
    await mount()
    host.querySelector('[data-por-explicar-etiquetas]').click()
    await flush()
    host.querySelector('[data-etiqueta-sugerida="Casa"]').click() // not this one
    await flush()
    host.querySelector('[data-etiquetas-crear-sugeridas]').click()
    await flush()
    const [, args] = state.call.mock.calls.find(([m]) =>
      m.endsWith('.etiquetas_crear'),
    )
    expect(JSON.parse(args.etiquetas_nuevas).map((t) => t.label)).toEqual([
      'Taller',
    ])
    expect(host.querySelector('[data-etiquetas-sheet]').textContent).toContain(
      'Del negocio',
    )
  })

  it('attaches a ticket to a movement and opens its review', async () => {
    state.push.mockReset()
    state.call.mockImplementation(async (method, args) => {
      if (method.endsWith('.estado')) return estado([PETRO])
      if (method.endsWith('.adjuntar'))
        return { open_url: '/crm/captura/CAP-9?return_to=x', duplicate: false }
      throw new Error(method + JSON.stringify(args))
    })
    await mount()
    button('Ver movimientos').click()
    await flush()
    host.querySelector('[data-por-explicar-adjuntar="BT7"]').click()
    await flush()
    const input = host.querySelector('[data-adjuntar-archivo]')
    const file = new File(['<cfdi/>'], 'factura.xml', { type: 'text/xml' })
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change'))
    await flush()
    // a CFDI's XML is a factura
    expect(
      host
        .querySelector('[data-adjuntar-tipo="factura"]')
        .getAttribute('aria-checked'),
    ).toBe('true')
    host.querySelector('[data-adjuntar-enviar]').click()
    // the file reader answers on a later task, not a microtask
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      await flush()
    }
    const [, args] = state.call.mock.calls.find(([m]) =>
      m.endsWith('.adjuntar'),
    )
    expect(args).toMatchObject({
      movimiento: 'BT7',
      tipo: 'factura',
      file_name: 'factura.xml',
    })
    expect(args.content_b64.length).toBeGreaterThan(0)
    expect(state.push).toHaveBeenCalledWith('/captura/CAP-9?return_to=x')
  })
})

describe('PorExplicar live', () => {
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
  const button = (text) =>
    [...host.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === text,
    )
  const withAccounts = (page, cuentas) => ({ ...page, cuentas })
  const AMEX = {
    bank_account: 'Amex',
    label: 'Amex Platinum',
    ledger: 'Amex - E',
  }
  const PETRO_2 = {
    ...PETRO,
    count: 2,
    total: 1079.8,
    rows: [
      ...PETRO.rows,
      {
        name: 'BT8',
        date: '2026-11-19',
        description: 'PETROPLAZAS 4711',
        amount: 600,
        twin: null,
      },
    ],
  }

  it('follows every money doctype, saves by this same person too', async () => {
    state.call.mockImplementation(async () => estado([PETRO]))
    await mount()
    expect(state.live.doctypes).toContain('Bank Transaction')
    expect(state.live.doctypes).toContain('Journal Entry')
    expect(state.live.doctypes).toContain('Payment Entry')
    expect(state.live.options.me()).toBe('')
  })

  it('reads again in place when something changes elsewhere, and marks what changed', async () => {
    let page = withAccounts(estado([ANTHROPIC, PETRO]), [
      { ...AMEX, count: 3, net: -7755.09 },
    ])
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.estado')) return page
      if (method.endsWith('.explicar'))
        return {
          results: [
            { name: 'BT1', ok: true, journal: 'JV-1', twin: null },
            { name: 'BT2', ok: true, journal: 'JV-2', twin: null },
          ],
          explained: 2,
          estado: withAccounts(estado([PETRO]), [
            { ...AMEX, count: 1, net: -479.8 },
          ]),
        }
      if (method.endsWith('.cuentas')) return { cards: [] }
      throw new Error(method)
    })
    await mount()
    button('Sí, es eso').click()
    await flush()
    expect(host.querySelector('[data-por-explicar-hecho]')).not.toBeNull()

    // the bank brings one more PETROPLAZAS movement
    page = withAccounts(estado([PETRO_2]), [
      { ...AMEX, count: 2, net: -1079.8 },
    ])
    await state.live.refresh()
    await flush()
    expect(
      host.querySelector('[data-por-explicar-hero]').textContent,
    ).toContain('2 movimientos')
    // the tap's result stays where it was
    expect(
      host.querySelector('[data-por-explicar-hecho]').textContent,
    ).toContain('ANTHROPIC: 2 movimientos explicados')
    const petro = host.querySelector('[data-por-explicar-grupo="PETROPLAZAS"]')
    expect(petro.textContent).toContain('$1,079.80')
    expect(petro.closest('li').hasAttribute('data-fresh')).toBe(true)
    const amex = host.querySelector('[data-cuenta-contra-banco="Amex"]')
    expect(amex.closest('li').hasAttribute('data-fresh')).toBe(true)
    expect(amex.textContent).toContain('2 movimientos por explicar')
  })

  it('never paints a live read older than a tap answer over it', async () => {
    let stale
    let reads = 0
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.estado')) {
        reads++
        if (reads === 1) return estado([ANTHROPIC, PETRO])
        return new Promise((resolve) => (stale = resolve))
      }
      if (method.endsWith('.explicar'))
        return {
          results: [
            { name: 'BT1', ok: true, journal: 'JV-1', twin: null },
            { name: 'BT2', ok: true, journal: 'JV-2', twin: null },
          ],
          explained: 2,
          estado: estado([PETRO]),
        }
      throw new Error(method)
    })
    await mount()
    const reading = state.live.refresh()
    await flush()
    button('Sí, es eso').click()
    await flush()
    stale(estado([ANTHROPIC, PETRO]))
    await reading
    await flush()
    expect(
      host.querySelector('[data-por-explicar-grupo="ANTHROPIC"]'),
    ).toBeNull()
    expect(host.querySelector('[data-por-explicar-hecho]')).not.toBeNull()
  })

  it('keeps an open sheet on its group, and says when it was explained elsewhere', async () => {
    let page = estado([PETRO])
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.estado')) return page
      throw new Error(method)
    })
    await mount()
    button('¿Qué fue?').click()
    await flush()
    host.querySelector('[data-por-explicar-tipo="gasto"]').click()
    await flush()
    const save = () => host.querySelector('[data-por-explicar-guardar]')
    expect(save().textContent).toBe('Explicar 1 movimiento')

    page = estado([PETRO_2])
    await state.live.refresh()
    await flush()
    expect(save().textContent).toBe('Explicar 2 movimientos')

    page = estado([])
    await state.live.refresh()
    await flush()
    expect(
      host.querySelector('[data-por-explicar-sheet-hecho]').textContent,
    ).toContain('Ya no queda nada por explicar aquí')
    expect(save()).toBeNull()
    button('Cerrar').click()
    await flush()
    expect(host.querySelector('[data-por-explicar-sheet]')).toBeNull()
  })

  it('keeps the page when a live read fails', async () => {
    let fail = false
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.estado')) {
        if (fail) throw new Error('offline')
        return estado([PETRO])
      }
      throw new Error(method)
    })
    await mount()
    fail = true
    await state.live.refresh()
    await flush()
    expect(host.querySelector('[data-por-explicar-problem]')).toBeNull()
    expect(
      host.querySelector('[data-por-explicar-grupo="PETROPLAZAS"]'),
    ).not.toBeNull()
  })
})
