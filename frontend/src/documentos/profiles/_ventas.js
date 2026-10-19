// What the six sales profiles share (Shell D2): the row's items line, «Filtros»
// (cliente, vendedor, tienda, fechas), the record panels («Creado desde» and
// «¿De dónde vino?») and the curated print formats.
import { formatDate, formatQty, formatMoney } from '@/utils/display'
import { titleOf } from './_generic'

/** «Concha, 2 pzas y 3 más» from `row.items` (rows asked with `_items`). */
export function itemsLine(row) {
  const items = row?.items
  if (!items?.count) return ''
  const [first] = items.first || []
  if (!first?.name) return ''
  const qty = Number(first.qty)
  const head =
    Number.isFinite(qty) && qty !== 1
      ? `${first.name}, ${formatQty(qty, first.uom)}`
      : first.name
  const more = items.count - 1
  return more > 0 ? `${head} y ${more} más` : head
}

/** One supporting line: what it carries, then when (or the due words). */
export function supportLine(row, when) {
  return [itemsLine(row), when].filter(Boolean).join(' · ')
}

/** The common row: the customer, items · date, the amount, the status chip. */
export function ventaRow(row, doctype, { when, tone = '', statusWords } = {}) {
  const title = titleOf(row, doctype)
  return {
    title,
    subtitle: supportLine(row, when ?? formatDate(row.date)),
    subtitleTone: tone,
    meta: formatMoney(row.amount, row.currency || 'MXN'),
    avatar: title,
    ...(statusWords ? { statusLabel: statusWords } : {}),
  }
}

// «Filtros» every sales list offers.
export const CLIENTE = {
  fieldname: 'customer',
  label: 'Cliente',
  kind: 'link',
  doctype: 'Customer',
}
export const VENDEDOR = {
  fieldname: 'vendedor',
  label: 'Vendedor',
  kind: 'link',
  doctype: 'Sales Person',
  filters: (value) => [['Sales Team', 'sales_person', '=', value]],
}
export const TIENDA = {
  fieldname: 'pos_profile',
  label: 'Tienda',
  kind: 'link',
  doctype: 'POS Profile',
}
export function fechas(field) {
  return { fieldname: 'fecha', label: 'Fechas', kind: 'period', field }
}

// The record panels (DD6, DD7): lazy, on sales records only.
const cadena = () => import('@/components/documentos/ventas/Cadena.vue')
const atribucion = () => import('@/components/documentos/ventas/Atribucion.vue')
export const PANELS = Object.freeze([
  { key: 'cadena', at: 'hero', load: cadena },
  { key: 'atribucion', at: 'aside', load: atribucion },
])
export const PANELS_NO_CHAIN = Object.freeze([
  { key: 'atribucion', at: 'aside', load: atribucion },
])

// Print formats (doco-mirror names): the worker sees the ones meant for the
// customer, in Spanish, the usual one first; internal vouchers, tax layouts of
// other countries and English names stay out. Formats missing on a site fall
// back to the server's list (curateFormats keeps it when none match).
export const PRINT = Object.freeze({
  // Each one checked as a PDF on doco-mirror (2026-10-18). Out: «Ticket 80mm factura de
  // venta» and «print 80mm» (Print Designer formats without settings: the PDF fails).
  // The CFDI one prints only a «no timbrado» notice until the invoice is stamped.
  'Sales Invoice': {
    only: ['Sales Invoice Standard', 'Factura CFDI 4.0'],
    labels: {
      'Factura CFDI 4.0': 'Factura (CFDI 4.0)',
      'Sales Invoice Standard': 'Factura',
    },
    hints: {
      'Factura CFDI 4.0': 'Con los datos del SAT, ya timbrada',
    },
    first: 'Sales Invoice Standard',
  },
  'POS Invoice': {
    only: ['Ticket 80mm', 'Ticket POS CFDI 4.0', 'POS Invoice Standard'],
    labels: {
      'Ticket 80mm': 'Ticket de 80 mm',
      'Ticket POS CFDI 4.0': 'Ticket con datos del SAT',
      'POS Invoice Standard': 'Ticket sencillo',
    },
    first: 'Ticket 80mm',
  },
  Quotation: {
    // «Cotizacion de reparaciones» refuses to print a sales quotation (417 on the lab).
    only: ['Cotización', 'Quotation Standard'],
    labels: { 'Quotation Standard': 'Cotización sencilla' },
    first: 'Cotización',
  },
  'Sales Order': {
    only: ['Sales Order Standard', 'Standard'],
    labels: { 'Sales Order Standard': 'Pedido', Standard: 'Pedido sencillo' },
    first: 'Sales Order Standard',
  },
  'Delivery Note': {
    only: ['Delivery Note Standard', 'Standard'],
    labels: {
      'Delivery Note Standard': 'Remisión',
      Standard: 'Remisión sencilla',
    },
    first: 'Delivery Note Standard',
  },
  'Payment Entry': {
    only: ['Standard', 'Complemento de Pago 2.0'],
    labels: {
      Standard: 'Recibo de pago',
      'Complemento de Pago 2.0': 'Complemento de pago (CFDI)',
    },
    hints: { 'Complemento de Pago 2.0': 'Con los datos del SAT, ya timbrado' },
    first: 'Standard',
  },
})
