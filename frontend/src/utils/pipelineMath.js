// Pipeline arithmetic shared by the deal board, its column headers and the lists.
//
// Two numbers live on a deal: `expected_deal_value` is the pipeline number (what
// we think we will close) and `deal_value` is the invoiced one. The board shows
// the expected value when it is set, else the invoiced one — one rule, one place.
//
// Pure functions: they take plain rows / aggregate entries, never a resource.

/**
 * Board / card money for a deal row (or for an aggregate entry that carries the
 * same two field names). Expected value wins when it is a real positive number.
 */
export function displayValue(row) {
  const expected = Number(row?.expected_deal_value)
  if (isFinite(expected) && expected > 0) return expected
  const actual = Number(row?.deal_value)
  return isFinite(actual) ? actual : 0
}

/**
 * Probability-weighted pipeline total.
 *
 * @param {Object} countsByStatus  status name -> { count, deal_value, expected_deal_value }
 * @param {Array}  statuses        [{ value|name, probability }] — the visible stages
 * @returns {number} sum of displayValue(entry) * probability / 100
 *
 * A stage with no probability contributes nothing: an unweighted stage would
 * otherwise inflate the forecast with its full value.
 */
export function weightedTotal(countsByStatus = {}, statuses = []) {
  let total = 0
  for (const status of statuses || []) {
    const key = status?.value ?? status?.name
    if (key == null) continue
    const entry = countsByStatus?.[key]
    if (!entry) continue
    const probability = Number(status?.probability)
    if (!isFinite(probability) || probability <= 0) continue
    total += (displayValue(entry) * probability) / 100
  }
  return total
}
