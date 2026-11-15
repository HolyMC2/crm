// A record hands a new project to Proyectos (Shell F14c): «Crear proyecto para
// esta orden» in Taller opens /crm/proyectos?nuevo=1 with the record it comes
// from and the way back. The project sheet opens with the record's name, and
// once the project exists its plan opens the first pendiente on that record.
// Pure: the pages read and forward these keys.
import { RETURN_PREFIXES, readReturn } from '@/vendor/muelle-shell/contracts'

const KEYS = Object.freeze(['ref_type', 'ref_name', 'ref_label'])
/** One line of at most 140 characters, no control characters. */
function plain(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 140 &&
    ![...value].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)
  )
}

function one(query, key) {
  const value = query?.[key]
  return plain(value) ? value : ''
}

/** The record a project is made from, or null when the URL names none (or junk). */
export function handoffFrom(query = {}) {
  const reference_type = one(query, 'ref_type')
  const reference_name = one(query, 'ref_name')
  if (!reference_type || !reference_name) return null
  return {
    reference_type,
    reference_name,
    reference_label: one(query, 'ref_label') || reference_name,
  }
}

/** The keys that carry the record and the way back on to the next screen. */
export function handoffQuery(query = {}) {
  const out = {}
  for (const key of [...KEYS, 'return_to', 'return_label']) {
    if (typeof query[key] === 'string' && query[key]) out[key] = query[key]
  }
  return out
}

/** The query without the one-shot «open the first pendiente» keys (a reload must not reopen it). */
export function withoutHandoff(query = {}) {
  const out = { ...query }
  for (const key of ['nuevo', 'nuevo_pendiente', ...KEYS]) delete out[key]
  return out
}

/**
 * Where «back» goes when another screen opened this one: a shell page as a route
 * location (`route`), another Muelle app (Taller) as a plain link (`href`), each
 * with its label. Null without a safe `return_to`.
 */
export function returnFrom(query = {}) {
  const search = new URLSearchParams()
  for (const key of ['return_to', 'return_label']) {
    if (typeof query[key] === 'string') search.set(key, query[key])
  }
  const target = readReturn(search, {
    allowedPrefixes: RETURN_PREFIXES,
    acceptLegacy: false,
  })
  if (!target) return null
  if (target.to.startsWith('/crm/'))
    return { route: target.to.slice(4), label: target.label }
  return { href: target.to, label: target.label }
}
