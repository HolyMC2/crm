// The way into Precios from other pages (a document's tools, a Productos
// selection), kept apart from usePrecios so those pages do not load it.

// Where a document's products come from, in the worker's words.
export const SOURCE_NAMES = Object.freeze({
  'Purchase Receipt': 'Recepción',
  'Purchase Invoice': 'Factura de proveedor',
  'Purchase Order': 'Orden de compra',
  'Supplier Quotation': 'Cotización de proveedor',
  'Material Request': 'Solicitud de material',
  'Stock Entry': 'Movimiento de almacén',
  'Stock Reconciliation': 'Ajuste de inventario',
  'Delivery Note': 'Entrega',
  'Sales Invoice': 'Factura',
})
export const SOURCE_DOCTYPES = Object.freeze(Object.keys(SOURCE_NAMES))
export function sourceName(doctype) {
  return SOURCE_NAMES[doctype] || 'Documento'
}

/** The shell link that opens Precios on a document or a selection. */
export function preciosHref({
  desde = '',
  codigos = [],
  returnTo = '',
  returnLabel = '',
} = {}) {
  const params = new URLSearchParams()
  if (desde) params.set('desde', desde)
  const codes = [...new Set(codigos.filter(Boolean))]
  if (codes.length) params.set('codigos', codes.join(','))
  if (returnTo) params.set('return_to', returnTo)
  if (returnLabel) params.set('return_label', returnLabel)
  const query = params.toString()
  return `/productos/precios${query ? `?${query}` : ''}`
}
