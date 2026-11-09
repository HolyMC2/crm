// The supplier's order sheet on the list page (doco.workspaces.hoja_pedido):
// one open order per supplier, whatever list a quantity was typed on, read
// per list and per product type against the month's budget and the months
// before. Pure helpers; the page and the order sheet draw them.

/** A list's name on its tab: its product type, else its title. */
export function listLabel(list) {
  return list?.item_group || list?.title || ''
}

/**
 * The supplier's lists for the tabs, with what the open order holds of each
 * as the last tap left it (`live`: {list: {pieces, amount, lines}}).
 */
export function supplierLists(lists, live, current) {
  return (lists || []).map((list) => {
    const held = (live || {})[list.name]
    return {
      ...list,
      pieces: held ? Number(held.pieces || 0) : 0,
      amount: held ? Number(held.amount || 0) : 0,
      lines: held ? Number(held.lines || 0) : 0,
      current: list.name === current,
    }
  })
}

/** The lists other than this one that the order holds lines of. */
export function otherLists(lists, current) {
  return (lists || []).filter((list) => list.name !== current && list.lines > 0)
}

/** The order's product types with their months (`history`: {type: months}). */
export function typeRows(groups, history) {
  return (groups || []).map((group) => ({
    ...group,
    history: (history || {})[group.item_group] || group.history || null,
  }))
}

/**
 * The budget bar of a type: the share already committed this month, the
 * share this order takes, and whether the two pass the budget. Widths are
 * percentages of the bar, never past 100 together.
 */
export function budgetBar(budget) {
  const amount = Number(budget?.amount || 0)
  if (!(amount > 0)) return null
  const committed = Math.max(Number(budget.committed || 0), 0)
  const order = Math.max(Number(budget.order || 0), 0)
  const committedPct = Math.min((committed / amount) * 100, 100)
  const orderPct = Math.min((order / amount) * 100, 100 - committedPct)
  return {
    committedPct: Math.round(committedPct * 10) / 10,
    orderPct: Math.round(orderPct * 10) / 10,
    over: committed + order > amount + 0.005,
  }
}

/**
 * The months of a type as small bars: each month's height against the
 * highest one, the last month marked as the one running.
 */
export function monthBars(history) {
  const months = history || []
  const top = Math.max(0, ...months.map((m) => Number(m.amount || 0)))
  return months.map((m, i) => ({
    ...m,
    amount: Number(m.amount || 0),
    supplier: Number(m.supplier || 0),
    pct: top > 0 ? Math.round((Number(m.amount || 0) / top) * 100) : 0,
    running: i === months.length - 1,
  }))
}

/** What the full months before this one bought of the type, on average. */
export function monthlyAverage(history) {
  const full = (history || []).slice(0, -1)
  if (!full.length) return 0
  return full.reduce((sum, m) => sum + Number(m.amount || 0), 0) / full.length
}
