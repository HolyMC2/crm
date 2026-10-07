import { ref } from 'vue'
import { callError, errorKind } from '@/utils/contactos'
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
export { money, requestId, outcomeUnknown }

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

/** «Vencida hace 12 días», «Vence hoy», «Vence el 2026-10-09». */
export function agingLabel(row, today) {
  const days = Number(row.oldest_overdue_days ?? row.overdue_days ?? 0)
  if (days === 1) return tr('Overdue 1 day')
  if (days > 1) return tr('Overdue {0} days', [days])
  const next = row.next_due
  if (!next) return tr('Not due yet')
  if (next === today) return tr('Due today')
  return tr('Due {0}', [next])
}

export function agingTone(row) {
  const days = Number(row.oldest_overdue_days ?? row.overdue_days ?? 0)
  if (days >= 15) return 'red'
  if (days >= 1) return 'orange'
  return 'gray'
}

/** The promise chip: «Promete $500 el 2026-10-09», «Promesa vencida»… */
export function promiseChip(promise, currency) {
  if (!promise) return null
  const amount = promise.amount ? money(promise.amount, currency) : ''
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
      ? tr('Promises {0} on {1}', [amount, promise.date])
      : tr('Promises to pay on {0}', [promise.date]),
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

/** «Segundo aviso · 2026-10-02 · Entregado». */
export function reminderChip(reminder) {
  if (!reminder) return null
  const parts = [reminder.label || tr('Reminder'), reminder.date]
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
