// «Registrar merma» (doco.workspaces.product_merma): pieces that broke,
// expired or went missing leave one store's stock. Pure helpers, shared by
// the sheet, the product page and the tests.
import { formatQty } from '@/utils/display'
import { parseQty } from './ajustar'

export const MERMA_METHOD = 'doco.workspaces.product_merma.register'

// What Doco sends with the action (`reasons`); these stand in for an older one.
export const MERMA_REASONS = [
  { key: 'danado', label: 'Dañado' },
  { key: 'caducado', label: 'Caducado' },
  { key: 'perdida', label: 'Robo o pérdida' },
  { key: 'otro', label: 'Otro' },
]

/** The stores that have pieces to give up, the one with most first. */
export function mermaStores(rows) {
  return (rows || [])
    .filter((row) => Number(row.actual_qty) > 0)
    .sort((a, b) => Number(b.actual_qty) - Number(a.actual_qty))
}

/** One store's serial numbers and lots, from the record's `units`. */
export function mermaUnits(units, warehouse) {
  const here = (rows) =>
    (rows || []).filter((row) => row.warehouse === warehouse)
  return {
    serials: here(units?.serials?.rows).map((row) => row.serial),
    batches: here(units?.batches?.rows),
  }
}

/** The typed pieces as a number above 0; null when it does not read as one. */
export function mermaQty(text) {
  const n = parseQty(text)
  return n !== null && n > 0 ? n : null
}

/** Why the sheet cannot send yet, in the worker's words; '' when it can.
 * `qty` is the number of pieces (the picked serials on a serial product),
 * `max` what the store (or the lot) has. */
export function mermaProblem({
  qty,
  max,
  reason,
  note,
  serial,
  lots,
  batch,
} = {}) {
  if (serial && !qty) return 'Elige los números de serie que se dan de baja.'
  if (lots && !batch) return 'Elige el lote.'
  if (!qty) return 'Escribe cuántas piezas se dan de baja.'
  if (qty > max) return `Hay ${formatQty(max, '')}: no puedes dar de baja más.`
  if (!reason) return 'Elige el motivo.'
  if (reason === 'otro' && !String(note || '').trim())
    return 'Escribe qué pasó.'
  return ''
}

export function mermaPayload({
  item,
  warehouse,
  qty,
  reason,
  note,
  serials,
  batch,
  requestId,
}) {
  return {
    request_id: requestId,
    item,
    warehouse,
    qty,
    reason,
    note: String(note || '').trim(),
    serials: serials?.length ? serials : null,
    batch: batch || '',
  }
}

/** «Queda 1 pza», «Quedan 3 pzas»: what a store keeps after the merma. */
export function mermaLeft(left, uom) {
  return `${Number(left) === 1 ? 'Queda' : 'Quedan'} ${formatQty(left, uom)}`
}

/** What the page says once Doco answered: the toast and the notice line. */
export function mermaDone(result = {}) {
  const pieces = formatQty(result.qty, result.uom)
  if (!result.confirmed)
    return {
      toast: 'Merma guardada como borrador',
      text: `Merma de ${pieces} en ${result.store} guardada como borrador: la existencia baja cuando la confirma quien administra el inventario.`,
      link: 'Abrir borrador',
    }
  return {
    toast: 'Merma registrada',
    text: `Merma registrada: ${pieces} menos en ${result.store}. ${mermaLeft(result.left, '')}.`,
    link: 'Ver la salida',
  }
}
