import { describe, expect, it } from 'vitest'
import {
  agingLabel,
  agingTone,
  invoiceAction,
  nextCustomer,
  normalizeSegment,
  parsePaymentDone,
  promiseChip,
  reminderChip,
  secondaryActions,
  withDueSoon,
} from '@/composables/useCobranza'
import { posCollectHref } from '@/utils/posHandoff'

const CAPS = { remind: true, promise: true, collect: true, setup: false }

function inv(extra = {}) {
  return {
    name: 'SINV-1',
    overdue_days: 0,
    next_due: null,
    current_dunning: null,
    promise: null,
    ...extra,
  }
}

describe('Cobranza next action', () => {
  it.each([
    ['overdue, no letter yet', { overdue_days: 9 }, 'remind'],
    [
      'overdue, letter at this level already sent',
      { overdue_days: 9, current_dunning: 'DUNN-1' },
      'promise',
    ],
    [
      'overdue with an open promise',
      { overdue_days: 9, promise: { state: 'open' } },
      'collect',
    ],
    [
      'promise partly kept',
      { overdue_days: 9, promise: { state: 'partial' } },
      'collect',
    ],
    [
      'promise broken, letter sent: send it again',
      {
        overdue_days: 9,
        current_dunning: 'DUNN-1',
        promise: { state: 'broken' },
      },
      'resend',
    ],
    ['due soon', { next_due: '2026-10-08', due_soon: true }, 'call'],
    ['not due for weeks', { next_due: '2026-11-30' }, 'collect'],
  ])('%s → %s', (_label, extra, key) => {
    expect(invoiceAction(inv(extra), { caps: CAPS }).key).toBe(key)
  })

  it('a refused reminder explains itself and offers a way forward', () => {
    const noGrant = invoiceAction(inv({ overdue_days: 3 }), {
      caps: { ...CAPS, remind: false },
    })
    expect(noGrant.blocked).toBeTruthy()
    expect(noGrant.resolve.key).toBe('copy_request')
    const noLadder = invoiceAction(inv({ overdue_days: 3 }), {
      caps: { ...CAPS, setup: true },
      ladderReady: false,
    })
    expect(noLadder.resolve.key).toBe('setup')
    const noPos = invoiceAction(inv({ next_due: '2026-12-01' }), {
      caps: { ...CAPS, collect: false },
    })
    expect(noPos.blocked).toBeTruthy()
    expect(noPos.resolve.key).toBe('copy_folio')
  })

  it('secondary actions never repeat the primary one', () => {
    const row = inv({ overdue_days: 9, promise: { state: 'open' } })
    const primary = invoiceAction(row, { caps: CAPS })
    const keys = secondaryActions(row, primary, CAPS).map((a) => a.key)
    expect(keys).not.toContain(primary.key)
    expect(keys).toEqual(['promise', 'call', 'remind'])
    const sent = inv({ overdue_days: 9, current_dunning: 'D-1' })
    const resend = secondaryActions(
      sent,
      invoiceAction(sent, { caps: CAPS }),
      CAPS,
    )
    expect(resend.find((a) => a.key === 'resend').dunning).toBe('D-1')
  })
})

describe('Cobranza queue chips', () => {
  it('aging reads in days and tones by ladder step', () => {
    expect(agingLabel({ oldest_overdue_days: 12 }, '2026-10-06')).toBe(
      'Overdue 12 days',
    )
    expect(agingLabel({ oldest_overdue_days: 1 }, '2026-10-06')).toBe(
      'Overdue 1 day',
    )
    expect(
      agingLabel(
        { oldest_overdue_days: 0, next_due: '2026-10-06' },
        '2026-10-06',
      ),
    ).toBe('Due today')
    expect(agingTone({ oldest_overdue_days: 15 })).toBe('red')
    expect(agingTone({ oldest_overdue_days: 2 })).toBe('orange')
    expect(agingTone({ oldest_overdue_days: 0 })).toBe('gray')
  })

  it('promise and reminder chips', () => {
    expect(promiseChip({ state: 'broken' }).theme).toBe('red')
    expect(promiseChip({ state: 'partial', paid: 400 }, 'MXN').label).toContain(
      '400',
    )
    expect(
      promiseChip({ state: 'open', amount: 500, date: '2026-10-09' }, 'MXN')
        .label,
    ).toContain('2026-10-09')
    expect(promiseChip(null)).toBeNull()
    expect(
      reminderChip({
        label: 'Segundo aviso',
        date: '2026-10-02',
        delivery: { state: 'read', label: 'Leído' },
      }),
    ).toEqual({ label: 'Segundo aviso · 2026-10-02 · Leído', theme: 'green' })
    expect(reminderChip({ label: 'Aviso final', date: 'x' }).label).toContain(
      'Not sent yet',
    )
  })

  it('due soon is within a week and never for overdue invoices', () => {
    const rows = withDueSoon(
      [
        inv({ name: 'a', next_due: '2026-10-13' }),
        inv({ name: 'b', next_due: '2026-10-14' }),
        inv({ name: 'c', next_due: '2026-10-07', overdue_days: 3 }),
      ],
      '2026-10-06',
    )
    expect(rows.map((r) => r.due_soon)).toEqual([true, false, false])
  })

  it('segments fall back to Vencidas', () => {
    expect(normalizeSegment('promesas')).toBe('promesas')
    expect(normalizeSegment('x')).toBe('vencidas')
  })
})

describe('Return from the register', () => {
  it('reads only a Payment Entry done reference', () => {
    expect(parsePaymentDone('Payment Entry:ACC-PAY-2026-00001')).toEqual({
      doctype: 'Payment Entry',
      name: 'ACC-PAY-2026-00001',
    })
    expect(parsePaymentDone('Sales Invoice:X')).toBeNull()
    expect(parsePaymentDone('nonsense')).toBeNull()
    expect(parsePaymentDone(undefined)).toBeNull()
  })

  it('next customer skips the current one', () => {
    const rows = [{ customer: 'A' }, { customer: 'B' }]
    expect(nextCustomer(rows, 'A').customer).toBe('B')
    expect(nextCustomer([{ customer: 'A' }], 'A')).toBeNull()
  })

  it('collect link carries the Cobranza record as a safe return', () => {
    const href = posCollectHref(
      { name: 'SINV-1', customer: 'Ana' },
      {
        returnTo: '/crm/cobranza/cliente/Ana?company=Doco',
        returnLabel: 'Cobranza',
      },
    )
    const params = new URL(href, 'https://x.invalid').searchParams
    expect(href.startsWith('/posapp/payments?')).toBe(true)
    expect(params.get('return_to')).toBe(
      '/crm/cobranza/cliente/Ana?company=Doco',
    )
    expect(params.get('return_label')).toBe('Cobranza')
    for (const bad of [
      '//evil.invalid/crm/x',
      '/posapp/x',
      'https://e.invalid/crm/',
    ])
      expect(posCollectHref({ name: 'S' }, { returnTo: bad })).not.toContain(
        'return_to',
      )
  })
})
