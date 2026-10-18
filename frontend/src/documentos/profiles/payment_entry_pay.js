// Pagos (Payment Entry, payment_type Pay): money you paid a supplier (Shell SPEC
// §6, D3). The form asks the worker's questions first: proveedor, monto, forma
// de pago, referencia; the accounts come from ERPNext's get_payment_entry.
import { formatDate } from '@/utils/display'
import { draftStep, genericProfile, stagesAt } from './_generic'
import {
  BUYER_FILTER,
  CADENA_PANEL,
  periodFilter,
  purchaseRow,
  SUPPLIER_FILTER,
} from './_compras'

export default {
  fields: ['party_type', 'party', 'mode_of_payment', 'reference_no'],
  panels: [CADENA_PANEL],
  chips: [
    {
      value: 'hechos',
      label: 'Hechos',
      filters: [['docstatus', '=', 1]],
    },
    {
      value: 'borradores',
      label: 'Por confirmar',
      filters: [['docstatus', '=', 0]],
    },
    { value: '', label: 'Todos', filters: null },
  ],
  defaultChip: '',
  filterFields: [
    {
      ...SUPPLIER_FILTER,
      fieldname: 'party',
      filters: (value) => [
        ['party_type', '=', 'Supplier'],
        ['party', '=', value],
      ],
    },
    { ...BUYER_FILTER, label: 'Pagó' },
    periodFilter('posting_date'),
  ],
  sorts: [
    { value: '', label: 'Más recientes' },
    { value: 'paid_amount desc', label: 'Importe mayor' },
  ],

  row(row) {
    const how = row.fields?.mode_of_payment || ''
    const line =
      row.docstatus === 0
        ? 'Por confirmar'
        : [row.date ? `Pagado ${formatDate(row.date)}` : '', how]
            .filter(Boolean)
            .join(' · ')
    const view = purchaseRow(row, 'Payment Entry', { line })
    view.icon = 'lucide-wallet'
    delete view.avatar
    return view
  },

  header(record) {
    const view = genericProfile.header(record)
    return { ...view, kind: 'Pago' }
  },

  // Proveedor, monto, forma de pago, referencia; the accounts stay as the mapper set them.
  editFields: [
    'party',
    'paid_amount',
    'mode_of_payment',
    'posting_date',
    'reference_no',
    'reference_date',
  ],

  /** Borrador · Pagado. */
  stages(record) {
    const h = record.header || {}
    if (h.docstatus === 2) return null
    return stagesAt(
      ['Borrador', 'Pagado'],
      h.docstatus === 0 ? 0 : 1,
      h.docstatus === 1,
    )
  },

  nextStep(record) {
    return draftStep(record)
  },
}
