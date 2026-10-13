// Atención a clientes in Conversaciones: «Por responder», the due chip and «Resolver».
// Pure helpers shared by the queue, the conversation header, the resolve sheet and tests.
// The clock is the inbox's own response clock (doco_marketing get_reply_queue rows carry
// waiting_secs / sla_overdue / due_in_secs); nothing here decides who is owed an answer.

export const REPLY_TAB = 'por-responder'

function tr(message, replace) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

/** «25 min» · «3 h» · «2 d» — how long, without a sign. */
export function span(secs) {
  const s = Math.abs(Math.trunc(Number(secs) || 0))
  if (s < 3600) return tr('{0} min', [Math.max(1, Math.floor(s / 60))])
  if (s < 86400) return tr('{0} h', [Math.floor(s / 3600)])
  return tr('{0} d', [Math.floor(s / 86400)])
}

/** True when the customer is waiting for our answer on this row. */
export function owed(row) {
  return row?.waiting_secs !== null && row?.waiting_secs !== undefined
}

/**
 * The one due chip of a conversation, in plain words:
 * «Venció hace 25 min» (red) · «Vence en 12 min» (amber) · «Esperando 3 h» (no limit set).
 * null when nobody is waiting.
 */
export function dueChip(row) {
  if (!owed(row)) return null
  const due = row.due_in_secs
  if (row.sla_overdue)
    return {
      tone: 'red',
      text: tr('Overdue by {0}', [
        span(due !== null && due !== undefined ? due : row.waiting_secs),
      ]),
    }
  if (due !== null && due !== undefined)
    return { tone: 'amber', text: tr('Due in {0}', [span(due)]) }
  return { tone: 'gray', text: tr('Waiting {0}', [span(row.waiting_secs)]) }
}

export const CHIP_CLASS = {
  red: 'bg-surface-red-2 text-ink-red-8',
  amber: 'bg-surface-amber-2 text-ink-amber-9',
  gray: 'bg-surface-gray-2 text-ink-gray-7',
}

export function rowKey(row) {
  return `${row?.ref_doctype || 'CRM Deal'}:${row?.name}`
}

/** The next conversation to answer after `doctype:name`, from the reloaded queue. */
export function nextReplyRow(rows, doctype, name) {
  const current = `${doctype || 'CRM Deal'}:${name}`
  return (rows || []).find((row) => rowKey(row) !== current) || null
}

/** The inbox tab a URL asks for (only «Por responder» lives in the URL). */
export function tabFromQuery(query) {
  return query?.tab === REPLY_TAB ? REPLY_TAB : null
}

/** The same URL with ?tab= for «Por responder», without it for any other tab. */
export function urlWithTab(href, tab) {
  const url = new URL(href, 'https://muelle.invalid')
  if (tab === REPLY_TAB) url.searchParams.set('tab', REPLY_TAB)
  else url.searchParams.delete('tab')
  return url.pathname + url.search + url.hash
}

/**
 * Where a guard action leads, inside the SPA (router base /crm), carrying the way back.
 * `target` is a router path such as /contactos?create=1 or /encuestas?setup=service.
 */
export function guardRoute(target, returnTo, returnLabel) {
  if (typeof target !== 'string' || !target.startsWith('/')) return null
  const url = new URL(target, 'https://muelle.invalid')
  if (returnTo) {
    url.searchParams.set('return_to', returnTo)
    url.searchParams.set('return_label', returnLabel || 'Conversaciones')
  }
  return url.pathname + url.search
}

/**
 * Go back to a caller's return_to (already checked with safeReturn): inside this SPA
 * (router base /crm) through the router, any other Muelle app by a page load.
 */
export function goToReturn(router, value) {
  if (!value) return false
  if (value.startsWith('/crm/') && router) router.push(value.slice(4))
  else window.location.assign(value)
  return true
}

/** What «Resolver» says and does: the label of the sheet's main button. */
export function resolveLabel({ ask = false, next = null } = {}) {
  if (next === 'queue')
    return ask ? tr('Resolve and next') : tr('Resolve without asking and next')
  if (next === 'return')
    return ask
      ? tr('Resolve and go back')
      : tr('Resolve without asking and go back')
  return ask ? tr('Resolve') : tr('Resolve without asking')
}

/** The header button's label: «Resolver y siguiente» when the worker came from Por responder. */
export function headerResolveLabel(next) {
  return next === 'queue' ? tr('Resolve and next') : tr('Resolve')
}
