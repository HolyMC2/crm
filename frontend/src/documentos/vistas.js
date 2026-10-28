// «Vistas» of a document list (pure, unit-tested): a saved view is the list's
// URL query (listState writeListQuery) under a name, so opening one is a
// router.replace and the way back from a record keeps it like any filter.

import { filterOptions } from '@/documentos/listState'

/** The query keys a view keeps, in a stable order, without empties. */
export function normalQuery(query = {}) {
  const out = {}
  for (const key of Object.keys(query || {}).sort()) {
    const value = query[key]
    if (typeof value === 'string' && value) out[key] = value
  }
  return out
}

export function sameQuery(a, b) {
  return JSON.stringify(normalQuery(a)) === JSON.stringify(normalQuery(b))
}

/** The saved view the list shows right now, if any. */
export function activeView(views = [], query = {}) {
  return (views || []).find((view) => sameQuery(view.query, query)) || null
}

/** One line on what a view shows: «Vencidas · Cliente: Acme · “tornillo”». */
export function describeView(query = {}, profile = null) {
  const q = normalQuery(query)
  const parts = []
  if ('estado' in q) {
    const chip = (profile?.chips || []).find((c) => c.value === q.estado)
    parts.push(chip?.label || q.estado)
  }
  for (const field of profile?.filterFields || []) {
    const value = q[`f_${field.fieldname}`]
    if (!value) continue
    const option =
      field.kind === 'link'
        ? null
        : filterOptions(field).find((o) => o.value === value)
    parts.push(`${field.label}: ${option?.label || value}`)
  }
  if (q.de) parts.push(q.de_label || 'Relacionados con un documento')
  if (q.q) parts.push(`“${q.q}”`)
  if (q.orden) {
    const sort = (profile?.sorts || []).find((s) => s.value === q.orden)
    parts.push(sort?.label || 'Otro orden')
  }
  return parts.join(' · ')
}

/** A name to offer for the list as it is: what it shows, short. */
export function suggestName(query = {}, profile = null) {
  return describeView(query, profile).slice(0, 60)
}
