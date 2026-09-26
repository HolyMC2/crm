// Commercial deal amounts are not evidence of invoicing or collection.
const OPEN_TYPES = new Set(['Open', 'Ongoing', 'On Hold'])

function number(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** A card's commercial value in its own currency. */
export function displayValue(row, stage = {}) {
  const actual = number(row?.deal_value)
  if (stage.type === 'Won' && actual > 0) return actual
  const expected = number(row?.expected_deal_value)
  return expected > 0 ? expected : actual
}

/** Explicit 0 is meaningful; only absent values inherit the stage probability. */
export function dealProbability(row, stage = {}) {
  const own = row?.probability
  const value = own == null || own === '' ? stage.probability : own
  return Math.max(0, Math.min(100, number(value)))
}

/** Normal sales rungs before an outcome; post-outcome repair re-entry is separate. */
export function funnelLadder(stages = []) {
  const ordered = [...stages].sort(
    (a, b) => number(a.position) - number(b.position),
  )
  const firstClosed = ordered.findIndex(
    (stage) => stage.type === 'Won' || stage.type === 'Lost',
  )
  const ladder = firstClosed === -1 ? ordered : ordered.slice(0, firstClosed)
  return ladder.filter(
    (stage) => OPEN_TYPES.has(stage.type) && !stage.hidden && !stage.archived,
  )
}

/** Server SUM of per-deal commercial values in the returned base currency. */
export function stageValue(entry) {
  return number(entry?.commercial_value)
}

/** Server SUM already respects per-deal probability, outcomes, FX and permissions. */
export function weightedTotal(countsByStatus = {}, statuses = []) {
  return (statuses || []).reduce((sum, stage) => {
    if (!OPEN_TYPES.has(stage.type) || stage.hidden || stage.archived)
      return sum
    return (
      sum +
      number(countsByStatus?.[stage.value ?? stage.name]?.weighted_forecast)
    )
  }, 0)
}
