// Pure label helpers for the Cadencia 1:1 picker chip (CadencePicker.vue, spec
// 4.2). Kept dependency-free so they unit-test without a clock, i18n catalog, or
// Vue. The component wraps the numeric variants in __() for translation; the
// convenience strings here are es-MX (the app's source locale) for tests/callers.
//
// `enrollment_status` (doco_marketing.api.cadence) supplies:
//   touches_done / total_touches — "touches" = the cadence's send steps, so the
//     positional engine step maps to a human "paso 2/3".
//   next_run_at — a Frappe datetime string "YYYY-MM-DD HH:mm:ss". Parsed the way
//     the rest of the CRM inbox parses server datetimes (space→T, device-local),
//     so the relative "próx." label lines up with the header's other time chips.

// "paso {current}/{total}" — current touch is the next one to fire (1-based),
// clamped so a completed sequence reads "paso N/N" rather than "N+1/N".
export function touchLabel(touchesDone, totalTouches) {
  const total = Number(totalTouches) || 0
  if (!total) return ''
  const current = Math.min((Number(touchesDone) || 0) + 1, total)
  return `paso ${current}/${total}`
}

function parseServerDate(s) {
  if (!s) return NaN
  // epoch (number or numeric string) passes straight through; datetime strings
  // are parsed device-local like DealHeader/ThreadSummary do.
  if (typeof s === 'number') return s
  const str = String(s)
  if (/^\d+$/.test(str)) return Number(str)
  return new Date(str.replace(' ', 'T')).getTime()
}

// Relative "próx." label for the next scheduled touch. Returns '' when there is
// no schedule (paused/finished). A due-or-past time reads "en breve" (the */5
// dispatch will ship it imminently), never a negative duration.
export function nextTouchLabel(nextRunAt, now = Date.now()) {
  const t = parseServerDate(nextRunAt)
  if (Number.isNaN(t)) return ''
  const diff = t - now
  if (diff <= 60000) return 'en breve'
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `en ${mins} min`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `en ${hrs} h`
  const days = Math.round(hrs / 24)
  return `en ${days} d`
}
