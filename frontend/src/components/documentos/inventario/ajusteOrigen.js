// «Cómo se hizo» for an Ajuste de inventario (Stock Reconciliation): who created it,
// from which count, the Motivo «Ajustar existencia» leaves, any other note, and the
// store its rows moved. A Stock Reconciliation has no reason, origin or link field;
// the notes on its Actividad are the only place it says how it happened, so this
// reads them and invents nothing: an adjustment with no notes says «Sin registro».
//
// Two note shapes exist today:
//  - the Escáner's cycle count (scanner_kit/conteo/stock_entry.py) writes
//    «Ajuste por conteo cíclico · tarea CC-… · fila … · sistema 10.0 → contado 7.0
//    · verificó <quién>», naming the Mercado Cycle Count Task it came from;
//  - Producto's «Ajustar existencia» (components/productos/ajustar.js) writes
//    «Motivo: <motivo> · <nota>».
import { storeName } from '@/documentos/profiles/_generic'
import { deskUrl } from '@/documentos/tools'
import { formatDateTime } from '@/utils/display'

// The task the Escáner's count belongs to; the shell already follows it live.
const COUNT_TASK = 'Mercado Cycle Count Task'

/** The cycle-count note as `{ task, quantity, verified }` ('' when it lacks a part); null otherwise. */
export function readCycleNote(text) {
  const clean = String(text || '').trim()
  if (!/^ajuste por conteo c[ií]clico/i.test(clean)) return null
  const parts = clean.split(' · ').map((part) => part.trim())
  const tail = (head) =>
    parts
      .find((part) => part.toLowerCase().startsWith(head))
      ?.slice(head.length)
      .trim() || ''
  return {
    task: tail('tarea '),
    quantity: parts.find((part) => /^sistema\b/i.test(part)) || '',
    verified: parts.find((part) => /^verific/i.test(part)) || '',
  }
}

/** «Motivo: Conteo físico · se cayó» → «Conteo físico · se cayó»; '' for any other note. */
export function readMotivo(text) {
  return (
    String(text || '')
      .trim()
      .match(/^motivo:\s*(.+)$/i)?.[1]
      ?.trim() || ''
  )
}

/**
 * The panel rows for an Ajuste's record: `{ key, icon, label, value, detail?, to?, muted? }[]`.
 * `to` is the Desk URL of the count task the adjustment came from, when it says one.
 */
export function ajusteOrigin(record = {}) {
  const events = record.activity?.events || []
  const created = events.find((event) => event.kind === 'create')
  const comments = events.filter(
    (event) => event.kind === 'comment' && String(event.text || '').trim(),
  )
  const cycle = comments
    .map((comment) => readCycleNote(comment.text))
    .find(Boolean)
  const motivo = comments
    .map((comment) => readMotivo(comment.text))
    .find(Boolean)
  const note = comments.find(
    (comment) => !readCycleNote(comment.text) && !readMotivo(comment.text),
  )
  const rows = []
  if (created?.who)
    rows.push({
      key: 'creado',
      icon: 'lucide-user-round',
      label: 'Creado por',
      value: created.who,
      detail: created.at ? formatDateTime(created.at) : '',
    })
  rows.push(
    cycle
      ? {
          key: 'origen',
          icon: 'lucide-scan-line',
          label: 'Origen',
          value: 'Conteo cíclico (Escáner)',
          detail: [cycle.quantity, cycle.verified].filter(Boolean).join(' · '),
        }
      : {
          key: 'origen',
          icon: 'lucide-scan-line',
          label: 'Origen',
          value: 'Sin registro en el ajuste',
          muted: true,
        },
  )
  if (cycle?.task)
    rows.push({
      key: 'tarea',
      icon: 'lucide-clipboard-list',
      label: 'Tarea de conteo',
      value: cycle.task,
      to: deskUrl(COUNT_TASK, cycle.task),
    })
  rows.push({
    key: 'motivo',
    icon: 'lucide-message-square',
    label: 'Motivo',
    value: motivo || 'Sin motivo registrado',
    muted: !motivo,
  })
  if (note)
    rows.push({
      key: 'nota',
      icon: 'lucide-sticky-note',
      label: 'Nota',
      value: note.text,
    })
  // The header names one store; a count can move rows in several.
  const stores = [
    ...new Set(
      (record.items?.rows || []).map((row) => row.warehouse).filter(Boolean),
    ),
  ]
  if (stores.length && !String(record.doc?.set_warehouse || '').trim())
    rows.push({
      key: 'bodega',
      icon: 'lucide-warehouse',
      label: stores.length === 1 ? 'Bodega' : 'Bodegas',
      value: stores.map(storeName).join(' · '),
    })
  return rows
}
