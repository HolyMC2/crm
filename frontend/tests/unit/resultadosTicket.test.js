import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('frappe-ui', () => ({ call: vi.fn(), toast: {} }))

import {
  itemCount,
  localDay,
  ticketChips,
  ticketCustomer,
  ticketDetails,
  ticketLine,
  ticketProfit,
  ticketRepair,
  ticketSteps,
  ticketTotals,
} from '../../src/composables/resultadosTicket.js'

const TODAY = '2026-11-17'
const money = (n) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'MXN',
  }).format(n)

// A repair ticket as crm.api.resultados.document sends it.
function ticket(extra = {}) {
  return {
    doctype: 'Sales Invoice',
    name: 'ACC-SINV-2026-03526',
    docstatus: 1,
    owner: 'jeydici',
    header: {
      status: 'Paid',
      customer: 'Alfredo Oleta',
      customer_name: 'Alfredo Oleta Toledo',
      pos_profile: 'Doco Ventas',
      currency: 'MXN',
      total: 350,
      net_total: 301.72,
      total_taxes_and_charges: 48.28,
      grand_total: 350,
      rounded_total: 350,
      outstanding_amount: 0,
      total_qty: 1,
      ...extra.header,
    },
    items: [
      {
        item_code: 'MO-1',
        item_name: 'Mano de obra',
        qty: 1,
        rate: 350,
        amount: 350,
        price_list_rate: 350,
      },
    ],
    payments: [
      { mode_of_payment: 'Cash', amount: 350 },
      { mode_of_payment: 'Credit Card', amount: 0 },
    ],
    taxes: [
      {
        description: 'IVA 16% (incluido)',
        tax_amount: 48.28,
        included_in_print_rate: 1,
      },
    ],
    register: { pos: true, return_until: '2026-11-19' },
    cfdi: {
      stamped: false,
      self_billing_url: 'https://x.invalid/facturacion?folio=A&total=350.00',
    },
    ...extra,
  }
}

describe('the ticket hero', () => {
  it('says how it was paid, that it has no invoice and until when it can be returned', () => {
    const chips = ticketChips(ticket(), TODAY)
    expect(chips.map((c) => c.key)).toEqual(['paid', 'cfdi', 'return'])
    expect(chips[0].label).toBe('Cash')
    expect(chips[1].label).toBe('No invoice yet')
    expect(chips[2].label).toMatch(/^Returnable until /)
  })

  it('a closed return window and a stamped sale read as such', () => {
    const chips = ticketChips(
      ticket({
        cfdi: { stamped: true },
        register: { pos: true, return_until: '2026-11-01' },
      }),
      TODAY,
    )
    expect(chips.find((c) => c.key === 'cfdi').label).toBe('Invoiced (CFDI)')
    expect(chips.find((c) => c.key === 'return').label).toBe(
      'Return window closed',
    )
  })

  it('names the credit provider of a financed sale', () => {
    const chips = ticketChips(
      ticket({ header: { is_financed: 1, credit_provider: 'PayJoy' } }),
      TODAY,
    )
    expect(chips.find((c) => c.key === 'credit').label).toBe(
      'On credit with PayJoy',
    )
  })

  it('counts items in the singular and plural', () => {
    expect(itemCount(1)).toBe('1 item')
    expect(itemCount(3)).toBe('3 items')
  })

  it('today is the device calendar day', () => {
    expect(localDay(new Date(2026, 10, 7, 23, 50))).toBe('2026-11-07')
  })
})

describe('what was sold', () => {
  it('a single piece shows no «1 × price» line; a discount and its cost do', () => {
    const plain = ticketLine(ticket().items[0], null, 'MXN')
    expect(plain.detail).toBe('')
    expect(plain.cost).toBe('')
    const line = ticketLine(
      {
        item_name: 'Funda',
        qty: 2,
        rate: 80,
        price_list_rate: 100,
        uom: 'Nos',
      },
      { cost: 60, margin: 77.93 },
      'MXN',
    )
    expect(line.detail).toContain(money(80))
    expect(line.discount).toBe(`${money(40)} off the list price`)
    expect(line.cost).toBe(`Cost ${money(60)} · profit ${money(77.93)}`)
    expect(line.loss).toBe(false)
    expect(ticketLine({ qty: 1 }, { cost: 90, margin: -10 }, 'MXN').loss).toBe(
      true,
    )
  })
})

describe('the payment block', () => {
  it('shows the tax included, the total and nothing owed', () => {
    const rows = ticketTotals(ticket())
    expect(rows.map((r) => r.key)).toEqual(['tax0', 'total'])
    expect(rows[0]).toMatchObject({
      label: 'IVA 16% (incluido)',
      amount: 48.28,
      quiet: true,
    })
  })

  it('a discount shows what it was before, the discount, the change and what is owed', () => {
    const rows = ticketTotals(
      ticket({
        header: {
          total: 400,
          discount_amount: 50,
          additional_discount_percentage: 12.5,
          grand_total: 350,
          change_amount: 50,
          outstanding_amount: 100,
        },
        taxes: [],
      }),
    )
    expect(rows.map((r) => [r.key, r.amount])).toEqual([
      ['before', 400],
      ['discount', -50],
      ['change', 50],
      ['total', 350],
      ['owed', 100],
    ])
    expect(rows[1].label).toBe('Discount, 12.5 %')
  })

  it('a cash closing has no ticket totals', () => {
    expect(ticketTotals({ doctype: 'POS Closing Shift', header: {} })).toEqual(
      [],
    )
  })
})

describe('the profit, for whom sees cost', () => {
  it('adds up: the costed lines without tax, their cost and the profit', () => {
    const p = ticketProfit(
      {
        net: 1422.41,
        cost: 450,
        margin: 843.1,
        margin_pct: 65.2,
        uncosted: 1,
        provider: 0,
        credit_unknown: false,
      },
      'MXN',
    )
    expect(p.headline).toBe(`Profit ${money(843.1)} · 65.2 %`)
    expect(p.rows.map((r) => [r.key, r.amount])).toEqual([
      ['costed', 1293.1],
      ['cost', -450],
      ['profit', 843.1],
    ])
    expect(p.notes[0]).toBe(
      `Plus ${money(129.31)} of labour or services, which have no cost.`,
    )
  })

  it('a ticket of labour only has nothing to compare', () => {
    const p = ticketProfit(
      { net: 301.72, cost: 0, margin: 0, margin_pct: null, uncosted: 1 },
      'MXN',
    )
    expect(p.rows).toEqual([])
    expect(p.headline).toBe('No cost to compare')
  })

  it('a loss reads as one and a credit sale says what it leaves out', () => {
    const p = ticketProfit(
      {
        net: 465,
        cost: 3000,
        margin: -2535,
        margin_pct: -545,
        credit_unknown: true,
      },
      'MXN',
    )
    expect(p.loss).toBe(true)
    expect(p.notes).toContain(
      'The credit price was never captured, so what the provider pays is left out.',
    )
  })

  it('nobody without margin gets a block', () => {
    expect(ticketProfit(undefined, 'MXN')).toBe(null)
  })
})

describe('the customer and the repair', () => {
  it('a regular reads their purchases, last visit, repairs and what they owe', () => {
    const c = ticketCustomer(
      {
        customer: 'C-1',
        name: 'Alfredo Oleta Toledo',
        tickets: 6,
        spent: 4250,
        since: '2025-03-02',
        previous: '2026-10-02',
        owed: 300,
      },
      { customer_orders: { count: 3, open: 1 } },
      'MXN',
    )
    expect(c.facts[0]).toBe(`6 purchases · ${money(4250)}`)
    expect(c.facts[1]).toMatch(/^Previous visit /)
    expect(c.facts[2]).toMatch(/^Customer since /)
    expect(c.facts[3]).toBe('3 repairs · 1 open')
    expect(c.owed).toBe(`Owes ${money(300)}`)
  })

  it('a first-time buyer says so; the walk-in customer has no block', () => {
    const c = ticketCustomer(
      { name: 'Ana', tickets: 1, spent: 350 },
      null,
      'MXN',
    )
    expect(c.facts).toEqual(['First purchase'])
    expect(c.owed).toBe('')
    expect(ticketCustomer(null, null, 'MXN')).toBe(null)
  })

  it('the repair names the device, the work, the people and the warranty', () => {
    const r = ticketRepair(
      {
        name: 'RO-02230',
        device: 'Apple iPhone 12',
        identifiers: [{ kind: 'IMEI', value: '353207809426830' }],
        status: 'Entregado',
        fault: 'No carga',
        work: 'Cambio de centro de carga',
        technician: 'Luis',
        received_by: 'Karla',
        delivered_by: 'Jeydici',
        received_on: '2026-11-10',
        delivered_on: '2026-11-17',
        warranty_until: '2026-12-02',
        parts: [{ item_name: 'Centro de carga', qty: 1, cost: 140 }],
        parts_cost: 140,
      },
      'MXN',
      TODAY,
    )
    expect(r.device).toBe('Apple iPhone 12')
    expect(r.identifiers).toEqual(['IMEI 353207809426830'])
    expect(r.facts.map((f) => f.label)).toEqual(['Reported', 'Work done'])
    expect(r.people).toBe(
      'Received by Karla · Repaired by Luis · Delivered by Jeydici',
    )
    expect(r.warrantyOn).toBe(true)
    expect(r.warranty).toMatch(/^Warranty until /)
    expect(r.parts).toEqual([{ name: 'Centro de carga', cost: money(140) }])
    // One part is its own total.
    expect(r.partsCost).toBe('')
    const two = ticketRepair(
      {
        parts: [
          { item_name: 'Pantalla', qty: 1, cost: 900 },
          { item_name: 'Tornillos', qty: 4, cost: 20 },
        ],
        parts_cost: 920,
      },
      'MXN',
      TODAY,
    )
    expect(two.partsCost).toBe(money(920))
    expect(two.parts[1].name).toBe('Tornillos × 4')
  })

  it('an expired warranty and one counted from delivery', () => {
    expect(
      ticketRepair({ warranty_until: '2026-10-01' }, 'MXN', TODAY).warranty,
    ).toMatch(/^Warranty ended /)
    const pending = ticketRepair({ warranty_days: 15 }, 'MXN', TODAY)
    expect(pending.warranty).toBe('15 days of warranty from delivery')
    expect(pending.partsCost).toBe('')
  })
})

describe('the ticket details', () => {
  it('lists the folio to copy, who sold it and the pieces, never what the hero says', () => {
    const rows = ticketDetails(
      ticket({ sales_team: [{ sales_person: 'Jessica' }] }),
    )
    expect(rows.map((r) => [r.key, r.value])).toEqual([
      ['folio', 'ACC-SINV-2026-03526'],
      ['sellers', 'Jessica'],
      ['qty', '1'],
    ])
    expect(rows[0].copy).toBe(true)
  })
})

describe('the bolt', () => {
  const ctx = {
    pos: true,
    canPrint: true,
    today: TODAY,
    returnTo: '/crm/resultados/documento/Sales%20Invoice/A',
    returnLabel: 'Alfredo',
    repairHref: '/taller/orders/RO-1',
  }

  it('a paid repair ticket: print, invoice, send the link, return, open the repair', () => {
    expect(ticketSteps(ticket(), ctx).map((s) => s.key)).toEqual([
      'print',
      'invoice',
      'invoice_link',
      'return',
      'repair',
    ])
    const steps = ticketSteps(ticket(), ctx)
    expect(steps.find((s) => s.key === 'invoice').external).toBe(true)
    expect(steps.find((s) => s.key === 'return').href).toBe(
      '/posapp?return_sale=ACC-SINV-2026-03526&return_doctype=Sales%20Invoice',
    )
    expect(steps.find((s) => s.key === 'invoice_link').share.url).toContain(
      '/facturacion?',
    )
  })

  it('money owed leads with collecting at the register, and comes back here', () => {
    const steps = ticketSteps(
      ticket({ header: { outstanding_amount: 100 } }),
      ctx,
    )
    expect(steps[0].key).toBe('collect')
    const url = new URL(steps[0].href, 'https://x.invalid')
    expect(url.pathname).toBe('/posapp/payments')
    expect(url.searchParams.get('invoice')).toBe('ACC-SINV-2026-03526')
    expect(url.searchParams.get('return_to')).toBe(ctx.returnTo)
  })

  it('no register, a closed window, a stamped or returned sale leave those steps out', () => {
    const keys = (doc, extra = {}) =>
      ticketSteps(doc, { ...ctx, ...extra }).map((s) => s.key)
    expect(keys(ticket(), { pos: false })).not.toContain('return')
    expect(
      keys(ticket({ register: { pos: true, return_until: '2026-11-01' } })),
    ).not.toContain('return')
    expect(keys(ticket({ cfdi: { stamped: true } }))).not.toContain('invoice')
    expect(keys(ticket({ header: { is_return: 1 } }))).not.toContain('return')
    expect(keys(ticket(), { canPrint: false })).not.toContain('print')
    expect(keys({ ...ticket(), docstatus: 2 }, { repairHref: null })).toEqual([
      'print',
      'invoice',
      'invoice_link',
    ])
  })
})

describe('es.po', () => {
  const po = readFileSync(
    resolve(__dirname, '../../../crm/locale/es.po'),
    'utf8',
  )
  const source = readFileSync(
    resolve(__dirname, '../../src/composables/resultadosTicket.js'),
    'utf8',
  )

  it('translates every string the ticket shows', () => {
    const keys = [...source.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1])
    expect(keys.length).toBeGreaterThan(40)
    for (const key of keys)
      expect(po, key).toContain(`msgctxt "Resultados"\nmsgid "${key}"\n`)
  })
})
