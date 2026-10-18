// Entradas y traspasos (Stock Entry, /inventario/entradas): each entry reads by
// what it did and where («Traspaso · Centro → Bodega»), never by its ID.
// The server titles the palette the same way (documentos.py `_stock_title`).
import { formatDate, formatMoney } from '@/utils/display'
import {
  confirmState,
  draftStep,
  genericProfile,
  stagesAt,
  storeName,
  titleOf,
} from './_generic'

// ERPNext's purpose → [the worker's word, which store it names, icon].
// `in` names where it arrived, `out` where it left, `move` both («A → B»).
// Icons as in the kardex (components/inventario/kardex.js).
const MOVES = {
  'Material Receipt': ['Entrada', 'in', 'lucide-arrow-down-to-line'],
  'Receive from Customer': ['Entrada', 'in', 'lucide-arrow-down-to-line'],
  'Material Issue': ['Salida', 'out', 'lucide-arrow-up-from-line'],
  'Return Raw Material to Customer': [
    'Salida',
    'out',
    'lucide-arrow-up-from-line',
  ],
  'Subcontracting Delivery': ['Salida', 'out', 'lucide-arrow-up-from-line'],
  'Material Consumption for Manufacture': [
    'Consumo',
    'out',
    'lucide-arrow-up-from-line',
  ],
  'Material Transfer': ['Traspaso', 'move', 'lucide-arrow-left-right'],
  'Material Transfer for Manufacture': [
    'Traspaso',
    'move',
    'lucide-arrow-left-right',
  ],
  'Send to Subcontractor': ['Traspaso', 'move', 'lucide-arrow-left-right'],
  Manufacture: ['Fabricación', 'move', 'lucide-factory'],
  Repack: ['Reempaque', 'move', 'lucide-factory'],
  Disassemble: ['Desarmado', 'move', 'lucide-factory'],
}

const purposes = (kind) =>
  Object.keys(MOVES).filter((p) => MOVES[p][0] === kind)
const IN = purposes('Entrada')
const OUT = [...purposes('Salida'), ...purposes('Consumo')]
const TRANSFERS = purposes('Traspaso')

/** «Centro → Bodega», «Centro» or '' for an entry's header stores. */
export function movedWhere(doc = {}) {
  const move = MOVES[doc.purpose]
  const from = storeName(doc.from_warehouse)
  const to = storeName(doc.to_warehouse)
  if (move?.[1] === 'in') return to
  if (move?.[1] === 'out') return from
  if (from && to && from !== to) return `${from} → ${to}`
  return to || from
}

/** «Traspaso · Centro → Bodega», «Entrada · Centro», «Salida»; '' when the purpose is unknown. */
export function moveTitle(doc = {}) {
  const move = MOVES[doc.purpose]
  if (!move) return ''
  const where = movedWhere(doc)
  return where ? `${move[0]} · ${where}` : move[0]
}

const amountOf = (value, currency) =>
  Number(value) > 0 ? formatMoney(value, currency || 'MXN') : ''

export default {
  fields: ['stock_entry_type', 'purpose', 'from_warehouse', 'to_warehouse'],
  chips: [
    {
      value: 'borradores',
      label: 'Borradores',
      filters: [['docstatus', '=', 0]],
    },
    {
      value: 'entradas',
      label: 'Entradas',
      filters: [
        ['docstatus', '=', 1],
        ['purpose', 'in', IN],
      ],
    },
    {
      value: 'salidas',
      label: 'Salidas',
      filters: [
        ['docstatus', '=', 1],
        ['purpose', 'in', OUT],
      ],
    },
    {
      value: 'traspasos',
      label: 'Traspasos',
      filters: [
        ['docstatus', '=', 1],
        ['purpose', 'in', TRANSFERS],
      ],
    },
    { value: '', label: 'Todas', filters: null },
  ],
  defaultChip: '',
  sorts: [
    { value: '', label: 'Más recientes' },
    { value: 'total_amount desc', label: 'Valor mayor' },
  ],
  // The value is the hero amount; there is no totals block worth a section.
  sections: ['items', 'datos', 'conexiones', 'actividad', 'archivos'],

  row(row) {
    const fields = row.fields || {}
    const state = confirmState(row)
    return {
      title: moveTitle(fields) || titleOf(row, 'Stock Entry'),
      subtitle: [state.statusLabel, formatDate(row.date)]
        .filter(Boolean)
        .join(' · '),
      meta: amountOf(row.amount, row.currency),
      ...state,
      icon: MOVES[fields.purpose]?.[2] || 'lucide-arrow-left-right',
    }
  },

  // The type picks the purpose; the default stores fill the rows on save.
  editFields: ['stock_entry_type', 'from_warehouse', 'to_warehouse', 'remarks'],

  /** The stores as the title, the purpose as the kind: «Traspaso · MAT-STE-…». */
  header(record) {
    const view = genericProfile.header(record)
    const h = record.header || {}
    const doc = record.doc || {}
    const move = MOVES[doc.purpose]
    const where = movedWhere(doc)
    return {
      ...view,
      ...confirmState(h),
      title: where || move?.[0] || view.title,
      kind: where && move ? move[0] : view.kind,
      amount: amountOf(h.amount, h.currency),
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
