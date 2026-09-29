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

// ── Embudo (pipeline analysis) ───────────────────────────────────────────────
// The funnel API reports the CURRENT stage of each deal created in the period.
// It records no stage history, so "reached a stage" is inferred: a deal sitting
// at a later rung, or won, must have passed every earlier rung. Lost deals do
// not say where they fell out, so they are an outcome of their own and are
// never charged to a stage.

export const PERIOD_KEYS = [
  '30d',
  '90d',
  'month',
  'prev_month',
  'year',
  'custom',
]
export const DEFAULT_PERIOD = '90d'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function parseDay(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const time = Date.UTC(y, m - 1, d)
  const date = new Date(time)
  // Rejects 2026-02-31 and friends instead of rolling them into March.
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return time
}
const DAY = 86400000
function formatDay(time) {
  return new Date(time).toISOString().slice(0, 10)
}
export function isDay(value) {
  return parseDay(value) != null
}
export function addDays(day, n) {
  return formatDay(parseDay(day) + n * DAY)
}
/** Inclusive number of days between two ISO dates. */
export function dayCount(from, to) {
  return Math.round((parseDay(to) - parseDay(from)) / DAY) + 1
}

/** Local calendar date of the browser as YYYY-MM-DD. */
export function localToday(now = new Date()) {
  const z = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}

/** Inclusive {from, to} for a preset, or null for an unusable custom range. */
export function periodRange(period, today, custom = {}) {
  const [y, m] = today.split('-').map(Number)
  switch (period) {
    case '30d':
      return { from: addDays(today, -29), to: today }
    case '90d':
      return { from: addDays(today, -89), to: today }
    case 'month':
      return { from: formatDay(Date.UTC(y, m - 1, 1)), to: today }
    case 'prev_month':
      return {
        from: formatDay(Date.UTC(y, m - 2, 1)),
        to: formatDay(Date.UTC(y, m - 1, 1) - DAY),
      }
    case 'year':
      return { from: formatDay(Date.UTC(y, 0, 1)), to: today }
    case 'custom':
      if (!isDay(custom.from) || !isDay(custom.to)) return null
      if (parseDay(custom.from) > parseDay(custom.to)) return null
      return { from: custom.from, to: custom.to }
    default:
      return null
  }
}

/** The equal-length window that ends the day before `range` starts. */
export function previousRange(range) {
  const days = dayCount(range.from, range.to)
  const to = addDays(range.from, -1)
  return { from: addDays(to, -(days - 1)), to }
}

/** Page state from the route query; anything unusable falls back to defaults. */
export function parseFunnelQuery(query = {}) {
  const one = (v) => (Array.isArray(v) ? v[0] : v)
  const pipeline =
    typeof one(query.pipeline) === 'string' ? one(query.pipeline) : ''
  let period = one(query.period)
  if (!PERIOD_KEYS.includes(period)) period = DEFAULT_PERIOD
  const from = one(query.from)
  const to = one(query.to)
  if (period === 'custom' && !periodRange('custom', '2000-01-01', { from, to }))
    period = DEFAULT_PERIOD
  return period === 'custom'
    ? { pipeline, period, from, to }
    : { pipeline, period, from: '', to: '' }
}

/** Route query for a page state (inverse of parseFunnelQuery). */
export function funnelQuery(state) {
  const query = {}
  if (state.pipeline) query.pipeline = state.pipeline
  query.period = state.period || DEFAULT_PERIOD
  if (query.period === 'custom') {
    query.from = state.from
    query.to = state.to
  }
  return query
}

/** Percentage or null when the base is empty (never a fake 0 %). */
export function percent(part, whole) {
  return whole > 0 ? (100 * part) / whole : null
}

/**
 * Funnel model for one pipeline.
 * payload: get_pipeline_funnel response; metrics: {status: aggregate row} or null.
 */
export function funnelModel(payload = {}, metrics = null) {
  const data = Array.isArray(payload) ? { stages: payload } : payload || {}
  const stages = data.stages || []
  const extra = [
    ...(data.historical_stages || []),
    ...(data.unclassified_stages || []),
  ]
  const all = [...stages, ...extra]
  const value = (status) => (metrics ? stageValue(metrics[status]) : null)
  const outcome = (type) => {
    const rows = all.filter((s) => s.type === type && number(s.count) > 0)
    const count = rows.reduce((sum, s) => sum + number(s.count), 0)
    return {
      count,
      value: metrics
        ? rows.reduce((sum, s) => sum + value(s.status ?? s.stage), 0)
        : null,
      statuses: rows.map((s) => ({
        status: s.status ?? s.stage,
        stage: s.stage,
        count: number(s.count),
      })),
    }
  }
  const won = outcome('Won')
  const lost = outcome('Lost')
  const ladder = funnelLadder(stages)
  const onLadder = new Set(ladder)
  const steps = ladder.map((s) => ({
    status: s.status ?? s.stage,
    stage: s.stage,
    type: s.type,
    probability: s.probability,
    count: number(s.count),
    value: value(s.status ?? s.stage),
  }))
  let reached = won.count
  for (let i = steps.length - 1; i >= 0; i--) {
    reached += steps[i].count
    steps[i].reached = reached
  }
  steps.forEach((step, i) => {
    const next = i + 1 < steps.length ? steps[i + 1].reached : won.count
    step.advanced = next
    step.stalled = step.reached - next
    step.conversion = percent(next, step.reached)
  })
  let biggest = null
  for (const step of steps) {
    if (step.conversion == null || step.conversion >= 100) continue
    if (!biggest || step.conversion < biggest.conversion) biggest = step
  }
  steps.forEach((step) => (step.biggestDrop = step === biggest))
  const others = all
    .filter(
      (s) =>
        !onLadder.has(s) &&
        s.type !== 'Won' &&
        s.type !== 'Lost' &&
        number(s.count) > 0,
    )
    .map((s) => ({
      status: s.status ?? s.stage,
      stage: s.stage,
      type: s.type,
      hidden: !!s.hidden,
      count: number(s.count),
      value: value(s.status ?? s.stage),
    }))
  const total =
    data.total != null
      ? number(data.total)
      : all.reduce((sum, s) => sum + number(s.count), 0)
  return {
    total,
    won,
    lost,
    open: steps.reduce((sum, s) => sum + s.count, 0),
    winRate: percent(won.count, won.count + lost.count),
    steps,
    others,
    biggestDrop: biggest ? biggest.status : null,
  }
}

/** Current minus previous; null when either side cannot be compared. */
function diff(a, b) {
  return a == null || b == null ? null : a - b
}

/** Period-over-period deltas, keyed by stage status for the ladder. */
export function funnelDelta(current, previous) {
  if (!current || !previous) return null
  const before = Object.fromEntries(previous.steps.map((s) => [s.status, s]))
  const steps = {}
  for (const step of current.steps) {
    const old = before[step.status]
    steps[step.status] = {
      count: diff(step.count, old ? old.count : 0),
      conversion: diff(step.conversion, old ? old.conversion : null),
    }
  }
  return {
    total: diff(current.total, previous.total),
    won: diff(current.won.count, previous.won.count),
    lost: diff(current.lost.count, previous.lost.count),
    wonValue: diff(current.won.value, previous.won.value),
    winRate: diff(current.winRate, previous.winRate),
    steps,
  }
}

/** Metrics rows from aggregate_deal_metrics as {status: row}. */
export function metricsByStatus(response) {
  if (!response || !Array.isArray(response.stages)) return null
  return Object.fromEntries(
    response.stages.map((row) => [row.status || '', row]),
  )
}
