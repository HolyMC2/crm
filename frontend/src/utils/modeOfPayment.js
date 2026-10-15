// ERPNext seeds these Modes of Payment with English names («Check» on a US
// setup, «Cheque» elsewhere). The record keeps its name (it is the value sent
// back to the server); the worker reads it in their language. A mode the
// business created itself shows as it was named.
export const SEEDED_MODES = Object.freeze([
  'Cash',
  'Check',
  'Cheque',
  'Bank Draft',
  'Wire Transfer',
  'Credit Card',
  'Debit Card',
])
const SEEDED = new Set(SEEDED_MODES)
export const MODE_CONTEXT = 'Mode of Payment'

/** The worker's word for a Mode of Payment record name. */
export function modeOfPaymentLabel(name) {
  const value = String(name || '')
  if (!SEEDED.has(value)) return value
  const tr =
    typeof window !== 'undefined' && typeof window.__ === 'function'
      ? window.__
      : null
  return tr ? tr(value, null, MODE_CONTEXT) : value
}
