// The palette's Desk reach (Shell E7, DE9): every report the worker may run,
// the Desk workspaces, pages and dashboards they see, every list they read
// and every form, tree or list only Desk opens, in one read
// (crm.api.shell.palette_reach). Reportes, Desk and Listas filter it as the
// worker types, as the Desk awesomebar filters its boot lists: a keystroke
// asks the server nothing for them.
import { call } from 'frappe-ui'
import { normalizeSearch, searchTokens } from '@/vendor/muelle-shell/contracts'

// The server keeps its copy five minutes too (crm.api.shell DESK_REACH_TTL).
export const PALETTE_REACH_TTL_MS = 5 * 60 * 1000

let pending = null
let loadedAt = 0

// Each row keeps its words folded once, so a keystroke compares strings and
// never folds a thousand labels again.
const folded = (...values) => normalizeSearch(values.filter(Boolean).join(' '))
// Letters and digits only, one space between words («Shift & Attendance» → «shift attendance»).
const spaced = (value) =>
  normalizeSearch(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * What a row is found by: `words`, everything it may be called, for the
 * shell's rule (every word, anywhere); `names`, each name on its own, for the
 * closer matches (the whole name, its start, its initials).
 */
function named(row, ...values) {
  const names = [...new Set(values.map(spaced).filter(Boolean))]
  return {
    ...row,
    words: folded(...values),
    names,
    starts: ` ${names.join(' ')}`,
    initials: names.map((name) =>
      name
        .split(' ')
        .map((word) => word[0])
        .join(''),
    ),
  }
}

function prepare(reach) {
  return {
    reports: (reach?.reports || []).map((row) => ({
      ...named(row, row.title, row.name),
      about: folded(row.ref_label),
    })),
    workspaces: (reach?.workspaces || []).map((row) =>
      named(row, row.label, row.title, row.name),
    ),
    lists: (reach?.lists || []).map((row) =>
      named(row, row.label, row.doctype),
    ),
    deskTypes: (reach?.desk_types || []).map((row) =>
      named(row, row.label, row.doctype),
    ),
    pages: (reach?.pages || []).map((row) => named(row, row.label, row.title)),
    dashboards: (reach?.dashboards || []).map((row) =>
      named(row, row.label, row.name),
    ),
  }
}

/**
 * The reach, read once and kept PALETTE_REACH_TTL_MS. A failed read answers
 * null (the groups stay empty) and the next search asks again.
 */
export function loadPaletteReach({ now = Date.now() } = {}) {
  if (pending && now - loadedAt < PALETTE_REACH_TTL_MS) return pending
  loadedAt = now
  pending = call('crm.api.shell.palette_reach')
    .then(prepare)
    .catch(() => {
      pending = null
      return null
    })
  return pending
}

/** The rows whose folded `field` holds every word of the query (matchTokens' rule). */
export function reachMatches(rows, text, field) {
  const words = searchTokens(text)
  return rows.filter((row) => words.every((word) => row[field].includes(word)))
}

/**
 * How closely a row answers the query, the closest first; the palette shows a
 * few rows per group, so «employee» must list Employee before the 25 types
 * that only mention it. `near` rows match nothing as typed and stand one slip
 * away from it (REACH_FIT.near).
 */
export const REACH_FIT = Object.freeze({
  exact: 0, // the name is the query
  start: 1, // the name starts with it
  words: 2, // every word starts a word of the name, or the query is its initials
  inside: 3, // every word is somewhere in it (the shell's rule)
  near: 4, // one slip per word: a letter missing, extra, wrong or swapped
})

// A slip is only looked for in a word this long; a shorter one must be there
// as typed. And the query needs one long word to hold on to: short words have
// too many neighbours («maria» is one letter from «marca»).
const NEAR_MIN = 4
const NEAR_ANCHOR = 6

/** Two words at most one slip apart: a letter missing, extra, wrong, or two swapped. */
function oneSlip(a, b) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1
  if (a.length === b.length)
    return (
      a.slice(i + 1) === b.slice(i + 1) ||
      (a[i] === b[i + 1] &&
        a[i + 1] === b[i] &&
        a.slice(i + 2) === b.slice(i + 2))
    )
  const [short, long] = a.length < b.length ? [a, b] : [b, a]
  return short.slice(i) === long.slice(i + 1)
}

/**
 * The typed word is one slip from the start of a word of the row («asistant»
 * → «assistant»). Never a slip in the first letter or the last one typed:
 * the last letter is where a different word begins («maria» is a name, not
 * «marital»), and the first is too much to give («phone» for «iphone»).
 */
function nearWord(typed, row) {
  if (row.words.includes(typed)) return true
  if (typed.length < NEAR_MIN) return false
  const stem = typed.slice(0, -1)
  return row.starts
    .split(' ')
    .some(
      (word) =>
        word[0] === typed[0] &&
        !word.startsWith(stem) &&
        [typed.length - 1, typed.length, typed.length + 1].some((length) =>
          oneSlip(typed, word.slice(0, length)),
        ),
    )
}

function fit(row, query, words) {
  if (row.names.includes(query)) return REACH_FIT.exact
  if (row.names.some((name) => name.startsWith(query))) return REACH_FIT.start
  if (
    words.every((word) => row.starts.includes(` ${word}`)) ||
    (query.length > 1 && row.initials.includes(query))
  )
    return REACH_FIT.words
  if (words.every((word) => row.words.includes(word))) return REACH_FIT.inside
  return null
}

/**
 * The term names the row: it is its name, or four letters or more of its
 * start. Such a row is what the worker asked for, so its group leads the
 * generic actions (utils/shellPalette orderPaletteSections); a shorter start
 * is still someone's name being typed («sol», «ana»).
 */
export function namesIt(fit, text) {
  return (
    fit === REACH_FIT.exact ||
    (fit === REACH_FIT.start && spaced(text).length >= 4)
  )
}

/**
 * The rows that answer the query as `{ row, fit }`, the closest first and, at
 * the same fit, the shortest matching name first (the least left untyped),
 * then the server's order. When none answers, the rows one slip away
 * (`near`), so a typo still finds its list: «boks asistant» → Books
 * Assistant Settings.
 */
export function reachRanked(rows, text) {
  const words = searchTokens(text)
  const query = spaced(text)
  if (!words.length || !query) return []
  // The name the term was found in («ventas» in the Spanish label, not the English name).
  const length = (row) => {
    const hit = row.names.filter((name) =>
      words.every((word) => name.includes(word)),
    )
    return Math.min(...(hit.length ? hit : row.names).map((n) => n.length))
  }
  const ordered = (found) =>
    found
      .map((entry, index) => ({ ...entry, index, length: length(entry.row) }))
      .sort((a, b) => a.fit - b.fit || a.length - b.length || a.index - b.index)
      .map(({ row, fit: rowFit }) => ({ row, fit: rowFit }))
  const found = []
  for (const row of rows) {
    const rowFit = fit(row, query, words)
    if (rowFit !== null) found.push({ row, fit: rowFit })
  }
  if (found.length) return ordered(found)
  if (!words.some((word) => word.length >= NEAR_ANCHOR)) return []
  return ordered(
    rows
      .filter((row) => words.every((word) => nearWord(word, row)))
      .map((row) => ({ row, fit: REACH_FIT.near })),
  )
}

/** Tests: forget the reach so the next search reads it again. */
export function _resetPaletteReach() {
  pending = null
  loadedAt = 0
}
