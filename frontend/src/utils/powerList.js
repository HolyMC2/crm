import { normalizeCombo } from '@/vendor/muelle-shell/contracts'

// The power worklist's pure parts, shared by Compras, Gastos and Garantías
// (Cobranza carries its own copy in useCobranza.js): the URL as the list's
// state, the list keys, focus and range selection, and the bulk run that
// reports one result per row. The pages and the tests share them.

/** The shared list keys (keyboard.ts KEYMAP «list» rows) as page actions. */
export const LIST_KEYS = Object.freeze({
  j: 'next',
  arrowdown: 'next',
  k: 'prev',
  arrowup: 'prev',
  enter: 'open',
  x: 'toggle',
  'shift+x': 'range',
  'mod+a': 'all',
  '/': 'search',
  escape: 'escape',
})

/**
 * The KEYMAP list ids a power list answers with its own listener, for the
 * Alt+H sheet: j/k and Enter, and x · Shift+X · Ctrl+A only while it has a
 * bulk action. Never «Abrir al lado» (Ctrl+Enter, no pane beside the list);
 * the search («/» and Ctrl+Shift+K) is answered by the shell, see
 * powerListPageKeys.
 */
export function powerListAnswers(selectable = true) {
  return [
    'row.next',
    'row.prev',
    'row.open',
    ...(selectable ? ['select.toggle', 'select.range', 'select.page'] : []),
  ]
}

/**
 * registerPageKeys options of a power list: the shell answers its search
 * (also Ctrl+Shift+K while typing) and lists exactly what the list answers.
 */
export function powerListPageKeys({
  focusSearch,
  selectable = () => true,
  enabled = () => true,
  shortcuts = () => [],
}) {
  return {
    keys: { search: () => focusSearch() },
    answers: () => powerListAnswers(selectable()),
    enabled,
    extra: shortcuts,
  }
}

/** The list keys plus a module's own verbs (`{ $: 'pay', r: 'register' }`). */
export function listKeys(verbs = {}) {
  return Object.freeze({ ...LIST_KEYS, ...verbs })
}

/** A key event as the page's action, or null (the shared normalized combos). */
export function keyAction(event, map, { apple = false } = {}) {
  if (!event || event.isComposing) return null
  return map[normalizeCombo(event, apple)] || null
}

/** A string query value, or '' (arrays and repeated params are ignored). */
export function textParam(value) {
  return typeof value === 'string' ? value : ''
}

/** A query for `patch` over the current one; empty values leave the URL. */
export function patchQuery(query = {}, patch = {}) {
  const next = { ...query, ...patch }
  for (const key of Object.keys(next))
    if (next[key] === '' || next[key] === null || next[key] === undefined)
      delete next[key]
  return next
}

/** `/compras?segment=…` for a query (a record keeps it to go back to the same place). */
export function pathWithQuery(path, query = {}) {
  const parts = Object.entries(patchQuery(query))
    .filter(([, value]) => typeof value === 'string')
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
  return parts.length ? `${path}?${parts.join('&')}` : path
}

/** j / k: the key `delta` rows away from `key`, clamped; no focus yet: the first. */
export function moveFocus(keys, key, delta) {
  if (!keys.length) return ''
  const index = keys.indexOf(key)
  if (index < 0) return keys[0]
  return keys[Math.min(Math.max(index + delta, 0), keys.length - 1)]
}

/** Shift+X: every key from the anchor to the focus (either direction). */
export function rangeKeys(keys, anchor, focus) {
  const a = keys.indexOf(anchor)
  const b = keys.indexOf(focus)
  if (b < 0) return []
  if (a < 0) return [focus]
  return keys.slice(Math.min(a, b), Math.max(a, b) + 1)
}

/** A value inside a CSS attribute selector (`[data-row-key="…"]`). */
export function cssValue(value) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value)
  return String(value).replace(/["\\]/g, '\\$&')
}

/** An element id for a row key (aria-activedescendant needs a plain id). */
export function domId(prefix, key) {
  return `${prefix}-row-${Array.from(String(key))
    .map((c) => c.charCodeAt(0).toString(36))
    .join('')}`
}

/** Scroll memory of one list: `{ top, count }`, or null. */
export function readMemory(key) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null')
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}
export function writeMemory(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* convenience only */
  }
}

/**
 * The page size of a load: the next page (`more`), the rows already shown
 * (`quiet` live refresh), or as many as were loaded before a visit
 * (`remembered`), never past the server's limit.
 */
export function loadLength({ more, quiet, shown, remembered, page, max }) {
  if (more) return page
  return Math.min(
    Math.max(page, quiet ? shown : 0, Number(remembered) || 0),
    max,
  )
}

/**
 * A bulk action, one row after another: `run(item)` resolves to
 * `{ status: 'done' | 'already', detail?, result? }` or throws a refusal,
 * which becomes that row's `blocked` result with its sentence. A row whose
 * outcome is unknown (no answer) is `unknown`: retrying it reuses its request
 * id, so it never acts twice. `onProgress(results)` sees every step.
 */
export async function runBulk(
  items,
  run,
  {
    describe = (e) => e?.message || '',
    unknown = () => false,
    onProgress,
  } = {},
) {
  const results = []
  for (const item of items) {
    let entry
    try {
      const outcome = (await run(item)) || {}
      entry = { item, status: outcome.status || 'done', ...outcome }
    } catch (error) {
      entry = {
        item,
        status: unknown(error) ? 'unknown' : 'blocked',
        detail: describe(error),
        error,
      }
    }
    results.push(entry)
    onProgress?.([...results])
  }
  return results
}

/** «3 done · 1 already · 2 to resolve» counts of a bulk run. */
export function bulkCounts(results = []) {
  const counts = { done: 0, already: 0, blocked: 0, unknown: 0 }
  for (const entry of results)
    counts[entry.status] = (counts[entry.status] || 0) + 1
  return counts
}

/** The Alt+H rows for a module's verbs, only those this worker may use. */
export function verbShortcuts(prefix, verbs) {
  return verbs
    .filter((verb) => verb.allowed !== false)
    .map((verb) => ({
      id: `${prefix}.${verb.action}`,
      keys: verb.keys,
      description: verb.description,
    }))
}

/** ISO date `days` after an ISO date (site dates, no time zone shift). */
export function addDays(day, days) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Whole days from ISO date `from` to ISO date `to` (negative when earlier). */
export function daysBetween(from, to) {
  if (!from || !to) return null
  const a = Date.parse(`${String(from).slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${String(to).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}
