// The palette's Desk reach (Shell E7, DE9): every report the worker may run,
// the Desk workspaces they see and every list they read, in one read
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

function prepare(reach) {
  return {
    reports: (reach?.reports || []).map((row) => ({
      ...row,
      named: folded(row.title, row.name),
      about: folded(row.ref_label),
    })),
    workspaces: (reach?.workspaces || []).map((row) => ({
      ...row,
      words: folded(row.label, row.title, row.name),
    })),
    lists: (reach?.lists || []).map((row) => ({
      ...row,
      words: folded(row.label, row.doctype),
    })),
  }
}

/**
 * The reach, read once and kept PALETTE_REACH_TTL_MS. A failed read answers
 * null (the three groups stay empty) and the next search asks again.
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

/** Tests: forget the reach so the next search reads it again. */
export function _resetPaletteReach() {
  pending = null
  loadedAt = 0
}
