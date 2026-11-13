// The bot's buy plan on its own page (doco.workspaces.surtido_plan): which
// lines a filter shows, the model-year chips, the corrections a −/+ or a
// «Quitar» sends, and the words of a line. Pure, so the page and its tests share them.

function tr(message, replace, context = 'Surtido') {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

/** «Se acabaron» (none left), «Quedan pocas» (fewer than the period used),
 *  «Te alcanzan» (at least what the period used). */
export function stockState(line = {}) {
  const stock = Number(line.stock || 0)
  if (stock <= 0) return 'agotadas'
  return stock < Number(line.moved || 0) ? 'pocas' : 'alcanzan'
}

export const FILTERS = ['todas', 'agotadas', 'pocas', 'alcanzan']

export function filterCounts(lines = []) {
  const counts = { todas: lines.length, agotadas: 0, pocas: 0, alcanzan: 0 }
  for (const line of lines) counts[stockState(line)] += 1
  return counts
}

export function shownLines(lines = [], filter = 'todas') {
  return filter === 'todas'
    ? lines
    : lines.filter((line) => stockState(line) === filter)
}

/** The year floors offered: every year, then the last six, four and two years. */
export function yearChips(now = new Date()) {
  const year = now.getFullYear()
  return [0, year - 6, year - 4, year - 2]
}

/** The corrections the page sends (at most `limit` each call): the pieces of
 *  the lines changed, a line at 0 removed. */
export function changesOf(edits = {}, limit = 40) {
  const out = []
  for (const [line, qty] of Object.entries(edits)) {
    const pieces = Math.max(0, Math.round(Number(qty) || 0))
    out.push(pieces ? { op: 'qty', line, qty: pieces } : { op: 'remove', line })
  }
  const batches = []
  for (let i = 0; i < out.length; i += limit)
    batches.push(out.slice(i, i + limit))
  return batches
}

/** Every line of a filter removed («Quitar las que te alcanzan»). */
export function removals(lines = []) {
  return Object.fromEntries(lines.map((line) => [line.line, 0]))
}

/** What the period did with the line: «Usadas 6» on a repairs plan, «Vendidas 6» otherwise. */
export function movedText(line = {}) {
  return line.moved_kind === 'installed'
    ? tr('Used {0}', [line.moved])
    : tr('Sold {0}', [line.moved])
}

const PRICE_SOURCE = {
  compra: () => tr('last purchase'),
  costo: () => tr('stock cost'),
  estilo: () => tr('style price'),
}

/** Where the price came from, in the worker's words; '' when the list printed it. */
export function priceSourceText(line = {}) {
  const label = PRICE_SOURCE[line.price_source]
  return label ? label() : ''
}

/** The plan's period and source in one line for the bar. */
export function planScope(plan = {}, formatDay = (d) => d) {
  const who = plan.supplier || tr('Supplier to be chosen')
  if (plan.installed)
    return tr('{0}, installed in repairs {1} to {2}', [
      who,
      formatDay(plan.installed.from),
      formatDay(plan.installed.to),
    ])
  if (plan.catalog_title) return `${who}, ${plan.catalog_title}`
  return plan.months ? tr('{0}, sales of {1} months', [who, plan.months]) : who
}

/** The realtime event of the plan's chain (doco sourcing.PLAN_EVENT) that the page
 *  should follow: a newer plan of the chain it shows. */
export function followsEvent(plan, payload) {
  return Boolean(
    plan?.chain &&
      payload?.id &&
      payload.chain === plan.chain &&
      payload.id !== plan.id,
  )
}

/** The lines a newer plan added or whose pieces it changed, to mark for a moment. */
export function changedLines(before = [], after = []) {
  const had = new Map(before.map((line) => [line.line, Number(line.qty)]))
  const out = new Set()
  for (const line of after)
    if (!had.has(line.line) || had.get(line.line) !== Number(line.qty))
      out.add(line.line)
  return out
}
