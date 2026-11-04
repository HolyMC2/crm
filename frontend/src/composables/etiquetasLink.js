// The way into Etiquetas from other pages (a document's tools, a product, a
// record's tags), kept apart from useEtiquetas so those pages do not load it.

// The documents whose lines become labels, in the worker's words.
const SOURCE_NAMES = {
  'Purchase Receipt': 'Recepción',
  'Purchase Invoice': 'Factura de proveedor',
  'Stock Entry': 'Entrada',
  'Purchase Order': 'Orden de compra',
  'Stock Reconciliation': 'Ajuste de inventario',
}
export const SOURCE_DOCTYPES = Object.keys(SOURCE_NAMES)

export function sourceName(doctype) {
  return SOURCE_NAMES[doctype] || doctype
}

/** The shell link that opens Etiquetas with these products already on it. */
export function etiquetasHref(codes = [], { desde = '' } = {}) {
  const params = new URLSearchParams()
  if (desde) params.set('desde', desde)
  const list = [...new Set(codes.filter(Boolean))]
  if (list.length) params.set('codigos', list.join(','))
  const query = params.toString()
  return `/productos/etiquetas${query ? `?${query}` : ''}`
}

/** Etiquetas for a record: a product's own, a document's lines; '' otherwise. */
export function etiquetasFor(doctype, name) {
  if (!name) return ''
  if (doctype === 'Item') return etiquetasHref([name])
  if (SOURCE_DOCTYPES.includes(doctype))
    return etiquetasHref([], { desde: `${doctype}:${name}` })
  return ''
}
