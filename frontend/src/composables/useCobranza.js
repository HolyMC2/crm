import { ref } from 'vue'
import { callError, errorKind, formatDay } from '@/utils/contactos'
import {
  comprasApi,
  money,
  outcomeUnknown,
  requestId,
} from '@/composables/useCompras'

// Cobranza: what each customer owes us → their record → one next action
// (reminder letter, promise, call, collect at the register) → paid → next
// customer. Native Sales Invoice / Dunning / ToDo / Payment Entry stay the
// records; Doco's receivables service owns every read and write, and the
// letter goes out through the guarded WhatsApp documents path.
// Pure helpers live here so the pages and tests share them.

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

const SERVICE = 'doco.workspaces.receivables'
export const SEND_API = 'doco.docoutils.document_send.api'
// Translation context: short generic words stay Cobranza-only in the catalog.
export const CTX = 'Cobranza'
export { formatDay, money, requestId, outcomeUnknown }

// Money: every amount is shown in its own currency. A debt in another currency
// than the company's also shows what it is worth in the company's (the books'
// value, sent by the server as base_*), and totals are in the company currency.
// Two currencies are never added up or shown with each other's symbol.

export function isForeign(currency, companyCurrency) {
  return Boolean(currency && companyCurrency && currency !== companyCurrency)
}

// No-break spaces: an amount and its company-currency value wrap as one unit.
const NBSP = '\u00a0'

/** «≈ $5,550.00»: a foreign amount's value in the company currency. */
export function approxMoney(base, companyCurrency) {
  return `≈${NBSP}${money(base, companyCurrency)}`
}

/** «USD 300.00 ≈ $5,550.00» in another currency; «$1,838.00» in the company's. */
export function moneyWithBase(amount, currency, base, companyCurrency) {
  const own = money(amount, currency)
  if (
    !isForeign(currency, companyCurrency) ||
    base === null ||
    base === undefined
  )
    return own
  return `${own}${NBSP}${approxMoney(base, companyCurrency)}`
}

/** The list totals: one per company currency (a server without them: its flat figure). */
export function statTotals(stats) {
  if (!stats) return []
  if (Array.isArray(stats.totals) && stats.totals.length) return stats.totals
  const { currency, outstanding, overdue, collected_today } = stats
  return [{ currency, outstanding, overdue, collected_today, foreign: [] }]
}

/** «incluye USD 300.00» under a company-currency total: its part owed in other currencies. */
export function foreignNote(foreign, key) {
  const parts = (foreign || [])
    .filter((part) => Number(part[key]) > 0)
    .map((part) => money(part[key], part.currency))
  return parts.length ? tr('includes {0}', [parts.join(' · ')], CTX) : ''
}

/** POST to the Cobranza service; a refusal keeps the server's message and type. */
export function cobranzaApi(method, args = {}) {
  return comprasApi(
    method.includes('.') ? method : `${SERVICE}.${method}`,
    args,
  )
}

/** GET for the WhatsApp documents preview (its endpoints accept GET only). */
export async function sendContext(args) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(args))
    if (value !== null && value !== undefined && value !== '')
      params.set(key, value)
  let response
  try {
    response = await fetch(
      `/api/method/${SEND_API}.get_send_context?${params.toString()}`,
      { headers: { Accept: 'application/json' } },
    )
  } catch {
    const error = new Error('get_send_context')
    error.offline = true
    error.messages = [tr('No connection. Reconnect and check again.')]
    throw error
  }
  let data
  try {
    data = await response.json()
  } catch {
    data = {}
  }
  if (response.ok) return data.message
  throw callError('get_send_context', response.status, data)
}

export async function sendStatus(sendId) {
  const response = await fetch(
    `/api/method/${SEND_API}.get_send_status?send_id=${encodeURIComponent(sendId)}`,
    { headers: { Accept: 'application/json' } },
  )
  const data = await response.json().catch(() => ({}))
  return response.ok ? data.message : null
}

export function downloadUrl(doctype, name, account = null) {
  const params = new URLSearchParams({ doctype, name })
  if (account) params.set('account', account)
  return `/api/method/${SEND_API}.download_pdf?${params.toString()}`
}

export function waLink(digits, text) {
  const clean = String(digits || '').replace(/\D/g, '')
  return `https://wa.me/${clean}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export const cobranzaBoot = ref(null)
let bootPending
/** Cobranza capability, cached per page load; refresh re-reads permissions. */
export function loadCobranzaBoot({ refresh = false } = {}) {
  if (cobranzaBoot.value && !refresh) return Promise.resolve(cobranzaBoot.value)
  if (bootPending) return bootPending
  bootPending = cobranzaApi('crm.api.cobranza.get_capabilities')
    .then((data) => (cobranzaBoot.value = data || { enabled: false }))
    .catch(() => (cobranzaBoot.value = { enabled: false, failed: true }))
    .finally(() => (bootPending = null))
  return bootPending
}

export const SEGMENTS = Object.freeze([
  { value: 'vencidas', label: 'Overdue', icon: 'alert-circle' },
  { value: 'hoy', label: 'Due soon', icon: 'clock' },
  { value: 'promesas', label: 'Promises', icon: 'calendar' },
  { value: 'todas', label: 'All', icon: 'list' },
  // The automatic reminders a person sends today (from their phone, or after a review).
  { value: 'recordar', label: "Today's reminders", icon: 'send' },
])
export function segmentLabel(value) {
  return tr(
    SEGMENTS.find((s) => s.value === value)?.label || 'Overdue',
    null,
    CTX,
  )
}
export function normalizeSegment(value) {
  return SEGMENTS.some((s) => s.value === value) ? value : 'vencidas'
}

/** «Vencida hace 12 días», «Vence hoy», «Vence el vie, 9 oct». */
export function agingLabel(row, today) {
  const days = Number(row.oldest_overdue_days ?? row.overdue_days ?? 0)
  if (days === 1) return tr('Overdue 1 day')
  if (days > 1) return tr('Overdue {0} days', [days])
  const next = row.next_due
  if (!next) return tr('Not due yet')
  if (next === today) return tr('Due today')
  return tr('Due {0}', [formatDay(next)], CTX)
}

export function agingTone(row) {
  const days = Number(row.oldest_overdue_days ?? row.overdue_days ?? 0)
  if (days >= 15) return 'red'
  if (days >= 1) return 'orange'
  return 'gray'
}

/** The promise chip: «Promete $500 el vie, 9 oct», «Promesa vencida»… */
export function promiseChip(promise, currency) {
  if (!promise) return null
  const amount = promise.amount ? money(promise.amount, currency) : ''
  const date = formatDay(promise.date)
  if (promise.state === 'broken')
    return { label: tr('Promise broken'), theme: 'red' }
  if (promise.state === 'partial')
    return {
      label: tr('Promise partly kept: {0}', [money(promise.paid, currency)]),
      theme: 'orange',
    }
  if (promise.state === 'kept')
    return { label: tr('Promise kept'), theme: 'green' }
  return {
    label: amount
      ? tr('Promises {0} on {1}', [amount, date])
      : tr('Promises to pay on {0}', [date]),
    theme: 'blue',
  }
}

const DELIVERY_THEMES = {
  read: 'green',
  delivered: 'green',
  accepted: 'blue',
  queued: 'blue',
  sending: 'blue',
  preparing: 'blue',
  failed: 'red',
  undeliverable: 'red',
  blocked: 'red',
  window_closed: 'orange',
  unknown: 'orange',
}

/** «Segundo aviso · vie, 2 oct · Entregado». */
export function reminderChip(reminder) {
  if (!reminder) return null
  const parts = [reminder.label || tr('Reminder'), formatDay(reminder.date)]
  if (reminder.delivery?.label) parts.push(reminder.delivery.label)
  else parts.push(tr('Not sent yet'))
  return {
    label: parts.filter(Boolean).join(' · '),
    theme: DELIVERY_THEMES[reminder.delivery?.state] || 'gray',
  }
}

/**
 * The one primary action for an invoice of the record, plus what blocks it.
 * caps: the record's capabilities; ladderReady: the company's three letters exist.
 * Blocked actions always carry a reason and a resolving action.
 */
export function invoiceAction(inv, { caps = {}, ladderReady = true } = {}) {
  const overdue = Number(inv.overdue_days || 0) > 0
  const promise = inv.promise
  const remind = () => {
    if (!caps.remind)
      return {
        key: 'remind',
        label: tr('Send reminder'),
        blocked: tr(
          'You need permission to send payment reminders. Ask your manager.',
        ),
        resolve: { key: 'copy_request', label: tr('Copy access request') },
      }
    if (!ladderReady)
      return {
        key: 'remind',
        label: tr('Send reminder'),
        blocked: tr('The reminder levels for this company are not set up yet.'),
        resolve: caps.setup
          ? { key: 'setup', label: tr('Set up reminder levels') }
          : { key: 'copy_request', label: tr('Copy access request') },
      }
    return inv.current_dunning
      ? {
          key: 'resend',
          label: tr('Send reminder again'),
          dunning: inv.current_dunning,
        }
      : { key: 'remind', label: tr('Send reminder') }
  }
  if (overdue && promise?.state === 'broken') return remind()
  if (overdue && ['open', 'partial'].includes(promise?.state))
    return collect(caps)
  if (overdue && !inv.current_dunning) return remind()
  if (overdue) return { key: 'promise', label: tr('Record promise') }
  if (inv.next_due && inv.due_soon)
    return { key: 'call', label: tr('Log call') }
  return collect(caps)
}

function collect(caps) {
  return caps.collect
    ? { key: 'collect', label: tr('Collect at the register') }
    : {
        key: 'collect',
        label: tr('Collect at the register'),
        blocked: tr(
          'The register (POS) is not installed on this site. Record the payment with your accountant.',
        ),
        resolve: { key: 'copy_folio', label: tr('Copy invoice number') },
      }
}

/** Secondary actions for an invoice, never repeating the primary one. */
export function secondaryActions(inv, primary, caps = {}) {
  const keys = []
  if (caps.collect && primary.key !== 'collect') keys.push('collect')
  if (caps.promise && primary.key !== 'promise') keys.push('promise')
  if (primary.key !== 'call') keys.push('call')
  if (
    Number(inv.overdue_days || 0) > 0 &&
    !['remind', 'resend'].includes(primary.key) &&
    caps.remind
  )
    keys.push(inv.current_dunning ? 'resend' : 'remind')
  const labels = {
    collect: tr('Collect at the register'),
    promise: tr('Record promise'),
    call: tr('Log call'),
    remind: tr('Send reminder'),
    resend: tr('Send reminder again'),
  }
  return keys.map((key) => ({
    key,
    label: labels[key],
    ...(key === 'resend' ? { dunning: inv.current_dunning } : {}),
  }))
}

/** Mark invoices due within a week (the record's «Vence pronto»). */
export function withDueSoon(invoices, today, days = 7) {
  const limit = new Date(`${today}T00:00:00Z`)
  limit.setUTCDate(limit.getUTCDate() + days)
  const edge = limit.toISOString().slice(0, 10)
  return (invoices || []).map((inv) => ({
    ...inv,
    due_soon: Boolean(
      inv.next_due &&
        Number(inv.overdue_days || 0) === 0 &&
        inv.next_due <= edge,
    ),
  }))
}

/** `done=Payment Entry:<name>` from the register's return. */
export function parsePaymentDone(value) {
  if (typeof value !== 'string') return null
  const index = value.indexOf(':')
  if (index < 1) return null
  const doctype = value.slice(0, index)
  const name = value.slice(index + 1)
  return doctype === 'Payment Entry' && name && name.length <= 140
    ? { doctype, name }
    : null
}

/** The next customer of the same list after this one, or null. */
export function nextCustomer(rows, current) {
  const list = (rows || []).filter((row) => row.customer !== current)
  return list[0] || null
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
    }
  if (kind === 'conflict')
    return {
      kind,
      title: tr('Someone else is working on this invoice'),
      detail,
    }
  if (kind === 'permission')
    return { kind, title: tr('Not allowed', null, CTX), detail }
  return { kind: 'error', title: tr('Could not finish'), detail }
}

/** English source strings; the catalog translates them. */
export const SEND_ACTION_LABELS = {
  request_owner: 'Ask the owner to send it',
  download: 'Download PDF',
  device_share: 'Share from my phone',
  configure: 'Set up sending',
  add_phone: 'Add or fix phone',
  retry_check: 'Check again',
  take_control: 'Open the conversation',
  request_control: 'Open the conversation',
  reopen_conversation: 'Open the conversation',
  refresh: 'Review preview',
  check_status: 'Check status',
  review_number: 'Review number',
  new_send: 'Prepare a new send',
  retry: 'Retry send',
  confirm_duplicate: 'Send again anyway',
}

// ── Recordatorios automáticos ──────────────────────────────────────────────
// The owner switches them on per company; the server sends each invoice's next
// ladder letter in that owner's name and reports every customer's automatic
// state (`auto`) from evidence. These helpers only word it.

export const AUTO_API = 'doco.cobranza.automatic'

/** The chip on a queue row or the record (null while the reminders are off). */
export function autoChip(auto, today) {
  if (!auto) return null
  const day = (date) =>
    date && date === today ? tr('today', null, CTX) : formatDay(date)
  switch (auto.state) {
    case 'next':
      return { label: tr('Next reminder {0}', [day(auto.date)]), theme: 'blue' }
    case 'promise':
      return {
        label: tr('Paused: promise until {0}', [formatDay(auto.date)]),
        theme: 'gray',
      }
    case 'replied':
      return { label: tr('Stopped: they replied'), theme: 'orange' }
    case 'opted_out':
      return { label: tr('Does not accept messages'), theme: 'red' }
    case 'manual':
      if (auto.code === 'suppressed')
        return { label: tr('Does not accept messages'), theme: 'red' }
      if (auto.code === 'conversation_owned')
        return { label: tr('Stopped: someone is in the chat'), theme: 'orange' }
      return { label: tr('You send it'), theme: 'orange' }
    case 'review_usd':
      return { label: tr('Review: invoice in USD'), theme: 'orange' }
    case 'paused':
      return { label: tr('Reminders paused'), theme: 'orange' }
    case 'done':
      return { label: tr('All three reminders sent'), theme: 'gray' }
    default:
      return null
  }
}

/** One sentence for the record header: what the automatic reminders do next. */
export function autoLine(auto, today) {
  if (!auto) return ''
  const day = (date) =>
    date && date === today ? tr('today', null, CTX) : formatDay(date)
  switch (auto.state) {
    case 'next':
      return auto.level_label
        ? tr('Next automatic reminder: {0} ({1}).', [
            day(auto.date),
            auto.level_label,
          ])
        : tr('Next automatic reminder: {0}.', [day(auto.date)])
    case 'promise':
      return tr('Paused until {0}: the customer promised to pay.', [
        formatDay(auto.date),
      ])
    case 'replied':
      return tr('Stopped: the customer replied on WhatsApp on {0}.', [
        formatDay(auto.date),
      ])
    case 'opted_out':
      return tr(
        'The customer asked not to get WhatsApp messages: call them instead.',
      )
    case 'manual':
      return tr('You send this one: {0}', [auto.reason || ''])
    case 'review_usd':
    case 'paused':
      return auto.reason || ''
    case 'done':
      return tr('The three reminders went out. Call or visit the customer.')
    default:
      return ''
  }
}

/** English source of what switching them on may need (the catalog translates). */
export const AUTO_MISSING = {
  route_write: 'permission to change how the business sends WhatsApp documents',
  documents_off: 'sending documents by WhatsApp turned on for the business',
  sender_grant: 'permission to send documents from that WhatsApp account',
  reminder_permission: 'permission to confirm payment reminders',
}

export const AUTO_ACTION_LABELS = {
  switch_on: 'Switch on with my account',
  choose_template: 'Choose another template',
  review_account: 'Review the account',
  whatsapp_settings: 'Open WhatsApp settings',
  setup_ladder: 'Set up reminder levels',
}

/** The text a worker copies for the owner when they may not switch it on. */
export function ownerRequest(missing, company) {
  const needs = (missing || []).map((code) => tr(AUTO_MISSING[code] || code))
  return tr(
    'Please switch on automatic payment reminders in Cobranza for {0}, or give me: {1}.',
    [company || '', needs.join('; ')],
  )
}

/**
 * Why «Encender» cannot be saved yet, and its way out ({text, action}), or null.
 * setup: the server's get_setup; form: {account, template, from, to}.
 */
export function setupProblem(setup, form) {
  if (!setup) return null
  if (setup.missing?.length)
    return {
      text: tr('To switch them on you need: {0}.', [
        setup.missing.map((code) => tr(AUTO_MISSING[code] || code)).join('; '),
      ]),
      action: 'copy_request',
    }
  if (!setup.ladder_ready)
    return {
      text: tr('The reminder levels of this company are not set up yet.'),
      action: setup.can_setup_ladder ? 'setup_ladder' : 'copy_request',
    }
  if (setup.mode === 'off')
    return {
      text: tr('WhatsApp is turned off for the business.'),
      action: setup.can_configure ? 'whatsapp_settings' : 'copy_request',
    }
  if (!form?.account)
    return {
      text: tr('Choose the WhatsApp account they go out from.'),
      action: null,
    }
  if (setup.mode === 'api') {
    const template = (setup.templates || []).find(
      (t) => t.name === form.template,
    )
    if (!template)
      return {
        text: tr(
          'Choose an approved template: most customers have not written in the last 24 hours.',
        ),
        action: 'choose_template',
      }
    if (template.problem)
      return {
        text: `${template.reason || ''} ${tr('Choose another template.')}`.trim(),
        action: 'choose_template',
      }
  }
  if (!form.from || !form.to || form.from >= form.to)
    return {
      text: tr('The sending window must start before it ends.'),
      action: null,
    }
  return null
}
