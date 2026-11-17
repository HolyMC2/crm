// Deudas y plan de pago (crm docs/DINERO_EN_ORDEN.md §3b-§3c): the words the owner
// reads (months, durations, the free date), the order the plan pays, and the page's
// flows: the plan follows the amount, a card Muelle sees is added in one tap.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({ call: vi.fn(), replace: vi.fn(), query: {} }))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    call: (...args) => state.call(...args),
    toast: { success: vi.fn(), error: vi.fn() },
    Button: {
      props: ['label', 'variant', 'loading', 'disabled'],
      emits: ['click'],
      setup:
        (props, { emit, attrs, slots }) =>
        () =>
          h(
            'button',
            {
              ...attrs,
              disabled: props.disabled,
              onClick: () => emit('click'),
            },
            [slots.prefix?.(), props.label],
          ),
    },
  }
})
vi.mock('@/components/ui', async () => {
  const { h } = await import('vue')
  return {
    AppBar: { props: ['title'], setup: (p) => () => h('h1', p.title) },
    EmptyState: {
      props: ['title', 'message', 'action'],
      emits: ['action'],
      setup:
        (p, { emit }) =>
        () =>
          h('div', { 'data-empty': '' }, [
            p.title,
            p.action
              ? h(
                  'button',
                  { 'data-empty-action': '', onClick: () => emit('action') },
                  p.action,
                )
              : null,
          ]),
    },
    Segmented: {
      props: ['modelValue', 'options', 'label'],
      emits: ['update:modelValue'],
      setup:
        (p, { emit }) =>
        () =>
          h(
            'div',
            { 'data-segmented': p.label },
            p.options.map((o) =>
              h(
                'button',
                {
                  'data-option': o.value,
                  onClick: () => emit('update:modelValue', o.value),
                },
                o.label,
              ),
            ),
          ),
    },
    BottomSheet: {
      props: ['open'],
      setup:
        (p, { slots }) =>
        () =>
          p.open ? h('div', [slots.default?.(), slots.actions?.()]) : null,
    },
  }
})
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: state.query }),
  useRouter: () => ({ replace: state.replace }),
}))

import {
  durationText,
  freeText,
  missingRates,
  monthLabel,
  orderedDebts,
} from '@/components/deudas/deudas'
import Deudas from '@/pages/Deudas.vue'

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

function board(extra = {}) {
  return {
    company: 'Mi Empresa',
    currency: 'MXN',
    owed: 85000,
    method: 'avalancha',
    monthly: 15000,
    personal: false,
    can_edit: true,
    tax_default: 16,
    books: [{ company: 'Mi Empresa', personal: false }],
    settings: {
      saved: true,
      method: 'avalancha',
      monthly_for_debt: 15000,
      cushion_months: 3,
    },
    targets: { 12: 7900, 24: 4300 },
    problem: null,
    debts: [
      {
        name: 'd1',
        title: 'Platino',
        owed: 70000,
        owed_source: 'banco',
        annual_rate: 60,
        tax_on_interest: 16,
        minimum_payment: 4000,
        next_due: '2026-12-05',
        active: true,
        bank_account: 'BA1',
      },
      {
        name: 'd2',
        title: 'Clásica',
        owed: 15000,
        owed_source: 'escrito',
        annual_rate: 0,
        tax_on_interest: 16,
        minimum_payment: null,
        next_due: null,
        active: true,
      },
    ],
    plan: {
      finished: true,
      months: 6,
      free_on: '2027-06-01',
      interest: 9100,
      interest_saved: 41000,
      months_sooner: 30,
      other: {
        method: 'bola_de_nieve',
        months: 7,
        interest: 9900,
        first: 'd2',
      },
      debts: [
        {
          id: 'd1',
          paid_off: '2027-05-01',
          months: 5,
          interest: 8800,
          estimated_minimum: false,
        },
        {
          id: 'd2',
          paid_off: '2027-06-01',
          months: 6,
          interest: 300,
          estimated_minimum: true,
        },
      ],
    },
    suggestions: [
      {
        bank_account: 'BA2',
        account: 'TDC - E',
        title: 'Oro 4190',
        bank: 'BBVA',
        owed: 6600,
        owed_source: 'banco',
      },
    ],
    ...extra,
  }
}

describe('deudas words', () => {
  it('names months and durations', () => {
    expect(monthLabel('2028-04-01')).toBe('abr 2028')
    expect(durationText(1)).toBe('1 mes')
    expect(durationText(16)).toBe('1 año y 4 meses')
    expect(durationText(24)).toBe('2 años')
  })

  it('lists the debts in the order the plan pays them', () => {
    const rows = orderedDebts(board())
    expect(rows.map((r) => [r.order, r.title, r.paidOff])).toEqual([
      [1, 'Platino', '2027-05-01'],
      [2, 'Clásica', '2027-06-01'],
    ])
    expect(missingRates(board())).toEqual(['Clásica'])
  })

  it('says when the owner is free, or why not', () => {
    expect(freeText(board())).toBe('Libre de deudas en jun 2027 (6 meses)')
    expect(freeText(board({ plan: null }))).toBe(
      'Elige cuánto abonas al mes para ver cuándo terminas.',
    )
    expect(freeText(board({ problem: 'no alcanza para los mínimos' }))).toBe(
      'no alcanza para los mínimos',
    )
  })
})

describe('Deudas page', () => {
  let host, app
  beforeEach(() => {
    state.call.mockReset()
    host = document.createElement('div')
    document.body.appendChild(host)
  })
  afterEach(() => {
    app?.unmount()
    host.remove()
  })
  const mount = () => {
    app = createApp({ render: () => h(Deudas) })
    app.mount(host)
  }

  it('shows what is owed, when the owner is free and what the plan saves', async () => {
    state.call.mockResolvedValue(board())
    mount()
    await flush()
    expect(state.call).toHaveBeenCalledWith('doco.workspaces.deudas.board', {})
    const hero = host.querySelector('[data-deudas-hero]').textContent
    expect(hero).toContain('$85,000.00')
    expect(host.querySelector('[data-deudas-libre]').textContent.trim()).toBe(
      'Libre de deudas en jun 2027 (6 meses)',
    )
    expect(host.querySelector('[data-deudas-intereses]').textContent).toContain(
      'ahorras $41,000.00',
    )
    expect(host.querySelector('[data-deudas-faltan]').textContent).toContain(
      'Clásica',
    )
    const items = [...host.querySelectorAll('[data-deuda]')].map(
      (li) => li.textContent,
    )
    expect(items[0]).toContain('Platino')
    expect(items[0]).toContain('Se termina en may 2027')
  })

  it('the plan follows the amount; saving keeps it', async () => {
    state.call.mockImplementation(async (method, args) => {
      if (method.endsWith('.simular'))
        return {
          ...board(),
          monthly: Number(args.monthly),
          plan: { ...board().plan, months: 4, free_on: '2027-04-01' },
        }
      if (method.endsWith('.guardar_plan'))
        return board({
          settings: {
            saved: true,
            method: 'avalancha',
            monthly_for_debt: 20000,
            cushion_months: 3,
          },
        })
      return board()
    })
    mount()
    await flush()
    const input = host.querySelector('[data-deudas-monto]')
    input.value = '20000'
    input.dispatchEvent(new Event('input'))
    await vi.waitFor(() =>
      expect(state.call).toHaveBeenCalledWith(
        'doco.workspaces.deudas.simular',
        {
          company: 'Mi Empresa',
          monthly: 20000,
          method: 'avalancha',
        },
      ),
    )
    await flush()
    expect(host.querySelector('[data-deudas-libre]').textContent).toContain(
      'abr 2027',
    )
    host.querySelector('[data-deudas-guardar]').click()
    await flush()
    expect(state.call).toHaveBeenCalledWith(
      'doco.workspaces.deudas.guardar_plan',
      {
        company: 'Mi Empresa',
        method: 'avalancha',
        monthly_for_debt: 20000,
      },
    )
  })

  it('a card Muelle sees is added in one tap', async () => {
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.guardar_deuda')) return board({ suggestions: [] })
      return board()
    })
    mount()
    await flush()
    host.querySelector('[data-deudas-agregar="BA2"]').click()
    await flush()
    const [, args] = state.call.mock.calls.find(([m]) =>
      m.endsWith('.guardar_deuda'),
    )
    expect(JSON.parse(args.values)).toEqual({
      title: 'Oro 4190',
      kind: 'Credit card',
      bank_account: 'BA2',
      account: 'TDC - E',
    })
  })

  it('with no debts it invites to add one', async () => {
    state.call.mockResolvedValue(
      board({ debts: [], suggestions: [], owed: 0, plan: null }),
    )
    mount()
    await flush()
    expect(host.querySelector('[data-empty]').textContent).toContain(
      'Sin deudas en el plan',
    )
  })
})
