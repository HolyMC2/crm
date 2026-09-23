// Group-by for the deals list.
//
// Pure on purpose: the page owns the data, this owns the rule. Only the stage
// dimension has an accurate total (the server already counts deals per status
// for the board headers and the funnel); the others are read off the rows that
// are actually loaded, so a group carries whether its count is the whole filtered
// set or only the loaded page and the header says which.

// Labels are translated where they are rendered, like FOLLOW_UP_QUEUES.
export const DEAL_GROUP_BYS = [
  { key: 'none', label: 'Sin agrupar' },
  { key: 'status', label: 'Etapa' },
  { key: 'deal_owner', label: 'Responsable' },
  { key: 'repair_status', label: 'Estado de reparación' },
]

export function isGroupBy(key) {
  return DEAL_GROUP_BYS.some((g) => g.key === key && g.key !== 'none')
}

export function groupByLabel(key) {
  return (
    DEAL_GROUP_BYS.find((g) => g.key === key)?.label || DEAL_GROUP_BYS[0].label
  )
}

/**
 * @param {Array<object>} rows loaded rows, already in their display order
 * @param {string} dimension one of DEAL_GROUP_BYS
 * @param {object} options
 *   order    — values that lead, in their own order (visible stage positions)
 *   counts   — {value: {count}} filtered totals from the server, stage only
 *   complete — every row of the filtered set is loaded (no next page)
 *   groupValue — resolves a row's group value; needed where it is not a row field
 *              (repair status comes from the display enrichment). Not named
 *              `valueOf`: that one is inherited from Object.prototype, so a
 *              caller that leaves it out would hand us the prototype method.
 *   labelOf  — display label for a value (owner email -> full name)
 *   emptyLabel — label for rows with no value
 * @returns {Array<{key: string, label: string, count: number, exact: boolean, rows: Array<object>}>}
 */
export function groupRows(rows, dimension, options = {}) {
  if (!isGroupBy(dimension)) return []
  const {
    order = [],
    counts = null,
    complete = true,
    groupValue = (row) => row?.[dimension],
    labelOf = (value) => value,
    emptyLabel = '',
  } = options

  const buckets = new Map()
  for (const row of rows || []) {
    const key = String(groupValue(row) ?? '')
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(row)
  }

  // Stages lead in their configured order; anything the rows carry that the
  // taxonomy does not (a deal parked on a hidden stage) follows in first-seen
  // order, and the unset group is always last.
  const ordered = []
  for (const value of order)
    if (buckets.has(String(value))) ordered.push(String(value))
  for (const key of buckets.keys())
    if (key && !ordered.includes(key)) ordered.push(key)
  if (buckets.has('')) ordered.push('')

  return ordered.map((key) => {
    const groupRowsOut = buckets.get(key) || []
    const total = counts?.[key]?.count
    const exact = total != null
    return {
      key,
      label: key ? String(labelOf(key) ?? key) : emptyLabel,
      count: exact ? Number(total) : groupRowsOut.length,
      // A derived count is only the whole truth when every matching row is loaded.
      exact: exact || complete,
      rows: groupRowsOut,
    }
  })
}
