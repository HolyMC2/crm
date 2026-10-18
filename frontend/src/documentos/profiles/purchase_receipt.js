// Recepciones (Purchase Receipt): merchandise that arrived from a supplier
// (Shell SPEC §6, D3). Next step: «Facturar» (ERPNext's make_purchase_invoice).
import { draftStep, stagesAt } from './_generic'
import {
  BUYER_FILTER,
  CADENA_PANEL,
  periodFilter,
  purchaseRow,
  STORE_FILTER,
  SUPPLIER_FILTER,
} from './_compras'
import { formatDate } from '@/utils/display'

export default {
  fields: ['supplier', 'set_warehouse', 'per_billed', 'is_return', '_items'],
  panels: [CADENA_PANEL],
  printFormats: {
    labels: {
      'Purchase Receipt Serial and Batch Bundle Print': 'Con series y lotes',
    },
  },
  chips: [
    {
      value: 'por-facturar',
      label: 'Por facturar',
      filters: [
        ['docstatus', '=', 1],
        ['status', '=', 'To Bill'],
      ],
    },
    {
      value: 'borradores',
      label: 'Por confirmar',
      filters: [['docstatus', '=', 0]],
    },
    {
      value: 'facturadas',
      label: 'Facturadas',
      filters: [['status', '=', 'Completed']],
    },
    { value: '', label: 'Todas', filters: null },
  ],
  defaultChip: 'por-facturar',
  filterFields: [
    SUPPLIER_FILTER,
    STORE_FILTER,
    { ...BUYER_FILTER, label: 'Recibió' },
    periodFilter('posting_date'),
  ],
  sorts: [
    { value: '', label: 'Más recientes' },
    { value: 'grand_total desc', label: 'Importe mayor' },
  ],

  row(row) {
    const line =
      row.docstatus === 1 && row.date
        ? `Llegó ${formatDate(row.date)}`
        : row.docstatus === 0
          ? 'Por confirmar'
          : ''
    const view = purchaseRow(row, 'Purchase Receipt', { line })
    if (row.fields?.is_return) view.subtitle = `Devolución · ${view.subtitle}`
    return view
  },

  editFields: ['supplier', 'posting_date', 'set_warehouse'],

  /** Borrador · Recibida · Facturada. */
  stages(record) {
    const h = record.header || {}
    if (h.docstatus === 2 || h.is_return || h.status === 'Closed') return null
    const labels = ['Borrador', 'Recibida', 'Facturada']
    if (h.docstatus === 0) return stagesAt(labels, 0)
    if (h.status === 'Completed') return stagesAt(labels, 2, true)
    return stagesAt(labels, 1)
  },

  /** Draft → «Confirmar» (stock enters); recibida → «Facturar». */
  nextStep(record) {
    const h = record.header || {}
    if (h.docstatus === 0) return draftStep(record)
    if (h.docstatus === 1 && !h.is_return && h.status === 'To Bill')
      return {
        label: 'Facturar',
        icon: 'lucide-receipt',
        make: 'purchase_invoice',
      }
    return null
  },
}
