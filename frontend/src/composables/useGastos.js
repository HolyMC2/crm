import { ref } from 'vue'
import { comprasApi, money, outcomeUnknown, requestId } from './useCompras'
import { errorKind } from '@/utils/contactos'

// Gastos: what the shop owes its suppliers, registered and paid from the bank.
// The native Purchase Invoice is the bill and the native Payment Entry the
// payment; Doco's payables service owns every read and write. Pure helpers
// live here so the pages and tests share them.

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

const SERVICE = 'doco.workspaces.payables'
// Translation context: short generic words stay Gastos-only in the catalog.
export const CTX = 'Gastos'

export { money, outcomeUnknown, requestId }

/** POST to the Gastos service; a refusal keeps the server's message and type. */
export function gastosApi(method, args = {}) {
  return comprasApi(
    method.includes('.') ? method : `${SERVICE}.${method}`,
    args,
  )
}

export const gastosBoot = ref(null)
let bootPending
/** Gastos capability, cached per page load; refresh re-reads permissions. */
export function loadGastosBoot({ refresh = false } = {}) {
  if (gastosBoot.value && !refresh) return Promise.resolve(gastosBoot.value)
  if (bootPending) return bootPending
  bootPending = gastosApi('crm.api.gastos.get_capabilities')
    .then((data) => (gastosBoot.value = data || { enabled: false }))
    .catch(() => (gastosBoot.value = { enabled: false, failed: true }))
    .finally(() => (bootPending = null))
  return bootPending
}

export const SEGMENTS = Object.freeze([
  { value: 'por-pagar', label: 'To pay', icon: 'credit-card' },
  { value: 'por-registrar', label: 'To register', icon: 'file-text' },
])
export const CHIPS = Object.freeze([
  { value: '', label: 'All' },
  { value: 'vencidas', label: 'Overdue' },
  { value: 'semana', label: 'This week' },
])
export function segmentLabel(value) {
  return tr(
    SEGMENTS.find((s) => s.value === value)?.label || 'To pay',
    null,
    CTX,
  )
}
export function normalizeSegment(value) {
  return SEGMENTS.some((s) => s.value === value) ? value : 'por-pagar'
}
export function normalizeChip(segment, value) {
  return segment === 'por-pagar' && CHIPS.some((c) => c.value === value)
    ? value
    : ''
}

/** The query that reopens a queue exactly as it was (segment, chip, search, order). */
export function queueQuery({ segment, chip, q, po } = {}) {
  const query = {}
  if (po) query.po = po
  else {
    if (segment && segment !== 'por-pagar') query.segment = segment
    if (chip) query.chip = chip
  }
  if (q) query.q = q
  return query
}

/** «Paid 400 of 1,000» on a submitted bill; empty on a draft. */
export function paidLabel(doc) {
  if (!doc || Number(doc.docstatus) !== 1) return ''
  const total = money(doc.total, doc.currency)
  const paid = Number(doc.paid || 0)
  if (Number(doc.outstanding_amount || 0) <= 0)
    return tr('Paid in full · {0}', [total])
  return paid > 0
    ? tr('Paid {0} of {1}', [money(paid, doc.currency), total])
    : tr('Nothing paid of {0}', [total])
}

/** Due-date wording relative to the site's today (both ISO dates). */
export function dueLabel(dueDate, today) {
  if (!dueDate) return ''
  if (!today) return tr('Due {0}', [dueDate])
  const days = Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86400000,
  )
  if (days < 0)
    return days === -1
      ? tr('Overdue since yesterday')
      : tr('Overdue {0} days', [-days])
  if (days === 0) return tr('Due today')
  if (days === 1) return tr('Due tomorrow')
  return tr('Due in {0} days', [days])
}

export function statusLabel(doc) {
  if (Number(doc?.docstatus) === 0) return tr('Draft', null, CTX)
  if (Number(doc?.docstatus) === 2) return tr('Cancelled', null, CTX)
  if (Number(doc?.outstanding_amount || 0) <= 0) return tr('Paid', null, CTX)
  if (doc?.on_hold) return tr('On hold', null, CTX)
  if (doc?.overdue) return tr('Overdue', null, CTX)
  return Number(doc?.paid || 0) > 0
    ? tr('Partly paid', null, CTX)
    : tr('To pay', null, CTX)
}

/** Bank side of a payment: matched in Contador, or still waiting for the bank. */
export function bankLabel(payment) {
  return payment?.reconciled
    ? tr('Reconciled')
    : tr('Waiting for the bank movement')
}

/** Contador's bank screen for this payment, with the way back to this bill. */
export function bankUrl(payment, bill) {
  const query = new URLSearchParams({
    review: payment,
    return_to: `/crm/gastos/factura/${encodeURIComponent(bill)}`,
    return_label: 'Gastos',
  })
  return `/contador/bancos?${query}`
}

/** Compras' order → its bills in Gastos. */
export function orderBillsRoute(order) {
  return { name: 'Gastos', query: { po: order } }
}

/** Whether a reference is required: bank transfers need one, cash does not. */
export function needsReference(account) {
  return account?.type === 'Bank'
}

/** Whether this account pays a bill owed in another currency, so the bank
 *  side needs an exchange rate (lane 1: company-currency accounts only). */
export function needsRate(account, options) {
  return Boolean(
    account && options?.exchange_rate && account.currency !== options.currency,
  )
}

/** What leaves the bank at the rate shown, in the account's currency. */
export function bankSide(form, options) {
  const account = options?.accounts?.find((a) => a.account === form.account)
  if (!needsRate(account, options)) return null
  const rate = Number(form.exchange_rate)
  const amount = Number(form.amount)
  if (!(rate > 0) || !(amount > 0)) return null
  return {
    amount: Math.round(amount * rate * 100) / 100,
    currency: account.currency,
  }
}

/** What still blocks «Pagar», as field keys, so the form can point at them. */
export function payMissing(form, options) {
  const missing = []
  const account = options?.accounts?.find((a) => a.account === form.account)
  if (!account) missing.push('account')
  const amount = Number(form.amount)
  if (!(amount > 0)) missing.push('amount')
  if (needsRate(account, options) && !(Number(form.exchange_rate) > 0))
    missing.push('exchange_rate')
  if (needsReference(account) && !String(form.reference_no || '').trim())
    missing.push('reference_no')
  if (!form.reference_date) missing.push('reference_date')
  return missing
}

/** Plain, actionable es-MX recovery for a failed call. */
export function problemOf(error) {
  const kind = errorKind(error)
  const detail =
    error?.messages?.join(' ') || error?.message || tr('Something went wrong.')
  if (outcomeUnknown(error))
    return {
      kind: 'offline',
      title: tr('No connection', null, CTX),
      detail,
      action: tr('Check result'),
    }
  if (kind === 'conflict')
    return {
      kind,
      title: tr('Someone else changed this bill'),
      detail,
      action: tr('Refresh and compare'),
    }
  if (kind === 'permission')
    return {
      kind,
      title: tr('Not allowed', null, CTX),
      detail,
      action: tr('Ask for help'),
    }
  return { kind: 'error', title: tr('Could not finish'), detail, action: null }
}

const PENDING_PREFIX = 'muelle:gastos:pending:'
/** A payment sent but not yet confirmed: its request id and exact payload are
 *  stored BEFORE dispatch, so a reload or retry asks about the same payment
 *  instead of paying twice. */
export function pendingPayment(bill) {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(PENDING_PREFIX + bill) || 'null',
    )
    return value && value.request_id && value.data ? value : null
  } catch {
    return null
  }
}
function rememberPayment(bill, operation) {
  try {
    sessionStorage.setItem(PENDING_PREFIX + bill, JSON.stringify(operation))
  } catch {
    /* the in-memory id still covers retries in this page */
  }
}
export function forgetPayment(bill) {
  try {
    sessionStorage.removeItem(PENDING_PREFIX + bill)
  } catch {
    /* ignore */
  }
}

/** «Pagar»: one operation per payment until the server answers; an unknown
 *  outcome keeps the request id so the retry replays instead of paying again. */
export async function payBill(api, bill, form) {
  const operation = pendingPayment(bill) || {
    request_id: requestId(),
    data: {
      name: bill,
      account: form.account,
      amount: Number(form.amount),
      reference_no: String(form.reference_no || '').trim(),
      reference_date: form.reference_date,
      exchange_rate: Number(form.exchange_rate) || 0,
    },
  }
  rememberPayment(bill, operation)
  try {
    const result = await api('pay', {
      request_id: operation.request_id,
      ...operation.data,
    })
    forgetPayment(bill)
    return result
  } catch (error) {
    if (!outcomeUnknown(error)) forgetPayment(bill)
    throw error
  }
}
