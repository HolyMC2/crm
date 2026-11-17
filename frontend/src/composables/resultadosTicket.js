// The ticket page in Resultados (/crm/resultados/documento/Sales Invoice/…):
// what each section says and which steps the bolt offers, from the ticket the
// server sent (crm.api.resultados.document: Mercado's summary, its margin for
// whom sees cost, the customer, the CFDI, the register and the apps' blocks).
// Pure, so tests read what the worker reads.
import { money } from '@/composables/useCompras'
import { CTX, tr } from '@/composables/useResultados'
import { formatDay } from '@/utils/contactos'
import { formatQty } from '@/utils/display'
import { modeOfPaymentLabel } from '@/utils/modeOfPayment'
import { posCollectHref, posReturnHref } from '@/utils/posHandoff'

const EPS = 0.005
const num = (value) => Number(value) || 0
const t = (message, replace) => tr(message, replace, CTX)

/** Today as the device's calendar day («2026-11-17»). */
export function localDay(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function isSale(doc) {
  return doc?.doctype === 'Sales Invoice' && doc?.docstatus === 1
}

/** «1 item», «3 items». */
export function itemCount(count) {
  return count === 1 ? t('1 item') : t('{0} items', [count])
}

/** The quiet chips under the amount: how it was paid, credit, CFDI, returns. */
export function ticketChips(doc, today = localDay()) {
  const h = doc?.header || {}
  const out = []
  const modes = [
    ...new Set(
      (doc?.payments || [])
        .filter((p) => Math.abs(num(p.amount)) > EPS)
        .map((p) => p.mode_of_payment)
        .filter(Boolean),
    ),
  ]
  if (modes.length)
    out.push({
      key: 'paid',
      icon: 'lucide-wallet',
      label: modes.map(modeOfPaymentLabel).join(' + '),
    })
  if (num(h.is_financed))
    out.push({
      key: 'credit',
      icon: 'lucide-landmark',
      label: h.credit_provider
        ? t('On credit with {0}', [h.credit_provider])
        : t('On credit'),
    })
  if (doc?.cfdi && isSale(doc) && !num(h.is_return))
    out.push({
      key: 'cfdi',
      icon: 'lucide-receipt',
      label: doc.cfdi.stamped ? t('Invoiced (CFDI)') : t('No invoice yet'),
    })
  const until = doc?.register?.return_until
  if (until && isSale(doc) && !num(h.is_return))
    out.push({
      key: 'return',
      icon: 'lucide-undo-2',
      label:
        until >= today
          ? t('Returnable until {0}', [formatDay(until)])
          : t('Return window closed'),
    })
  return out
}

/** One line of «What was sold», with its cost when the reader sees margin. */
export function ticketLine(item, cost, currency) {
  const qty = num(item.qty)
  const rate = num(item.rate)
  const list = num(item.price_list_rate)
  const off = list > rate + EPS ? (list - rate) * qty : 0
  return {
    title: item.item_name || item.item_code || '',
    detail:
      item.qty !== undefined && qty !== 1
        ? `${formatQty(qty, item.uom || item.stock_uom)} × ${money(rate, currency)}`
        : '',
    discount: off ? t('{0} off the list price', [money(off, currency)]) : '',
    cost:
      cost && cost.cost !== null && cost.cost !== undefined
        ? t('Cost {0} · profit {1}', [
            money(cost.cost, currency),
            money(cost.margin, currency),
          ])
        : '',
    loss: num(cost?.margin) < -EPS,
    image: item.image || '',
  }
}

/** The payment block's rows after the tenders: before the discount, the
 * discount, the taxes, the change, the total and what is still owed. */
export function ticketTotals(doc) {
  const h = doc?.header
  if (!h || doc?.doctype !== 'Sales Invoice') return []
  const out = []
  const discount = num(h.discount_amount)
  if (discount > EPS) {
    out.push({
      key: 'before',
      label: t('Before the discount'),
      amount: num(h.total) || num(h.grand_total) + discount,
      quiet: true,
    })
    const pct = num(h.additional_discount_percentage)
    out.push({
      key: 'discount',
      label: pct ? t('Discount, {0} %', [pct]) : t('Discount'),
      amount: -discount,
      quiet: true,
    })
  }
  ;(doc.taxes || []).forEach((tax, i) => {
    if (Math.abs(num(tax.tax_amount)) < EPS) return
    out.push({
      key: `tax${i}`,
      label: tax.description || t('Taxes'),
      amount: num(tax.tax_amount),
      quiet: true,
    })
  })
  const change = num(h.change_amount)
  if (change > EPS)
    out.push({ key: 'change', label: t('Change given'), amount: change })
  out.push({
    key: 'total',
    label: t('Total'),
    amount: h.rounded_total || h.grand_total || 0,
  })
  const owed = num(h.outstanding_amount)
  if (owed > EPS)
    out.push({ key: 'owed', label: t('Still owed'), amount: owed })
  return out
}

/** The profit block for whom sees margin: the costed lines without tax,
 * their cost, the profit, and what the figure leaves out. */
export function ticketProfit(margin, currency) {
  if (!margin) return null
  const cost = num(margin.cost)
  const profit = num(margin.margin)
  const costed = profit + cost
  const rest = num(margin.net) - costed
  const notes = []
  if (num(margin.provider) > EPS)
    notes.push(
      t('Includes {0} the credit provider pays.', [
        money(margin.provider, currency),
      ]),
    )
  if (margin.credit_unknown)
    notes.push(
      t(
        'The credit price was never captured, so what the provider pays is left out.',
      ),
    )
  if (margin.margin_pct === null || margin.margin_pct === undefined)
    return {
      headline: t('No cost to compare'),
      rows: [],
      notes: [
        t('Nothing on this ticket has a cost (labour or services).'),
        ...notes,
      ],
      loss: false,
    }
  if (rest > EPS)
    notes.unshift(
      t('Plus {0} of labour or services, which have no cost.', [
        money(rest, currency),
      ]),
    )
  return {
    headline: t('Profit {0} · {1} %', [
      money(profit, currency),
      margin.margin_pct,
    ]),
    rows: [
      { key: 'costed', label: t('Sold, without tax'), amount: costed },
      { key: 'cost', label: t('What it cost'), amount: -cost },
      { key: 'profit', label: t('Profit'), amount: profit, strong: true },
    ],
    notes,
    loss: profit < -EPS,
  }
}

function monthYear(day) {
  const [year, month] = String(day || '')
    .slice(0, 7)
    .split('-')
    .map(Number)
  if (!year || !month) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

/** Who bought: their purchases with the shop, the visit before this one,
 * how long they have been a customer, their repairs and what they owe. */
export function ticketCustomer(customer, repair, currency) {
  if (!customer) return null
  const facts = []
  const tickets = num(customer.tickets)
  if (tickets > 1)
    facts.push(
      t('{0} purchases · {1}', [tickets, money(customer.spent, currency)]),
    )
  else if (tickets === 1) facts.push(t('First purchase'))
  if (customer.previous)
    facts.push(t('Previous visit {0}', [formatDay(customer.previous)]))
  if (customer.since && tickets > 1)
    facts.push(t('Customer since {0}', [monthYear(customer.since)]))
  const orders = repair?.customer_orders
  if (orders?.count)
    facts.push(
      orders.open
        ? t('{0} repairs · {1} open', [orders.count, orders.open])
        : orders.count === 1
          ? t('1 repair')
          : t('{0} repairs', [orders.count]),
    )
  return {
    name: customer.name || customer.customer,
    facts,
    owed:
      num(customer.owed) > EPS
        ? t('Owes {0}', [money(customer.owed, currency)])
        : '',
  }
}

/** The repair an invoice charged, in the order page's words. */
export function ticketRepair(repair, currency, today = localDay()) {
  if (!repair) return null
  const people = [
    repair.received_by && t('Received by {0}', [repair.received_by]),
    repair.technician && t('Repaired by {0}', [repair.technician]),
    repair.delivered_by && t('Delivered by {0}', [repair.delivered_by]),
  ].filter(Boolean)
  const dates = [
    repair.received_on && t('In {0}', [formatDay(repair.received_on)]),
    repair.delivered_on && t('Out {0}', [formatDay(repair.delivered_on)]),
  ].filter(Boolean)
  let warranty = ''
  let warrantyOn = false
  if (repair.warranty_until) {
    warrantyOn = repair.warranty_until >= today
    warranty = warrantyOn
      ? t('Warranty until {0}', [formatDay(repair.warranty_until)])
      : t('Warranty ended {0}', [formatDay(repair.warranty_until)])
  } else if (num(repair.warranty_days))
    warranty = t('{0} days of warranty from delivery', [repair.warranty_days])
  return {
    name: repair.name,
    device: repair.device || t('Device'),
    identifiers: (repair.identifiers || []).map(
      (id) => `${id.kind || 'IMEI'} ${id.value}`,
    ),
    status: repair.status || '',
    facts: [
      repair.fault && {
        key: 'fault',
        label: t('Reported'),
        value: repair.fault,
      },
      repair.work && { key: 'work', label: t('Work done'), value: repair.work },
    ].filter(Boolean),
    people: people.join(' · '),
    dates: dates.join(' · '),
    warranty,
    warrantyOn,
    claim: repair.is_warranty_claim ? t('This was a warranty claim') : '',
    parts: (repair.parts || []).map((part) => ({
      name:
        num(part.qty) !== 1
          ? `${part.item_name} × ${formatQty(part.qty)}`
          : part.item_name,
      cost: money(part.cost, currency),
    })),
    // One part's cost is its own line; the sum reads only over several.
    partsCost:
      repair.parts_cost !== undefined && (repair.parts || []).length > 1
        ? money(repair.parts_cost, currency)
        : '',
  }
}

/** The ticket's facts the hero does not show (it names the register and
 * who rang it up), as label and value. */
export function ticketDetails(doc) {
  const h = doc?.header || {}
  const sellers = (doc?.sales_team || [])
    .map((row) => row.sales_person)
    .filter(Boolean)
  return [
    { key: 'folio', label: t('Folio'), value: doc?.name || '', copy: true },
    sellers.length && {
      key: 'sellers',
      label: t('Sold by'),
      value: sellers.join(', '),
    },
    num(h.total_qty) && {
      key: 'qty',
      label: t('Pieces'),
      value: formatQty(h.total_qty),
    },
    h.due_date &&
      num(h.outstanding_amount) > EPS && {
        key: 'due',
        label: t('Due'),
        value: formatDay(h.due_date),
      },
  ].filter(Boolean)
}

/**
 * The bolt's steps for a ticket, most likely first. `ctx`: { pos (the register
 * is installed), canPrint, returnTo, returnLabel, repairHref, dealHref, today }.
 * Each step has `href` (a page), `external` (a new tab), `share` or `tool`.
 */
export function ticketSteps(doc, ctx = {}) {
  const h = doc?.header || {}
  const today = ctx.today || localDay()
  const steps = []
  const sale = isSale(doc)
  if (sale && ctx.pos && num(h.outstanding_amount) > EPS)
    steps.push({
      key: 'collect',
      label: t('Collect at the register'),
      icon: 'lucide-hand-coins',
      href: posCollectHref(
        { customer: h.customer, name: doc.name },
        { returnTo: ctx.returnTo, returnLabel: ctx.returnLabel },
      ),
    })
  if (ctx.canPrint)
    steps.push({
      key: 'print',
      label: t('Print or download the ticket'),
      icon: 'lucide-printer',
      tool: 'print',
    })
  const url = doc?.cfdi?.self_billing_url
  if (url) {
    steps.push({
      key: 'invoice',
      label: t('Make the invoice (CFDI)'),
      icon: 'lucide-receipt',
      href: url,
      external: true,
    })
    steps.push({
      key: 'invoice_link',
      label: t('Send the customer the invoicing link'),
      icon: 'lucide-send',
      share: {
        url,
        title: t('Your invoice'),
        text: t('Get the invoice for your purchase here:'),
      },
    })
  }
  const until = doc?.register?.return_until
  if (sale && ctx.pos && !num(h.is_return) && (!until || until >= today))
    steps.push({
      key: 'return',
      label: t('Return at the register'),
      icon: 'lucide-undo-2',
      href: posReturnHref(doc),
    })
  if (ctx.repairHref)
    steps.push({
      key: 'repair',
      label: t('Open the repair'),
      icon: 'lucide-wrench',
      href: ctx.repairHref,
    })
  if (ctx.dealHref)
    steps.push({
      key: 'deal',
      label: t('Open the sale in Ventas'),
      icon: 'lucide-briefcase',
      href: ctx.dealHref,
    })
  return steps
}
