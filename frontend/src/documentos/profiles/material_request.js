// Requisiciones (Material Request): what a store needs (Shell SPEC §6, D3).
// Next step: «Pedir» (an orden de compra, ERPNext's make_purchase_order) and
// «Cotizar» (a cotización de proveedor first, make_supplier_quotation).
import { formatDate } from '@/utils/display'
import { draftStep, genericProfile, stagesAt } from './_generic'
import {
  arrivalLine,
  BUYER_FILTER,
  CADENA_PANEL,
  itemsLine,
  periodFilter,
  purchaseRow,
  requestTitle,
  STORE_FILTER,
} from './_compras'

const OPEN = ['Pending', 'Partially Ordered']

export default {
  fields: ['material_request_type', 'set_warehouse', '_items'],
  panels: [CADENA_PANEL],
  chips: [
    {
      value: 'pendientes',
      label: 'Por pedir',
      filters: [
        ['docstatus', '=', 1],
        ['status', 'in', OPEN],
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
      filters: [['status', 'in', ['Ordered', 'Partially Received']]],
    },
    {
      value: 'recibidas',
      label: 'Recibidas',
      filters: [['status', '=', 'Received']],
    },
    { value: '', label: 'Todas', filters: null },
  ],
  defaultChip: 'pendientes',
  filterFields: [
    STORE_FILTER,
    { ...BUYER_FILTER, label: 'Pidió' },
    periodFilter('transaction_date'),
  ],
  sorts: [
    { value: '', label: 'Más recientes' },
    { value: 'schedule_date asc', label: 'Se necesitan primero' },
  ],

  row(row) {
    // What it asks for is the title (a requisition has no supplier yet).
    const title = itemsLine(row) || requestTitle(row.title)
    const view = purchaseRow({ ...row, title, items: null }, 'Material Request')
    const open = row.docstatus === 1 && OPEN.includes(row.status) && row.due
    if (open) {
      const when = arrivalLine(row.due)
      view.subtitle = [
        when.late
          ? `Se necesitaba ${formatDate(row.due)}`
          : `Para ${formatDate(row.due)}`,
        view.subtitle,
      ]
        .filter(Boolean)
        .join(' · ')
      view.subtitleTone = when.late ? 'danger' : ''
    }
    view.icon = 'lucide-list-checks'
    delete view.avatar
    return view
  },

  header(record) {
    const view = genericProfile.header(record)
    const title = requestTitle(record.header?.title)
    return {
      ...view,
      title: title || view.title,
      kind: 'Requisición',
      due: record.header?.due
        ? `Para ${formatDate(record.header.due, { relative: false })}`
        : '',
    }
  },

  editFields: ['schedule_date', 'set_warehouse'],

  /** Borrador · Por pedir · Pedida · Recibida. */
  stages(record) {
    const h = record.header || {}
    if (h.docstatus === 2) return null
    const labels = ['Borrador', 'Por pedir', 'Pedida', 'Recibida']
    if (h.docstatus === 0) return stagesAt(labels, 0)
    if (OPEN.includes(h.status)) return stagesAt(labels, 1)
    if (h.status === 'Received') return stagesAt(labels, 3, true)
    return stagesAt(labels, 2)
  },

  /** Draft → «Confirmar»; por pedir → «Pedir» (make_purchase_order). */
  nextStep(record) {
    const h = record.header || {}
    if (h.docstatus === 0) return draftStep(record)
    if (canOrder(record))
      return {
        label: 'Pedir',
        icon: 'lucide-shopping-cart',
        make: 'purchase_order',
      }
    return null
  },

  /** «Cotizar»: ask a supplier's price first (make_supplier_quotation). */
  altSteps(record) {
    if (!canOrder(record)) return []
    return [
      {
        label: 'Cotizar',
        icon: 'lucide-file-text',
        make: 'supplier_quotation',
      },
    ]
  },
}

function canOrder(record) {
  const h = record.header || {}
  const type = record.doc?.material_request_type
  return (
    h.docstatus === 1 &&
    OPEN.includes(h.status) &&
    (!type || type === 'Purchase')
  )
}
