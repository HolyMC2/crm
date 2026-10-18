// Cotizaciones de proveedor (Supplier Quotation): the prices a supplier gave you
// (Shell SPEC §6, D3). Next step: «Pedir» (ERPNext's make_purchase_order).
import { formatDate } from '@/utils/display'
import { draftStep, stagesAt } from './_generic'
import {
  BUYER_FILTER,
  CADENA_PANEL,
  periodFilter,
  purchaseRow,
  SUPPLIER_FILTER,
} from './_compras'
import { dayDiff, parseServerDate } from '@/utils/display'

const LIVE = ['Submitted', 'Partially Ordered']

export default {
  fields: ['supplier', '_items'],
  panels: [
    CADENA_PANEL,
    {
      key: 'comparar',
      at: 'aside',
      load: () =>
        import('@/components/documentos/compras/CompararCotizaciones.vue'),
      when: (record) => record.header?.docstatus === 1,
    },
  ],
  chips: [
    {
      value: 'vigentes',
      label: 'Vigentes',
      filters: [
        ['docstatus', '=', 1],
        ['status', 'in', LIVE],
      ],
    },
    {
      value: 'borradores',
      label: 'Borradores',
      filters: [['docstatus', '=', 0]],
    },
    {
      value: 'pedidas',
      label: 'Pedidas',
      filters: [['status', '=', 'Ordered']],
    },
    {
      value: 'vencidas',
      label: 'Vencidas',
      filters: [['status', '=', 'Expired']],
    },
    { value: '', label: 'Todas', filters: null },
  ],
  defaultChip: 'vigentes',
  filterFields: [
    SUPPLIER_FILTER,
    { ...BUYER_FILTER, label: 'Registró' },
    periodFilter('transaction_date'),
  ],
  sorts: [
    { value: '', label: 'Más recientes' },
    { value: 'valid_till asc', label: 'Vencen primero' },
    { value: 'grand_total asc', label: 'Más baratas' },
  ],

  row(row) {
    const live = row.docstatus === 1 && LIVE.includes(row.status) && row.due
    let line = ''
    let tone = ''
    if (live) {
      const d = parseServerDate(row.due)
      const late = d && dayDiff(d) < 0
      line = late
        ? `Venció ${formatDate(row.due)}`
        : `Válida hasta ${formatDate(row.due, { relative: false })}`
      tone = late ? 'danger' : ''
    }
    return purchaseRow(row, 'Supplier Quotation', { line, tone })
  },

  editFields: ['supplier', 'transaction_date', 'valid_till'],

  /** Borrador · Recibida · Pedida. */
  stages(record) {
    const h = record.header || {}
    if (h.docstatus === 2 || h.status === 'Expired') return null
    const labels = ['Borrador', 'Recibida', 'Pedida']
    if (h.docstatus === 0) return stagesAt(labels, 0)
    if (h.status === 'Ordered') return stagesAt(labels, 2, true)
    return stagesAt(labels, 1)
  },

  /** Draft → «Confirmar»; vigente → «Pedir» (make_purchase_order). */
  nextStep(record) {
    const h = record.header || {}
    if (h.docstatus === 0) return draftStep(record)
    if (h.docstatus === 1 && LIVE.includes(h.status))
      return {
        label: 'Pedir',
        icon: 'lucide-shopping-cart',
        make: 'purchase_order',
      }
    return null
  },
}
