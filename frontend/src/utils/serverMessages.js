import { toast } from 'frappe-ui'

// frappe-ui 1.0.2 `call()`/`frappeRequest` hand `_server_messages` (what the
// server `frappe.msgprint`ed on a *successful* response) to the configured
// `serverMessagesHandler`; without one they are dropped, which is what the
// beta.29 `call()` did. Failures are a different path: their messages ride on
// the rejection (`e.messages`) and every call site toasts them itself.
//
// Each entry is a JSON string `{ message, title?, indicator?, raise_exception? }`.
// A successful answer also carries what the server only logged on the way:
// Frappe's permission-check notes (no indicator) and refusals it raised and
// caught (`raise_exception`). The page already shows that state, so only a
// message the server styled for the person (an indicator) becomes a toast,
// and Desk's dialog title («Mensaje») is not a second line.
const INDICATOR_TYPE = {
  red: 'error',
  orange: 'warning',
  yellow: 'warning',
  green: 'success',
}

export function parseServerMessages(messages) {
  const out = []
  const seen = new Set()
  for (const raw of Array.isArray(messages) ? messages : []) {
    let m
    try {
      m = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch {
      continue
    }
    if (!m || typeof m !== 'object' || !m.indicator || m.raise_exception)
      continue
    const message = String(m.message ?? '').trim()
    if (!message || seen.has(message)) continue
    seen.add(message)
    out.push({
      type: INDICATOR_TYPE[String(m.indicator).toLowerCase()] || 'info',
      message,
    })
  }
  return out
}

export function handleServerMessages(messages) {
  for (const { type, message } of parseServerMessages(messages)) {
    toast[type](message)
  }
}
