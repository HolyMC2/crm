// A dropped connection (Wi-Fi switch, VPN, ERR_NETWORK_CHANGED) must not
// surface as an uncaught «Failed to fetch» page error with a stale screen.
// Network-class rejections nobody handled become one visible retry state:
// «Retry» (and coming back online) re-runs every view's reload-on-return hook
// (composables/reloadOnReturn listens to window focus). Anything else still
// reaches the browser untouched.

const NETWORK_MESSAGES = [
  /failed to fetch/i,
  /networkerror/i,
  /network request failed/i,
  /load failed/i,
  /err_network/i,
  /importing a module script failed/i,
]

export function isNetworkFailure(reason) {
  if (!reason || reason.name === 'AbortError') return false
  const message = String(reason.message || reason)
  if (Array.isArray(reason.messages) && reason.status) return false // server answered
  return NETWORK_MESSAGES.some((pattern) => pattern.test(message))
}

export function retryViews(target = globalThis.window) {
  target?.dispatchEvent(new Event('focus'))
}

let installed = false
export function installNetworkRecovery({ notify } = {}) {
  if (installed || typeof window === 'undefined') return false
  installed = true
  let shownAt = 0
  window.addEventListener('unhandledrejection', (event) => {
    if (!isNetworkFailure(event.reason)) return
    event.preventDefault()
    const now = Date.now()
    if (now - shownAt < 10000) return // one notice per outage, not per request
    shownAt = now
    notify?.(() => retryViews())
  })
  window.addEventListener('online', () => retryViews())
  return true
}
