import { ref } from 'vue'
import { callError } from '@/utils/contactos'
import {
  defaultReturnLabel,
  safeReturn,
  sanitizeReturnLabel,
} from '@/vendor/muelle-shell/contracts'

// «Capturar documento» (ARC-S2.6): a worker drops a quote, invoice, ticket or
// transfer receipt; the books capture pipeline reads it and the shell review
// turns it into a DRAFT record. Pure helpers live here so the button, the
// review page and the tests share them.

function tr(message, replace, context) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

const SERVICE = 'doco.docoutils.books.shell_capture'

export const TARGETS = Object.freeze([
  'Purchase Order',
  'Purchase Invoice',
  'Payment Entry',
  'Journal Entry',
])
// Poll the review while the pipeline reads (it takes ~10-60 s); give up
// honestly after four minutes and offer to look again.
export const POLL_MS = 2500
export const POLL_LIMIT_MS = 4 * 60 * 1000

/** POST to the capture service; a refusal carries the server's Spanish message. */
export async function capturaApi(method, args = {}) {
  const path = method.includes('.') ? method : `${SERVICE}.${method}`
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Frappe-Site-Name': window.location.hostname,
  }
  if (window.csrf_token && window.csrf_token !== '{{ csrf_token }}')
    headers['X-Frappe-CSRF-Token'] = window.csrf_token
  let response
  try {
    response = await fetch(`/api/method/${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(args),
    })
  } catch {
    const error = new Error(path)
    error.offline = true
    error.messages = [
      tr(
        'No connection. Your changes stay on screen; reconnect and try again.',
      ),
    ]
    throw error
  }
  let data
  try {
    data = await response.json()
  } catch {
    data = {}
  }
  if (response.ok) return data.message
  throw callError(path, response.status, data)
}

/** The first readable message of a failed call (server text, no HTML). */
export function capturaMessage(error) {
  const raw =
    error?.messages?.find?.((m) => typeof m === 'string' && m.trim()) || ''
  const text = String(raw)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text || tr('We could not finish. Try again in a moment.')
}

export const capturaBoot = ref(null)
let bootPending
/**
 * Companies, default company, the targets this user may create (D9), labels
 * and upload limits. Cached per page load; refresh re-reads permissions.
 */
export function loadCapturaBoot({ refresh = false } = {}) {
  if (capturaBoot.value && !refresh) return Promise.resolve(capturaBoot.value)
  if (bootPending) return bootPending
  bootPending = capturaApi('boot')
    .then((data) => (capturaBoot.value = data || { targets: {} }))
    .catch(
      () => (capturaBoot.value = { targets: {}, companies: [], failed: true }),
    )
    .finally(() => (bootPending = null))
  return bootPending
}

/** The caller's targets (preference order) that this user may create. */
export function allowedTargets(boot, targets = []) {
  return (targets || []).filter(
    (target) => TARGETS.includes(target) && boot?.targets?.[target] === true,
  )
}

const TARGET_LABELS = {
  'Purchase Order': 'Purchase order',
  'Purchase Invoice': 'Purchase invoice',
  'Payment Entry': 'Payment',
  'Journal Entry': 'Journal entry',
}
/** The server's Spanish label when it sent one, else the shell's own. */
export function targetLabel(target, boot) {
  return (
    boot?.labels?.[target] ||
    (TARGET_LABELS[target] ? tr(TARGET_LABELS[target]) : target)
  )
}

/** Why this file cannot be captured, or '' (limits and types from boot). */
export function captureProblem(file, boot) {
  if (!file) return tr('Choose a file or take a photo.')
  const limit = Number(boot?.max_mb) || 10
  if (file.size > limit * 1024 * 1024)
    return tr('This file is larger than {0} MB. Send a lighter photo or PDF.', [
      limit,
    ])
  const accept = String(boot?.accept || '.pdf,.png,.jpg,.jpeg,.webp,.heic,.xml')
    .split(',')
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean)
  const name = String(file.name || '').toLowerCase()
  return accept.some((ext) => name.endsWith(ext))
    ? ''
    : tr('Send a PDF, a photo (JPG, PNG, WEBP or HEIC) or an XML invoice.')
}

/**
 * Router location of the review page. `returnTo` is a full local path
 * (`/crm/compras?…`); an unsafe one is dropped rather than forwarded.
 */
export function capturaRoute(
  name,
  { doctype, returnTo, returnLabel, duplicate = false } = {},
) {
  const query = {}
  if (duplicate) query.duplicate = '1'
  const back = safeReturn(returnTo)
  if (back) {
    query.return_to = back
    const label = sanitizeReturnLabel(returnLabel)
    if (label) query.return_label = label
  }
  // a purchase order is reviewed in Compras; bills, payments and pólizas in Gastos
  const routeName =
    doctype === 'Purchase Order' ? 'CompraCaptura' : 'GastoCaptura'
  return { name: routeName, params: { name: String(name) }, query }
}

/** The page's way back (`return_to`/`return_label`), or null when absent/unsafe. */
export function capturaReturn(query = {}) {
  const to = safeReturn(
    typeof query.return_to === 'string' ? query.return_to : null,
  )
  if (!to) return null
  return {
    to,
    label: sanitizeReturnLabel(query.return_label) || defaultReturnLabel(to),
  }
}

/**
 * Where the created draft opens. Shell routes (`/crm/…`) become a router
 * location without the `/crm` base, carrying the original return_to/label so
 * the worker can go back; Desk routes (`/app/…`) a full URL for
 * window.location. Anything else: null.
 */
export function draftTarget(created, { returnTo, returnLabel } = {}) {
  const route = typeof created?.route === 'string' ? created.route : ''
  if (!route.startsWith('/') || route.startsWith('//')) return null
  if (route.startsWith('/crm/')) {
    if (!safeReturn(route)) return null
    const [path, search = ''] = route.slice(4).split('?')
    const query = Object.fromEntries(new URLSearchParams(search))
    const back = safeReturn(returnTo)
    if (back) {
      query.return_to = back
      const label = sanitizeReturnLabel(returnLabel)
      if (label) query.return_label = label
    }
    return { kind: 'router', to: { path, query } }
  }
  if (route.startsWith('/app/') && !/[\\\s]/.test(route))
    return { kind: 'href', href: route }
  return null
}

const LINE_STATES = {
  mapped: ['Item assigned', 'green'],
  ask: ['Choose the item', 'orange'],
  new: ['No item yet', 'orange'],
  dropped: ['Left out', 'gray'],
}
export function lineStateLabel(state) {
  return tr((LINE_STATES[state] || LINE_STATES.new)[0])
}
export function lineStateTheme(state) {
  return (LINE_STATES[state] || LINE_STATES.new)[1]
}

/** Header badge: reading, needs attention, discarded, created or to review. */
export function captureStatus(review) {
  if (!review) return { label: '', theme: 'gray' }
  if (review.created) return { label: tr('Draft created'), theme: 'green' }
  if (review.processing) return { label: tr('Reading'), theme: 'blue' }
  if (review.error) return { label: tr('Needs attention'), theme: 'red' }
  if (review.status === 'Descartado')
    return { label: tr('Discarded'), theme: 'gray' }
  return { label: tr('To review', null, 'Captura'), theme: 'orange' }
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}
/**
 * The totals check in plain words: lines + shipping + tax against what the
 * document says. `matches` comes from the server (it tolerates $1 and totals
 * written without tax); null means there was no document total to compare.
 */
export function totalsSummary(totals) {
  const t = totals || {}
  const lines = round2(t.lines)
  const shipping = round2(t.shipping)
  const tax = round2(t.tax)
  const document = round2(t.document)
  const rows = [
    { key: 'lines', label: tr('Lines', null, 'Captura'), amount: lines },
  ]
  if (shipping)
    rows.push({ key: 'shipping', label: tr('Shipping'), amount: shipping })
  if (tax) rows.push({ key: 'tax', label: tr('Tax'), amount: tax })
  const sum = round2(lines + shipping + tax)
  let verdict
  if (t.matches === true) verdict = { label: tr('Matches'), theme: 'green' }
  else if (t.matches === false)
    verdict = { label: tr('Does not match'), theme: 'red' }
  else verdict = { label: tr('Nothing to compare'), theme: 'gray' }
  return {
    rows,
    sum,
    document,
    difference: document ? round2(document - sum) : null,
    matches: t.matches === true ? true : t.matches === false ? false : null,
    verdict,
    currency: t.currency || 'MXN',
    draft: t.draft === null || t.draft === undefined ? null : round2(t.draft),
  }
}

/** Lines still waiting for an item (the blockers count them too). */
export function pendingLines(lines) {
  return (lines || []).filter((l) => l.state === 'ask' || l.state === 'new')
}
