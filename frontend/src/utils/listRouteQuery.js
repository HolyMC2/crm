// Drill-down links into a list: another page (Pipeline Analysis today) opens the
// deals list with a query such as
//   /deals?report=pipeline&status=Won&pipeline=Ventas&created_from=2026-09-01&created_to=2026-09-28
// and the list shows that cohort as an unsaved change of the current view.
//
// This is the query form DealsView reads (`report=pipeline`, `status`,
// `pipeline`, `created_from`, `created_to`) plus `owner` (the deal owner). The
// helpers are pure; ViewControls and Deals.vue wire them in.

// report key → the page the drill came from (for the "back to" link)
const DEAL_REPORT_SOURCES = {
  pipeline: { name: 'Pipeline Analysis', label: 'Pipeline analysis' },
}

// the query keys a drill owns; removing them ends the drill
export const DEAL_LIST_QUERY_KEYS = [
  'report',
  'status',
  'pipeline',
  'owner',
  'created_from',
  'created_to',
]

const DATE = /^\d{4}-\d{2}-\d{2}$/

function strings(value) {
  const list = Array.isArray(value) ? value : [value]
  return list.filter((v) => typeof v === 'string' && v.trim() !== '')
}

function oneOrIn(values) {
  return values.length === 1 ? values[0] : ['in', values]
}

function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return ''
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
    ? value
    : ''
}

/** 'YYYY-MM-DD' one calendar day later (no time zone involved). */
export function nextDay(value) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/**
 * The creation window in site dates. Both ends inclusive: Frappe widens a
 * date-only `between` on a Datetime column to the end of the last day. With only
 * an end, the list needs everything before the next day starts.
 */
export function creationFilter(from, to) {
  if (from && to) return ['between', [from, to]]
  if (from) return ['>=', from]
  if (to) return ['<', nextDay(to)]
  return null
}

/**
 * The deals list's drill query, or null when the route carries none.
 * @returns {{key: string, source: {name: string, label: string}, filters: object, keys: string[]} | null}
 */
export function parseDealListQuery(query = {}) {
  const report = typeof query?.report === 'string' ? query.report : ''
  const source = DEAL_REPORT_SOURCES[report]
  if (!source) return null

  const filters = {}
  const status = strings(query.status)
  if (status.length) filters.status = oneOrIn(status)
  const pipeline = strings(query.pipeline)[0]
  if (pipeline) filters.pipeline = pipeline
  const owner = strings(query.owner)
  if (owner.length) filters.deal_owner = oneOrIn(owner)
  let from = validDate(query.created_from)
  let to = validDate(query.created_to)
  if (from && to && from > to) [from, to] = [to, from]
  const creation = creationFilter(from, to)
  if (creation) filters.creation = creation
  if (!Object.keys(filters).length) return null

  const keys = DEAL_LIST_QUERY_KEYS.filter((k) => query[k] != null)
  return {
    key: JSON.stringify(
      keys.map((k) => [k, Array.isArray(query[k]) ? query[k] : [query[k]]]),
    ),
    source: { ...source },
    filters,
    keys,
  }
}

function plain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

/**
 * The list's first params, from the view's params, the back-navigation state
 * and the incoming drill query.
 *
 * - No drill: the stored state is laid over the view (restoreListParams).
 * - A drill replaces the view's filters and ignores the stored state, unless the
 *   worker is coming back to this same history entry (`returning`) and the state
 *   was saved from the same drill: then it holds what they did since.
 *
 * @returns {{params: object, state: object|null, viewUpdated: boolean}}
 */
export function initialListParams(
  params,
  { restored = null, incoming = null, returning = false, restore } = {},
) {
  const lay = restore || ((p) => p)
  if (!incoming) {
    return {
      params: lay(params, restored),
      state: restored,
      viewUpdated: !!restored?.viewUpdated,
    }
  }
  if (restored && returning && restored.routeKey === incoming.key) {
    return { params: lay(params, restored), state: restored, viewUpdated: true }
  }
  const next = { ...params, filters: plain(incoming.filters) }
  delete next.or_filters
  return { params: next, state: null, viewUpdated: true }
}

/** The route query without the drill's keys (ends the drill in place). */
export function withoutRouteQuery(query = {}, keys = DEAL_LIST_QUERY_KEYS) {
  const next = { ...query }
  for (const k of keys) delete next[k]
  return next
}

/**
 * Whether the previous history entry is the drill's source page, so "back"
 * should pop history (keeping that page's own state) instead of pushing it anew.
 */
export function isBackToSource(backPath, sourcePath) {
  if (typeof backPath !== 'string' || !backPath || !sourcePath) return false
  return backPath.split(/[?#]/)[0] === sourcePath
}
