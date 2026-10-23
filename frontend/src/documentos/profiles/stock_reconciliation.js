// Ajustes (Stock Reconciliation, /inventario/ajustes): a count that corrects the
// stock, by what was counted («Loyal Item y 2 más») then the kind, the store and
// the date; never by its ID (SPEC DD1). The server titles the palette and the
// record by the store («Ajuste · Centro») and counts the rows (`row.lines`).
// A record also says at a glance what it moved (hero amount and per-row before
// and after) and how it was made («Cómo se hizo», from its Actividad).
import { formatDate, formatMoney } from '@/utils/display'
import {
  confirmState,
  draftStep,
  genericProfile,
  itemsTitle,
  stagesAt,
  storeName,
  titleOf,
} from './_generic'

const OPENING = 'Opening Stock'

/** «Ajuste» / «Inventario inicial»; `long` for the title without a store. */
export function adjustmentWord(purpose, { long = false } = {}) {
  if (purpose === OPENING) return 'Inventario inicial'
  return long ? 'Ajuste de conteo' : 'Ajuste'
}

/** «Ajuste · Centro», «Inventario inicial · Bodega», else «Ajuste de conteo». */
export function adjustmentTitle(doc = {}) {
  const store = storeName(doc.set_warehouse)
  if (!doc.purpose && !store) return ''
  return store
    ? `${adjustmentWord(doc.purpose)} · ${store}`
    : adjustmentWord(doc.purpose, { long: true })
}

// A count saved by an import or by the Escáner keeps its store on the rows, not
// on the header: the record still names the store the rows moved (Desk copies
// one store to `set_warehouse`, but not every caller does).
function rowsStore(record) {
  const row = (record?.items?.rows || []).find((line) => line.warehouse)
  return storeName(row?.warehouse || '')
}

/** «−$300.00» / «+$70.00»: the amount the count moved, signed; '' when it moved nothing. */
export function differenceAmount(record) {
  const amount = Number(record?.header?.amount)
  if (!Number.isFinite(amount) || !amount) return ''
  return `${amount > 0 ? '+' : '−'}${formatMoney(
    Math.abs(amount),
    record?.header?.currency || 'MXN',
  )}`
}

function linesLabel(n) {
  const count = Number(n) || 0
  if (count <= 0) return ''
  return count === 1 ? '1 artículo' : `${count} artículos`
}

// «Cómo se hizo»: who created it, from which count, its Motivo and store.
const origen = () =>
  import('@/components/documentos/inventario/AjusteOrigen.vue')

export default {
  fields: ['purpose', 'set_warehouse', '_items'],
  chips: [
    {
      value: 'borradores',
      label: 'Borradores',
      filters: [['docstatus', '=', 0]],
    },
    {
      value: 'confirmados',
      label: 'Confirmados',
      filters: [['docstatus', '=', 1]],
    },
    { value: '', label: 'Todos', filters: null },
  ],
  defaultChip: '',
  sections: ['items', 'datos', 'conexiones', 'actividad', 'archivos'],
  panels: [{ key: 'origen', at: 'hero', load: origen }],

  row(row) {
    const state = confirmState(row)
    const fields = row.fields || {}
    const things = itemsTitle(row.items)
    if (things)
      return {
        title: things,
        subtitle: [
          adjustmentWord(fields.purpose),
          state.status === 'Submitted' ? '' : state.statusLabel,
          formatDate(row.date),
          storeName(fields.set_warehouse || row.items.target),
        ]
          .filter(Boolean)
          .join(' · '),
        meta: '',
        ...state,
        icon: 'lucide-clipboard-check',
      }
    return {
      title:
        adjustmentTitle(row.fields || {}) ||
        titleOf(row, 'Stock Reconciliation'),
      subtitle: [state.statusLabel, formatDate(row.date)]
        .filter(Boolean)
        .join(' · '),
      meta: linesLabel(row.lines),
      ...state,
      icon: 'lucide-clipboard-check',
    }
  },

  // A new Ajuste: count or opening stock (the server starts it as a count) and
  // the store every counted row takes. The date is today's: ERPNext resets a
  // stock document's date unless «Editar fecha» is on, which the sheet does not offer.
  editFields: ['purpose', 'set_warehouse'],

  /** The store as the title, the purpose as the kind, and the difference as the amount. */
  header(record) {
    const view = genericProfile.header(record)
    const doc = record.doc || {}
    const store = storeName(doc.set_warehouse) || rowsStore(record)
    return {
      ...view,
      ...confirmState(record.header),
      title: store || adjustmentTitle(doc) || view.title,
      kind: store ? adjustmentWord(doc.purpose) : view.kind,
      // The hero amount is what the count moved («−$300.00»), not what it left.
      amount: differenceAmount(record),
    }
  },

  /** Borrador · Confirmado (none once cancelled). */
  stages(record) {
    const h = record.header || {}
    const labels = ['Borrador', 'Confirmado']
    if (h.docstatus === 0) return stagesAt(labels, 0)
    if (h.docstatus === 1) return stagesAt(labels, 1, true)
    return null
  },

  nextStep: draftStep,
}
