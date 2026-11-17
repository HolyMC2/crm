// Colchón (crm docs/DINERO_EN_ORDEN.md §3b D4): the helpers' words and numbers,
// and the page's flows: the goal and how far, debt first, the savings accounts,
// the month's plan, a withdrawal and the settings.
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
vi.mock('vue-router', async () => {
  const { h } = await import('vue')
  return {
    RouterLink: {
      props: ['to'],
      setup:
        (_p, { slots, attrs }) =>
        () =>
          h('a', attrs, slots.default?.()),
    },
    useRoute: () => ({ query: state.query, params: {} }),
  }
})

import {
  coveredText,
  fullness,
  parseAmount,
  planLabel,
  starterCushion,
  takeFromText,
} from '@/components/dinero/colchon'
import Colchon from '@/pages/Colchon.vue'

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

function estado(extra = {}) {
  return {
    company: 'Mi Empresa',
    currency: 'MXN',
    months_used: ['2026-10', '2026-09', '2026-08'],
    essential: 46000,
    goal_months: 3,
    have: 12000,
    covered: 0.2,
    settings: {
      saved: true,
      cushion_months: 3,
      monthly_for_cushion: 0,
      accounts: ['Ahorro - E'],
    },
    accounts: [
      {
        account: 'Ahorro - E',
        name: 'Ahorro BBVA',
        type: 'Bank',
        amount: 12000,
        source: 'banco',
        chosen: true,
      },
      {
        account: 'Caja - E',
        name: 'Caja fuerte',
        type: 'Cash',
        amount: 3000,
        source: 'libros',
        chosen: false,
      },
    ],
    debt: {
      can: true,
      owed: 110195,
      monthly: 15000,
      minimums: 6000,
      months: 9,
      free_on: '2027-09-01',
      finished: true,
      first: 'Amex',
    },
    reach: {
      need: 138000,
      have: 12000,
      missing: 126000,
      months: 15,
      ready_on: '2028-03-01',
      finished: true,
      why: null,
      milestones: [
        { months: 1, on: '2027-11-01' },
        { months: 2, on: '2028-01-01' },
        { months: 3, on: '2028-03-01' },
      ],
    },
    averages: { income: 90000, fixed: 42000, variable: 5000, goods: 20000 },
    plan: {
      lines: [
        { key: 'income', amount: 90000, left: 90000 },
        { key: 'fixed', amount: 42000, left: 48000 },
        { key: 'variable', amount: 5000, left: 43000 },
        { key: 'minimums', amount: 6000, left: 37000 },
        { key: 'extra', amount: 9000, left: 28000 },
        { key: 'goods', amount: 20000, left: 8000 },
      ],
      free: 8000,
      extra: 9000,
    },
    goods_from: 'promedio',
    unexplained: { count: 3, amount: 900 },
    can_edit: true,
    ...extra,
  }
}

describe('colchón: words and numbers', () => {
  it('measures how full and how many months', () => {
    expect(fullness(12000, 138000)).toBe(9)
    expect(fullness(200000, 138000)).toBe(100)
    expect(fullness(0, 0)).toBe(0)
    expect(coveredText(0.2, 3)).toBe('0.2 de 3 meses')
    expect(coveredText(3.0, 3)).toBe('3 de 3 meses')
    expect(coveredText(5.4, 3)).toBe('3 de 3 meses')
    expect(coveredText(null, 3)).toBe('')
  })

  it('reads amounts and names the plan lines', () => {
    expect(parseAmount('12,500.50')).toBe(12500.5)
    expect(parseAmount('$ 10000')).toBe(10000)
    expect(parseAmount('')).toBe(null)
    expect(planLabel('extra', { first: 'Amex' })).toBe('Extra a Amex')
    expect(planLabel('extra', {})).toBe('Extra a tus deudas')
    expect(starterCushion(46000)).toBe(23000)
    expect(
      takeFromText(
        {
          from: [
            { key: 'cushion', amount: 4000 },
            { key: 'extra', amount: 2000 },
          ],
        },
        (n) => `$${n}`,
      ),
    ).toBe('$4000 del colchón y $2000 del extra a tus deudas')
  })
})

describe('Colchon page', () => {
  let host, app
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
  const mount = () => {
    app = createApp({ render: () => h(Colchon) })
    app.mount(host)
  }

  it('shows the goal, debt first, the accounts and the month plan', async () => {
    state.call.mockResolvedValue(estado())
    mount()
    await flush()
    expect(state.call).toHaveBeenCalledWith(
      'doco.workspaces.colchon.estado',
      {},
    )
    const meta = host.querySelector('[data-colchon-meta]').textContent
    expect(meta).toContain('$12,000.00')
    expect(meta).toContain('$138,000.00')
    expect(meta).toContain('0.2 de 3 meses')
    const cuando = host.querySelector('[data-colchon-cuando]').textContent
    expect(cuando).toContain('Primero tus deudas')
    expect(cuando).toContain('Colchón completo en')
    expect(
      host.querySelector('[data-colchon-cuenta="Ahorro - E"]').textContent,
    ).toContain('según el banco')
    expect(host.querySelector('[data-colchon-cuenta="Caja - E"]')).toBeNull()
    expect(
      host.querySelector('[data-plan-linea="extra"]').textContent,
    ).toContain('Extra a Amex')
    expect(
      host.querySelector('[data-plan-linea="free"]').textContent,
    ).toContain('$8,000.00')
  })

  it('says what is missing when there are no fixed expenses yet', async () => {
    state.call.mockResolvedValue(
      estado({
        essential: 0,
        covered: null,
        reach: {
          need: 0,
          have: 0,
          missing: 0,
          months: null,
          ready_on: null,
          finished: false,
          why: 'sin_gastos',
          milestones: [],
        },
      }),
    )
    mount()
    await flush()
    expect(host.querySelector('[data-colchon-meta]').textContent).toContain(
      'Aún no hay gastos fijos',
    )
    expect(host.querySelector('[data-colchon-cuando]')).toBeNull()
  })

  it('chooses the savings accounts', async () => {
    state.call.mockResolvedValue(estado())
    mount()
    await flush()
    host.querySelector('[data-colchon-elegir]').click()
    await flush()
    host.querySelector('[data-colchon-opcion="Caja - E"]').click()
    await flush()
    host.querySelector('[data-colchon-guardar-cuentas]').click()
    await flush()
    expect(state.call).toHaveBeenCalledWith('doco.workspaces.colchon.guardar', {
      company: 'Mi Empresa',
      accounts: JSON.stringify(['Ahorro - E', 'Caja - E']),
    })
  })

  it('asks whether a withdrawal fits', async () => {
    state.call.mockImplementation(async (_method, args) =>
      args.retiro
        ? estado({
            retiro: {
              amount: 10000,
              fits: false,
              free: 8000,
              short: 2000,
              from: [{ key: 'extra', amount: 2000 }],
              uncovered: 0,
            },
          })
        : estado(),
    )
    mount()
    await flush()
    const input = host.querySelector('#colchon-retiro')
    input.value = '10,000'
    input.dispatchEvent(new Event('input'))
    host
      .querySelector('[data-colchon-retiro]')
      .dispatchEvent(new Event('submit'))
    await flush()
    expect(state.call).toHaveBeenLastCalledWith(
      'doco.workspaces.colchon.estado',
      { company: 'Mi Empresa', retiro: 10000 },
    )
    const answer = host.querySelector(
      '[data-colchon-retiro-respuesta]',
    ).textContent
    expect(answer).toContain('No cabe')
    expect(answer).toContain('del extra a tus deudas')
  })

  it('saves the months and the monthly amount', async () => {
    state.call.mockResolvedValue(estado())
    mount()
    await flush()
    host.querySelector('[data-colchon-ajustes]').click()
    await flush()
    host.querySelector('[data-colchon-meses="6"]').click()
    const input = host.querySelector('[data-colchon-mensual]')
    input.value = '2500'
    input.dispatchEvent(new Event('input'))
    await flush()
    host.querySelector('[data-colchon-guardar-ajustes]').click()
    await flush()
    expect(state.call).toHaveBeenCalledWith('doco.workspaces.colchon.guardar', {
      company: 'Mi Empresa',
      months: 6,
      monthly: 2500,
    })
  })
})
