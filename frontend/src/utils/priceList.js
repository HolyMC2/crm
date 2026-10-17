// Price-list names as a shop reads them (Shell program SPEC §1.4, §2.2 pattern 7).
// ERPNext ships «Standard Selling» / «Standard Buying»; a worker sees «Precio de
// venta» / «Precio de compra», and the default list is not repeated on every row.
// Other lists (Payjoy, Mayoreo…) are the shop's own names and pass through.

const DEFAULT_LISTS = {
  'Standard Selling': 'Precio de venta',
  'Standard Buying': 'Precio de compra',
}

/** The es-MX name of a price list; '' when there is none. */
export function priceListLabel(name) {
  const text = String(name ?? '').trim()
  if (!text) return ''
  return DEFAULT_LISTS[text] || text
}

/**
 * The note under a price: only a non-default list needs one (the default list
 * is what «Precio de venta» already says). '' when nothing should be shown.
 */
export function priceListNote(name) {
  const text = String(name ?? '').trim()
  if (!text || DEFAULT_LISTS[text]) return ''
  return priceListLabel(text)
}
