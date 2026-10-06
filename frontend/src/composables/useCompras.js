import { ref } from 'vue'
import { callError, errorKind } from '@/utils/contactos'

// Compras: prepare a purchase, receive what arrived (Escáner), come back to
// the same order. Native Material Request / Purchase Order / Purchase Receipt
// stay the records; Doco's purchasing service owns every read and write.
// Pure helpers live here so the pages and tests share them.

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

const SERVICE = 'doco.workspaces.purchasing'
// Translation context: short generic words stay Compras-only in the catalog.
export const CTX = 'Compras'

/** POST to the Compras service; a refusal keeps the server's message and type. */
export async function comprasApi(method, args = {}) {
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
        'No connection. Your changes stay on screen; reconnect and check the result.',
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

export const comprasBoot = ref(null)
let bootPending
/** Compras capability, cached per page load; refresh re-reads permissions. */
export function loadComprasBoot({ refresh = false } = {}) {
  if (comprasBoot.value && !refresh) return Promise.resolve(comprasBoot.value)
  if (bootPending) return bootPending
  bootPending = comprasApi('crm.api.compras.get_capabilities')
    .then((data) => (comprasBoot.value = data || { enabled: false }))
    .catch(() => (comprasBoot.value = { enabled: false, failed: true }))
    .finally(() => (bootPending = null))
  return bootPending
}

export const SEGMENTS = Object.freeze([
  { value: 'por-comprar', label: 'To buy', icon: 'shopping-cart' },
  { value: 'por-recibir', label: 'To receive', icon: 'truck' },
  { value: 'historial', label: 'History', icon: 'archive' },
])
export function segmentLabel(value) {
  return tr(
    SEGMENTS.find((s) => s.value === value)?.label || 'To buy',
    null,
    CTX,
  )
}
export function normalizeSegment(value) {
  return SEGMENTS.some((s) => s.value === value) ? value : 'por-comprar'
}

/** A stable id per user action: retries of the SAME action reuse it. */
export function requestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function recordRoute(row) {
  return row.kind === 'solicitud' || row.doctype === 'Material Request'
    ? { name: 'CompraSolicitud', params: { name: row.name } }
    : { name: 'CompraOrden', params: { name: row.name } }
}

export function qty(value) {
  const number = Number(value || 0)
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(
    number,
  )
}

export function money(value, currency) {
  if (value === null || value === undefined) return ''
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'MXN',
    }).format(Number(value))
  } catch {
    return `${qty(value)} ${currency || ''}`.trim()
  }
}

/** «Recibido 1 de 3 · faltan 2» when the order has one unit; % otherwise. */
export function progressLabel(row) {
  if (row.ordered_qty !== null && row.ordered_qty !== undefined) {
    const ordered = Number(row.ordered_qty)
    const received = Number(row.received_qty || 0)
    const unit = row.uom ? ` ${row.uom}` : ''
    if (received <= 0)
      return tr('Nothing received of {0}', [qty(ordered) + unit])
    const missing = Math.max(ordered - received, 0)
    return missing > 0
      ? tr('Received {0} of {1} · {2} missing', [
          qty(received),
          qty(ordered) + unit,
          qty(missing),
        ])
      : tr('Received {0} of {1}', [qty(received), qty(ordered) + unit])
  }
  if (row.per_received !== undefined && row.per_received !== null)
    return tr('{0}% received', [qty(row.per_received)])
  return ''
}

export function statusLabel(row) {
  if (row.kind === 'solicitud' || row.doctype === 'Material Request') {
    return Number(row.per_ordered || 0) > 0
      ? tr('Request · {0}% ordered', [qty(row.per_ordered)])
      : tr('Request · to order')
  }
  if (Number(row.docstatus) === 0) return tr('Draft', null, CTX)
  if (Number(row.docstatus) === 2) return tr('Cancelled', null, CTX)
  const map = {
    'To Receive and Bill': 'To receive',
    'To Receive': 'To receive',
    'To Bill': 'Received',
    Completed: 'Completed',
    Closed: 'Closed',
    'On Hold': 'On hold',
    Delivered: 'Delivered',
  }
  return tr(map[row.status] || row.status || '', null, CTX)
}

// Return-to protocol (shell §8.3): local path, allowed prefix, ≤ 2048 chars.
const RETURN_PREFIXES = ['/crm/', '/posapp/', '/scan/', '/taller/', '/app/']
export function safeReturn(value) {
  if (typeof value !== 'string' || !value || value.length > 2048) return null
  if (
    value.startsWith('//') ||
    [...value].some(
      (ch) => ch === '\\' || ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127,
    )
  )
    return null
  let url
  try {
    url = new URL(value, 'https://muelle.invalid')
  } catch {
    return null
  }
  if (url.origin !== 'https://muelle.invalid') return null
  let decoded
  try {
    decoded = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  if (decoded.split('/').some((part) => part === '.' || part === '..'))
    return null
  if (!RETURN_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)))
    return null
  return url.pathname + url.search + url.hash
}

/** `done=<doctype>:<name>` from a hand-off we started (Escáner receipt). */
export function parseDone(value) {
  if (typeof value !== 'string') return null
  const index = value.indexOf(':')
  if (index < 1) return null
  const doctype = value.slice(0, index)
  const name = value.slice(index + 1)
  return ['Purchase Receipt', 'Purchase Order'].includes(doctype) && name
    ? { doctype, name }
    : null
}

/** Escáner's receipt editor, with the way back to this order. */
export function scannerReceiptUrl(receipt, order) {
  const query = new URLSearchParams({
    return_to: `/crm/compras/orden/${encodeURIComponent(order)}`,
    return_label: 'Compras',
  })
  return `/scan/docs/PR/${encodeURIComponent(receipt)}?${query}`
}

/** The request may have committed without us hearing back: no connection, a
 *  gateway timeout, or the same request still being saved. Retries must reuse
 *  the same request id; anything else is an answer (nothing was written). */
export function outcomeUnknown(error) {
  return Boolean(
    error?.offline || [429, 502, 503, 504].includes(Number(error?.status)),
  )
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
      title: tr('Someone else changed this purchase'),
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

/** Editor rows → the allowlisted payload the service accepts. A saved order
 *  carries how many rows the editor loaded, so a partial view never replaces
 *  the whole row list. */
export function orderPayload(form) {
  return {
    ...(form.name ? { name: form.name, modified: form.modified } : {}),
    ...(form.name && Number.isInteger(form.row_total)
      ? { row_total: form.row_total }
      : {}),
    supplier: form.supplier || null,
    company: form.company || null,
    schedule_date: form.schedule_date || null,
    set_warehouse: form.set_warehouse || null,
    items: form.items.map((row) => ({
      ...(row.name ? { name: row.name } : {}),
      item_code: row.item_code,
      qty: Number(row.qty),
      ...(row.uom ? { uom: row.uom } : {}),
      ...(row.rate !== '' && row.rate !== null && row.rate !== undefined
        ? { rate: Number(row.rate) }
        : {}),
      ...(row.warehouse ? { warehouse: row.warehouse } : {}),
    })),
  }
}

/** What still blocks a save, as field keys, so the editor can point at them. */
export function missingFields(form) {
  const missing = []
  if (!form.supplier) missing.push('supplier')
  if (!form.company) missing.push('company')
  if (!form.schedule_date) missing.push('schedule_date')
  if (!form.set_warehouse && form.items.some((row) => !row.warehouse))
    missing.push('warehouse')
  if (!form.items.length) missing.push('items')
  if (form.items.some((row) => !(Number(row.qty) > 0))) missing.push('qty')
  return missing
}

export const MISSING_LABELS = Object.freeze({
  supplier: 'supplier',
  company: 'company',
  schedule_date: 'delivery date',
  warehouse: 'destination warehouse',
  items: 'items',
  qty: 'quantities above zero',
})

const DRAFT_PREFIX = 'muelle:compras:draft:'
/** Unsaved editor input survives a reload of this tab (purged on logout with
 *  the other `muelle:` keys); it is never sent on its own. */
export function saveDraft(key, form) {
  try {
    sessionStorage.setItem(
      DRAFT_PREFIX + key,
      JSON.stringify({ at: Date.now(), form }),
    )
  } catch {
    /* storage is a convenience */
  }
}
export function loadDraft(key) {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(DRAFT_PREFIX + key) || 'null',
    )
    return value && value.form ? value : null
  } catch {
    return null
  }
}
export function clearDraft(key) {
  try {
    sessionStorage.removeItem(DRAFT_PREFIX + key)
  } catch {
    /* ignore */
  }
}

/** Every row page of one order, so review, comparison and recovery never work
 *  from the first page alone. `api` is `comprasApi` (injected for tests). */
export async function loadWholeOrder(api, name, limit = 5000) {
  let payload = await api('order', { name })
  let rows = payload.rows || []
  while (payload.rows_scope?.has_more && rows.length < limit) {
    const next = await api('order', { name, row_start: rows.length })
    if (!next.rows?.length) break
    rows = rows.concat(next.rows)
    payload = { ...payload, rows_scope: next.rows_scope }
  }
  return { ...payload, rows, complete: !payload.rows_scope?.has_more }
}

/** The single destination applies to every row that followed the previous one
 *  (or had none); a row sent elsewhere on purpose keeps its warehouse. */
export function followDestination(items, previous, next) {
  for (const row of items) {
    if (!row.warehouse || row.warehouse === previous) row.warehouse = next || ''
  }
  return items
}

/** «Reapply my changes» on top of the current version. Rows the other person
 *  removed come back as new rows only when they carry no request link: a row
 *  of a purchase request recreated without its link would leave that demand
 *  open and get it ordered twice, so it is listed for review instead. */
export function reapplyRows(items, currentRows) {
  const live = new Set(currentRows.map((row) => row.name))
  const kept = []
  const dropped = []
  for (const row of items) {
    if (!row.name || live.has(row.name)) kept.push(row)
    else if (row.material_request) dropped.push(row)
    else kept.push({ ...row, name: '' })
  }
  return { items: kept, dropped }
}

const PENDING_PREFIX = 'muelle:compras:pending:'
/** A creation sent but not yet confirmed: its request id and the exact payload
 *  are stored BEFORE dispatch, so a reload asks the server about the same
 *  operation instead of creating a second purchase. */
export function rememberPendingSave(key, operation) {
  try {
    sessionStorage.setItem(
      PENDING_PREFIX + key,
      JSON.stringify({ ...operation, at: operation.at || Date.now() }),
    )
  } catch {
    /* the in-memory id still covers retries in this page */
  }
}
export function pendingSave(key) {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(PENDING_PREFIX + key) || 'null',
    )
    return value && value.request_id && value.data ? value : null
  } catch {
    return null
  }
}
export function forgetPendingSave(key) {
  try {
    sessionStorage.removeItem(PENDING_PREFIX + key)
  } catch {
    /* ignore */
  }
}

/** Create (or re-ask about) a new purchase: one operation per form until the
 *  server answers. Returns the server result; keeps the operation when the
 *  outcome is unknown, drops it on a definite answer. */
export async function createOrder(api, key, form) {
  const operation = pendingSave(key) || {
    request_id: requestId(),
    data: orderPayload(form),
  }
  rememberPendingSave(key, operation)
  try {
    const result = await api('save_order', {
      request_id: operation.request_id,
      data: operation.data,
    })
    forgetPendingSave(key)
    return {
      ...result,
      resent:
        JSON.stringify(operation.data) !== JSON.stringify(orderPayload(form)),
    }
  } catch (error) {
    if (!outcomeUnknown(error)) forgetPendingSave(key)
    throw error
  }
}
