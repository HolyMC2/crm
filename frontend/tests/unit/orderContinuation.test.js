import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
const api = vi.hoisted(() => ({ call: vi.fn(), leave: null, update: null }))
vi.mock('frappe-ui', () => ({ call: (...args) => api.call(...args) }))
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: (fn) => {
    api.leave = fn
  },
  onBeforeRouteUpdate: (fn) => {
    api.update = fn
  },
}))
import OrderContinuation from '@/components/Commerce/OrderContinuation.vue'
import DealOrders from '@/components/Commerce/DealOrders.vue'
import {
  createCommerceState,
  persistCommand,
  restoreCommand,
  useCommerceState,
} from '@/components/Commerce/commerceState'
const actor = 'seller@example.test'
const order = (extra = {}) => ({
  name: 'SO-1',
  status: 'Draft',
  docstatus: 0,
  customer: 'Customer A',
  company: 'Company A',
  currency: 'MXN',
  total: '116',
  advance_paid: '0',
  remaining: '116',
  sales_order_url: '/app/sales-order/SO-1',
  delivery: { percent: 0, state: 'Pending' },
  billing: { percent: 0, state: 'Pending', invoices: [] },
  profiles: [{ name: 'Register A' }],
  payments: [],
  payment_available: true,
  payment_reason_code: null,
  capabilities: {
    can_pos_review: true,
    can_payment_review: true,
    can_submit: true,
  },
  ...extra,
})
const payment = (extra = {}) => ({
  name: 'PAY-1',
  sales_order: 'SO-1',
  state: 'Unknown',
  amount: '116',
  currency: 'MXN',
  fee_net_available: false,
  ...extra,
})
const review = (extra = {}) => ({
  sales_order: 'SO-1',
  customer: 'Customer A',
  company: 'Company A',
  currency: 'MXN',
  total: '116',
  taxes: '16',
  advance_paid: '0',
  amount: '116',
  requires_submit: true,
  effect: 'submit_order_and_request_link',
  review_hash: 'review-1',
  items: [
    {
      item_code: 'ITEM A',
      description: '<b>Original item</b>',
      qty: 1,
      rate: 100,
    },
  ],
  ...extra,
})
const cleanup = []
beforeEach(() => {
  api.call.mockReset()
  sessionStorage.clear()
})
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
  sessionStorage.clear()
  vi.restoreAllMocks()
})
async function flush() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function calls(method) {
  return api.call.mock.calls.filter(([name]) => name.endsWith(method))
}
function button(el, label) {
  return [...el.querySelectorAll('button')].find((node) =>
    node.textContent.includes(label),
  )
}
async function click(el, label) {
  const node = button(el, label)
  expect(node, label).toBeTruthy()
  node.click()
  await flush()
}
async function accept(el) {
  const checkbox = el.querySelector('input[type=checkbox]')
  expect(checkbox).toBeTruthy()
  checkbox.checked = true
  checkbox.dispatchEvent(new Event('change', { bubbles: true }))
  await flush()
}
async function mount(options = {}) {
  let current = options.order || order()
  api.call.mockImplementation((method, args) => {
    const result = options.handler?.(method, args, (value) => {
      current = value
    })
    if (result !== undefined) return result
    if (method.endsWith('get_context'))
      return Promise.resolve(
        options.context || {
          available: true,
          orders: [current],
          selected: args.sales_order ? structuredClone(current) : null,
        },
      )
    if (method.endsWith('preview_payment_link'))
      return Promise.resolve(review())
    if (method.endsWith('preview_checkout'))
      return Promise.resolve(review({ pos_profile: args.pos_profile }))
    throw new Error(`Unexpected method ${method}`)
  })
  const el = document.createElement('div')
  document.body.append(el)
  const props = reactive({
    salesOrder: 'SO-1',
    deal: 'DEAL-1',
    ...options.props,
  })
  let state = options.state || createCommerceState(actor)
  const app = createApp({
    setup() {
      if (options.route) state = useCommerceState()
      return () =>
        h(options.list ? DealOrders : OrderContinuation, { ...props, state })
    },
  })
  app.provide('session', { user: actor })
  app.config.globalProperties.__ = globalThis.__
  app.mount(el)
  let mounted = true
  function unmount() {
    if (mounted) {
      app.unmount()
      el.remove()
      mounted = false
    }
  }
  cleanup.push(unmount)
  await flush()
  return { el, props, state, unmount }
}
describe('reviewed native order continuation (synthetic API fixtures)', () => {
  it('loads only status and preserves independent order, invoice and delivery states', async () => {
    const { el } = await mount({
      order: order({
        status: 'To Deliver',
        docstatus: 1,
        advance_paid: '116',
        remaining: '0',
        billing: {
          state: 'Billed',
          percent: 100,
          invoices: [
            {
              name: 'INV-1',
              docstatus: 1,
              currency: 'MXN',
              outstanding_amount: '0',
              invoice_url: '/app/sales-invoice/INV-1',
            },
          ],
        },
        delivery: { state: 'Pending', percent: 0 },
      }),
    })
    expect(api.call.mock.calls.map(([method]) => method)).toEqual([
      'crm.api.commerce.get_context',
    ])
    expect(el.textContent).toContain('Billed · 100%')
    expect(el.textContent).toContain('Pending · 0%')
    expect(el.querySelector('a[href="/app/sales-invoice/INV-1"]')).toBeTruthy()
    expect(button(el, 'Review payment link').disabled).toBe(true)
  })
  it.each([
    {
      label: 'a fully advanced order with a Paid payment receipt',
      total: '100',
      advance_paid: '100',
      docstatus: 1,
      payments: [payment({ state: 'Paid', amount: '100' })],
    },
    {
      label: 'a genuinely free order',
      total: '0',
      advance_paid: '0',
      docstatus: 0,
      payments: [],
    },
  ])(
    'allows register invoicing for $label without allowing another payment',
    async ({ total, advance_paid, docstatus, payments }) => {
      const fixture = order({
        total,
        advance_paid,
        remaining: '0',
        docstatus,
        payments,
      })
      const handoff = {
        sales_order: 'SO-1',
        charge_request: 'PCR-zero',
        state: 'Open',
        pos_profile: 'Register A',
        cashier_url: '/posapp?charge_request=PCR-zero',
      }
      const { el } = await mount({
        order: fixture,
        handler(method, args, set) {
          if (method.endsWith('preview_checkout'))
            return Promise.resolve(
              review({
                total,
                advance_paid,
                taxes: '0',
                items: [
                  {
                    item_code: 'ITEM A',
                    description: 'Reviewed item',
                    qty: 1,
                    rate: Number(total),
                  },
                ],
                pos_profile: args.pos_profile,
                requires_submit: docstatus === 0,
              }),
            )
          if (method.endsWith('queue_checkout')) {
            set({ ...fixture, pos_checkout: handoff })
            return Promise.resolve(handoff)
          }
        },
      })
      expect(button(el, 'Review payment link').disabled).toBe(true)
      const select = el.querySelector('select')
      expect(select.disabled).toBe(false)
      select.value = 'Register A'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await flush()
      expect(button(el, 'Review register handoff').disabled).toBe(false)
      await click(el, 'Review register handoff')
      expect(calls('queue_checkout')).toHaveLength(0)
      await accept(el)
      const confirmation =
        docstatus === 0
          ? 'Submit order and send to register'
          : 'Send reviewed order to register'
      expect(button(el, confirmation).disabled).toBe(false)
      await click(el, confirmation)
      expect(calls('queue_checkout')).toHaveLength(1)
      expect(calls('queue_checkout')[0][1]).toEqual({
        sales_order: 'SO-1',
        deal: 'DEAL-1',
        pos_profile: 'Register A',
        review_hash: 'review-1',
      })
      expect(calls('preview_payment_link')).toHaveLength(0)
      expect(calls('request_payment_link')).toHaveLength(0)
      expect(
        el.querySelector('a[href="/posapp?charge_request=PCR-zero"]'),
      ).toBeTruthy()
    },
  )
  it('requires explicit review and consent before submitting an order for a payment link', async () => {
    const { el } = await mount({
      props: { cart: 'cart-1' },
      handler(method, args, set) {
        if (method.endsWith('request_payment_link')) {
          set(order({ payments: [payment()] }))
          return Promise.resolve(payment())
        }
      },
    })
    await click(el, 'Review payment link')
    expect(calls('request_payment_link')).toHaveLength(0)
    expect(el.textContent).toContain('<b>Original item</b>')
    expect(el.querySelector('b')).toBeNull()
    expect(button(el, 'Submit order and request payment link').disabled).toBe(
      true,
    )
    await accept(el)
    await click(el, 'Submit order and request payment link')
    expect(calls('request_payment_link')).toHaveLength(1)
    expect(calls('request_payment_link')[0][1]).toMatchObject({
      sales_order: 'SO-1',
      deal: 'DEAL-1',
      cart: 'cart-1',
      review_hash: 'review-1',
      request_id: expect.any(String),
    })
    expect(el.textContent).toContain('payment outcome is unknown')
    expect(button(el, 'Review payment link').disabled).toBe(true)
    expect(restoreCommand(actor, 'SO-1')).toBeNull()
  })
  it('persists a lost request and retries the identical command after remount', async () => {
    let sends = 0
    const handler = (method, args, set) => {
      if (method.endsWith('request_payment_link')) {
        if (++sends === 1) return Promise.reject(new TypeError('Lost response'))
        set(order({ payments: [payment()] }))
        return Promise.resolve(payment())
      }
    }
    const first = await mount({ handler })
    await click(first.el, 'Review payment link')
    await accept(first.el)
    await click(first.el, 'Submit order and request payment link')
    const original = structuredClone(calls('request_payment_link')[0][1])
    expect(first.state.pending.params).toEqual(original)
    first.unmount()
    const second = await mount({ handler })
    expect(second.state.pending.params).toEqual(original)
    expect(calls('request_payment_link')).toHaveLength(1)
    await click(second.el, 'Retry the same order action')
    expect(calls('request_payment_link').map(([, params]) => params)).toEqual([
      original,
      original,
    ])
    expect(second.state.pending).toBeNull()
    expect(second.el.textContent).toContain('Unknown')
  })
  it('keeps a pending money request across permission refusal and route navigation attempts', async () => {
    persistCommand(actor, {
      action: 'request_payment_link',
      params: {
        sales_order: 'SO-1',
        review_hash: 'old-review',
        request_id: 'a1234567-1234-1234-1234-123456789abc',
      },
    })
    const { el, state } = await mount({
      route: true,
      handler(method) {
        if (method.endsWith('request_payment_link'))
          return Promise.reject({ exc_type: 'PermissionError' })
      },
    })
    expect(api.leave()).toBe(false)
    expect(
      api.update(
        { params: { dealId: 'DEAL-2' } },
        { params: { dealId: 'DEAL-1' } },
      ),
    ).toBe(false)
    await click(el, 'Retry the same order action')
    expect(state.pending).toBeTruthy()
    expect(el.textContent).toContain('do not have permission')
    expect(restoreCommand(actor, 'SO-1')).toBeTruthy()
  })
  it('requires a fresh review after a definite stale-review refusal', async () => {
    const { el, state } = await mount({
      handler(method) {
        if (method.endsWith('request_payment_link'))
          return Promise.reject({
            exc_type: 'ValidationError',
            messages: ['Review the order again.'],
          })
      },
    })
    await click(el, 'Review payment link')
    await accept(el)
    await click(el, 'Submit order and request payment link')
    expect(state.review).toBeNull()
    expect(state.pending).toBeNull()
    expect(el.textContent).toContain('Review the order again.')
    expect(button(el, 'Review payment link').disabled).toBe(false)
  })
  it('does not start collection when command storage is corrupt or unavailable', async () => {
    persistCommand(actor, {
      action: 'request_payment_link',
      params: {
        sales_order: 'SO-1',
        review_hash: 'hash',
        request_id: 'a1234567-1234-1234-1234-123456789abc',
      },
    })
    sessionStorage.setItem(sessionStorage.key(0), '{')
    const { el } = await mount()
    expect(el.textContent).toContain('saved order action could not be read')
    await click(el, 'Refresh order status')
    expect(button(el, 'Review payment link').disabled).toBe(true)
    expect(calls('request_payment_link')).toHaveLength(0)
  })
  it('refuses a money action if session storage cannot retain its exact command', async () => {
    const { el, state } = await mount()
    await click(el, 'Review payment link')
    await accept(el)
    vi.spyOn(sessionStorage, 'setItem').mockImplementationOnce(() => {
      throw new Error('Storage unavailable')
    })
    await click(el, 'Submit order and request payment link')
    expect(calls('request_payment_link')).toHaveLength(0)
    expect(state.pending).toBeNull()
    expect(el.textContent).toContain('Storage unavailable')
  })
  it('recovers a register handoff and invoice from read-side context without queueing again', async () => {
    const { el } = await mount({
      order: order({
        pos_checkout: {
          sales_order: 'SO-1',
          charge_request: 'PCR-1',
          state: 'Open',
          pos_profile: 'Register A',
          cashier_url: '/posapp?charge_request=PCR-1',
          invoice_url: '/app/sales-invoice/INV-1',
          callback_status: 'Pending',
        },
      }),
    })
    expect(
      el.querySelector('a[href="/posapp?charge_request=PCR-1"]'),
    ).toBeTruthy()
    expect(calls('queue_checkout')).toHaveLength(0)
    expect(button(el, 'Review payment link').disabled).toBe(true)
  })
  it('requires an allowed profile and explicit consent before the native register queue', async () => {
    const handoff = {
      sales_order: 'SO-1',
      charge_request: 'PCR-1',
      state: 'Open',
      pos_profile: 'Register A',
      cashier_url: '/posapp?charge_request=PCR-1',
    }
    const { el } = await mount({
      handler(method, args, set) {
        if (method.endsWith('queue_checkout')) {
          set(order({ pos_checkout: handoff }))
          return Promise.resolve(handoff)
        }
      },
    })
    expect(button(el, 'Review register handoff').disabled).toBe(true)
    const select = el.querySelector('select')
    select.value = 'Register A'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
    await click(el, 'Review register handoff')
    expect(el.textContent).toContain('Taxes: 16 MXN')
    expect(calls('queue_checkout')).toHaveLength(0)
    await accept(el)
    await click(el, 'Submit order and send to register')
    expect(calls('queue_checkout')[0][1]).toEqual({
      sales_order: 'SO-1',
      deal: 'DEAL-1',
      pos_profile: 'Register A',
      review_hash: 'review-1',
    })
    expect(
      el.querySelector('a[href="/posapp?charge_request=PCR-1"]'),
    ).toBeTruthy()
  })
  it('blocks fresh collection for Unknown and explicitly reconciles the existing receipt', async () => {
    const { el } = await mount({
      order: order({ payments: [payment()] }),
      handler(method, args, set) {
        if (method.endsWith('refresh_payment')) {
          set(
            order({
              payments: [payment({ state: 'Paid', payment_entry: 'PE-1' })],
              remaining: '0',
            }),
          )
          return Promise.resolve(
            payment({ state: 'Paid', payment_entry: 'PE-1' }),
          )
        }
      },
    })
    expect(button(el, 'Review payment link').disabled).toBe(true)
    expect(calls('refresh_payment')).toHaveLength(0)
    await click(el, 'Check payment status')
    expect(calls('refresh_payment')[0][1]).toEqual({
      name: 'PAY-1',
      sales_order: 'SO-1',
      deal: 'DEAL-1',
    })
    expect(el.querySelector('a[href="/app/payment-entry/PE-1"]')).toBeTruthy()
    expect(el.textContent).toContain(
      'Provider fees and net settlement are not available',
    )
    expect(calls('request_payment_link')).toHaveLength(0)
  })
  it('requires explicit cancellation and preserves its canonical name while uncertain', async () => {
    const open = payment({
      state: 'Open',
      checkout_url:
        'https://www.mercadopago.com.mx/checkout/v1/redirect?order_id=valid',
    })
    const { el, state } = await mount({
      order: order({ payments: [open] }),
      handler(method) {
        if (method.endsWith('cancel_payment'))
          return Promise.reject(new TypeError('Lost cancellation response'))
      },
    })
    await click(el, 'Cancel payment link…')
    expect(calls('cancel_payment')).toHaveLength(0)
    await click(el, 'Confirm link cancellation')
    expect(state.pending.params).toEqual({
      name: 'PAY-1',
      sales_order: 'SO-1',
      deal: 'DEAL-1',
    })
    await click(el, 'Retry the same order action')
    expect(calls('cancel_payment').map(([, params]) => params)).toEqual([
      state.pending.params,
      state.pending.params,
    ])
  })
  it('distinguishes absent integration, configuration, denial and outage without enabling actions', async () => {
    const missing = await mount({
      context: {
        available: false,
        reason_code: 'erp_checkout_unavailable',
        selected: null,
        orders: [],
      },
    })
    expect(missing.el.textContent).toContain('not installed')
    expect(button(missing.el, 'Review payment link')).toBeUndefined()
    missing.unmount()
    const config = await mount({
      order: order({
        payment_available: false,
        payment_reason_code: 'payment_configuration_required',
      }),
    })
    expect(config.el.textContent).toContain('need configuration')
    expect(button(config.el, 'Review payment link').disabled).toBe(true)
    config.unmount()
    const denied = await mount({
      handler() {
        return Promise.reject({ exc_type: 'PermissionError' })
      },
    })
    expect(denied.el.textContent).toContain('do not have permission')
    denied.unmount()
    const outage = await mount({
      handler() {
        return Promise.reject({})
      },
    })
    expect(outage.el.textContent).toContain(
      'Orders cannot be reached right now',
    )
    expect(button(outage.el, 'Review payment link')).toBeUndefined()
  })
  it('honors submit permission and conversation ownership blockers', async () => {
    const denied = await mount({
      order: order({
        capabilities: {
          can_submit: false,
          can_pos_review: true,
          can_payment_review: true,
        },
      }),
    })
    expect(denied.el.textContent).toContain('cannot submit this draft order')
    expect(button(denied.el, 'Review payment link').disabled).toBe(true)
    denied.unmount()
    const blocked = await mount({ props: { blocked: true } })
    expect(button(blocked.el, 'Review payment link').disabled).toBe(true)
    expect(calls('request_payment_link')).toHaveLength(0)
  })
  it('fails closed when the review omits financial terms', async () => {
    const { el, state } = await mount({
      handler(method) {
        if (method.endsWith('preview_payment_link'))
          return Promise.resolve(review({ amount: undefined }))
      },
    })
    await click(el, 'Review payment link')
    expect(state.review).toBeNull()
    expect(el.textContent).toContain('review is incomplete')
    expect(calls('request_payment_link')).toHaveLength(0)
  })
  it('keeps the selected order in a deal and reports the bounded list continuation', async () => {
    const state = createCommerceState(actor)
    state.selected = 'SO-1'
    const { el } = await mount({
      state,
      list: true,
      context: {
        available: true,
        orders: [order()],
        selected: order(),
        has_more: true,
      },
    })
    expect(state.selected).toBe('SO-1')
    expect(
      el.querySelector('a[href="/app/sales-order?crm_deal=DEAL-1"]'),
    ).toBeTruthy()
    expect(el.textContent).toContain('20 most recently updated')
  })
})
