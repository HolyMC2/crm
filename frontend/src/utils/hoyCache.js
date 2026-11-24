import { saveWithRoom } from '@/utils/listCache'

// Hoy's last answer for this site, user and roles scope. A return visit paints it
// at once while the day's read runs, and the fresh answer replaces it. Keyed and
// swept like the shell boot copy (composables/muelleShell.js, stores/session.js).
export const HOY_CACHE_PREFIX = 'muelle:hoy:'
// Bump when the answer's shape changes, so an old copy is never painted.
const VERSION = 'v1:'
// Hoy is about today: a copy from an earlier day is not worth a flash.
export const HOY_CACHE_MAX_AGE_MS = 12 * 3600 * 1000
// Today's money moves with every ticket: from an older copy the sales cards wait
// for the read (a skeleton) instead of showing an earlier total as today's.
export const HOY_MONEY_FRESH_MS = 2 * 60 * 1000
const MONEY_SECTIONS = ['ventas', 'credito']

function keyOf(scope) {
  return HOY_CACHE_PREFIX + VERSION + scope
}

/** A money section from an older copy: on, without its figures. */
function held(section) {
  return section?.available
    ? { available: true, held: true, label: section.label }
    : section
}

/** The answer saved for this scope, or null when there is none worth showing. */
export function readCachedHoy(scope, now = Date.now()) {
  try {
    const saved = JSON.parse(localStorage.getItem(keyOf(scope)))
    if (
      saved?.answer &&
      typeof saved.at === 'number' &&
      now - saved.at < HOY_CACHE_MAX_AGE_MS
    ) {
      if (now - saved.at < HOY_MONEY_FRESH_MS) return saved.answer
      const answer = { ...saved.answer }
      for (const name of MONEY_SECTIONS)
        if (name in answer) answer[name] = held(answer[name])
      return answer
    }
  } catch {
    // Unreadable or private mode: wait for the read.
  }
  return null
}

/**
 * Saves the answer; this user's copies under older roles scopes are dead and go.
 * A full storage makes room from the saved lists; when the answer still does not
 * fit, the older copy goes too, so a later visit never paints it.
 */
export function writeCachedHoy(scope, answer) {
  try {
    const mine = keyOf(scope.slice(0, scope.lastIndexOf(':') + 1))
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const stored = localStorage.key(i)
      if (stored?.startsWith(mine) && stored !== keyOf(scope))
        localStorage.removeItem(stored)
    }
    const value = JSON.stringify({ at: Date.now(), answer })
    if (!saveWithRoom(keyOf(scope), value))
      localStorage.removeItem(keyOf(scope))
  } catch {
    // Storage unavailable: the next visit waits for the read.
  }
}
