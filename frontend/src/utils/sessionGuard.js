import { ref } from 'vue'
import { safeIntendedRoute } from '@/utils/shellRoutes'

// A refusal is not always a permission answer. After a deploy or a restart the
// sid can expire while the browser still holds the user_id cookie: the router
// lets the worker in, and the first call (crm.api.shell.boot) answers 403
// PermissionError «not whitelisted» as Guest. Asking for access then is a dead
// end; signing in again is the way on.

/** True once the server said this browser is Guest after a refusal. */
export const sessionEnded = ref(false)
let asking = null

/**
 * The refusal kind from stable signals only (exception type, HTTP status):
 * 'permission', 'session' or null. A permission refusal may still hide an
 * ended session; sessionLost() asks the server.
 */
export function refusalKind(error) {
  const exc = String(error?.exc_type || '')
  const status = Number(error?.status || error?.httpStatus || 0)
  if (exc === 'PermissionError' || status === 403) return 'permission'
  if (
    ['AuthenticationError', 'SessionExpired', 'CSRFTokenError'].includes(exc) ||
    status === 401
  )
    return 'session'
  return null
}

/** How long the shell waits for that answer before it keeps the permission path. */
export const PROBE_TIMEOUT_MS = 5000

/**
 * Who the server says this browser is: the user, 'Guest', or null when it
 * could not answer in time (offline, a restart, a stalled connection). A GET
 * needs no CSRF token, and get_logged_user refuses Guest (403), so any
 * refusal here means Guest.
 */
export async function askLoggedUser(
  fetchImpl = globalThis.fetch,
  timeoutMs = PROBE_TIMEOUT_MS,
) {
  const controller = new AbortController()
  let timer
  const late = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(null)
    }, timeoutMs)
  })
  const probe = (async () => {
    try {
      const response = await fetchImpl(
        '/api/method/frappe.auth.get_logged_user',
        {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        },
      )
      if ([401, 403].includes(response.status)) return 'Guest'
      if (!response.ok) return null
      const body = await response.json()
      return typeof body?.message === 'string' && body.message
        ? body.message
        : null
    } catch {
      return null
    }
  })()
  try {
    return await Promise.race([probe, late])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * After a refusal: did the session end? Asks the server once per refusal
 * burst; a server that cannot answer keeps the permission path.
 */
export async function sessionLost(error, fetchImpl) {
  if (sessionEnded.value) return true
  if (!refusalKind(error)) return false
  asking ||= askLoggedUser(fetchImpl).finally(() => {
    asking = null
  })
  const user = await asking
  if (user === 'Guest') sessionEnded.value = true
  return sessionEnded.value
}

/** A shell boot succeeded: the session is live again (signed in from another tab). */
export function sessionBack() {
  sessionEnded.value = false
}

/** /login, back to the same /crm route (a router fullPath) after signing in. */
export function signInHref(path) {
  return (
    '/login?redirect-to=' +
    encodeURIComponent(safeIntendedRoute('/crm' + (path || '/')))
  )
}

/** Tests: forget the answer. */
export function resetSessionGuardForTests() {
  sessionEnded.value = false
  asking = null
}
