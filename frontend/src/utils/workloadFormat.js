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

// Semantic load tone → frappe-ui surface token for the load bar:
//   over (>=100% of cap) → red, high (>=75%) → amber, ok (<75%) → green,
//   none (no cap set)     → neutral gray.
export function barToken(load, cap) {
  const pct = capPercent(load, cap)
  if (pct == null) return 'bg-surface-gray-4'
  if (pct >= 100) return 'bg-surface-red-7'
  if (pct >= 75) return 'bg-surface-amber-2'
  return 'bg-surface-green-3'
}

// Sortable row keys, in display order. 'full_name' sorts as es-locale text; the rest are
// numeric (open counts + the SLA-overdue tally).
export const WORKLOAD_SORT_KEYS = [
  'full_name',
  'open_total',
  'open_leads',
  'open_deals',
  'sla_overdue_count',
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
