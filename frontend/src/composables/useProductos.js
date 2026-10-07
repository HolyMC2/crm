import { ref } from 'vue'
import { errorKind } from '@/utils/contactos'
import {
  RETURN_PREFIXES,
  safeReturn as contractReturn,
} from '@/vendor/muelle-shell/contracts'
import {
  comprasApi,
  outcomeUnknown,
  qty,
  requestId,
} from '@/composables/useCompras'

// Productos: a product's price and stock. Native Item, Item Price, Bin and
// Stock Ledger Entry stay the records; Doco's products service owns every
// read and write, Mercado's owner path every price change and Escáner every
// count. Pure helpers live here so the pages and tests share them.

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

const SERVICE = 'doco.workspaces.products'
// Translation context: short generic words stay Productos-only in the catalog.
export const CTX = 'Productos'

/** POST to the Productos service; a refusal keeps the server's message and type. */
export function productosApi(method, args = {}) {
  return comprasApi(
    method.includes('.') ? method : `${SERVICE}.${method}`,
    args,
  )
}

export { outcomeUnknown, qty, requestId }

// Return protocol (shell §8.3): the Muelle SPAs plus Desk, where the
// Inventario lists and price hand-offs start.
const RETURN_ALLOWED = Object.freeze([...RETURN_PREFIXES, '/app/'])
export function safeReturn(value) {
  return contractReturn(value, RETURN_ALLOWED)
}

export const productosBoot = ref(null)
let bootPending
/** Productos capability, cached per page load; refresh re-reads permissions. */
export function loadProductosBoot({ refresh = false } = {}) {
  if (productosBoot.value && !refresh)
    return Promise.resolve(productosBoot.value)
  if (bootPending) return bootPending
  bootPending = productosApi('bootstrap')
    .then((data) => (productosBoot.value = data || { enabled: false }))
    .catch((error) => {
      productosBoot.value = {
        enabled: false,
        failed: true,
        reason: error?.messages?.join(' ') || '',
      }
      return productosBoot.value
    })
    .finally(() => (bootPending = null))
  return bootPending
}

export const VIEWS = Object.freeze([
  { value: 'todos', label: 'All products', icon: 'package' },
  { value: 'sin-precio', label: 'No price', icon: 'tag' },
  { value: 'precio-revisar', label: 'Price to review', icon: 'alert-triangle' },
  { value: 'faltan', label: 'Out of stock', icon: 'alert-octagon' },
  { value: 'bajo-minimo', label: 'Below minimum', icon: 'trending-down' },
])
export function viewLabel(value) {
  return tr(
    VIEWS.find((v) => v.value === value)?.label || 'All products',
    null,
    CTX,
  )
}
export function normalizeView(value) {
  return VIEWS.some((v) => v.value === value) ? value : 'todos'
}

/** The product record, remembering the list it was opened from. */
export function productRoute(row, list) {
  return {
    name: 'Producto',
    params: { item: row.name },
    query: list ? { list } : {},
  }
}

/** «5 Pza · 2 stores» from the row's stock in the chosen stores. */
export function stockLabel(row) {
  const stock = row.stock || {}
  const unit = row.uom ? ` ${row.uom}` : ''
  if (row.warehouse)
    return tr('{0} on hand in {1} · minimum {2}', [
      qty(row.actual_qty) + unit,
      row.warehouse,
      qty(row.reorder_level),
    ])
  if (!stock.stores) return row.stock_item === false ? '' : tr('No stock')
  return stock.stores > 1
    ? tr('{0} in {1} stores', [qty(stock.qty) + unit, stock.stores])
    : qty(stock.qty) + unit
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

/** Server messages may carry a link; the page shows text and its own actions. */
export function plain(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Plain, actionable recovery for a failed call. */
export function problemOf(error) {
  const kind = errorKind(error)
  const detail = plain(
    error?.messages?.join(' ') || error?.message || tr('Something went wrong.'),
  )
  if (outcomeUnknown(error))
    return {
      kind: 'offline',
      title: tr('We do not know if it was saved'),
      detail,
      action: tr('Check result'),
    }
  if (kind === 'conflict')
    return {
      kind,
      title: tr('Someone else changed this product'),
      detail,
      action: tr('Refresh and compare'),
    }
  if (kind === 'permission')
    return {
      kind,
      title: tr('Not allowed', null, CTX),
      detail,
      action: tr('Ask for the change'),
    }
  return { kind: 'error', title: tr('Could not finish'), detail, action: null }
}

/** How big a price change is, and whether it needs an explicit OK. */
export function priceCheck(row, value) {
  const next = Number(value)
  const old =
    row.rate === null || row.rate === undefined ? null : Number(row.rate)
  const valid = Number.isFinite(next) && next > 0
  const changed = valid && (old === null || Math.abs(next - old) > 1e-9)
  const percent =
    changed && old ? Math.round((Math.abs(next - old) / old) * 1000) / 10 : 0
  const large =
    changed && old !== null && percent >= Number(row.warning_percent || 0)
  return {
    valid,
    changed,
    first: old === null,
    percent,
    large: Boolean(large && row.warning_percent),
    needsAck: Boolean(
      changed && (row.requires_ack || (large && row.warning_percent)),
    ),
  }
}

/** The lists the worker changed, against the revision each one was reviewed at. */
export function pricePayload(rows, drafts, acknowledged = {}) {
  const prices = {}
  const expected = {}
  const ack = []
  for (const row of rows) {
    if (!row.can_write) continue
    const value = drafts[row.price_list]
    if (value === '' || value === null || value === undefined) continue
    const check = priceCheck(row, value)
    if (!check.valid || !check.changed) continue
    prices[row.price_list] = Number(value)
    expected[row.price_list] = row.revision || null
    if (check.needsAck && acknowledged[row.price_list]) ack.push(row.price_list)
  }
  return { prices, expected, acknowledged: ack }
}

/** Lists that still need the worker's OK before saving. */
export function missingAcks(rows, drafts, acknowledged = {}) {
  return rows
    .filter((row) => row.can_write)
    .filter((row) => {
      const value = drafts[row.price_list]
      if (value === '' || value === null || value === undefined) return false
      return priceCheck(row, value).needsAck && !acknowledged[row.price_list]
    })
    .map((row) => row.price_list)
}

const EDIT_FIELDS = [
  'item_name',
  'item_group',
  'brand',
  'description',
  'disabled',
]
/** Only what the worker changed; barcodes travel as the whole visible list. */
export function editPayload(original, form) {
  const data = {}
  for (const field of EDIT_FIELDS) {
    const before =
      field === 'disabled'
        ? Number(original[field] || 0)
        : original[field] || ''
    const after =
      field === 'disabled'
        ? Number(form[field] || 0)
        : (form[field] || '').trim()
    if (before !== after) data[field] = after
  }
  const codes = (list) =>
    (list || [])
      .map((row) => ({
        barcode: String(row.barcode || '').trim(),
        barcode_type: row.barcode_type || '',
      }))
      .filter((row) => row.barcode)
  if (
    JSON.stringify(codes(original.barcodes)) !==
    JSON.stringify(codes(form.barcodes))
  )
    data.barcodes = codes(form.barcodes)
  return data
}

/** `done=Purchase Order:<name>` from a hand-off we started (Compras). */
export function parseDone(value) {
  if (typeof value !== 'string') return null
  const index = value.indexOf(':')
  if (index < 1) return null
  const doctype = value.slice(0, index)
  const name = value.slice(index + 1)
  return ['Purchase Order', 'Material Request'].includes(doctype) && name
    ? { doctype, name }
    : null
}

export function recordPath(item) {
  return `/crm/productos/${encodeURIComponent(item)}`
}

/** «Pedir»: a new purchase in Compras with this product, store and quantity,
 *  and the way back to this product. */
export function purchaseRoute(item, { warehouse, qty: amount } = {}) {
  const query = {
    item,
    return_to: recordPath(item),
    return_label: 'Productos',
  }
  if (warehouse) query.warehouse = warehouse
  if (Number(amount) > 0) query.qty = String(Number(amount))
  return { name: 'CompraNueva', query }
}

/** Escáner's product page (cajón, mover), with the way back here. */
export function scannerItemUrl(item) {
  const query = new URLSearchParams({
    return_to: recordPath(item),
    return_label: 'Productos',
  })
  return `/scan/item/${encodeURIComponent(item)}?${query}`
}

/** Where «Back» goes: an allowed return_to, the list it came from, or Productos. */
export function backTarget(query) {
  const external = safeReturn(query?.return_to)
  if (external) return { href: external }
  const list = typeof query?.list === 'string' ? query.list : ''
  if (list.startsWith('/productos')) return { to: list }
  return { to: { name: 'Productos' } }
}

/** A Desk form opened this product to change a price: tell it the price is
 *  saved (same message Mercado sends), only to a same-origin Desk opener. */
export function notifyPriceOpener(query, user, item, win = window) {
  const token = query?.context
  if (
    typeof token !== 'string' ||
    !/^[a-zA-Z0-9_-]{16,128}$/.test(token) ||
    query.site !== win.location.host ||
    !user ||
    query.user !== user
  )
    return false
  try {
    const opener = win.opener
    if (
      !opener ||
      opener.closed ||
      opener.location.origin !== win.location.origin
    )
      return false
    if (!/^\/(?:app|doco)(?:\/|$)/.test(opener.location.pathname)) return false
    opener.postMessage(
      {
        type: 'mercado:price-return',
        token,
        item_code: item,
        site: win.location.host,
        user,
      },
      win.location.origin,
    )
    return true
  } catch {
    return false
  }
}

export const ACTIONS = Object.freeze(['precio', 'editar', 'conteo'])
export function requestedAction(query) {
  return ACTIONS.includes(query?.accion) ? query.accion : null
}
