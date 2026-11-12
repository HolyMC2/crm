// Mi cuenta's Facturación in the owner's words: invoices (to pay first, then the
// paid ones with their CFDI), the wallet's movements and the saved cards, from
// one Mi plan bootstrap and the wallet_txns / payment_methods relays. Pure,
// except `downloadCfdi`, which streams a stamped CFDI through the existing
// download relay. Never shows a stored key: no folio, no card id, no reference.
import {
  LOCALE,
  formatDate,
  formatDateTime,
  formatMoney,
} from '@/utils/display'
import { downloadPath, receiptPath } from './api'

const t = (text, replace) => __(text, replace, 'Cuenta')
const MXN = 'MXN'
const money = (value) => formatMoney(value || 0, MXN)
const OVERDUE = ['Overdue', 'Failed']
const CLOSED = ['Paid', 'Cancelled']

function dayOf(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null
}

/** «Noviembre 2026»: the month an invoice covers, as a bookkeeper names it. */
export function monthTitle(value) {
  const day = dayOf(value)
  if (!day) return t('Invoice')
  return new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' })
    .format(day)
    .replace(' de ', ' ')
    .replace(/^./, (c) => c.toUpperCase())
}

/**
 * The CFDI files Boat can serve for an invoice: only a stamped one, and its
 * PDF only when Boat attached it. A Boat that sends no fiscal state offers none.
 */
export function cfdiKinds(inv) {
  if (inv?.cfdi_state !== 'stamped') return []
  return inv.cfdi_pdf === false ? ['xml'] : ['pdf', 'xml']
}

/** «Factura fiscal pendiente» when Boat says the invoice has no stamped CFDI yet. */
export function fiscalPending(inv) {
  return Boolean(inv) && 'cfdi_state' in inv && inv.cfdi_state !== 'stamped'
}

function invoiceLine(inv) {
  const overdue = OVERDUE.includes(inv.status)
  if (inv.status === 'Paid')
    return inv.payment_date
      ? t('Paid {0}', [formatDate(inv.payment_date)])
      : t('Paid')
  if (inv.status === 'Cancelled') return t('Cancelled')
  if (inv.due_date)
    return overdue
      ? t('Overdue since {0}', [formatDate(inv.due_date)])
      : t('Due {0}', [formatDate(inv.due_date)])
  return overdue ? t('Overdue') : t('To pay')
}

function invoiceRow(inv) {
  return {
    ...inv,
    title: monthTitle(inv.period_start),
    amount: money(inv.amount_mxn),
    payable: !CLOSED.includes(inv.status),
    overdue: OVERDUE.includes(inv.status),
    line: invoiceLine(inv),
    cfdi: inv.status === 'Paid' ? cfdiKinds(inv) : [],
    fiscalPending: inv.status === 'Paid' && fiscalPending(inv),
  }
}

/** The invoices to pay (oldest first), then the rest as Boat sent them (newest first). */
export function invoiceGroups(data) {
  const rows = (data?.invoices || []).map(invoiceRow)
  const byPeriod = (a, b) =>
    String(a.period_start || '').localeCompare(String(b.period_start || ''))
  return {
    due: rows.filter((row) => row.payable).sort(byPeriod),
    done: rows.filter((row) => !row.payable),
  }
}

/** A top-up's receipt files: only a stamped one; none when Boat says nothing. */
export function receiptKinds(txn) {
  if (txn?.has_receipt !== true) return []
  return txn.receipt_pdf === false ? ['xml'] : ['pdf', 'xml']
}

/** Each billable service's name, so a charge reads as what it paid for. */
export function serviceNames(data) {
  const names = {}
  for (const row of data?.store?.addons || [])
    if (row?.service_key && row.service_name)
      names[row.service_key] = row.service_name
  for (const row of data?.usage?.services || [])
    if (row?.service_key && row.service_name)
      names[row.service_key] = row.service_name
  return names
}

// Boat's ledger types (Doco Credit Txn.txn_type); a charge names its service.
function txnLabel(txn, names) {
  if (txn.txn_type === 'Debit') return names[txn.service_key] || t('Charge')
  if (txn.txn_type === 'Top-up') return t('Top-up')
  if (txn.txn_type === 'Refund') return t('Refund')
  if (txn.txn_type === 'Adjustment') return t('Adjustment')
  return t('Movement')
}

/** The ledger as rows: what moved, when, and by how much (signed by Boat). */
export function txnRows(txns, names = {}) {
  return (txns || []).map((txn, index) => {
    const value = Number(txn.amount_mxn) || 0
    const credit = value > 0
    const label = txnLabel(txn, names)
    const topup = txn.txn_type === 'Top-up'
    return {
      key: txn.name || `txn:${index}`,
      name: txn.name,
      label,
      when: formatDateTime(txn.creation),
      credit,
      // A paid top-up: Boat serves its payment receipt (capability «receipts»).
      paidTopup: topup && credit && Boolean(txn.name),
      amount: `${credit ? '+' : '−'}${money(Math.abs(value))}`,
      receipts: topup ? receiptKinds(txn) : [],
      receiptPending: topup && 'has_receipt' in txn && txn.has_receipt !== true,
    }
  })
}

/** Saved cards: brand, last four and expiry; the id stays for the relay only. */
export function cardRows(cards) {
  return (cards || [])
    .filter((card) => card?.id)
    .map((card) => {
      const month = Number(card.exp_month)
      const year = Number(card.exp_year)
      const expires =
        month && year
          ? t('Expires {0}', [
              `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`,
            ])
          : ''
      return {
        id: card.id,
        title: `${card.brand || t('Card')} ···· ${card.last4 || ''}`.trim(),
        expires,
      }
    })
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function serverMessage(body) {
  try {
    const messages = JSON.parse(body?._server_messages || '[]')
    if (messages.length) return JSON.parse(messages[0]).message
  } catch {
    // the body carries no queued message
  }
  const message = body?.message?.error || body?.message
  return typeof message === 'string' ? message : ''
}

/**
 * Mi plan's downloadCFDI: the stamped file through the existing relay, saved
 * from the browser so a refusal stays on the page. Resolves to '' or to what
 * to tell the owner.
 */
export async function downloadCfdi(
  { type, name, kind },
  { fetcher = (...args) => fetch(...args), save = saveBlob } = {},
) {
  try {
    const response = await fetcher(downloadPath(type, name, kind), {
      credentials: 'same-origin',
      headers: { 'X-Frappe-CSRF-Token': window.csrf_token || '' },
    })
    const contentType = response.headers?.get?.('Content-Type') || ''
    if (!response.ok || contentType.includes('json')) {
      const body = await response.json().catch(() => ({}))
      const said = serverMessage(body)
        .replace(/<[^>]+>/g, '')
        .trim()
      return (
        said ||
        t('The CFDI is not available yet. Ask support to check the stamping.')
      )
    }
    const blob = await response.blob()
    if (!blob.size) return t('The CFDI arrived empty. Ask support to check it.')
    const safe = String(name).replace(/[^a-zA-Z0-9_-]/g, '_')
    save(blob, `CFDI-${safe}.${kind}`)
    return ''
  } catch {
    return t('We could not download the CFDI. Try again in a moment.')
  }
}

/**
 * The payment receipt of a paid invoice or a top-up (a PDF that says it is not
 * a CFDI) through the receipt relay, saved from the browser so a refusal stays
 * on the page. Resolves to '' or to what to tell the owner.
 */
export async function downloadReceipt(
  { type, name },
  { fetcher = (...args) => fetch(...args), save = saveBlob } = {},
) {
  try {
    const response = await fetcher(receiptPath(type, name), {
      credentials: 'same-origin',
      headers: { 'X-Frappe-CSRF-Token': window.csrf_token || '' },
    })
    const contentType = response.headers?.get?.('Content-Type') || ''
    if (!response.ok || !contentType.includes('pdf')) {
      const body = await response.json().catch(() => ({}))
      const said = serverMessage(body)
        .replace(/<[^>]+>/g, '')
        .trim()
      return (
        said ||
        t('The receipt is not available right now. Try again or ask support.')
      )
    }
    const blob = await response.blob()
    if (!blob.size)
      return t('The receipt arrived empty. Try again or ask support.')
    const safe = String(name).replace(/[^a-zA-Z0-9_-]/g, '_')
    save(blob, `Comprobante-${safe}.pdf`)
    return ''
  } catch {
    return t('We could not download the receipt. Try again in a moment.')
  }
}
