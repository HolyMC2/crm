// Entregas (Delivery Note), Shell D2: merchandise that went out to a customer;
// its next step is the invoice («Facturar»).
import { formatDate, statusTone } from '@/utils/display'
import { docStatus, draftStep, genericProfile } from './_generic'
import { CLIENTE, fechas, PANELS, PRINT, VENDEDOR, ventaRow } from './_ventas'

// An entrega is «ella».
export const WORDS = {
  Draft: 'Borrador',
  'To Bill': 'Por facturar',
  Completed: 'Facturada',
  'Return Issued': 'Con devolución',
  Return: 'Devolución',
  Closed: 'Cerrada',
  Cancelled: 'Cancelada',
}

export default {
  fields: ['_items', 'customer', 'is_return'],
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
      label: 'Borradores',
      filters: [['docstatus', '=', 0]],
    },
    {
      value: 'facturadas',
      label: 'Facturadas',
      filters: [['status', '=', 'Completed']],
    },
    {
      value: 'devoluciones',
      label: 'Devoluciones',
      filters: [['is_return', '=', 1]],
    },
    { value: '', label: 'Todas', filters: null },
  ],
  defaultChip: 'por-facturar',
  filterFields: [CLIENTE, VENDEDOR, fechas('posting_date')],
  sorts: [
    { value: '', label: 'Más recientes' },
    { value: 'posting_date asc', label: 'Más antiguas' },
    { value: 'grand_total desc', label: 'Importe mayor' },
  ],

  row(row) {
    const status = docStatus(row)
    return {
      ...ventaRow(row, 'Delivery Note', {
        when: row.fields?.is_return
          ? `Devolución · ${formatDate(row.date)}`
          : formatDate(row.date),
        statusWords: WORDS[status],
      }),
      status,
      tone: statusTone(status),
    }
  },

  header(record) {
    const view = genericProfile.header(record)
    return { ...view, statusLabel: WORDS[view.status] || '' }
  },

  editFields: ['customer', 'posting_date'],

  nextStep(record) {
    const h = record.header || {}
    if (h.docstatus === 0) return draftStep(record)
    if (h.docstatus === 1 && !h.is_return && h.status === 'To Bill')
      return {
        label: 'Facturar',
        icon: 'lucide-receipt',
        make: 'sales_invoice',
      }
    return null
  },

  panels: PANELS,
  printFormats: PRINT['Delivery Note'],
}
