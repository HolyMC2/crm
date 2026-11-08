// Surtido (ASI-S4): the pure parts of CompraSurtido.vue — the owner's
// corrections as the `changes` doco.workspaces.sourcing.plan understands,
// the budget bar, the create-items rows and the status tones.

/** Owner edits on plan lines (+ left-out lines to add) → plan `changes`. */
export function buildChanges(plan, edits = {}, adds = {}) {
  if (!plan) return []
  const out = []
  for (const line of plan.lines || []) {
    const e = edits[line.line]
    if (!e) continue
    if (e.remove) {
      out.push({ op: 'remove', line: line.line })
      continue
    }
    if (Number.isInteger(e.qty) && e.qty > 0 && e.qty !== line.qty)
      out.push({ op: 'qty', line: line.line, qty: e.qty })
    if (e.colour && e.colour !== line.colour)
      out.push({ op: 'colour', line: line.line, colour: e.colour })
  }
  const known = new Set((plan.left_out || []).map((l) => l.line))
  for (const [line, qty] of Object.entries(adds))
    if (known.has(line) && Number.isInteger(qty) && qty > 0)
      out.push({ op: 'add', line, qty })
  return out.slice(0, 40)
}

/** Share of the budget the plan uses, 0–100 (the plan never passes it). */
export function budgetShare(plan) {
  const budget = Number(plan?.budget) || 0
  if (budget <= 0) return 0
  return Math.max(
    0,
    Math.min(100, Math.round((Number(plan.total) / budget) * 100)),
  )
}

/** Chosen reply rows → create_items rows; every row must say batches and serials. */
export function readyRows(indexes, batch = {}, serial = {}) {
  const said = (v) => v === '1' || v === '0'
  const rows = []
  let ok = indexes.length > 0
  for (const index of indexes) {
    if (!said(batch[index]) || !said(serial[index])) {
      ok = false
      continue
    }
    rows.push({
      index,
      has_batch: batch[index] === '1',
      has_serial: serial[index] === '1',
    })
  }
  return { ok, rows }
}

const CATALOG = {
  Listo: 'green',
  Indexando: 'blue',
  Indexado: 'blue',
  Recibido: 'blue',
  Error: 'red',
  'Esperando archivo': 'amber',
}
const PEDIDO = {
  Borrador: 'gray',
  Enviado: 'blue',
  Cotizado: 'amber',
  Cerrado: 'green',
}
const LINE = {
  Confirmada: 'green',
  'Sin existencia': 'red',
  Descartada: 'gray',
  Pendiente: 'blue',
}

export const catalogTone = (status) => CATALOG[status] || 'gray'
export const pedidoTone = (status) => PEDIDO[status] || 'gray'
export const lineTone = (status) => LINE[status] || 'gray'

/** The close's answers for the Items it creates, by catalog line: the owner's
 *  select when they touched it, else the section's serial default and no
 *  batches. `{ catalogo_linea: { has_serial, has_batch } }`. */
export function closeSpecs(items = [], batch = {}, serial = {}) {
  const out = {}
  for (const row of items) {
    if (!row?.catalogo_linea) continue
    const said = (v) => v === '1' || v === '0'
    out[row.catalogo_linea] = {
      has_serial: said(serial[row.catalogo_linea])
        ? serial[row.catalogo_linea] === '1'
        : Boolean(row.has_serial_default),
      has_batch: said(batch[row.catalogo_linea])
        ? batch[row.catalogo_linea] === '1'
        : false,
    }
  }
  return out
}

/**
 * A plan line's code, model and colour on one line, leaving out what its name
 * already says.
 */
export function lineMeta(line = {}) {
  const name = String(line?.name || '').toLowerCase()
  return [line?.code, line?.model, line?.colour]
    .filter((v) => v && !name.includes(String(v).toLowerCase()))
    .join(', ')
}

/** The new Items the close cannot name a product type for. */
export function missingGroups(items = []) {
  return items.filter((row) => row.group_missing).map((row) => row.name)
}

/**
 * What the plan did not propose and why (the plan's `counts`), one phrase
 * per reason; the chat says the same in format_plan.
 */
export function skippedText(counts = {}) {
  const n = (key) => Math.max(0, Number(counts?.[key]) || 0)
  const out = []
  if (n('stock_suficiente'))
    out.push(__('{0} with enough stock', [n('stock_suficiente')], 'Surtido'))
  if (n('sin_ventas'))
    out.push(
      __('{0} without sales in the period', [n('sin_ventas')], 'Surtido'),
    )
  if (n('modelo_nuevo_omitido'))
    out.push(
      __(
        '{0} new models (not asked for)',
        [n('modelo_nuevo_omitido')],
        'Surtido',
      ),
    )
  if (n('nivel_cubierto'))
    out.push(__('{0} at their stock level', [n('nivel_cubierto')], 'Surtido'))
  if (n('ya_lo_tienes'))
    out.push(__('{0} models you already have', [n('ya_lo_tienes')], 'Surtido'))
  if (n('otra_calidad'))
    out.push(
      __(
        '{0} lines of another quality of the same model',
        [n('otra_calidad')],
        'Surtido',
      ),
    )
  if (n('sin_instalar'))
    out.push(
      __(
        '{0} without parts installed in the period',
        [n('sin_instalar')],
        'Surtido',
      ),
    )
  if (n('ya_viene'))
    out.push(__('{0} already on purchase orders', [n('ya_viene')], 'Surtido'))
  if (n('fuera_de_años'))
    out.push(
      __('{0} models outside the years asked', [n('fuera_de_años')], 'Surtido'),
    )
  return out
}
