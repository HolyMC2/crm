// Hoy's last answer for this site, user and roles scope. A return visit paints it
// at once while the day's read runs, and the fresh answer replaces it. Keyed and
// swept like the shell boot copy (composables/muelleShell.js, stores/session.js).
export const HOY_CACHE_PREFIX = 'muelle:hoy:'
// Bump when the answer's shape changes, so an old copy is never painted.
const VERSION = 'v1:'
// Hoy is about today: a copy from an earlier day is not worth a flash.
export const HOY_CACHE_MAX_AGE_MS = 12 * 3600 * 1000

function keyOf(scope) {
  return HOY_CACHE_PREFIX + VERSION + scope
}

/** The answer saved for this scope, or null when there is none worth showing. */
export function readCachedHoy(scope) {
  try {
    const saved = JSON.parse(localStorage.getItem(keyOf(scope)))
    if (
      saved?.answer &&
      typeof saved.at === 'number' &&
      Date.now() - saved.at < HOY_CACHE_MAX_AGE_MS
    )
      return saved.answer
  } catch {
    // Unreadable or private mode: wait for the read.
  }
  return null
}

/** Saves the answer; this user's copies under older roles scopes are dead and go. */
export function writeCachedHoy(scope, answer) {
  try {
    const mine = keyOf(scope.slice(0, scope.lastIndexOf(':') + 1))
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const stored = localStorage.key(i)
      if (stored?.startsWith(mine) && stored !== keyOf(scope))
        localStorage.removeItem(stored)
    }
    localStorage.setItem(
      keyOf(scope),
      JSON.stringify({ at: Date.now(), answer }),
    )
  } catch {
    // Full storage: the next visit waits for the read.
  }
}
