// «Usar en la tienda» (doco.workspaces.product_equipo): pieces the shop keeps
// for its own work leave one store's stock as the company's equipment (an
// activo fijo), never as a sale. Pure helpers, shared by the sheet, the
// product page and the tests.
import { formatQty } from '@/utils/display'
import { mermaQty, mermaStores, mermaUnits } from './merma'

export const EQUIPO_METHOD = 'doco.workspaces.product_equipo.register'
export const EQUIPO_HINT =
  'Equipo para trabajar en la tienda: sale del inventario como activo, no como venta'

// The stores with pieces, their serial numbers and lots: the same as a merma.
export const equipoStores = mermaStores
export const equipoUnits = mermaUnits
export const equipoQty = mermaQty

/** Why the sheet cannot send yet, in the worker's words; '' when it can. */
export function equipoProblem({ qty, max, serial, lots, batch } = {}) {
  if (serial && !qty) return 'Elige el número de serie de la pieza.'
  if (lots && !batch) return 'Elige el lote.'
  if (!qty) return 'Escribe cuántas piezas se quedan en la tienda.'
  if (qty > max) return `Hay ${formatQty(max, '')}: no puedes tomar más.`
  return ''
}

export function equipoPayload({
  item,
  warehouse,
  qty,
  serials,
  batch,
  custodian,
  note,
  requestId,
}) {
  return {
    request_id: requestId,
    item,
    warehouse,
    qty,
    serials: serials?.length ? serials : null,
    batch: batch || '',
    custodian: custodian || '',
    note: String(note || '').trim(),
  }
}

/** What the page says once Doco answered: the toast and the notice line. */
export function equipoDone(result = {}) {
  const assets = result.assets || []
  const one = assets.length === 1 ? assets[0] : null
  const what = one
    ? one.serial
      ? `SN ${one.serial}`
      : formatQty(result.qty, result.uom)
    : `${assets.length} piezas`
  const who = result.custodian ? ` Lo usa ${result.custodian}.` : ''
  return {
    toast: 'Ya es equipo de la tienda',
    text: `${what} salió de ${result.store} como equipo de la tienda, no como venta.${who}`,
    link: one ? 'Ver el activo' : '',
    asset: one?.asset || '',
  }
}
