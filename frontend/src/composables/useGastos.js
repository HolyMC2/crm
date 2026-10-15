import { ref } from 'vue'
import { comprasApi, money, outcomeUnknown, requestId } from './useCompras'
import { claimsSegmentShown, defaultSegment } from './useGastosEmpleados'
import { errorKind } from '@/utils/contactos'
import { listKeys, pathWithQuery, textParam } from '@/utils/powerList'

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
  // Employees' expenses: their own claims, approvals, reimbursements, advances.
  { value: 'empleados', label: 'From employees', icon: 'users' },
])
const BILL_SEGMENTS = ['por-pagar', 'por-registrar']
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
/** The segments this worker sees: bills for bill readers, «De empleados»
 *  where claims work (or its guard explains why they do not). */
export function visibleSegments(boot) {
  const bills = !boot || Boolean(boot.capabilities?.read)
  return SEGMENTS.filter((s) =>
    BILL_SEGMENTS.includes(s.value) ? bills : claimsSegmentShown(boot),
  )
}
export function normalizeSegment(value, boot) {
  return visibleSegments(boot).some((s) => s.value === value)
    ? value
    : defaultSegment(boot)
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

// ── Power worklist: URL state, keyboard, «Pagar» from the list, bulk ───────
// Agenda/Cobranza standard: the URL is the list's state (list, chip, order,
// search, focused bill), the keyboard works the list, a payment can be undone
// by whom made it, and several bills are paid in one go with one result each.

export const ACTIONS = 'doco.workspaces.payables'
// A bill changes with its payments; a payment made from another tab or by
// someone else reloads the rows already shown.
export const LIVE_DOCTYPES = Object.freeze([
  'Purchase Invoice',
  'Payment Entry',
])

/** The bill queue's state, read from the URL (the URL is the state). */
export function queueState(query = {}, boot = null) {
  const segment = normalizeSegment(textParam(query.segment), boot)
  return {
    segment,
    chip: normalizeChip(segment, textParam(query.chip)),
    po: textParam(query.po),
    q: textParam(query.q),
    foco: textParam(query.foco),
  }
}

/** Scroll memory is per list (its filters), never per focused bill. */
export function listMemoryKey(query = {}) {
  const s = queueState(query)
  return `muelle:gastos:list:${s.segment}|${s.chip}|${s.po}|${s.q}`
}

/** `/gastos?…` for a query: the record keeps it to come back to the same row. */
export function listHref(query = {}) {
  return pathWithQuery('/gastos', query)
}

export const QUEUE_VERBS = Object.freeze({
  $: 'pay',
  r: 'register',
  a: 'ask',
})
export const QUEUE_KEYS = listKeys(QUEUE_VERBS)
export const RECORD_KEYS = Object.freeze({
  $: 'pay',
  r: 'register',
  a: 'ask',
  escape: 'back',
})

/** The queue's own keys for the Alt+H sheet: only what this worker may do. */
export function queueShortcuts(caps = {}) {
  return [
    {
      id: 'gastos.pay',
      keys: ['$'],
      description: caps.pay ? 'Pay the bill' : 'Ask someone to pay the bill',
    },
    caps.submit && {
      id: 'gastos.register',
      keys: ['r'],
      description: 'Review and register the bill',
    },
    { id: 'gastos.ask', keys: ['a'], description: 'Ask for approval' },
  ].filter(Boolean)
}

/** The bill record's keys. */
export function recordShortcuts(caps = {}) {
  return [
    ...queueShortcuts(caps),
    { id: 'gastos.back', keys: ['escape'], description: 'Back to the list' },
  ]
}

/** What `$` does on a row: pay it, or the reason and the way that resolves it. */
export function payStep(row, caps = {}) {
  if (!row) return { kind: 'none' }
  if (Number(row.docstatus) === 0)
    return {
      kind: 'register',
      text: tr('Register this bill first; then it can be paid.'),
    }
  if (Number(row.docstatus) !== 1 || Number(row.outstanding_amount || 0) <= 0)
    return { kind: 'paid', text: tr('This bill is already paid.') }
  if (row.on_hold)
    return {
      kind: 'held',
      text: tr('This bill is on hold. Open it to see why and release it.'),
    }
  if (!caps.pay)
    return {
      kind: 'ask',
      text: tr('Payments are made by an accounts manager. Ask one to pay it.'),
    }
  return { kind: 'pay' }
}

/**
 * Which selected bills «Pagar» can pay in one go: registered, owing, not held,
 * one company and one owed currency (each payment is the bill's own, in full).
 * `groups` lets the worker keep one company/currency when they are mixed.
 */
export function bulkPayPlan(rows = []) {
  const payable = []
  const skipped = []
  for (const row of rows) {
    const step = payStep(row, { pay: true })
    if (step.kind === 'pay') payable.push(row)
    else skipped.push({ row, reason: step.text })
  }
  const groups = new Map()
  for (const row of payable) {
    const key = `${row.company || ''}\u0000${row.owed_currency || row.currency || ''}`
    if (!groups.has(key))
      groups.set(key, {
        key,
        company: row.company || '',
        currency: row.owed_currency || row.currency || '',
        rows: [],
      })
    groups.get(key).rows.push(row)
  }
  const list = [...groups.values()]
  const total = payable.reduce(
    (sum, row) => sum + Math.round(Number(row.outstanding_amount || 0) * 100),
    0,
  )
  return {
    payable,
    skipped,
    groups: list,
    mixed: list.length > 1,
    total: total / 100,
    currency: list.length === 1 ? list[0].currency : '',
  }
}

/** Bulk «Pagar» pays from one account in the bills' own currency (no rate to type). */
export function bulkAccounts(options, currency) {
  return (options?.accounts || []).filter((a) => a.currency === currency)
}

/** What still blocks a bulk payment, as field keys. */
export function bulkPayMissing(form, accounts) {
  const missing = []
  const account = (accounts || []).find((a) => a.account === form.account)
  if (!account) missing.push('account')
  if (needsReference(account) && !String(form.reference_no || '').trim())
    missing.push('reference_no')
  if (!form.reference_date) missing.push('reference_date')
  return missing
}

/** «Deshacer» of a payment just made: ERPNext cancels it (author only). */
export function cancelPayment(api, payment) {
  return api('cancel_payment', {
    request_id: `${payment}:undo`,
    payment_entry: payment,
  })
}
