// Pure, testable helpers for the manager workload view (WorkloadView.vue, P2 S11).
// Dependency-free so vitest can exercise the cap math + sort without mounting the page.
// All returned color strings are frappe-ui surface tokens (dark-safe), kept here (not in
// the component) because the workplan puts "bar color token" in this util.

// Percentage of an agent's cap their open load consumes. Returns null when no cap is
// configured (auto_assign_cap <= 0) — the caller hides the bar and shows the raw count.
export function capPercent(load, cap) {
  const c = Number(cap) || 0
  if (c <= 0) return null
  return Math.round(((Number(load) || 0) / c) * 100)
}

// Bar fill width as a 0–100 number for a CSS width:%. Clamped so an over-cap agent's bar
// pins at 100 rather than overflowing. 0 when no cap (bar isn't rendered then anyway).
export function barWidth(load, cap) {
  const pct = capPercent(load, cap)
  if (pct == null) return 0
  return Math.min(100, Math.max(0, pct))
}

// Semantic load tone → frappe-ui surface token for the load bar. Muted steps so the page
// stays calm in dark mode; only a real problem gets colour:
//   over (>=100% of cap) → red, high (>=75%) → amber, ok (<75%) → neutral gray,
//   none (no cap set)     → light gray track colour.
export function barToken(load, cap) {
  const pct = capPercent(load, cap)
  if (pct == null) return 'bg-surface-gray-4'
  if (pct >= 100) return 'bg-surface-red-5'
  if (pct >= 75) return 'bg-surface-amber-5'
  return 'bg-surface-gray-6'
}

// Sortable row keys, in display order. 'full_name' sorts as es-locale text; the rest are
// numeric (open counts + the SLA-overdue tally).
export const WORKLOAD_SORT_KEYS = [
  'full_name',
  'open_total',
  'open_leads',
  'open_deals',
  'overdue_tasks',
]

// Client-side sort. Returns a NEW array — never mutates the source. null/undefined values
// always sink to the bottom regardless of direction so an empty cell never outranks a real
// number. Mirrors sortAgents() in agentMetricsFormat.js so the two manager tables behave alike.
export function sortWorkload(rows, key, dir = 'desc') {
  const factor = dir === 'asc' ? 1 : -1
  const numeric = key !== 'full_name'
  return [...(rows || [])].sort((a, b) => {
    const av = a?.[key]
    const bv = b?.[key]
    const an = av == null
    const bn = bv == null
    if (an && bn) return 0
    if (an) return 1
    if (bn) return -1
    if (numeric) return (Number(av) - Number(bv)) * factor
    return String(av).localeCompare(String(bv), 'es') * factor
  })
}

// Retain failed rows with their original version. Reload is deliberate; never
// silently turn a stale command into an authorization to move the newer record.
export function retainFailedSelection(selectedRows, results) {
  const succeeded = new Set(
    (results || []).filter((row) => row.ok).map(workItemKey),
  )
  return selectedRows.filter((row) => !succeeded.has(workItemKey(row)))
}

export function workItemKey(row) {
  return `${row.doctype}:${row.name}`
}

export function workItemHref(row) {
  if (row.doctype === 'CRM Lead')
    return `/crm/leads/${encodeURIComponent(row.name)}`
  if (row.doctype === 'CRM Deal')
    return `/crm/deals/${encodeURIComponent(row.name)}`
  return `/app/crm-task/${encodeURIComponent(row.name)}`
}

export const WORKLOAD_KINDS = ['leads', 'deals', 'tasks']
export const WORKLOAD_BUCKETS = ['all', 'overdue', 'today']
export const WORKLOAD_PAGE = 25

// Overdue and due-today buckets only exist for tasks (the only kind with a due date).
function normalizeBucket(bucket, kind) {
  return kind === 'tasks' && WORKLOAD_BUCKETS.includes(bucket) ? bucket : 'all'
}

export function safeWorkloadState(value) {
  const result = {
    pipeline: '',
    company: '',
    owner: null,
    kind: 'deals',
    bucket: 'all',
    offset: 0,
    agentOffset: 0,
    scroll: 0,
  }
  if (!value || typeof value !== 'object') return result
  for (const key of ['pipeline', 'company', 'owner']) {
    if (typeof value[key] === 'string' && value[key].length <= 140)
      result[key] = value[key]
  }
  if (WORKLOAD_KINDS.includes(value.kind)) result.kind = value.kind
  // v2 sessions stored `overdue: true`; read it as the overdue bucket.
  const bucket =
    value.bucket ?? (value.overdue === true ? 'overdue' : undefined)
  result.bucket = normalizeBucket(bucket, result.kind)
  for (const key of ['offset', 'agentOffset', 'scroll']) {
    if (
      Number.isInteger(value[key]) &&
      value[key] >= 0 &&
      value[key] <= 1000000 &&
      (key === 'scroll' || value[key] % WORKLOAD_PAGE === 0)
    )
      result[key] = value[key]
  }
  return result
}

// ---- URL state ------------------------------------------------------------
// The queue selection lives in the route query so a link is shareable and Back
// works. Only non-default keys are written; `unassigned=1` distinguishes the
// unassigned queue (owner '') from "every owner" (owner null).
const QUERY_KEYS = [
  'pipeline',
  'company',
  'owner',
  'unassigned',
  'kind',
  'bucket',
  'page',
  'people',
]

export function encodeWorkloadQuery(state) {
  const safe = safeWorkloadState(state)
  const query = {}
  if (safe.pipeline) query.pipeline = safe.pipeline
  if (safe.company) query.company = safe.company
  if (safe.owner === '') query.unassigned = '1'
  else if (safe.owner) query.owner = safe.owner
  if (safe.kind !== 'deals') query.kind = safe.kind
  if (safe.bucket !== 'all') query.bucket = safe.bucket
  if (safe.offset) query.page = String(safe.offset / WORKLOAD_PAGE + 1)
  if (safe.agentOffset)
    query.people = String(safe.agentOffset / WORKLOAD_PAGE + 1)
  return query
}

function first(value) {
  return Array.isArray(value) ? value[0] : value
}

function pageOffset(value) {
  const text = first(value)
  if (typeof text !== 'string' || !/^[1-9][0-9]{0,4}$/.test(text)) return 0
  return (Number(text) - 1) * WORKLOAD_PAGE
}

// Returns null when the query carries no workload keys, so the caller can fall
// back to the session copy (e.g. opening /workload from the sidebar).
export function decodeWorkloadQuery(query) {
  if (!query || !QUERY_KEYS.some((key) => first(query[key]) != null))
    return null
  const text = (key) => {
    const value = first(query[key])
    return typeof value === 'string' ? value : undefined
  }
  return safeWorkloadState({
    pipeline: text('pipeline'),
    company: text('company'),
    owner: text('unassigned') === '1' ? '' : text('owner'),
    kind: text('kind'),
    bucket: text('bucket'),
    offset: pageOffset(query.page),
    agentOffset: pageOffset(query.people),
  })
}

export function sameWorkloadQuery(a, b) {
  const left = encodeWorkloadQuery(a)
  const right = encodeWorkloadQuery(b)
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...keys].every((key) => left[key] === right[key])
}

// ---- Risk and capacity ----------------------------------------------------
// One label per person, most urgent first: over capacity, then behind (overdue
// tasks), then close to the cap. 'ok' only when a cap exists to compare with.
export function riskLevel(agent, cap) {
  const pct = capPercent(agent?.open_total, cap)
  if (pct != null && pct >= 100) return 'over'
  if ((Number(agent?.overdue_tasks) || 0) > 0) return 'behind'
  if (pct != null && pct >= 75) return 'near'
  return pct == null ? 'none' : 'ok'
}

const RISK_RANK = { over: 3, behind: 2, near: 1, ok: 0, none: 0 }

// Problems first: risk tier, then overdue tasks, then share of cap / open load,
// then name. Returns a new array.
export function sortByRisk(agents, cap) {
  const load = (row) => Number(row?.open_total) || 0
  return [...(agents || [])].sort((a, b) => {
    const tier = RISK_RANK[riskLevel(b, cap)] - RISK_RANK[riskLevel(a, cap)]
    if (tier) return tier
    const overdue =
      (Number(b?.overdue_tasks) || 0) - (Number(a?.overdue_tasks) || 0)
    if (overdue) return overdue
    if (load(b) !== load(a)) return load(b) - load(a)
    return String(a?.full_name || a?.user || '').localeCompare(
      String(b?.full_name || b?.user || ''),
    )
  })
}

// Reassignment targets, lowest visible load first. Load comes from the agent
// rows on the current page; people whose load is not on this page follow,
// alphabetically, with `load: null` so the picker never invents a number.
export function rankCandidates(candidates, agents) {
  const byUser = new Map((agents || []).map((row) => [row.user, row]))
  return (candidates || [])
    .map((candidate) => {
      const row = byUser.get(candidate.user)
      return {
        ...candidate,
        load: row ? Number(row.open_total) || 0 : null,
        overdue: row ? Number(row.overdue_tasks) || 0 : null,
      }
    })
    .sort((a, b) => {
      if ((a.load == null) !== (b.load == null)) return a.load == null ? 1 : -1
      if (a.load !== b.load) return a.load - b.load
      if (a.overdue !== b.overdue) return (a.overdue || 0) - (b.overdue || 0)
      return String(a.full_name || a.user).localeCompare(
        String(b.full_name || b.user),
      )
    })
}

// ---- Site dates -----------------------------------------------------------
// The API returns naive datetimes already in the site timezone
// ("YYYY-MM-DD HH:MM:SS[.ffffff]"), and `as_of` is the site's own clock.
// Comparing those strings directly keeps every judgement in site time.
const NAIVE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/

export function siteDay(value) {
  const match = typeof value === 'string' && value.match(NAIVE)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : ''
}

// 'overdue' | 'today' | 'later' | 'none', matching the server rule
// (overdue = due before the site timestamp).
export function dueState(due, asOf) {
  if (!siteDay(due) || !siteDay(asOf)) return 'none'
  if (String(due) < String(asOf)) return 'overdue'
  return siteDay(due) === siteDay(asOf) ? 'today' : 'later'
}

// Whole days between a record's last change and the site timestamp.
export function ageDays(modified, asOf) {
  const from = siteDay(modified)
  const to = siteDay(asOf)
  if (!from || !to) return null
  const days = (Date.parse(to) - Date.parse(from)) / 86400000
  return Number.isFinite(days) ? Math.max(0, Math.round(days)) : null
}

// Render a naive site datetime with the site's date format
// (sysdefaults.date_format, e.g. "dd-mm-yyyy"); ISO date when none is set.
// Time is shown only when the value carries a non-midnight time.
export function formatSiteDate(value, dateFormat) {
  const match = typeof value === 'string' && value.match(NAIVE)
  if (!match) return ''
  const [, y, m, d, hh, mm] = match
  const pattern = (dateFormat || 'yyyy-mm-dd').toLowerCase()
  const date = pattern.replace('yyyy', y).replace('mm', m).replace('dd', d)
  return hh && `${hh}:${mm}` !== '00:00' ? `${date} ${hh}:${mm}` : date
}

// ---- Due-today scan -------------------------------------------------------
// get_work_items(kind='tasks') orders open tasks by due date (undated last).
// Starting right after the overdue ones, rows are taken while they are due on
// the site's current day. `done` is true once a later/undated row appears or
// the list ends, i.e. the page holds the tail of today's tasks.
export function takeDueToday(rows, asOf) {
  const items = []
  for (const row of rows || []) {
    const state = dueState(row?.due_date, asOf)
    if (state === 'overdue') continue
    if (state !== 'today') return { items, done: true }
    items.push(row)
  }
  return { items, done: false }
}

// Per-owner counts for the overview ('' = unassigned).
export function countByOwner(rows) {
  const counts = {}
  for (const row of rows || []) {
    const owner = row?.owner || ''
    counts[owner] = (counts[owner] || 0) + 1
  }
  return counts
}
