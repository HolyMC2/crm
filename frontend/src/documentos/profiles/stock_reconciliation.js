// Ajustes (Stock Reconciliation, /inventario/ajustes): a count that corrects the
// stock, by its store («Ajuste · Centro»), never by its ID. The server titles the
// palette the same way and counts the rows (`row.lines`, documentos.py).
import { formatDate } from '@/utils/display'
import {
  confirmState,
  draftStep,
  genericProfile,
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

function linesLabel(n) {
  const count = Number(n) || 0
  if (count <= 0) return ''
  return count === 1 ? '1 artículo' : `${count} artículos`
}

export default {
  fields: ['purpose', 'set_warehouse'],
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

  row(row) {
    const state = confirmState(row)
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

  /** The store as the title, the purpose as the kind: «Ajuste · MAT-RECO-…». */
  header(record) {
    const view = genericProfile.header(record)
    const doc = record.doc || {}
    const store = storeName(doc.set_warehouse)
    return {
      ...view,
      ...confirmState(record.header),
      title: store || adjustmentTitle(doc) || view.title,
      kind: store ? adjustmentWord(doc.purpose) : view.kind,
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
