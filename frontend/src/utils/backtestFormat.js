// Pure, testable helpers behind ScoreBacktest.vue (P2 S17 — score backtest).
// Dependency-free so vitest exercises the percentage / lift / cohort-shaping logic
// without mounting the component or pulling frappe-ui. NO translated strings live
// here — the component composes es-MX copy through __(); these helpers only shape
// and format numbers so they stay locale-neutral and unit-testable.

// Grades in display order — the backend returns a {A,B,C,D} object; the table
// iterates this so a missing grade still renders a zero row.
export const GRADES = ['A', 'B', 'C', 'D']

// es-MX abbreviated month names, indexed 1..12 (index 0 unused). Kept as a static
// table rather than Date/Intl locale so the label is deterministic in any test env.
const MONTHS_ES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// 0..1 win-rate ratio → "50%". null/undefined/NaN (no data) → "—". `digits`
// controls decimal places for sub-percent precision when a caller wants it.
export function pct(ratio, digits = 0) {
  if (ratio == null || Number.isNaN(Number(ratio))) return '—'
  return `${(Number(ratio) * 100).toFixed(digits)}%`
}

// Lift multiplier → "4.2×" (one decimal, trailing ".0" trimmed so 10 → "10×").
// null when the backend couldn't compute a lift (div-zero / thin data) — the
// component swaps in an "insufficient data" sentence in that case.
export function fmtLift(lift) {
  if (lift == null || Number.isNaN(Number(lift))) return null
  const n = Number(lift)
  const oneDp = Math.round(n * 10) / 10
  const body = Number.isInteger(oneDp) ? String(oneDp) : oneDp.toFixed(1)
  return `${body}×`
}

// "2026-07" → "jul 2026". A malformed key is returned as-is (never throws — the
// label is cosmetic and must not break the panel).
export function monthLabel(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key || ''))
  if (!m) return String(key || '')
  const month = MONTHS_ES[Number(m[2])] || m[2]
  return `${month} ${m[1]}`
}

// A grades object ({A:{leads,converted,win_rate}, ...}) → an ordered array of rows
// for the table v-for. Missing grades are filled with a zero row so the four bands
// always render. Returns a NEW array; never mutates the input.
export function gradeRows(grades) {
  const g = grades || {}
  return GRADES.map((grade) => {
    const row = g[grade] || {}
    return {
      grade,
      leads: Number(row.leads || 0),
      converted: Number(row.converted || 0),
      win_rate: row.win_rate == null ? 0 : Number(row.win_rate),
    }
  })
}

// Width of a win-rate bar as an integer percent (0..100), clamped. Separate from
// pct() because the bar wants a bare number for a style binding, not a "%" string.
export function barPct(ratio) {
  const n = Number(ratio)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n * 100)))
}
