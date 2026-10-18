// List state lives in the URL (chip, search, sort, «Filtros», a connection scope),
// so the way back from a record keeps it; the scroll position lives in session
// memory under the list's full path (purged on logout with the other muelle: keys).

const SCROLL_PREFIX = 'muelle:documentos:scroll:'

function text(value) {
  return typeof value === 'string' ? value : ''
}

/** Query → state. `chip` is null when the URL names none (the profile's default applies). */
export function readListQuery(query = {}) {
  const filters = {}
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('f_') && typeof value === 'string' && value)
      filters[key.slice(2)] = value
  }
  let scope = null
  if (typeof query.de === 'string' && query.de) {
    try {
      const parsed = JSON.parse(query.de)
      if (Array.isArray(parsed)) scope = parsed
    } catch {
      scope = null
    }
  }
  return {
    chip: typeof query.estado === 'string' ? query.estado : null,
    search: text(query.q),
    sort: text(query.orden),
    filters,
    scope,
    scopeLabel: text(query.de_label),
  }
}

/** State → query; the profile's default chip stays out of the URL. */
export function writeListQuery(state, { defaultChip = '' } = {}) {
  const query = {}
  if (
    state.chip !== null &&
    state.chip !== undefined &&
    state.chip !== defaultChip
  )
    query.estado = state.chip
  if (state.search?.trim()) query.q = state.search.trim()
  if (state.sort) query.orden = state.sort
  for (const [key, value] of Object.entries(state.filters || {}))
    if (value) query[`f_${key}`] = value
  if (state.scope?.length) {
    query.de = JSON.stringify(state.scope)
    if (state.scopeLabel) query.de_label = state.scopeLabel
  }
  return query
}

/** The server filters: base list filters, the chip's, «Filtros» and the connection scope. */
export function listFilters(profile, state) {
  const out = [...(profile.filters || [])]
  const chipValue = state.chip ?? profile.defaultChip ?? ''
  const chip = (profile.chips || []).find((c) => c.value === chipValue)
  if (chip?.filters) out.push(...chip.filters)
  for (const [key, value] of Object.entries(state.filters || {}))
    out.push([key, '=', value])
  if (state.scope?.length) out.push(...state.scope)
  return out
}

/** Chip counts: each chip's filters plus everything but the chip. */
export function chipCountFilters(profile, state) {
  const rest = listFilters(profile, { ...state, chip: '__none__' })
  const out = {}
  for (const chip of profile.chips || [])
    out[chip.value || 'todos'] = [...rest, ...(chip.filters || [])]
  return out
}

export function rememberScroll(path, top, count) {
  try {
    sessionStorage.setItem(SCROLL_PREFIX + path, JSON.stringify({ top, count }))
  } catch {
    /* private mode: no memory */
  }
}

export function recallScroll(path) {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(SCROLL_PREFIX + path) || 'null',
    )
    return saved && Number.isFinite(saved.top) ? saved : null
  } catch {
    return null
  }
}
