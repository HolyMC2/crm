// Bancos (Shell D11, DD19): the words of a bank movement and an account, days
// grouped as a bank app does, and «Conciliar» mounted with its real logic: the
// suggested payment in a green card, one tap sends what Contador needs, and a
// refusal stays on the sheet in the worker's words.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const state = vi.hoisted(() => ({ call: vi.fn(), push: vi.fn() }))
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
  return {
    BottomSheet: {
      props: ['open', 'title', 'subtitle'],
      setup:
        (props, { slots }) =>
        () =>
          props.open
            ? h('div', { role: 'dialog' }, [
                h('h2', props.title),
                h('p', { 'data-subtitle': '' }, props.subtitle),
                slots.default?.(),
                slots.actions?.(),
              ])
            : null,
    },
  }
})
vi.mock('@/components/captura/CapturarDocumentoButton.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@/composables/muelleShell', () => ({ shellBoot: { value: {} } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: state.push }) }))

import {
  accountLine,
  accountTitle,
  groupByDay,
  money,
  movementLine,
  signedMoney,
} from '@/components/bancos/bancos'
import ConciliarSheet from '@/components/bancos/ConciliarSheet.vue'

const NOW = new Date(2026, 3, 18, 12, 0, 0)
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('bancos words', () => {
  it('signs amounts with a real minus and keeps zero bare', () => {
    expect(signedMoney(1500)).toMatch(/^\+\$1,500\.00$/)
    expect(signedMoney(-775)).toMatch(/^−\$775\.00$/)
    expect(signedMoney(0)).not.toMatch(/^[+−]/)
    expect(money(-10)).toMatch(/^−/)
    expect(money(null)).toBe('—')
  })

  it('groups movements by day, newest first, one header per day', () => {
    const groups = groupByDay(
      [
        { name: 'a', date: '2026-04-18' },
        { name: 'b', date: '2026-04-18 09:00:00' },
        { name: 'c', date: '2026-04-17' },
        { name: 'd', date: '2026-04-13' },
      ],
      NOW,
    )
    expect(groups.map((g) => g.day)).toEqual([
      '2026-04-18',
      '2026-04-17',
      '2026-04-13',
    ])
    expect(groups[0].rows.map((r) => r.name)).toEqual(['a', 'b'])
    expect(groups[0].label).toBe('Hoy')
    expect(groups[1].label).toBe('Ayer')
    expect(groups[2].label.charAt(0)).toBe(
      groups[2].label.charAt(0).toUpperCase(),
    )
  })

  it('says what a movement was matched with, or what is left', () => {
    expect(
      movementLine({
        state: 'conciliado',
        matches: [{ word: 'Cobro', party: 'Mercado Pago' }],
      }),
    ).toBe('Cobro · Mercado Pago')
    expect(movementLine({ state: 'parcial', remaining: 50 })).toMatch(
      /^Falta \$50\.00$/,
    )
    expect(movementLine({ state: 'pendiente', detail: 'Mercado Pago' })).toBe(
      'Mercado Pago · Sin conciliar',
    )
    expect(movementLine({})).toBe('Sin conciliar')
  })

  it('reads an account by its SAT code, its children or its kind', () => {
    expect(
      accountLine({
        agrupador: { code: '102.01', words: 'Bancos nacionales' },
      }),
    ).toBe('SAT 102.01 · Bancos nacionales')
    expect(accountLine({ group: true, children: 1 })).toBe('1 cuenta')
    expect(accountLine({ group: true, children: 4 })).toBe('4 cuentas')
    expect(accountLine({ account_type: 'Bank' })).toBe('Banco')
    expect(accountLine({ root_word: 'Activo' })).toBe('Activo')
    expect(
      accountLine({ path: 'Activo › Bancos', agrupador: { code: '102' } }),
    ).toBe('Activo › Bancos · SAT 102')
    expect(accountTitle({ number: '1020', label: 'Bancos' })).toBe(
      '1020 · Bancos',
    )
    expect(accountTitle({ label: 'Caja' })).toBe('Caja')
  })
})

const MOVEMENT = {
  name: 'ACC-BTN-2026-00024',
  title: 'Transferencia recibida',
  detail: 'Mercado Pago',
  reference: '0118220827',
  amount: 190,
  remaining: 190,
  currency: 'MXN',
  date: '2026-04-17',
  state: 'pendiente',
}
const detail = (extra = {}) => ({
  movement: MOVEMENT,
  candidates: [
    {
      doctype: 'Payment Entry',
      name: 'ACC-PAY-2026-00001',
      word: 'Cobro',
      party: 'Mercado Pago',
      amount: 190,
      apply_amount: 190,
      fingerprint: 'fp-1',
      reason: 'Mismo importe y referencia',
      suggested: true,
    },
  ],
  invoices: [],
  drafts: [],
  matches: [],
  blocked: [],
  can: { conciliar: true, deshacer: true, gasto: false },
  scope: 'near',
  engine: 'contador',
  ...extra,
})

describe('ConciliarSheet', () => {
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
  const mount = (props = {}) => {
    const events = []
    app = createApp({
      render: () =>
        h(ConciliarSheet, {
          open: true,
          movement: { name: MOVEMENT.name },
          onChanged: (e) => events.push(e),
          ...props,
        }),
    })
    app.mount(host)
    return events
  }

  it('shows the suggestion and reconciles it in one tap', async () => {
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.movimiento')) return detail()
      if (method.endsWith('.conciliar'))
        return {
          ok: true,
          state: 'conciliado',
          remaining: 0,
          matches: [{ word: 'Cobro', party: 'Mercado Pago' }],
        }
    })
    const events = mount()
    await flush()
    expect(state.call).toHaveBeenCalledWith('crm.api.bancos.movimiento', {
      bank_transaction: MOVEMENT.name,
      scope: 'near',
    })
    expect(host.querySelector('h2').textContent).toBe('Transferencia recibida')
    const card = host.querySelector('[data-bancos-suggested]')
    expect(card.textContent).toContain('Coincide con')
    expect(card.textContent).toContain('Mercado Pago')
    expect(
      host.querySelector('[data-bancos-sheet-amount]').textContent,
    ).toMatch(/^\+\$190\.00$/)

    host.querySelector('[data-bancos-conciliar-btn]').click()
    await flush()
    const [method, args] = state.call.mock.calls.find(([m]) =>
      m.endsWith('.conciliar'),
    )
    expect(method).toBe('crm.api.bancos.conciliar')
    expect(args).toMatchObject({
      bank_transaction: MOVEMENT.name,
      doctype: 'Payment Entry',
      name: 'ACC-PAY-2026-00001',
      fingerprint: 'fp-1',
      apply_amount: 190,
      scope: 'near',
    })
    expect(args.request_id).toBeTruthy()
    expect(events).toEqual([
      {
        name: MOVEMENT.name,
        row: {
          state: 'conciliado',
          remaining: 0,
          matches: [{ word: 'Cobro', party: 'Mercado Pago' }],
        },
      },
    ])
  })

  it('keeps a refusal on the sheet in words, without changing the row', async () => {
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.movimiento')) return detail()
      if (method.endsWith('.conciliar'))
        return { ok: false, message: 'Ese mes ya está cerrado.' }
    })
    const events = mount()
    await flush()
    host.querySelector('[data-bancos-conciliar-btn]').click()
    await flush()
    expect(host.querySelector('[data-bancos-problem]').textContent).toContain(
      'Ese mes ya está cerrado.',
    )
    expect(events).toEqual([])
  })

  it('a read-only worker sees the match but no button', async () => {
    state.call.mockResolvedValue(
      detail({ can: { conciliar: false, deshacer: false, gasto: false } }),
    )
    mount()
    await flush()
    expect(host.querySelector('[data-bancos-suggested]')).not.toBeNull()
    expect(host.querySelector('[data-bancos-conciliar-btn]')).toBeNull()
  })

  it('a read-only worker can ask for authorization instead of hitting a dead end', async () => {
    const written = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text) => written.push(text) },
    })
    state.call.mockResolvedValue(
      detail({
        can: { conciliar: false, deshacer: false, gasto: false },
        blocked: [
          {
            code: 'read_only',
            message: 'Puedes ver este movimiento, pero no conciliarlo.',
            actions: ['request_authorization'],
          },
        ],
      }),
    )
    mount()
    await flush()
    const ask = host.querySelector('[data-bancos-pedir]')
    expect(ask.textContent).toBe('Pedir autorización')
    ask.click()
    await flush()
    expect(written).toHaveLength(1)
    // the request carries what the responsable needs to find the movement
    expect(written[0]).toContain('autorices conciliar')
    expect(written[0]).toContain('ACC-BTN-2026-00024')
    expect(written[0]).toContain('Ref. 0118220827')
    expect(written[0]).toContain('+$190.00')
    expect(host.querySelector('[data-bancos-blocked]').textContent).toContain(
      'Copiado.',
    )
    // asking changes nothing on the server
    expect(
      state.call.mock.calls.filter(([m]) => !m.endsWith('.movimiento')),
    ).toEqual([])
  })

  it('a refusal with no way out shows no button', async () => {
    state.call.mockResolvedValue(
      detail({
        can: { conciliar: false, deshacer: false, gasto: false },
        blocked: [{ code: 'period_closed', message: 'Este mes está cerrado.' }],
      }),
    )
    mount()
    await flush()
    expect(host.querySelector('[data-bancos-pedir]')).toBeNull()
  })

  it('offers the open invoice when nothing matches', async () => {
    state.call.mockImplementation(async (method) => {
      if (method.endsWith('.movimiento'))
        return detail({
          candidates: [],
          invoices: [
            {
              doctype: 'Sales Invoice',
              name: 'ACC-SINV-2026-00009',
              party: 'Laura S.A.',
              amount: 190,
              currency: 'MXN',
            },
          ],
        })
      return {}
    })
    mount()
    await flush()
    const invoice = host.querySelector('[data-bancos-invoice]')
    expect(invoice.textContent).toContain('Laura S.A.')
    const button = host.querySelector('[data-bancos-crear-pago]')
    expect(button.textContent).toBe('Registrar cobro')
    button.click()
    await flush()
    expect(state.call).toHaveBeenCalledWith('crm.api.bancos.crear_pago', {
      bank_transaction: MOVEMENT.name,
      invoice_doctype: 'Sales Invoice',
      invoice: 'ACC-SINV-2026-00009',
    })
  })

  it('a server traceback never reaches the worker', async () => {
    state.call.mockRejectedValue({
      messages: ['Traceback (most recent call last): …'],
    })
    mount()
    await flush()
    expect(host.querySelector('[data-bancos-problem]').textContent).toContain(
      'Revisa tu conexión',
    )
  })
})
