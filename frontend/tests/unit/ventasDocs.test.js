import { describe, expect, it } from 'vitest'
import {
  nextActions,
  normalizeCommercialDocs,
  paidPercent,
  posCollectHref,
  posReturnHref,
  safeReturnPath,
  statusLabel,
} from '@/utils/ventasDocs'

const ALL = {
  can_write: true,
  can_confirm_order: true,
  can_invoice: true,
  can_issue_invoice: true,
  has_pos: true,
}
const deal = (row, caps = ALL, extra = {}) =>
  nextActions(row, { scope: 'deal', caps, ...extra })
const row = (over) => ({
  doctype: 'Quotation',
  name: 'DOC-1',
  status: '',
  docstatus: 0,
  outstanding: 0,
  isReturn: false,
  perBilled: 0,
  customer: 'CUST-1',
  ...over,
})

describe('normalizeCommercialDocs', () => {
  it('splits deal returns into credit notes and keeps capabilities', () => {
    const model = normalizeCommercialDocs({
      quotations: [{ name: 'Q-1', docstatus: 1, grand_total: 100 }],
      sales_orders: [],
      invoices: [
        {
          doctype: 'Sales Invoice',
          name: 'SI-1',
          docstatus: 1,
          grand_total: 100,
          outstanding_amount: 40,
          is_return: 0,
          modified: '2026-10-05 10:00:00.000001',
        },
        {
          doctype: 'Sales Invoice',
          name: 'SI-2',
          docstatus: 1,
          grand_total: -20,
          is_return: 1,
        },
      ],
      payments: [
        { name: 'PE-1', allocated_amount: 60, payment_type: 'Receive' },
      ],
      rollup: { invoiced: 100, paid: 60, outstanding: 40, currency: 'MXN' },
      capabilities: ALL,
    })
    expect(model.groups.map((g) => g.key)).toEqual([
      'quotations',
      'invoices',
      'credit_notes',
      'payments',
    ])
    const invoice = model.groups[1].rows[0]
    expect(invoice).toMatchObject({
      doctype: 'Sales Invoice',
      outstanding: 40,
      modified: '2026-10-05 10:00:00.000001',
    })
    expect(model.groups[2].rows[0].isReturn).toBe(true)
    expect(model.groups[3].rows[0]).toMatchObject({
      doctype: 'Payment Entry',
      amount: 60,
      docstatus: 1,
    })
    expect(model.capabilities).toEqual(ALL)
    expect(model.counters.find((c) => c.key === 'outstanding').amount).toBe(40)
  })

  it('reads the contact shape with truncation totals', () => {
    const model = normalizeCommercialDocs({
      quotations: [],
      sales_orders: [{ name: 'SO-1', docstatus: 1, grand_total: 5 }],
      invoices: [],
      credit_notes: [{ doctype: 'POS Invoice', name: 'R-1', is_return: 1 }],
      payments: [],
      rollup: { outstanding: null, by_currency: [] },
      truncated: { sales_orders: { shown: 1, total: 140, is_truncated: true } },
    })
    expect(model.groups.map((g) => g.key)).toEqual([
      'sales_orders',
      'credit_notes',
    ])
    expect(model.counters.find((c) => c.key === 'sales_orders').count).toBe(140)
    // mixed currencies: no single balance is invented
    expect(model.counters.find((c) => c.key === 'outstanding').amount).toBe(
      null,
    )
    expect(model.capabilities).toBe(null)
  })

  it('is empty, not broken, without documents', () => {
    expect(normalizeCommercialDocs({}).empty).toBe(true)
    expect(normalizeCommercialDocs(null)).toBe(null)
  })
})

describe('nextActions — one primary step per document state', () => {
  it('walks the chain quote → order → invoice → collection', () => {
    expect(deal(row({ docstatus: 0 })).primary.key).toBe('edit_quote')
    expect(deal(row({ docstatus: 1, status: 'Open' })).primary.key).toBe(
      'accept_quote',
    )
    expect(deal(row({ docstatus: 1, status: 'Ordered' })).primary).toBe(null)
    const so = { doctype: 'Sales Order' }
    expect(deal(row({ ...so, docstatus: 0 })).primary.method).toBe(
      'confirm_sales_order',
    )
    expect(
      deal(row({ ...so, docstatus: 1, status: 'To Deliver and Bill' })).primary
        .method,
    ).toBe('make_invoice')
    expect(
      deal(row({ ...so, docstatus: 1, status: 'Completed', perBilled: 100 }))
        .primary,
    ).toBe(null)
    const si = { doctype: 'Sales Invoice' }
    expect(deal(row({ ...si, docstatus: 0 })).primary.method).toBe(
      'issue_invoice',
    )
    const unpaid = deal(row({ ...si, docstatus: 1, outstanding: 50 }))
    expect(unpaid.primary.key).toBe('collect')
    expect(unpaid.primary.href).toContain('/posapp/payments?')
    expect(unpaid.secondary.map((a) => a.key)).toEqual(['return', 'view'])
    const paid = deal(row({ ...si, docstatus: 1, status: 'Paid' }))
    expect(paid.primary).toBe(null)
    expect(paid.secondary.map((a) => a.key)).toEqual(['return', 'view'])
  })

  it('explains a missing right instead of hiding the step', () => {
    const confirm = deal(row({ doctype: 'Sales Order', docstatus: 0 }), {
      ...ALL,
      can_confirm_order: false,
    }).primary
    expect(confirm.disabled).toBe(true)
    expect(confirm.reason).toBeTruthy()
    expect(confirm.resolve.key).toBe('copy_request')
    const invoice = deal(
      row({ doctype: 'Sales Order', docstatus: 1, status: 'To Bill' }),
      { ...ALL, can_invoice: false },
    ).primary
    expect(invoice.disabled).toBe(true)
    const readOnly = deal(row({ docstatus: 0 }), {
      ...ALL,
      can_write: false,
    }).primary
    expect(readOnly.disabled).toBe(true)
  })

  it('without POS the collection step says why and offers the folio', () => {
    const out = deal(
      row({ doctype: 'Sales Invoice', docstatus: 1, outstanding: 9 }),
      { ...ALL, has_pos: false },
    )
    expect(out.primary.disabled).toBe(true)
    expect(out.primary.resolve.key).toBe('copy_folio')
    expect(out.secondary.map((a) => a.key)).toEqual(['view'])
  })

  it('offers the payment link only where a composer exists', () => {
    const r = row({ doctype: 'Sales Invoice', docstatus: 1, outstanding: 9 })
    expect(deal(r).secondary.map((a) => a.key)).not.toContain('payment_link')
    expect(
      deal(r, ALL, { paymentLink: true }).secondary.map((a) => a.key),
    ).toContain('payment_link')
  })

  it('contact scope never offers deal-bound actions', () => {
    const contact = (r) => nextActions(r, { scope: 'contact', caps: {} })
    expect(contact(row({ docstatus: 0 })).primary).toBe(null)
    expect(contact(row({ doctype: 'Sales Order', docstatus: 0 })).primary).toBe(
      null,
    )
    const pos = contact(
      row({ doctype: 'POS Invoice', docstatus: 1, outstanding: 3 }),
    )
    expect(pos.primary.key).toBe('collect')
    expect(pos.secondary.find((a) => a.key === 'return').href).toBe(
      '/posapp?return_sale=DOC-1&return_doctype=POS%20Invoice',
    )
  })

  it('returns and cancelled documents only open the viewer', () => {
    const credit = deal(
      row({ doctype: 'Sales Invoice', docstatus: 1, isReturn: true }),
    )
    expect(credit.primary).toBe(null)
    expect(credit.secondary.map((a) => a.key)).toEqual(['view'])
    expect(deal(row({ docstatus: 2 })).secondary.map((a) => a.key)).toEqual([
      'view',
    ])
    expect(
      deal(row({ doctype: 'Payment Entry', docstatus: 1 })).secondary,
    ).toEqual([])
  })
})

describe('blocked and shared documents keep a way forward', () => {
  it('collection is an assisted hand-off naming the exact invoice', () => {
    const out = deal(
      row({
        doctype: 'Sales Invoice',
        name: 'SI-9',
        docstatus: 1,
        outstanding: 50,
        customer: 'Ana',
      }),
    )
    expect(out.primary.kind).toBe('handoff')
    expect(out.primary.href).toContain('invoice=SI-9')
    // POS does not preselect it yet: the worker is told what to pick
    expect(out.primary.assist).toContain('SI-9')
    expect(out.primary.assist).toContain('Ana')
  })

  it('a held or closed order offers «resume», not only «view»', () => {
    for (const status of ['On Hold', 'Closed']) {
      const out = deal(row({ doctype: 'Sales Order', docstatus: 1, status }))
      expect(out.primary.method).toBe('reopen_sales_order')
      expect(out.primary.reason).toBe(true)
      expect(out.primary.blocked).toContain(
        status === 'On Hold' ? 'hold' : 'closed',
      )
    }
    const denied = deal(
      row({ doctype: 'Sales Order', docstatus: 1, status: 'On Hold' }),
      { ...ALL, can_confirm_order: false },
    ).primary
    expect(denied.disabled).toBe(true)
    expect(denied.resolve.key).toBe('copy_request')
  })

  it('an invoice shared with other deals is not opened or issued from here', () => {
    const shared = deal(
      row({
        doctype: 'Sales Invoice',
        docstatus: 0,
        mixed: true,
        viewable: false,
      }),
    )
    expect(shared.primary.disabled).toBe(true)
    expect(shared.primary.reason).toMatch(/other deals/)
    expect(shared.secondary.map((a) => a.key)).not.toContain('view')
    const normalized = normalizeCommercialDocs({
      invoices: [
        { name: 'SI-M', grand_total: 60, mixed: 1, viewable: 0, docstatus: 1 },
      ],
    }).groups[0].rows[0]
    expect(normalized).toMatchObject({ mixed: true, viewable: false })
  })

  it('refuses encoded dot segments in return paths', () => {
    for (const bad of [
      '/crm/%2e%2e/login',
      '/crm/%2E/x',
      '/crm/a%5cb',
      '/crm/%00',
    ])
      expect(safeReturnPath(bad)).toBe('')
    expect(safeReturnPath('/crm/ventas/deal/D%201')).toBe(
      '/crm/ventas/deal/D%201',
    )
  })
})

describe('POS hand-offs', () => {
  it('carries a validated return path and a short label', () => {
    const href = posCollectHref(
      { doctype: 'Sales Invoice', name: 'SI/1', customer: 'Ana & Co' },
      {
        returnTo: '/crm/ventas/deal/D-1?tab=overview',
        returnLabel: 'x'.repeat(60),
      },
    )
    const params = new URL(href, 'https://x.invalid').searchParams
    expect(params.get('invoice')).toBe('SI/1')
    expect(params.get('customer')).toBe('Ana & Co')
    expect(params.get('return_to')).toBe('/crm/ventas/deal/D-1?tab=overview')
    expect(params.get('return_label')).toHaveLength(40)
  })

  it('drops unsafe return paths', () => {
    for (const bad of [
      'https://evil.invalid/crm/',
      '//evil.invalid/crm/',
      '/crm/../desk',
      '/crm/./x',
      '/posapp/',
      '/crm/a\\b',
      '/crm/\u0001',
    ])
      expect(safeReturnPath(bad)).toBe('')
    expect(safeReturnPath('/crm/inbox?deal=1')).toBe('/crm/inbox?deal=1')
    const href = posCollectHref(
      { doctype: 'Sales Invoice', name: 'SI-1' },
      { returnTo: '//evil.invalid/crm/' },
    )
    expect(href).not.toContain('return_to')
  })

  it('only allowlisted doctypes get a return link', () => {
    expect(posReturnHref({ doctype: 'Sales Order', name: 'SO-1' })).toBe('')
    expect(posReturnHref({ doctype: 'Sales Invoice', name: 'A B' })).toBe(
      '/posapp?return_sale=A%20B&return_doctype=Sales%20Invoice',
    )
  })
})

describe('status and rollup', () => {
  it('labels drafts, cancellations and payments', () => {
    expect(statusLabel(row({ docstatus: 0, status: 'Open' }))).toBe('Draft')
    expect(statusLabel(row({ docstatus: 2 }))).toBe('Cancelled')
    expect(
      statusLabel({
        doctype: 'Payment Entry',
        docstatus: 1,
        paymentType: 'Pay',
      }),
    ).toBe('Refund')
  })
  it('bounds the paid share', () => {
    expect(paidPercent({ invoiced: 0 })).toBe(0)
    expect(paidPercent({ invoiced: 100, paid: 140 })).toBe(100)
    expect(paidPercent({ invoiced: 200, paid: 50 })).toBe(25)
  })
})
