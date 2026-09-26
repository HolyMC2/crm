import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ACTIVE_PAYMENTS,
  forgetCommand,
  localCommerceUrl,
  paymentCheckoutUrl,
  persistCommand,
  restoreCommand,
} from '@/components/Commerce/commerceState'
const actor = 'sales@example.test'
const command = () => ({
  action: 'request_payment_link',
  params: {
    sales_order: 'SO-1',
    deal: 'DEAL-1',
    review_hash: 'review-hash',
    request_id: 'a1234567-1234-1234-1234-123456789abc',
  },
})
beforeEach(() => sessionStorage.clear())
afterEach(() => sessionStorage.clear())
describe('commerce command continuity', () => {
  it('preserves the exact command across reload scoped to the actor and order', () => {
    persistCommand(actor, command())
    const restored = restoreCommand(actor, 'SO-1')
    expect(restored).toEqual(command())
    expect(Object.isFrozen(restored.params)).toBe(true)
    expect(restoreCommand('another@example.test', 'SO-1')).toBeNull()
    expect(restoreCommand(actor, 'SO-2')).toBeNull()
    forgetCommand(actor, 'SO-1')
    expect(restoreCommand(actor, 'SO-1')).toBeNull()
  })
  it('rejects extra payload or missing stable identity before persistence', () => {
    expect(() =>
      persistCommand(actor, {
        ...command(),
        params: { ...command().params, customer: 'Private Customer' },
      }),
    ).toThrow()
    expect(() =>
      persistCommand(actor, {
        ...command(),
        params: { ...command().params, request_id: '' },
      }),
    ).toThrow()
    expect(() => persistCommand('', command())).toThrow()
    expect(sessionStorage.length).toBe(0)
  })
  it('persists native register and cancellation identities without amounts or URLs', () => {
    const checkout = {
      action: 'queue_checkout',
      params: {
        sales_order: 'SO-1',
        cart: 'cart-1',
        review_hash: 'hash',
        pos_profile: 'Register A',
      },
    }
    persistCommand(actor, checkout)
    expect(restoreCommand(actor, 'SO-1')).toEqual(checkout)
    const cancel = {
      action: 'cancel_payment',
      params: { sales_order: 'SO-1', name: 'PAY-1' },
    }
    persistCommand(actor, cancel)
    expect(restoreCommand(actor, 'SO-1')).toEqual(cancel)
  })
  it('refuses corrupted storage and fails when the browser cannot retain a command', () => {
    persistCommand(actor, command())
    const key = sessionStorage.key(0)
    sessionStorage.setItem(key, '{')
    expect(() => restoreCommand(actor, 'SO-1')).toThrow()
    expect(() =>
      persistCommand(actor, command(), {
        setItem() {
          throw new Error('Storage unavailable')
        },
      }),
    ).toThrow('Storage unavailable')
  })
})
describe('permissioned commerce destinations', () => {
  it('accepts native record and register URLs but rejects external and executable destinations', () => {
    expect(localCommerceUrl('/app/sales-order/SO%20A')).toBe(
      '/app/sales-order/SO%20A',
    )
    expect(localCommerceUrl('/posapp?charge_request=PCR-1', 'cashier')).toBe(
      '/posapp?charge_request=PCR-1',
    )
    for (const url of [
      '//other.test/app/sales-order/A',
      'https://other.test',
      'javascript:alert(1)',
      '/app/user/Administrator',
      '/app/sales-order/../../user/Administrator',
      '/app/sales-order/A\\B',
      '/app/sales-order/A\nB',
    ])
      expect(localCommerceUrl(url)).toBe('')
    expect(
      localCommerceUrl(
        '/posapp?charge_request=A&redirect=https://other.test',
        'cashier',
      ),
    ).toBe('')
  })
  it('shows only a confirmed Open provider link using the native Mercado Pago URL contract', () => {
    const payment = {
      state: 'Open',
      checkout_url:
        'https://www.mercadopago.com.mx/checkout/v1/redirect?order_id=abc-123',
    }
    expect(paymentCheckoutUrl(payment)).toBe(payment.checkout_url)
    for (const state of [
      'Unknown',
      'Queued',
      'Paid',
      'CancelPending',
      'Rejected',
    ])
      expect(paymentCheckoutUrl({ ...payment, state })).toBe('')
    for (const checkout_url of [
      'http://www.mercadopago.com.mx/checkout/v1/redirect?order_id=abc',
      'https://www.mercadopago.com.mx.evil.test/checkout/v1/redirect?order_id=abc',
      'https://user@www.mercadopago.com.mx/checkout/v1/redirect?order_id=abc',
      'https://www.mercadopago.com.mx/checkout/v1/redirect?order_id=abc&extra=1',
      'https://www.mercadopago.com.mx/checkout/v1/redirect?order_id=abc#bad',
    ])
      expect(paymentCheckoutUrl({ ...payment, checkout_url })).toBe('')
  })
  it('blocks new collection while a payment is queued, processing, open, cancelling or uncertain', () => {
    expect([...ACTIVE_PAYMENTS]).toEqual([
      'Queued',
      'Dispatching',
      'Unknown',
      'Open',
      'CancelPending',
      'Review',
    ])
    expect(ACTIVE_PAYMENTS.has('Paid')).toBe(false)
    expect(ACTIVE_PAYMENTS.has('Cancelled')).toBe(false)
  })
})
