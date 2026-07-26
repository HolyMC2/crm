// Post-llamada helpers (PostCallSheet.vue, spec 4.4). Pure + dependency-free so
// they unit-test without a clock, i18n catalog, or component mount.
//
// The outcome VALUE is ascii (what the backend enum stores/queries); the label is
// the es-MX source-locale text — the component wraps it in __() for translation.
// Keep this list in lockstep with api/postcall.py::_OUTCOMES.
export const OUTCOMES = [
  { value: 'contesto', label: 'Contestó', emoji: '✅' },
  { value: 'no_contesto', label: 'No contestó', emoji: '📵' },
  { value: 'buzon', label: 'Buzón', emoji: '📼' },
  { value: 'venta', label: 'Venta', emoji: '💰' },
  { value: 'otro', label: 'Otro', emoji: '•' },
]

const _BY_VALUE = Object.fromEntries(OUTCOMES.map((o) => [o.value, o]))

export function isValidOutcome(value) {
  return Object.prototype.hasOwnProperty.call(_BY_VALUE, value)
}

export function outcomeLabel(value) {
  return _BY_VALUE[value]?.label || ''
}

// Absolute epoch (ms) for "mañana 9:00" in the operator's LOCAL timezone. Computed
// device-side and sent as an epoch so the backend converts to site tz with no
// device-tz vs site-tz drift (mirrors DealHeader snooze's _tomorrow9). Passing an
// explicit `now` keeps it deterministic under test.
export function tomorrow9Epoch(now = Date.now()) {
  const d = new Date(now)
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d.getTime()
}

// Duration seconds → "m:ss" (calls rarely run an hour; longer still reads fine as
// minutes). Non-finite / negative collapses to "0:00".
export function formatCallDuration(secs) {
  const s = Number(secs)
  if (!Number.isFinite(s) || s <= 0) return '0:00'
  const total = Math.floor(s)
  const m = Math.floor(total / 60)
  const rem = total % 60
  return `${m}:${String(rem).padStart(2, '0')}`
}
