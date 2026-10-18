// Solicitudes de cotización (Request for Quotation): prices you asked suppliers
// for (Shell SPEC §6, D3). Next step: «Registrar cotización» (ERPNext's
// make_supplier_quotation_from_rfq), then compare them (CompararCotizaciones).
import { formatDate } from '@/utils/display'
import { draftStep, genericProfile, stagesAt } from './_generic'
import {
  arrivalLine,
  BUYER_FILTER,
  CADENA_PANEL,
  itemsLine,
  periodFilter,
  purchaseRow,
} from './_compras'

export default {
  fields: ['_items'],
  panels: [
    CADENA_PANEL,
    {
      key: 'comparar',
      at: 'hero',
      load: () =>
        import('@/components/documentos/compras/CompararCotizaciones.vue'),
      when: (record) => record.header?.docstatus === 1,
    },
  ],
  printFormats: {
    labels: {
      'Request for Quotation with Item Image': 'Solicitud con fotos',
    },
  },
  chips: [
    {
      value: 'enviadas',
      label: 'Enviadas',
      filters: [
        ['docstatus', '=', 1],
        ['status', '=', 'Submitted'],
      ],
    },
    {
      value: 'borradores',
      label: 'Borradores',
      filters: [['docstatus', '=', 0]],
    },
    { value: '', label: 'Todas', filters: null },
  ],
  defaultChip: 'enviadas',
  filterFields: [
    { ...BUYER_FILTER, label: 'Pidió' },
    periodFilter('transaction_date'),
  ],

  row(row) {
    const title = itemsLine(row) || 'Solicitud de cotización'
    const when = row.docstatus === 1 && row.due ? arrivalLine(row.due) : null
    const line = when
      ? when.late
        ? `Respuesta esperada ${formatDate(row.due)}`
        : `Respuesta para ${formatDate(row.due)}`
      : ''
    const view = purchaseRow(
      { ...row, title, items: null },
      'Request for Quotation',
      { line },
    )
    view.icon = 'lucide-mail'
    delete view.avatar
    return view
  },

  header(record) {
    const view = genericProfile.header(record)
    const rows = record.items?.rows || []
    const first = rows[0]?.item_name || rows[0]?.item_code || ''
    const title =
      rows.length > 1
        ? `${first} y ${rows.length - 1} más`
        : first || view.title
    return { ...view, title }
  },

  editFields: ['transaction_date', 'schedule_date'],

  /** Borrador · Enviada. */
  stages(record) {
    const h = record.header || {}
    if (h.docstatus === 2) return null
    return stagesAt(
      ['Borrador', 'Enviada'],
      h.docstatus === 0 ? 0 : 1,
      h.docstatus === 1,
    )
  },

  /** Draft → «Confirmar»; enviada → «Registrar cotización» (a supplier answered). */
  nextStep(record) {
    const h = record.header || {}
    if (h.docstatus === 0) return draftStep(record)
    if (h.docstatus === 1)
      return {
        label: 'Registrar cotización',
        icon: 'lucide-file-text',
        make: 'supplier_quotation',
      }
    return null
  },
}
