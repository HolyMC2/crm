// Cobranza sheets mounted with their real logic: «Registrar pago» prefills from
// the invoice the worker came from, applies the amount oldest first, explains a
// refusal with both ways out and sends what the server needs; «Estado de
// cuenta» downloads ERPNext's PDF or says why there is none.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

const state = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('frappe-ui', async () => {
  const { h } = await import('vue')
  return {
    Button: {
      props: ['label', 'variant', 'loading', 'disabled'],
      emits: ['click'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'button',
            { disabled: props.disabled, onClick: () => emit('click') },
            props.label,
          ),
    },
    // The desktop container renders its slots so the form can be driven.
    Dialog: {
      props: ['modelValue', 'options'],
      setup:
        (props, { slots }) =>
        () =>
          props.modelValue
            ? h('div', { role: 'dialog' }, [
                h('h2', props.options?.title),
                slots['body-content']?.(),
                slots.actions?.(),
              ])
            : null,
    },
    BottomSheet: { render: () => null },
    FormControl: {
      props: ['modelValue', 'label', 'type', 'options'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h('label', [
            props.label,
            props.type === 'select'
              ? h(
                  'select',
                  {
                    'data-label': props.label,
                    value: props.modelValue,
                    onChange: (e) => emit('update:modelValue', e.target.value),
                  },
                  (props.options || []).map((o) =>
                    h(
                      'option',
                      { value: o.value, disabled: o.disabled },
                      o.label,
                    ),
                  ),
                )
              : h('input', {
                  'data-label': props.label,
                  value: props.modelValue,
                  onInput: (e) => emit('update:modelValue', e.target.value),
                }),
          ]),
    },
    toast: { success: vi.fn(), error: vi.fn() },
  }
})
vi.mock('@/composables/useCobranza', async (importOriginal) => ({
  ...(await importOriginal()),
  cobranzaApi: (...args) => state.api(...args),
}))

import PaymentSheet from '@/components/cobranza/PaymentSheet.vue'
import StatementSheet from '@/components/cobranza/StatementSheet.vue'

const CONTEXT = {
  customer: 'Laura',
  customer_name: 'Laura S.A.',
  company: 'Tienda',
  company_currency: 'MXN',
  invoices: [
    {
      name: 'OLD',
      overdue_days: 40,
      outstanding: 1000,
      currency: 'MXN',
      account: 'Clientes',
      next_due: null,
    },
    {
      name: 'NEW',
      overdue_days: 5,
      outstanding: 500,
      currency: 'MXN',
      account: 'Clientes',
      next_due: null,
    },
    {
      name: 'LATER',
      overdue_days: 0,
      outstanding: 200,
      currency: 'MXN',
      account: 'Clientes',
      next_due: '2026-10-30',
    },
  ],
  modes: [
    {
      name: 'Efectivo',
      account: 'Caja',
      needs_reference: false,
      problem: null,
    },
    {
      name: 'Transferencia',
      account: 'Banco',
      needs_reference: true,
      problem: null,
    },
  ],
  default_mode: 'Efectivo',
  today: '2026-10-14',
  can_pay: true,
  problem: null,
  can_cancel: true,
}
const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}
let app, root
function mount(component, props) {
  root = document.createElement('div')
  document.body.appendChild(root)
  const bound = reactive({ modelValue: true, ...props })
  const events = []
  app = createApp({
    render: () =>
      h(component, {
        ...bound,
        'onUpdate:modelValue': (v) => (bound.modelValue = v),
        onSaved: (r) => events.push(['saved', r]),
        onCollect: (r) => events.push(['collect', r]),
      }),
  })
  app.config.globalProperties.__ = (...args) => window.__(...args)
  app.mount(root)
  return events
}
const input = (label) => root.querySelector(`[data-label="${label}"]`)
const button = (text) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent.includes(text))
beforeEach(() => {
  state.api.mockReset()
  window.__ = (text, values) =>
    String(text).replace(/{(\d+)}/g, (m, i) => values?.[i] ?? m)
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.unstubAllGlobals()
})

describe('«Registrar pago»', () => {
  it('starts from everything overdue, applies oldest first and registers it', async () => {
    state.api.mockImplementation(async (method) =>
      method.endsWith('payment_context')
        ? CONTEXT
        : { payment_entry: 'PE-1', can_cancel: true },
    )
    const events = mount(PaymentSheet, {
      customer: 'Laura',
      company: 'Tienda',
      caps: { collect: true },
    })
    await flush()
    expect(input('Amount received ({0})'.replace('{0}', 'MXN')).value).toBe(
      '1500',
    )
    const checked = [...root.querySelectorAll('input[type="checkbox"]')].map(
      (c) => c.checked,
    )
    expect(checked).toEqual([true, true, false])
    const amount = input('Amount received (MXN)')
    amount.value = '1200'
    amount.dispatchEvent(new Event('input'))
    await flush()
    expect(root.textContent).toContain('paid in full')
    button('Register').click()
    await flush()
    const [method, args] = state.api.mock.calls.at(-1)
    expect(method).toMatch(/register_payment$/)
    expect(args).toMatchObject({
      customer: 'Laura',
      company: 'Tienda',
      mode_of_payment: 'Efectivo',
      posting_date: '2026-10-14',
      reference_no: '',
      allocations: [
        { invoice: 'OLD', amount: 1000 },
        { invoice: 'NEW', amount: 200 },
      ],
    })
    expect(args.request_id).toBeTruthy()
    expect(events).toEqual([
      ['saved', { payment_entry: 'PE-1', can_cancel: true }],
    ])
  })

  it('ERPNext’s seeded modes read in Spanish; the record name is what is sent', async () => {
    const catalog = {
      'Cash:Mode of Payment': 'Efectivo',
      'Wire Transfer:Mode of Payment': 'Transferencia',
      'Credit Card:Mode of Payment': 'Tarjeta de crédito',
      'Check:Mode of Payment': 'Cheque',
    }
    window.__ = (text, values, context) =>
      String((context && catalog[`${text}:${context}`]) || text).replace(
        /{(\d+)}/g,
        (m, i) => values?.[i] ?? m,
      )
    state.api.mockImplementation(async (method) =>
      method.endsWith('payment_context')
        ? {
            ...CONTEXT,
            modes: [
              { name: 'Cash', account: 'Caja', needs_reference: false },
              {
                name: 'Wire Transfer',
                account: 'Banco',
                needs_reference: true,
              },
              { name: 'Credit Card', account: null, problem: 'Sin cuenta' },
              { name: 'Check', account: null, problem: 'Sin cuenta' },
              { name: 'Vales Doco', account: 'Caja', needs_reference: false },
            ],
            default_mode: 'Cash',
          }
        : { payment_entry: 'PE-2', can_cancel: true },
    )
    mount(PaymentSheet, { customer: 'Laura', company: 'Tienda' })
    await flush()
    const mode = input('How did they pay?')
    expect(
      [...mode.querySelectorAll('option')].map((o) => [o.value, o.textContent]),
    ).toEqual([
      ['Cash', 'Efectivo'],
      ['Wire Transfer', 'Transferencia'],
      ['Credit Card', 'Tarjeta de crédito (no account)'],
      ['Check', 'Cheque (no account)'],
      ['Vales Doco', 'Vales Doco'],
    ])
    button('Register').click()
    await flush()
    const [, args] = state.api.mock.calls.at(-1)
    expect(args.mode_of_payment).toBe('Cash')
  })

  it('a bank payment asks for its reference before it can be saved', async () => {
    state.api.mockResolvedValue(CONTEXT)
    mount(PaymentSheet, {
      customer: 'Laura',
      company: 'Tienda',
      invoice: 'NEW',
    })
    await flush()
    expect(input('Amount received (MXN)').value).toBe('500')
    const mode = input('How did they pay?')
    mode.value = 'Transferencia'
    mode.dispatchEvent(new Event('change'))
    await flush()
    expect(root.querySelector('[data-payment-problem]').textContent).toMatch(
      /reference/,
    )
    expect(button('Register').disabled).toBe(true)
    const reference = input('Transfer or deposit reference')
    reference.value = 'SPEI 99'
    reference.dispatchEvent(new Event('input'))
    await flush()
    expect(root.querySelector('[data-payment-problem]')).toBeNull()
    expect(button('Register').disabled).toBe(false)
  })

  it('a refusal says the missing permission and offers the register and a request', async () => {
    state.api.mockResolvedValue({
      ...CONTEXT,
      can_pay: false,
      modes: [],
      problem:
        'Para registrar pagos necesitas permiso para crear y validar pagos (Payment Entry).',
    })
    const events = mount(PaymentSheet, {
      customer: 'Laura',
      company: 'Tienda',
      invoice: 'OLD',
      caps: { collect: true },
    })
    await flush()
    const refused = root.querySelector('[data-payment-refused]')
    expect(refused.textContent).toContain('(Payment Entry)')
    expect(refused.textContent).toContain('Copy access request')
    button('Collect at the register').click()
    await flush()
    expect(events).toEqual([['collect', 'OLD']])
    expect(button('Register payment')).toBeUndefined()
  })
})

describe('«Estado de cuenta»', () => {
  it('downloads ERPNext’s PDF, or says why there is none', async () => {
    const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(pdf, {
          status: 200,
          headers: {
            'content-type': 'application/pdf',
            'content-disposition':
              'attachment; filename="Estado de cuenta - Laura - 2026-10-14.pdf"',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            exc_type: 'ValidationError',
            _server_messages: JSON.stringify([
              JSON.stringify({
                message:
                  'Laura no tiene movimientos del 1 al 2. Elige un periodo más amplio.',
              }),
            ]),
          }),
          { status: 417, headers: { 'content-type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetch)
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    mount(StatementSheet, {
      customer: 'Laura',
      company: 'Tienda',
      today: '2026-10-14',
    })
    await flush()
    expect(input('From').value).toBe('2026-07-16')
    button('Download PDF').click()
    await flush()
    const url = new URL(fetch.mock.calls[0][0], 'https://x.invalid')
    expect(url.pathname).toBe(
      '/api/method/doco.workspaces.receivables_actions.statement_pdf',
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      customer: 'Laura',
      company: 'Tienda',
      from_date: '2026-07-16',
      to_date: '2026-10-14',
    })
    expect(root.textContent).toContain(
      'Ready: Estado de cuenta - Laura - 2026-10-14.pdf',
    )
    button('Download PDF').click()
    await flush()
    expect(root.querySelector('[role="alert"]').textContent).toContain(
      'no tiene movimientos',
    )
  })
})
