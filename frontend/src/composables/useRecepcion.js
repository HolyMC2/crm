// Recepción in the shell: the draft receipt of a purchase order, counted
// against the order. The same server Escáner uses (scanner_kit documents: the
// code resolves there, a rescan replays by uuid), so nothing of the catalog is
// downloaded and the order page opens it as a route, not a new app.
import { matchTokens } from '@/vendor/muelle-shell/contracts/search'
import { comprasApi, requestId } from '@/composables/useCompras'

const NS = 'scanner_kit.api.documents'
const CTX = 'Recepción'
function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

/** One call on the receipt; every answer is the whole receipt (or a scan outcome). */
export function recepcionApi(method, args = {}) {
  return comprasApi(`${NS}.${method}`, { kind: 'PR', ...args })
}

export const loadReceipt = (name) => recepcionApi('doc_detail', { name })
export const setLineQty = (name, row, qty) =>
  recepcionApi('set_line_qty', { name, row, qty })
export const confirmReceipt = (name) => recepcionApi('submit_doc', { name })
/** A scan or a typed code; the uuid makes a lost answer safe to send again. */
export const scanCode = (name, code, { row = null, uuid = requestId() } = {}) =>
  recepcionApi('scan_add_line', {
    name,
    code,
    qty: 1,
    uuid,
    ...(row ? { row } : {}),
  })

const num = (value) => Number(value) || 0

/** What is still owed on the line before this receipt: ordered less earlier receipts. */
export function owed(line) {
  if (line.ordered_qty === undefined || line.ordered_qty === null) return null
  return Math.max(num(line.ordered_qty) - num(line.already_received), 0)
}

/** The line against its order row: missing, complete, over, or not ordered. */
export function lineState(line) {
  const want = owed(line)
  const got = num(line.qty)
  if (want === null)
    return {
      key: 'extra',
      tone: 'neutral',
      text: tr('Not on the order', null, CTX),
    }
  if (got < want)
    return {
      key: 'missing',
      tone: 'neutral',
      text: tr('{0} missing', [fmt(want - got)], CTX),
    }
  if (got === want)
    return { key: 'complete', tone: 'success', text: tr('Complete', null, CTX) }
  return {
    key: 'over',
    tone: 'warning',
    text: tr('{0} more than ordered', [fmt(got - want)], CTX),
  }
}

function fmt(value) {
  return Number.isInteger(value) ? String(value) : String(+value.toFixed(3))
}

/** The page's tally: `counted` goes into stock; `toward` of `expected` fills the order. */
export function tally(lines = []) {
  let counted = 0
  let toward = 0
  let expected = 0
  let missing = 0
  let over = 0
  for (const line of lines) {
    const got = num(line.qty)
    counted += got
    const want = owed(line)
    if (want === null) continue
    expected += want
    toward += Math.min(got, want)
    if (got < want) missing += want - got
    if (got > want) over += got - want
  }
  // The hero counts toward the order: an extra piece is no missing one found.
  if (!expected) toward = counted
  const ratio = expected > 0 ? toward / expected : counted ? 1 : 0
  return {
    counted,
    toward,
    expected,
    missing,
    over,
    ratio,
    complete: expected > 0 && !missing,
  }
}

/** Lines first by what is left to count, then as on the order. */
export function orderedLines(lines = []) {
  const rank = { missing: 0, extra: 1, over: 2, complete: 3 }
  return lines
    .map((line, index) => ({ line, index, state: lineState(line) }))
    .sort(
      (a, b) =>
        (rank[a.state.key] ?? 9) - (rank[b.state.key] ?? 9) ||
        a.index - b.index,
    )
}

/** The field filters the lines as the worker types (name or code, any order). */
export function filterLines(rows, query) {
  const text = String(query || '').trim()
  if (!text) return rows
  return rows.filter(({ line }) =>
    matchTokens(
      text,
      String(line.item_name || ''),
      String(line.item_code || ''),
    ),
  )
}

/**
 * What a scan answer means for the worker. `applied` landed on `row`; the rest
 * changed nothing and say why; `escaner` marks the cases Escáner resolves
 * (serials, lotes, units), so the page offers to open it.
 */
export function scanOutcome(result, code) {
  if (!result) return { kind: 'error' }
  if ('unknown_code' in result)
    return {
      kind: 'unknown',
      text: tr(
        'No product has the code «{0}».',
        [result.unknown_code || code],
        CTX,
      ),
    }
  if (result.ambiguous)
    return { kind: 'ambiguous', rows: result.rows || [], code }
  if (result.not_ordered)
    return {
      kind: 'refused',
      text: tr(
        '{0} is not on this order. Nothing was added.',
        [result.not_ordered],
        CTX,
      ),
    }
  if (result.unit_mismatch)
    return {
      kind: 'refused',
      escaner: true,
      text: tr(
        'That label counts in {0} and the order in {1}. Open it in Escáner to count it.',
        [result.code_uom || '', result.row_uom || ''],
        CTX,
      ),
    }
  if (result.serial_conflict)
    return {
      kind: 'refused',
      escaner: true,
      text: tr(
        'Serial {0} is already on another line.',
        [result.serial_conflict],
        CTX,
      ),
    }
  if (result.needs_review || result.review_only)
    return {
      kind: 'refused',
      escaner: true,
      text: tr(
        'This label needs a review in Escáner before it counts.',
        null,
        CTX,
      ),
    }
  return {
    kind: 'applied',
    row: result.touched_row || null,
    replay: Boolean(result.replay),
    counted: result.counted_from || null,
  }
}
