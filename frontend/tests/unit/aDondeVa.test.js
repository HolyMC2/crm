// «¿A dónde va el dinero?» (crm docs/DINERO_EN_ORDEN.md §3b D3): months and deltas in
// words, the bars, the cushion the fixed expenses ask for, and the page's flows.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({
  call: vi.fn(),
  replace: vi.fn(),
  query: {},
  params: {},
}))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    Button: {
      props: ['label', 'variant', 'loading', 'disabled'],
      emits: ['click'],
      setup:
        (props, { emit, attrs }) =>
        () =>
          h(
            'button',
            {
              ...attrs,
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
  const pass = {
    setup:
      (_p, { slots }) =>
      () =>
        slots.default?.(),
  }
  return {
    AppBar: { props: ['title'], setup: (p) => () => h('h1', p.title) },
    EmptyState: {
      props: ['title'],
      setup: (p) => () => h('div', { 'data-empty': '' }, p.title),
    },
    ExpandTransition: pass,
    BottomSheet: {
      props: ['open', 'title'],
      setup:
        (p, { slots }) =>
        () =>
          p.open
            ? h('div', { 'data-sheet': '' }, [
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
    useRoute: () => ({ query: state.query, params: state.params }),
    useRouter: () => ({ replace: state.replace }),
  }
})

import {
  barWidths,
  cushion,
  deltaText,
  monthName,
  shiftMonth,
} from '@/components/dinero/aDondeVa'
import ADondeVa from '@/pages/ADondeVa.vue'
import TuDinero from '@/pages/TuDinero.vue'

vi.mock('@/pages/Deudas.vue', async () => {
  const { h } = await import('vue')
  return { default: { setup: () => () => h('div', { 'data-deudas': '' }) } }
})

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

function month(extra = {}) {
  return {
    company: 'Mi Empresa',
    month: '2026-11',
    currency: 'MXN',
    income: 90000,
    out: 62000,
    left: 28000,
    fixed: 47000,
    fixed_average: 46000,
    unexplained: { count: 12, amount: 18500 },
    can_edit: true,
    destinos: [
      { key: 'nomina', label: 'Nómina y comisiones', fixed: true },
      { key: 'servicios', label: 'Servicios y suscripciones', fixed: true },
      { key: 'transporte', label: 'Transporte y envíos', fixed: false },
    ],
    lines: [
      {
        key: 'nomina',
        label: 'Nómina y comisiones',
        amount: 30000,
        average: 30000,
        of_income: 33.3,
        fixed: true,
        not_money: false,
        accounts: [
          {
            account: 'Sueldos - E',
            name: 'Sueldos y salarios',
            amount: 30000,
            chosen: false,
            fixed: true,
          },
        ],
      },
      {
        key: 'transporte',
        label: 'Transporte y envíos',
        amount: 2500,
        average: 1300,
        of_income: 2.8,
        fixed: false,
        not_money: false,
        accounts: [
          {
            account: 'Gasolina - E',
            name: 'Gasolina',
            amount: 2500,
            chosen: false,
            fixed: false,
          },
        ],
      },
      {
        key: 'sin_salida',
        label: 'Sin salida de dinero',
        amount: 4000,
        average: 4000,
        of_income: null,
        fixed: false,
        not_money: true,
        accounts: [],
      },
    ],
    trend: [
      { month: '2026-10', income: 85000, out: 60000 },
      { month: '2026-11', income: 90000, out: 62000 },
    ],
    ...extra,
  }
}

describe('a dónde va: words', () => {
  it('names months and moves between them', () => {
    expect(monthName('2026-11')).toBe('noviembre 2026')
    expect(monthName('2026-11', { short: true })).toBe('nov 2026')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('compares with the owner’s own average', () => {
    expect(deltaText(2500, 1300)).toBe('+92 % vs tu promedio')
    expect(deltaText(900, 1000)).toBe('−10 % vs tu promedio')
    expect(deltaText(1010, 1000)).toBe('igual que tu promedio')
    expect(deltaText(500, 0)).toBe('')
  })

  it('draws bars against the biggest line that is money, and the cushion', () => {
    expect(barWidths(month().lines)).toEqual({
      nomina: 100,
      transporte: 8,
      sin_salida: 13,
    })
    expect(cushion(month(), 3)).toBe(138000)
  })
})

describe('ADondeVa page', () => {
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
    app = createApp({ render: () => h(ADondeVa) })
    app.mount(host)
  }

  it('shows in, out, left, what is unexplained, the fixed expenses and where it went', async () => {
    state.call.mockResolvedValue(month())
    mount()
    await flush()
    const resumen = host.querySelector('[data-adondeva-resumen]').textContent
    expect(resumen).toContain('$90,000.00')
    expect(resumen).toContain('$28,000.00')
    expect(host.querySelector('[data-adondeva-faltan]').textContent).toContain(
      'Faltan 12 movimientos del banco por explicar',
    )
    const fijos = host.querySelector('[data-adondeva-fijos]').textContent
    expect(fijos).toContain('$46,000.00')
    expect(fijos).toContain('$138,000.00')
    const transporte = host.querySelector(
      '[data-destino="transporte"]',
    ).textContent
    expect(transporte).toContain('+92 % vs tu promedio')
    expect(
      host.querySelector('[data-destino="sin_salida"]').textContent,
    ).toContain('no sale dinero')
  })

  it('moves an account to another destination and marks it fixed', async () => {
    state.call.mockImplementation(async (method) =>
      method.endsWith('.cambiar') ? month({ fixed: 49500 }) : month(),
    )
    mount()
    await flush()
    host.querySelector('[data-destino="transporte"] button').click()
    await flush()
    host.querySelector('[data-adondeva-cambiar="Gasolina - E"]').click()
    await flush()
    host.querySelector('[data-destino-opcion="servicios"]').click()
    ;[...host.querySelectorAll('[data-sheet] button')]
      .find((b) => b.textContent === 'Sí, es fijo')
      .click()
    await flush()
    host.querySelector('[data-adondeva-guardar]').click()
    await flush()
    expect(state.call).toHaveBeenCalledWith(
      'doco.workspaces.a_donde_va.cambiar',
      {
        company: 'Mi Empresa',
        account: 'Gasolina - E',
        destino: 'servicios',
        fijo: '1',
        month: expect.any(String),
      },
    )
  })

  it('never goes past this month', async () => {
    state.call.mockResolvedValue(month())
    mount()
    await flush()
    const next = host.querySelector('[aria-label="Mes siguiente"]')
    expect(next.disabled).toBe(true)
    host.querySelector('[aria-label="Mes anterior"]').click()
    expect(state.replace).toHaveBeenCalled()
  })
})

describe('Tu dinero route', () => {
  it('shows the page its path names', async () => {
    state.call.mockResolvedValue(month())
    const host = document.createElement('div')
    state.params = { dinero: 'a-donde-va' }
    let app = createApp({ render: () => h(TuDinero) })
    app.mount(host)
    await flush()
    expect(host.querySelector('[data-adondeva-resumen]')).not.toBeNull()
    app.unmount()
    state.params = { dinero: 'deudas' }
    app = createApp({ render: () => h(TuDinero) })
    app.mount(host)
    await flush()
    expect(host.querySelector('[data-deudas]')).not.toBeNull()
    app.unmount()
  })
})
