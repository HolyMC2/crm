// Aprobaciones in Pendientes: «Por aprobar» (segment=approve) and «Esperando
// respuesta» (segment=waiting). Rows come from the owners through
// doco.pendientes.aprobaciones; each one opens its owner's screen with the way
// back here, and that screen returns with `done=<doctype>:<name>`.
// Pure helpers live here so the list, the banner and their tests share them.
import { callError, formatMoment } from '@/utils/contactos'
import {
  defaultReturnLabel,
  readDone,
  safeReturn,
  sanitizeReturnLabel,
  withoutDone,
} from '@/vendor/muelle-shell/contracts'
import { pendienteError, requestId, toQuery } from '@/composables/usePendientes'

// English source strings; the es-MX catalog (crm/locale/es.po) translates them.
const t = (text, replace) =>
  globalThis.window?.__
    ? globalThis.window.__(text, replace)
    : replace
      ? text.replace(/{(\d+)}/g, (match, index) => replace[index] ?? match)
      : text

const SERVICE = 'doco.pendientes.aprobaciones'
export const VIEWS = Object.freeze({ approve: 'decide', waiting: 'waiting' })
// Owner screens: the shell's own pages and Desk pages of their apps (Asistencia).
export const TARGET_PREFIXES = Object.freeze(['/crm/', '/app/'])

/** Same request as frappe-ui's call, keeping exc_type for recovery. */
export async function aprobacionesApi(method, args = {}) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Frappe-Site-Name': window.location.hostname,
  }
  if (window.csrf_token && window.csrf_token !== '{{ csrf_token }}')
    headers['X-Frappe-CSRF-Token'] = window.csrf_token
  const path = method.includes('.') ? method : `${SERVICE}.${method}`
  const response = await fetch(`/api/method/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  })
  let data
  try {
    data = await response.json()
  } catch {
    data = {}
  }
  if (response.ok) return data.message
  throw callError(path, response.status, data)
}

export function approvalArgs(state, start = 0) {
  return {
    view: VIEWS[state.segment] || 'decide',
    kind: state.kind || '',
    search: state.q || '',
    start,
    page_length: 30,
  }
}

/** This list as a return target: segment, kind and search, never `done`. */
export function listPath(state) {
  const query = new URLSearchParams(toQuery(state)).toString()
  return `/crm/pendientes${query ? `?${query}` : ''}`
}

export function returnLabel(segment) {
  return segment === 'waiting' ? t('Waiting for an answer') : t('To approve')
}

/**
 * Where a row opens: its owner screen with `return_to`/`return_label` back to
 * this list. A shell route is `{ to }` (router path under /crm), a Desk page
 * `{ href }`; anything else (or a redacted row) opens nothing.
 */
export function approvalTarget(row, state) {
  const url = safeReturn(row?.url, TARGET_PREFIXES)
  if (!url) return null
  const target = new URL(url, 'https://muelle.invalid')
  target.searchParams.set('return_to', listPath(state))
  target.searchParams.set('return_label', returnLabel(state.segment))
  const href = target.pathname + target.search + target.hash
  return href.startsWith('/crm/') ? { to: href.slice(4) } : { href }
}

/** «Pide Ana · hace 2 h» / «Esperando a Juan y Pedro · hace 2 h». */
export function requestText(row, segment, options = {}) {
  const when = row?.requested_at ? formatMoment(row.requested_at, options) : ''
  const who =
    segment === 'waiting'
      ? row?.decider
        ? t('Waiting for {0}', [row.decider])
        : ''
      : row?.requested_by_name
        ? t('Asked by {0}', [row.requested_by_name])
        : ''
  return [who, when].filter(Boolean).join(' · ')
}

/** The record an owner screen reported back (`done=<doctype>:<name>`), or null. */
export function doneOf(query = {}) {
  return typeof query.done === 'string'
    ? readDone(new URLSearchParams({ done: query.done }))
    : null
}

/** The current list without `done`, for router.replace after reading it. */
export function withoutDoneQuery(query = {}) {
  const rest = { ...query }
  delete rest.done
  return rest
}

export function rowKey(row) {
  return `${row.kind}:${row.doctype}:${row.name}:${row.ask || ''}`
}

/** What the person asked can do on this row, besides opening it. */
export function rowActions(row, segment) {
  if (segment !== 'approve' || !row) return []
  const out = []
  const guard = row.guard
  if (row.ask && row.state === 'pending' && guard?.code !== 'no_access') {
    if (row.settle) out.push({ key: 'settle', label: t('Done') })
    out.push({ key: 'decline', label: t("Don't approve") })
  }
  return out
}

export function countText(count) {
  if (!count || !count.value) return ''
  return count.capped ? `${count.value}+` : String(count.value)
}

/** The owner screen finished: back to the list it came from, saying what. */
export function completeTo(returnTo, doctype, name) {
  const target = safeReturn(returnTo, ['/crm/'])
  if (!target) return null
  const url = new URL(target, 'https://muelle.invalid')
  url.searchParams.delete('done')
  if (doctype && name) url.searchParams.set('done', `${doctype}:${name}`)
  return url.pathname + url.search + url.hash
}

/**
 * The way back an owner screen was opened with (`return_to`/`return_label`,
 * shell return protocol), limited to this SPA; null when absent or unsafe.
 */
export function ownerReturn(query = {}) {
  const to =
    typeof query.return_to === 'string'
      ? safeReturn(query.return_to, ['/crm/'])
      : null
  if (!to) return null
  return {
    to,
    label: sanitizeReturnLabel(query.return_label) || defaultReturnLabel(to),
  }
}

/** Go to a /crm/ path inside the SPA (router), anything else as a page load. */
export function goTo(router, path) {
  if (!path) return null
  return path.startsWith('/crm/')
    ? router.push(path.slice(4))
    : window.location.assign(path)
}

export { pendienteError as approvalError, requestId, withoutDone }
