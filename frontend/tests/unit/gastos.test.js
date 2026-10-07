import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recoveryModule } from '../../src/utils/shellRoutes.js'
import {
  bankSide,
  bankUrl,
  dueLabel,
  needsRate,
  needsReference,
  normalizeChip,
  normalizeSegment,
  orderBillsRoute,
  paidLabel,
  payBill,
  payMissing,
  pendingPayment,
  queueQuery,
  statusLabel,
} from '../../src/composables/useGastos.js'

describe('Gastos queues', () => {
  it('keeps unknown segments on Por pagar and chips on Por pagar only', () => {
    expect(normalizeSegment('por-registrar')).toBe('por-registrar')
    expect(normalizeSegment('x')).toBe('por-pagar')
    expect(normalizeSegment(undefined)).toBe('por-pagar')
    expect(normalizeChip('por-pagar', 'vencidas')).toBe('vencidas')
    expect(normalizeChip('por-pagar', 'otra')).toBe('')
    expect(normalizeChip('por-registrar', 'vencidas')).toBe('')
  })
  it('reopens the same list: segment, chip, search, or one order', () => {
    expect(
      queueQuery({ segment: 'por-pagar', chip: 'vencidas', q: 'luz' }),
    ).toEqual({
      chip: 'vencidas',
      q: 'luz',
    })
    expect(queueQuery({ segment: 'por-registrar' })).toEqual({
      segment: 'por-registrar',
    })
    expect(
      queueQuery({ segment: 'por-registrar', chip: 'x', po: 'PO-1' }),
    ).toEqual({
      po: 'PO-1',
    })
    expect(orderBillsRoute('PO-1')).toEqual({
      name: 'Gastos',
      query: { po: 'PO-1' },
    })
  })
  it('a refused Gastos recovers into Gastos, not Ventas', () => {
    expect(recoveryModule('/gastos/factura/PI-1')).toBe('gastos')
    expect(recoveryModule('/gastos?chip=vencidas')).toBe('gastos')
  })
})

describe('bill wording', () => {
  const bill = { docstatus: 1, total: 1000, currency: 'MXN' }
  it('says how much is paid of the total', () => {
    expect(paidLabel({ ...bill, paid: 0, outstanding_amount: 1000 })).toMatch(
      /^Nothing paid of/,
    )
    const partly = paidLabel({ ...bill, paid: 400, outstanding_amount: 600 })
    expect(partly).toMatch(/^Paid .*400.* of .*1,000/)
    expect(paidLabel({ ...bill, paid: 1000, outstanding_amount: 0 })).toMatch(
      /^Paid in full/,
    )
    expect(paidLabel({ docstatus: 0, total: 5 })).toBe('')
  })
  it('counts due days against the site today', () => {
    expect(dueLabel('2026-10-07', '2026-10-06')).toBe('Due tomorrow')
    expect(dueLabel('2026-10-06', '2026-10-06')).toBe('Due today')
    expect(dueLabel('2026-10-05', '2026-10-06')).toBe('Overdue since yesterday')
    expect(dueLabel('2026-10-01', '2026-10-06')).toBe('Overdue 5 days')
    expect(dueLabel('2026-10-16', '2026-10-06')).toBe('Due in 10 days')
    expect(dueLabel('', '2026-10-06')).toBe('')
  })
  it('names the state a worker acts on', () => {
    expect(statusLabel({ docstatus: 0 })).toBe('Draft')
    expect(statusLabel({ docstatus: 1, outstanding_amount: 0 })).toBe('Paid')
    expect(
      statusLabel({ docstatus: 1, outstanding_amount: 5, overdue: true }),
    ).toBe('Overdue')
    expect(statusLabel({ docstatus: 1, outstanding_amount: 5, paid: 1 })).toBe(
      'Partly paid',
    )
    expect(
      statusLabel({ docstatus: 1, outstanding_amount: 5, on_hold: true }),
    ).toBe('On hold')
  })
  it('hands the bank side to Contador with the way back to this bill', () => {
    const url = new URL(bankUrl('PE-1', 'PI 1'), 'https://x.invalid')
    expect(url.pathname).toBe('/contador/bancos')
    expect(url.searchParams.get('review')).toBe('PE-1')
    expect(url.searchParams.get('return_to')).toBe('/crm/gastos/factura/PI%201')
  })
})

describe('Pagar form', () => {
  const options = {
    accounts: [
      { account: 'Banco - X', type: 'Bank' },
      { account: 'Caja - X', type: 'Cash' },
    ],
  }
  it('asks a transfer number for the bank, not for cash', () => {
    expect(needsReference(options.accounts[0])).toBe(true)
    expect(needsReference(options.accounts[1])).toBe(false)
    const form = {
      account: 'Banco - X',
      amount: 400,
      reference_no: '',
      reference_date: '2026-10-06',
    }
    expect(payMissing(form, options)).toEqual(['reference_no'])
    expect(payMissing({ ...form, account: 'Caja - X' }, options)).toEqual([])
    expect(
      payMissing({ account: 'Otra', amount: 0, reference_date: '' }, options),
    ).toEqual(['account', 'amount', 'reference_date'])
  })
  it('a bill owed in dollars paid from a peso account needs the rate and shows the bank side', () => {
    const foreign = {
      currency: 'USD',
      company_currency: 'MXN',
      exchange_rate: { from: 'USD', to: 'MXN', rate: 18.5 },
      accounts: [
        { account: 'Banco - X', type: 'Bank', currency: 'MXN' },
        { account: 'Dólares - X', type: 'Bank', currency: 'USD' },
      ],
    }
    const form = {
      account: 'Banco - X',
      amount: '100',
      reference_no: 'TRF-1',
      reference_date: '2026-10-06',
      exchange_rate: '',
    }
    expect(needsRate(foreign.accounts[0], foreign)).toBe(true)
    expect(needsRate(foreign.accounts[1], foreign)).toBe(false)
    expect(needsRate(options.accounts[0], options)).toBe(false)
    expect(payMissing(form, foreign)).toEqual(['exchange_rate'])
    expect(bankSide(form, foreign)).toBeNull()
    const typed = { ...form, exchange_rate: '19' }
    expect(payMissing(typed, foreign)).toEqual([])
    expect(bankSide(typed, foreign)).toEqual({ amount: 1900, currency: 'MXN' })
    expect(bankSide({ ...typed, account: 'Dólares - X' }, foreign)).toBeNull()
  })
})

describe('one payment per tap', () => {
  beforeEach(() => sessionStorage.clear())
  const form = {
    account: 'Banco - X',
    amount: '400',
    reference_no: ' TRF-1 ',
    reference_date: '2026-10-06',
  }
  it('an unknown outcome keeps the request id; the retry asks about the same payment', async () => {
    const offline = Object.assign(new Error('x'), { offline: true })
    const api = vi.fn().mockRejectedValueOnce(offline).mockResolvedValueOnce({
      payment_entry: 'PE-1',
      outstanding_amount: 600,
    })
    await expect(payBill(api, 'PI-1', form)).rejects.toBe(offline)
    const kept = pendingPayment('PI-1')
    expect(kept.data).toEqual({
      name: 'PI-1',
      account: 'Banco - X',
      amount: 400,
      reference_no: 'TRF-1',
      reference_date: '2026-10-06',
      exchange_rate: 0,
    })
    // The worker changed the amount meanwhile: the pending payment still wins.
    const result = await payBill(api, 'PI-1', { ...form, amount: '999' })
    expect(result.payment_entry).toBe('PE-1')
    expect(api.mock.calls[1][1].request_id).toBe(
      api.mock.calls[0][1].request_id,
    )
    expect(api.mock.calls[1][1].amount).toBe(400)
    expect(pendingPayment('PI-1')).toBeNull()
  })
  it('a definite refusal forgets the attempt', async () => {
    const refused = Object.assign(new Error('closed'), { status: 417 })
    const api = vi.fn().mockRejectedValue(refused)
    await expect(payBill(api, 'PI-2', form)).rejects.toBe(refused)
    expect(pendingPayment('PI-2')).toBeNull()
  })
})
