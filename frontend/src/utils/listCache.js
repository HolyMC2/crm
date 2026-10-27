import { currentScope } from '@/composables/muelleShell'

// A shell list's last answer per site, user and roles scope, module and
// filters. Opening the list paints it at once while the read runs, and the
// fresh answer replaces it, like Hoy (utils/hoyCache.js). Lists only steer
// what the worker sees first: every action rechecks on the server.
// Swept on logout (stores/session.js, prefix «muelle:list:»).
export const LIST_CACHE_PREFIX = 'muelle:list:'
// Bump when the stored shape changes, so an old copy is never painted.
const VERSION = 'v1:'
const INDEX_KEY = LIST_CACHE_PREFIX + 'index'
// Older than this, a copy would mislead more than it helps.
export const LIST_CACHE_MAX_AGE_MS = 24 * 3600 * 1000
// The newest lists kept; the oldest go first.
export const LIST_CACHE_MAX_ENTRIES = 40
// A bigger answer is not worth the storage (the browser allows ~5 MB in all).
export const LIST_CACHE_MAX_CHARS = 200_000

function keyOf(scope, list) {
  return LIST_CACHE_PREFIX + VERSION + scope + '|' + list
}

function readIndex() {
  try {
    const index = JSON.parse(localStorage.getItem(INDEX_KEY))
    return index && typeof index === 'object' ? index : {}
  } catch {
    return {}
  }
}

/**
 * The list's saved answer, or null when there is none worth painting (or
 * none younger than `maxAge`).
 */
export function readCachedList(
  list,
  scope = currentScope(),
  maxAge = LIST_CACHE_MAX_AGE_MS,
) {
  if (!list) return null
  try {
    const saved = JSON.parse(localStorage.getItem(keyOf(scope, list)))
    if (
      saved?.answer &&
      typeof saved.at === 'number' &&
      Date.now() - saved.at < Math.min(maxAge, LIST_CACHE_MAX_AGE_MS)
    )
      return saved.answer
  } catch {
    // Unreadable or private mode: wait for the read.
  }
  return null
}

/**
 * Saves the answer. This user's copies under an older roles scope are dead
 * and go, and past the cap the least recently saved lists go.
 */
export function writeCachedList(list, answer, scope = currentScope()) {
  if (!list || !answer) return
  const key = keyOf(scope, list)
  try {
    const value = JSON.stringify({ at: Date.now(), answer })
    const index = readIndex()
    if (value.length > LIST_CACHE_MAX_CHARS) {
      // Never paint a copy older than the list the worker just saw.
      localStorage.removeItem(key)
      delete index[key]
      localStorage.setItem(INDEX_KEY, JSON.stringify(index))
      return
    }
    const mine =
      LIST_CACHE_PREFIX + VERSION + scope.slice(0, scope.lastIndexOf(':') + 1)
    for (const stored of Object.keys(index))
      if (stored.startsWith(mine) && !stored.startsWith(keyOf(scope, ''))) {
        localStorage.removeItem(stored)
        delete index[stored]
      }
    index[key] = Date.now()
    const oldest = Object.keys(index).sort((a, b) => index[a] - index[b])
    for (const stored of oldest.slice(
      0,
      Math.max(0, oldest.length - LIST_CACHE_MAX_ENTRIES),
    )) {
      localStorage.removeItem(stored)
      delete index[stored]
    }
    localStorage.setItem(key, value)
    localStorage.setItem(INDEX_KEY, JSON.stringify(index))
  } catch {
    // Full storage: the next visit waits for the read.
  }
}

/** Forgets the list's saved answer (the server refused it). */
export function dropCachedList(list, scope = currentScope()) {
  if (!list) return
  const key = keyOf(scope, list)
  try {
    localStorage.removeItem(key)
    const index = readIndex()
    delete index[key]
    localStorage.setItem(INDEX_KEY, JSON.stringify(index))
  } catch {
    // Nothing to drop.
  }
}

/** A list key from its module and filters (order and types kept). */
export function listKey(module, filters) {
  return module + ':' + JSON.stringify(filters ?? null)
}

/**
 * One page's list cache. `filters()` names the list on screen, or null when
 * it is not kept (a search). A load takes `key()` before it reads, `paint`s
 * the saved copy while it waits, and `save`s the fresh answer under that key.
 */
export function createListCache(module, filters) {
  // The list whose saved copy is on screen, until its fresh answer lands.
  let painted = ''
  function key() {
    const current = filters()
    return current == null ? null : listKey(module, current)
  }
  return {
    key,
    /**
     * Shows the saved copy of the list on screen through `show(answer)`.
     * True while a copy of this list is on screen (painted now or before).
     */
    paint(show) {
      const current = key()
      if (!current) return false
      if (current === painted) return true
      const answer = readCachedList(current)
      if (!answer) return false
      show(answer)
      painted = current
      return true
    },
    /** True while the screen shows the saved copy of the list on screen. */
    showing() {
      return Boolean(painted) && painted === key()
    },
    /** True when the screen shows a saved copy of another list. */
    stale() {
      return Boolean(painted) && painted !== key()
    },
    /** A fresh answer is on screen; keeps it when its list is kept. */
    save(listAt, answer) {
      painted = ''
      if (listAt) writeCachedList(listAt, answer)
    },
  }
}
