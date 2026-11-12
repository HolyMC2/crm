// One invoice in detail (capability «invoice_detail», Boat
// tenant_portal.invoice_detail through miplan.call) and Mi cuenta's «Historial»
// (capability «history», my_history), in the owner's words. Boat writes the
// line labels and the history titles in es-MX and splits the IVA out of the
// total; nothing here computes money. Only the fields named here are read,
// never a folio, a key or a login. Times come in the site's zone (ISO 8601
// with its offset), so a date is the site's in any browser. Pure.
import { LOCALE, formatMoney } from '@/utils/display'
import { longDate } from './autoservicio'
import { periodRange } from './cuenta'
import { cfdiKinds, monthTitle, zeroAmount } from './facturacion'
import { siteClock } from './incidentes'

const t = (text, replace) => __(text, replace, 'Cuenta')
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)
const money = (value) => formatMoney(Math.abs(num(value)), 'MXN')
const minus = (value) => `−${money(value)}`
const text = (value) => (typeof value === 'string' ? value.trim() : '')
const OVERDUE = ['Overdue', 'Failed']

/** The site's calendar day of a Boat time (noon of it, for formatting); null when unknown. */
export function siteDay(value) {
  const clock = siteClock(value)
  return clock ? new Date(clock.year, clock.month - 1, clock.day, 12) : null
}

/** «5 de noviembre, 9:05» in the site's clock, the year when it is not this one. */
export function siteWhen(value, now = new Date()) {
  const clock = siteClock(value)
  if (!clock) return ''
  const day = longDate(siteDay(value), now)
  return `${day}, ${clock.hour}:${String(clock.minute).padStart(2, '0')}`
}

const count = (value) =>
  new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(value)

function lineRow(line, index) {
  const quantity = Number(line.quantity)
  const unit = Number(line.unit_price_mxn)
  const counted =
    line.quantity != null &&
    line.unit_price_mxn != null &&
    quantity > 0 &&
    unit > 0
  return {
    key: `${index}:${text(line.label)}`,
    label: text(line.label),
    detail: counted ? `${count(quantity)} × ${money(unit)}` : '',
    amount:
      num(line.amount_mxn) < 0
        ? minus(line.amount_mxn)
        : money(line.amount_mxn),
  }
}

const rows = (list) =>
  (Array.isArray(list) ? list : []).filter(
    (line) => line && text(line.label) && num(line.amount_mxn) !== 0,
  )

function statusLine(inv, now, credited) {
  // A $0 month Boat closes as Paid: nothing was charged, a credit covered it.
  if (inv.status === 'Paid' && zeroAmount(inv))
    return credited ? t('No charge: your credit covered it') : t('No charge')
  if (inv.status === 'Paid') {
    const day = siteDay(inv.payment?.at)
    const method = text(inv.payment?.method)
    if (!day) return t('Paid')
    return method
      ? t('Paid on {0} with {1}', [longDate(day, now), method.toLowerCase()])
      : t('Paid on {0}', [longDate(day, now)])
  }
  if (inv.status === 'Cancelled') return t('Cancelled')
  const due = longDate(inv.due_date, now)
  if (OVERDUE.includes(inv.status))
    return due ? t('Unpaid since {0}', [due]) : t('Overdue')
  return due ? t('Due on {0}', [due]) : t('To pay')
}

// Boat's cfdi_state: stamped, pending (being stamped), none (a CFDI is still
// coming) or not_applicable (none will be stamped: a month covered by credit,
// the fiscal leg off). Only a CFDI Boat says is coming is promised.
function cfdiNote(inv) {
  if (inv.cfdi_state === 'pending') return t('Fiscal invoice in process')
  return inv.cfdi_state === 'none' && inv.status === 'Paid'
    ? t('Fiscal invoice pending')
    : ''
}

/**
 * The sheet's content, or null when Boat did not answer an invoice: title,
 * status line, total with the IVA inside it, the lines it charges, the credits,
 * discount and refunds as their own rows, the period, and the fiscal files.
 */
export function detailView(answer, now = new Date()) {
  const inv = answer?.ok === true ? answer.invoice : null
  if (!inv || typeof inv !== 'object') return null
  const charges = rows(inv.lines).map(lineRow)
  const credits = rows(inv.credits).map(lineRow)
  const discount = num(inv.partner_discount_mxn)
  if (discount > 0)
    credits.push({
      key: 'discount',
      label: t('Partner discount'),
      detail: '',
      amount: minus(discount),
    })
  const refunds = (Array.isArray(inv.refunds) ? inv.refunds : [])
    .filter((row) => row && num(row.amount_mxn) > 0)
    .map((row, index) => {
      const day = siteDay(row.at)
      return {
        key: `refund:${index}`,
        label: day ? t('Refund of {0}', [longDate(day, now)]) : t('Refund'),
        amount: money(row.amount_mxn),
      }
    })
  const kinds = cfdiKinds(inv)
  return {
    title: monthTitle(inv.period_start),
    status: statusLine(inv, now, credits.length > 0),
    overdue: OVERDUE.includes(inv.status),
    total: money(inv.amount_mxn),
    // The IVA inside the total; nothing to split on a $0 invoice.
    iva: zeroAmount(inv) ? '' : t('IVA included: {0}', [money(inv.iva_mxn)]),
    period: periodRange(inv.period_start, inv.period_end),
    lines: charges,
    // A subtotal only when something is taken off the lines.
    subtotal: credits.length ? money(inv.subtotal_mxn) : '',
    credits,
    refunds,
    cfdi: kinds,
    cfdiNote: kinds.length ? '' : cfdiNote(inv),
    receipt: inv.receipt === true,
  }
}

// ── Historial ───────────────────────────────────────────────────────────────

function cycleWords(cycle) {
  return cycle === 'Anual'
    ? t('a year, IVA included')
    : t('a month, IVA included')
}

function statusWords(event, now) {
  if (event.status === 'scheduled') {
    const day = longDate(event.effective_date, now)
    return day ? t('Scheduled for {0}', [day]) : t('Scheduled')
  }
  if (event.status === 'in_progress') return t('Being applied')
  if (event.status === 'failed') return t('It did not go through')
  if (event.status === 'cancelled') return t('Dropped before it took effect')
  return ''
}

/** The lines under a history row: its state, its price and what it bills. */
export function historyDetails(event, now = new Date()) {
  const out = []
  const status = statusWords(event, now)
  if (status) out.push(status)
  const amount = num(event.amount_mxn)
  if (event.kind === 'adjustment' && amount) {
    const month = event.bills_on ? monthTitle(event.bills_on).toLowerCase() : ''
    if (month)
      out.push(
        amount > 0
          ? t('{0} on your {1} invoice', [money(amount), month])
          : t('{0} off your {1} invoice', [money(amount), month]),
      )
    else
      out.push(
        amount > 0
          ? t('Charge of {0}', [money(amount)])
          : t('Credit of {0}', [money(amount)]),
      )
  } else if (amount > 0) {
    out.push(`${money(amount)} ${cycleWords(event.cycle)}`)
  }
  // What the change charged for the rest of its period, worded so it stays
  // true once that invoice is out.
  if (num(event.charge_now_mxn) > 0)
    out.push(t('Prorated charge: {0}', [money(event.charge_now_mxn)]))
  return out
}

/** Boat's events as rows, in its order (newest first): {key, title, when, details, failed}. */
export function historyRows(events, now = new Date()) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => event && text(event.title))
    .map((event, index) => ({
      key: text(String(event.id ?? '')) || `event:${index}`,
      title: text(event.title),
      when: siteWhen(event.at, now),
      details: historyDetails(event, now),
      failed: event.status === 'failed',
    }))
}
