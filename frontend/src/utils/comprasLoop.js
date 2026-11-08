// The buying loop's pure parts: the suggested levels the owner picks, the floor
// («Sobra», «Mover», «Reponer exhibición», «Contar»), the asks without stock and
// the Compras › Hoy board. The rows come from doco.workspaces.niveles and
// doco.workspaces.compras_hoy (books/level_suggest, compras_floor, lost_sales,
// compras_board); the words stay in the pages.

/** The suggestions «Usar» can save: a level to make, raise, lower or re-mix. */
export function pickable(rows = []) {
  return rows.filter((r) => r.can_apply && r.change !== 'igual')
}

/** A stable key of one suggestion (a model of a type, in a store or all). */
export function suggestionKey(row) {
  return [row.item_group, row.model, row.warehouse || ''].join('|')
}

/** The picked suggestions as `suggestions_apply` takes them. */
export function applyPayload(rows = [], picked = new Set()) {
  return JSON.stringify(
    pickable(rows)
      .filter((r) => picked.has(suggestionKey(r)))
      .map((r) => ({
        item_group: r.item_group,
        model: r.model,
        warehouse: r.warehouse || '',
        target_qty: r.target_qty,
        min_qty: r.min_qty,
        mix: r.mix || [],
      })),
  )
}

/** «60 % Oscuros, 40 % Vivos». */
export function mixText(mix = []) {
  return (mix || [])
    .filter((m) => Number(m.share) > 0)
    .map((m) => `${Math.round(Number(m.share))} % ${m.tone}`)
    .join(', ')
}

/** «2 Oscuros, 1 Vivos» of [{tone, buy|qty}], or of {tone: qty}. */
export function tonesText(tones) {
  const rows = Array.isArray(tones)
    ? tones.map((t) => [t.tone, Number(t.buy ?? t.qty) || 0])
    : Object.entries(tones || {}).map(([tone, qty]) => [tone, Number(qty) || 0])
  return rows
    .filter(([tone, qty]) => tone && qty > 0)
    .map(([tone, qty]) => `${round(qty)} ${tone}`)
    .join(', ')
}

function round(n) {
  return Math.round(Number(n) * 100) / 100
}

/** Precios opens on the codes of a «Sobra» row (`?codigos=A,B`), coming back here. */
export function pricesQuery(row, returnTo = '/crm/compras/niveles?ver=piso') {
  return {
    codigos: (row?.items || []).slice(0, 300).join(','),
    return_to: returnTo,
  }
}

/** The lines `transfer_create` takes from a move or a display refill. */
export function moveLines(lines = []) {
  return JSON.stringify(
    (lines || [])
      .filter((l) => l.item && Number(l.qty) > 0)
      .map((l) => ({ item: l.item, qty: Number(l.qty), bin: l.bin || '' })),
  )
}

/** The cajones a pick visits, in order and once each. */
export function cajones(lines = []) {
  return [...new Set((lines || []).map((l) => l.cajon).filter(Boolean))]
}

/** Lost-sale rows split into the bot's drafts (the seller confirms them) and the rest. */
export function splitDrafts(rows = [], draft = 'Borrador') {
  return {
    drafts: rows.filter((r) => r.status === draft),
    confirmed: rows.filter((r) => r.status !== draft),
  }
}

/** A budget's month: how much of it is used (0–100+) and whether it is spent. */
export function budgetUse(row) {
  const amount = Number(row?.amount) || 0
  const used = Number(row?.committed) || 0
  return {
    pct: amount > 0 ? Math.round((used / amount) * 100) : null,
    spent: amount > 0 && used >= amount,
    left: Math.round((amount - used) * 100) / 100,
  }
}

/** The board's tiles that need the owner: each with its number and whether it asks
 *  for action now. A section the person may not read (null) gives no tile. */
export function boardAlerts(board = {}) {
  const out = []
  const levels = Number(board.levels) || 0
  if (levels)
    out.push({
      key: 'levels',
      value: Number(board.met) || 0,
      of: levels,
      urgent: (Number(board.met) || 0) < levels,
    })
  if (board.orders)
    out.push({
      key: 'orders',
      value: board.orders.count,
      late: board.orders.late,
      urgent: board.orders.late > 0,
    })
  if (board.arrivals)
    out.push({
      key: 'arrivals',
      value: board.arrivals.count,
      urgent: board.arrivals.count > 0,
    })
  if (board.bills)
    out.push({
      key: 'bills',
      value: board.bills.count,
      overdue: board.bills.overdue,
      urgent: board.bills.overdue > 0,
    })
  if (board.lost)
    out.push({
      key: 'lost',
      value: board.lost.qty,
      urgent: board.lost.qty > 0,
    })
  return out
}

/** Delivery-day rows as the sheet edits them: the days in use and where they come
 *  from («proveedor»: the owner's, «medido»: order to receipt, «ajustes»: the
 *  default), and the owner's own days to type (empty: measure them). */
export function leadRows(rows = []) {
  return (rows || []).map((r) => ({
    supplier: r.supplier,
    label: r.label || r.supplier,
    days: r.days,
    source: r.source,
    samples: r.samples || 0,
    own: r.source === 'proveedor' ? String(r.days) : '',
  }))
}

const SETTING_NUMBERS = [
  'suggest_weeks',
  'order_cycle_days',
  'default_lead_days',
  'lost_days',
  'surplus_days',
  'review_hour',
]

/** The settings sheet as `settings_save` takes it. An empty number or day is left
 *  out (the stored value or its default stands); a display row needs both stores. */
export function settingsPayload(form = {}, exhibitions = []) {
  const values = { review_enabled: form.review_enabled ? 1 : 0 }
  for (const field of SETTING_NUMBERS) {
    const raw = form[field]
    if (raw === '' || raw === null || raw === undefined) continue
    if (Number.isFinite(Number(raw))) values[field] = Math.round(Number(raw))
  }
  if (form.review_weekday) values.review_weekday = form.review_weekday
  return {
    values: JSON.stringify(values),
    exhibitions: JSON.stringify(
      (exhibitions || [])
        .filter((r) => r.display || r.backroom)
        .map((r) => ({ display: r.display || '', backroom: r.backroom || '' })),
    ),
  }
}

/** A catalogue's price changes with the model they price (the low row whose offer is
 *  that line), so the board names a model, not a supplier's code. */
export function priceChangeRows(changes = [], low = []) {
  const models = new Map()
  for (const r of low || [])
    for (const o of r.offers || [])
      models.set(`${o.catalog}|${String(o.code).trim().toUpperCase()}`, r.model)
  return (changes || []).map((p) => ({
    ...p,
    model:
      models.get(`${p.catalog}|${String(p.code).trim().toUpperCase()}`) || '',
  }))
}
