import { ref } from 'vue'
import { callError, errorKind } from '@/utils/contactos'
import { listKeys, pathWithQuery, textParam } from '@/utils/powerList'
import {
  RETURN_PREFIXES as SHELL_RETURN_PREFIXES,
  completeReturn,
} from '@/vendor/muelle-shell/contracts'

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
  // What arrived and still waits for the supplier's bill (then Gastos pays it).
  { value: 'por-facturar', label: 'To bill', icon: 'file-text' },
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

/** A new purchase opened from another module (Productos «Pedir»): the
 *  product, destination store and quantity it carries, validated. */
export function prefillFromQuery(query) {
  const text = (value) =>
    typeof value === 'string' && value.trim() && value.length <= 140
      ? value.trim()
      : ''
  const amount = Number(query?.qty)
  return {
    item: text(query?.item),
    warehouse: text(query?.warehouse),
    qty: Number.isFinite(amount) && amount > 0 && amount <= 1e6 ? amount : 1,
  }
}

/** «Pedir» carries a quantity in the stock unit. The line uses the purchase
 *  unit when the Item converts it (rounded up to whole units), otherwise the
 *  stock unit; `note` says both. */
export function prefillLine(option, stockQty) {
  const stock = option.stock_uom || option.uom
  const purchase = option.uom || stock
  const amount = Number(stockQty)
  const uoms = option.uoms || []
  const factor = Number(uoms.find((row) => row.uom === purchase)?.factor)
  if (purchase === stock) return { uom: stock, qty: amount, uoms, note: '' }
  if (Number.isFinite(factor) && factor > 0) {
    const units = Math.ceil(amount / factor - 1e-9)
    const exact = Math.abs(units * factor - amount) < 1e-9
    return {
      uom: purchase,
      qty: units,
      uoms,
      note: exact
        ? tr('{0} {1} = {2} {3}', [qty(amount), stock, qty(units), purchase])
        : tr('{0} {1}, rounded up to {2} {3} ({4} {5})', [
            qty(amount),
            stock,
            qty(units),
            purchase,
            qty(units * factor),
            stock,
          ]),
    }
  }
  return {
    uom: stock,
    qty: amount,
    uoms: uoms.some((row) => row.uom === stock)
      ? uoms
      : [...uoms, { uom: stock, factor: 1 }],
    note: '',
  }
}

/** The way back to the module that started this purchase, saying what was saved. */
export function returnWithDone(target, doctype, name) {
  if (!target || !name) return target
  try {
    return completeReturn(target, { doctype, name }, [
      ...SHELL_RETURN_PREFIXES,
      '/app/',
    ])
  } catch {
    return target
  }
}

/** `done=<doctype>:<name>` from a hand-off we started (Escáner receipt). */
export function parseDone(value) {
  if (typeof value !== 'string') return null
  const index = value.indexOf(':')
  if (index < 1) return null
  const doctype = value.slice(0, index)
  const name = value.slice(index + 1)
  return ['Purchase Receipt', 'Purchase Order', 'Purchase Invoice'].includes(
    doctype,
  ) && name
    ? { doctype, name }
    : null
}

/** The order's record path under the shell; `list` keeps the queue to return to. */
export function orderPath(order, list = '') {
  const path = `/crm/compras/orden/${encodeURIComponent(order)}`
  return list && list.startsWith('/compras')
    ? `${path}?${new URLSearchParams({ list })}`
    : path
}

/** Escáner's receipt editor, with the way back to this order (and its queue). */
export function scannerReceiptUrl(receipt, order, list = '') {
  const query = new URLSearchParams({
    return_to: orderPath(order, list),
    return_label: 'Compras',
  })
  return `/scan/docs/PR/${encodeURIComponent(receipt)}?${query}`
}

/** The supplier bill in Gastos, with the way back here (`/crm/…`). */
export function billRoute(bill, returnTo) {
  return {
    name: 'GastoFactura',
    params: { name: bill },
    query: { return_to: returnTo, return_label: 'Compras' },
  }
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

// ── Power worklist: URL state, keyboard, the next step from the list, bulk ─
// Agenda/Cobranza standard: the URL is the list's state (list, search,
// focused purchase), the keyboard works the list and starts each step of the
// chain (confirm → receive in Escáner → register the supplier's bill), and
// several prepared purchases are confirmed in one go with one result each.

// Receiving (Escáner saves its draft receipt), billing and requests all change
// what each queue shows.
export const LIVE_DOCTYPES = Object.freeze([
  'Purchase Order',
  'Material Request',
  'Purchase Receipt',
  'Purchase Invoice',
])

/** The queue's state, read from the URL (the URL is the state). */
export function queueState(query = {}) {
  return {
    segment: normalizeSegment(textParam(query.segment)),
    q: textParam(query.q),
    foco: textParam(query.foco),
  }
}

/** Scroll memory is per list (its filters), never per focused purchase. */
export function listMemoryKey(query = {}) {
  const s = queueState(query)
  return `muelle:compras:list:${s.segment}|${s.q}`
}

/** `/compras?…` for a query: the record keeps it to come back to the same row. */
export function listHref(query = {}) {
  return pathWithQuery('/compras', query)
}

/** A row's key in the mixed «Por comprar» list (orders and requests). */
export function rowKey(row) {
  return `${row.doctype || (row.kind === 'solicitud' ? 'Material Request' : 'Purchase Order')}:${row.name}`
}

export const QUEUE_VERBS = Object.freeze({
  o: 'confirm',
  r: 'receive',
  f: 'bill',
})
export const QUEUE_KEYS = listKeys(QUEUE_VERBS)
export const RECORD_KEYS = Object.freeze({
  o: 'confirm',
  r: 'receive',
  f: 'bill',
  escape: 'back',
})

/** The queue's own keys for the Alt+H sheet: only what this worker may do. */
export function queueShortcuts(caps = {}) {
  return [
    caps.confirm && {
      id: 'compras.confirm',
      keys: ['o'],
      description: 'Review and confirm the purchase',
    },
    caps.receive && {
      id: 'compras.receive',
      keys: ['r'],
      description: 'Receive in Escáner',
    },
    {
      id: 'compras.bill',
      keys: ['f'],
      description: "Register the supplier's bill",
    },
  ].filter(Boolean)
}

export function recordShortcuts(caps = {}) {
  return [
    ...queueShortcuts(caps),
    { id: 'compras.back', keys: ['escape'], description: 'Back to the list' },
  ]
}

const isOrder = (row) =>
  row?.kind !== 'solicitud' && row?.doctype !== 'Material Request'

/**
 * What a verb does on a row: go ahead (`kind: 'go'`) or the reason with the
 * step that comes first (`kind` names it: open the request, confirm, receive).
 */
export function rowStep(row, verb, { caps = {}, scanner = null } = {}) {
  if (!row) return { kind: 'none' }
  if (!isOrder(row))
    return {
      kind: 'open',
      text: tr(
        'A purchase request becomes a purchase first. Open it to prepare one.',
      ),
    }
  const docstatus = Number(row.docstatus)
  if (verb === 'confirm') {
    if (docstatus !== 0)
      return { kind: 'done', text: tr('This purchase is already confirmed.') }
    if (!caps.confirm)
      return {
        kind: 'handoff',
        action: 'confirm',
        text: tr(
          'Confirming purchases is for whoever may confirm them. Ask for it.',
        ),
      }
    return { kind: 'go' }
  }
  if (docstatus === 0)
    return {
      kind: 'confirm',
      text: tr(
        'Confirm this purchase first; then it can be received and billed.',
      ),
    }
  if (docstatus === 2)
    return { kind: 'done', text: tr('This purchase is cancelled.') }
  if (verb === 'receive') {
    if (Number(row.per_received || 0) >= 100)
      return { kind: 'done', text: tr('Everything on this purchase arrived.') }
    if (['Closed', 'On Hold'].includes(row.status))
      return {
        kind: 'open',
        text: tr('This purchase is on hold or closed; it cannot be received.'),
      }
    if (!caps.receive)
      return {
        kind: 'handoff',
        action: 'receive_access',
        text: tr('You cannot register receipts yet. Ask for access.'),
      }
    if (scanner && !scanner.ready)
      return {
        kind: 'handoff',
        action: 'receive_access',
        text: scanner.reason || tr('Escáner is not ready for your user.'),
      }
    return { kind: 'go' }
  }
  if (verb === 'bill') {
    if (Number(row.per_billed || 0) >= 100)
      return {
        kind: 'bills',
        text: tr('This purchase is billed. Its bills are in Gastos.'),
      }
    if (Number(row.per_received || 0) <= 0)
      return {
        kind: 'receive',
        text: tr('Nothing has arrived yet. Receive it in Escáner first.'),
      }
    return { kind: 'go' }
  }
  return { kind: 'none' }
}

/** Which selected rows «Confirmar» can confirm: prepared purchases (drafts). */
export function bulkConfirmPlan(rows = []) {
  const ready = []
  const skipped = []
  for (const row of rows) {
    const step = rowStep(row, 'confirm', { caps: { confirm: true } })
    if (step.kind === 'go') ready.push(row)
    else skipped.push({ row, reason: step.text })
  }
  return { ready, skipped }
}
