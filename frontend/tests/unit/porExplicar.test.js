// Por explicar (crm docs/DINERO_EN_ORDEN.md §3d): the helpers' words, and the
// page's flows: a group answered with its guess in one tap, undo, «¿Qué fue?»
// with an answer and an account, and the empty state.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({ call: vi.fn(), query: {} }))
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
    AppBar: { props: ['title'], setup: (p) => () => h('h1', p.title) },
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
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: state.query, params: {} }),
}))

import {
  accountNames,
  accountsFor,
  answerText,
  journalsOf,
  kindsFor,
  rangeText,
  receiptText,
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
    expect(
      host.querySelector('[data-por-explicar-recibo]').textContent,
    ).toContain('Listo: 2 movimientos de ANTHROPIC explicados.')
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
})
