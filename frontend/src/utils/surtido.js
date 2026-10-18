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
  'Esperando archivo': 'orange',
}
const PEDIDO = {
  Borrador: 'gray',
  Enviado: 'blue',
  Cotizado: 'orange',
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
