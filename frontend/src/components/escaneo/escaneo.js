import { call } from 'frappe-ui'

// The shell's scanner talks to doco's scan-to-catalog service, the same one
// Escáner, POS and the Desk use (doco.docoutils.catalog_items), so a product
// created here is created exactly as anywhere else.
const NS = 'doco.docoutils.catalog_items'

/**
 * What a code is, in one call: {kind: 'item', item_code, item_name, via},
 * {kind: 'choose', items}, or {kind: 'unknown', prefill}. `doctype` is the
 * document the code is for, so purchasing staff may create on a purchase.
 */
export function resolveScan(code, doctype = '') {
  return call(`${NS}.resolve_scan`, {
    code,
    ...(doctype ? { ctx: { doctype } } : {}),
  })
}

export function createFromScan(args) {
  return call(`${NS}.create_item_from_scan`, args)
}

export function requestAlta(barcode, note = '') {
  return call(`${NS}.request_item_for_barcode`, {
    barcode,
    note: note || null,
    source_app: 'other',
  })
}

/** The names a create form offers for a master (groups, units). */
export async function masterNames(doctype, filters = {}) {
  const rows = await call('frappe.client.get_list', {
    doctype,
    fields: ['name'],
    filters,
    order_by: 'name asc',
    limit_page_length: 300,
  })
  return (rows || []).map((row) => row.name)
}

/**
 * A code a worker could mean as a product code: one word with a digit. A
 * typed name («funda roja») is a search, never a new product.
 */
export function looksLikeCode(text) {
  return /^(?=.*\d)\S{4,140}$/.test(String(text ?? '').trim())
}

/**
 * A typed price, read like Precios reads one (usePrecios.parseAmount):
 * «$1,234.50» is 1234.5 and a comma alone is the decimal («89,90»). Blank,
 * zero or nonsense is «no price», never a zero price.
 */
export function priceValue(text) {
  let raw = String(text ?? '').replace(/[$\s]/g, '')
  if (!raw) return null
  if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/,/g, '')
  else raw = raw.replace(',', '.')
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

/** The catalog keeps the size apart; the shelf name wants it once. */
export function suggestedName(prefill = {}) {
  const name = String(prefill.suggested_name || prefill.product_name || '')
    .replace(/\s+/g, ' ')
    .trim()
  const size = String(prefill.size || '').trim()
  if (!size || name.toLowerCase().includes(size.toLowerCase())) return name
  return name ? `${name} ${size}` : ''
}

/** The product a create answers with, in the shape a resolved scan has. */
export function createdItem(result) {
  return {
    kind: 'item',
    via: 'created',
    item_code: result.item_code,
    item_name: result.item_name || result.item_code,
    stock_uom: result.uom || null,
    created: Boolean(result.created),
  }
}
