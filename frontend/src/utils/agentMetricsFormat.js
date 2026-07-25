// Pure, testable helpers for the per-agent analytics table (ReportsAgents.vue).
// Kept dependency-free so vitest can exercise the sort + formatting logic without
// mounting the component.

// Compact first-response label: 45s / 12m / 3.5h, or "—" when the agent has no
// measured first response (median_response_secs === null from the backend).
// Mirrors fmtResp() in pages/Reports.vue so the two agent reports read alike.
export function fmtDuration(secs) {
  if (secs == null) return '—'
  const s = Number(secs) || 0
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${(s / 3600).toFixed(1)}h`
}

// The sortable columns, in display order. 'agent_name' sorts as es-locale text;
// every other key is numeric.
export const AGENT_SORT_KEYS = ['agent_name', 'open', 'won', 'won_value', 'median_response_secs']

// Client-side sort. Returns a NEW array — never mutates the source. null/undefined
// values (e.g. an agent with no measured response, shown as "—") always sink to the
// bottom regardless of direction, so an empty cell never outranks a real number.
export function sortAgents(rows, key, dir = 'desc') {
  const factor = dir === 'asc' ? 1 : -1
  const numeric = key !== 'agent_name'
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

// Header-click transition: clicking a NEW column starts descending (biggest first
// — the useful default for counts/pesos); re-clicking the active column toggles it.
export function nextSort(current, key) {
  if (!current || current.key !== key) return { key, dir: 'desc' }
  return { key, dir: current.dir === 'desc' ? 'asc' : 'desc' }
}
