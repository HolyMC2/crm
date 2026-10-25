import { toast } from 'frappe-ui'

// frappe-ui 1.0.2 `call()`/`frappeRequest` hand `_server_messages` (what the
// server `frappe.msgprint`ed on a *successful* response) to the configured
// `serverMessagesHandler`; without one they are dropped, which is what the
// beta.29 `call()` did. Failures are a different path: their messages ride on
// the rejection (`e.messages`) and every call site toasts them itself.
//
// Each entry is a JSON string `{ message, title?, indicator? }`; the indicator
// is the Desk colour name. One toast per distinct message per batch.
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
    let m = raw
    if (typeof raw === 'string') {
      try {
        m = JSON.parse(raw)
      } catch {
        m = { message: raw }
      }
    }
    if (!m || typeof m !== 'object') continue
    const message = String(m.message ?? '').trim()
    if (!message || seen.has(message)) continue
    seen.add(message)
    out.push({
      type: INDICATOR_TYPE[String(m.indicator || '').toLowerCase()] || 'info',
      message,
      title: m.title ? String(m.title) : '',
    })
  }
  return out
}

export function handleServerMessages(messages) {
  for (const { type, message, title } of parseServerMessages(messages)) {
    toast[type](message, title ? { description: title } : undefined)
  }
}
