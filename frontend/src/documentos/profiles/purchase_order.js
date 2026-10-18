// Órdenes de compra (Purchase Order): what you asked a supplier for (Shell SPEC
// §6, D3). The record opens Compras' own page (registry recordRoute); this
// profile drives the list, the engine's /nuevo form and the split pane.
import { draftStep, genericProfile, stagesAt } from './_generic'
import {
  arrivalLine,
  BUYER_FILTER,
  CADENA_PANEL,
  localToday,
  periodFilter,
  purchaseRow,
  STORE_FILTER,
  SUPPLIER_FILTER,
} from './_compras'

export const TO_RECEIVE = ['To Receive and Bill', 'To Receive']
const TO_BILL = ['To Bill']

export default {
  fields: ['supplier', 'set_warehouse', 'per_received', 'per_billed', '_items'],
  panels: [CADENA_PANEL],
  chips: [
    {
      value: 'por-recibir',
      label: 'Por recibir',
      filters: [
        ['docstatus', '=', 1],
        ['status', 'in', TO_RECEIVE],
      ],
    },
    {
      value: 'atrasadas',
      label: 'Atrasadas',
      // Built when the profile loads: «today» is the worker's local day.
      get filters() {
        return [
          ['docstatus', '=', 1],
          ['status', 'in', TO_RECEIVE],
          ['schedule_date', '<', localToday()],
        ]
      },
    },
    {
      value: 'por-facturar',
      label: 'Por facturar',
      filters: [
        ['docstatus', '=', 1],
        ['status', 'in', TO_BILL],
      ],
    },
    {
      value: 'borradores',
      label: 'Borradores',
      filters: [['docstatus', '=', 0]],
    },
    { value: '', label: 'Todas', filters: null },
  ],
  defaultChip: 'por-recibir',
  filterFields: [
    SUPPLIER_FILTER,
    STORE_FILTER,
    BUYER_FILTER,
    periodFilter('transaction_date'),
  ],
  sorts: [
    { value: '', label: 'Más recientes' },
    { value: 'schedule_date asc', label: 'Llegan primero' },
    { value: 'grand_total desc', label: 'Importe mayor' },
  ],

  row(row) {
    const waiting = row.docstatus === 1 && TO_RECEIVE.includes(row.status)
    const when = waiting && row.due ? arrivalLine(row.due) : null
    return purchaseRow(row, 'Purchase Order', {
      line: when?.label || '',
      tone: when?.late ? 'danger' : '',
    })
  },

  header(record) {
    const view = genericProfile.header(record)
    const h = record.header || {}
    const waiting = h.docstatus === 1 && TO_RECEIVE.includes(h.status)
    const when = waiting && h.due ? arrivalLine(h.due) : null
    return { ...view, due: when?.label || '', late: !!when?.late }
  },

  editFields: ['supplier', 'schedule_date', 'set_warehouse'],

  /** Borrador · Por recibir · Recibida · Facturada. */
  stages(record) {
    return orderStages(record.header || {}, record.doc || {})
  },

  /** Draft → «Confirmar»; por recibir → «Recibir»; recibida → «Facturar». */
  nextStep(record) {
    const h = record.header || {}
    if (h.docstatus === 0) return draftStep(record)
    if (h.docstatus !== 1) return null
    if (TO_RECEIVE.includes(h.status))
      return {
        label: 'Recibir',
        icon: 'lucide-package-open',
        make: 'purchase_receipt',
      }
    if (TO_BILL.includes(h.status))
      return {
        label: 'Facturar',
        icon: 'lucide-receipt',
        make: 'purchase_invoice',
      }
    return null
  },
}

/** The order's life as four steps, from its status and per_received / per_billed. */
export function orderStages(h, doc) {
  if (h.docstatus === 2 || h.status === 'Closed') return null
  const labels = ['Borrador', 'Por recibir', 'Recibida', 'Facturada']
  if (h.docstatus === 0) return stagesAt(labels, 0)
  const received = Number(doc.per_received || 0) >= 100
  const billed = Number(doc.per_billed || 0) >= 100
  if (h.status === 'Completed' || (received && billed))
    return stagesAt(labels, 3, true)
  if (received || TO_BILL.includes(h.status)) return stagesAt(labels, 2)
  return stagesAt(labels, 1)
}
