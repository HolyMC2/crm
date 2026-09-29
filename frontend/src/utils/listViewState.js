// What a list keeps while the worker opens a record and comes back: filters,
// search, sort, grouping, how many pages were loaded, the scroll position and
// whether the view had unsaved changes. Per tab (sessionStorage), per user and
// per doctype + view, so another view or another list never inherits it.

export const LIST_STATE_MAX_AGE_MS = 12 * 60 * 60 * 1000

export function listStateKey(user, doctype, viewName, viewType) {
  return [
    'crm_list_state',
    user || 'guest',
    doctype || '',
    viewName || '',
    viewType || 'list',
  ].join(':')
}

function plain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function count(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
}

/** A serialisable snapshot of the list params plus the page's own state. */
export function snapshotListState(
  params = {},
  { scrollTop = 0, viewUpdated = false, now = Date.now() } = {},
) {
  return {
    filters: plain(params.filters || {}),
    or_filters: plain(params.or_filters || {}),
    order_by: params.order_by || '',
    group_by_field: params.view?.group_by_field || '',
    page_length: count(params.page_length),
    page_length_count: count(params.page_length_count),
    scrollTop: Math.max(0, Math.round(Number(scrollTop) || 0)),
    viewUpdated: !!viewUpdated,
    savedAt: now,
  }
}

export function writeListState(storage, key, state) {
  try {
    storage?.setItem(key, JSON.stringify(state))
    return true
  } catch {
    // a full or blocked session store must not break navigation
    return false
  }
}

/** The stored state, or null when missing, unreadable or stale. */
export function readListState(
  storage,
  key,
  { now = Date.now(), maxAgeMs = LIST_STATE_MAX_AGE_MS } = {},
) {
  let raw
  try {
    raw = storage?.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null
  let state
  try {
    state = JSON.parse(raw)
  } catch {
    return null
  }
  if (!state || typeof state !== 'object') return null
  if (!Number.isFinite(state.savedAt) || now - state.savedAt > maxAgeMs)
    return null
  return state
}

export function clearListState(storage, key) {
  try {
    storage?.removeItem(key)
  } catch {
    /* nothing to clear */
  }
}

/** The list params with a stored state laid over them. */
export function restoreListParams(params, state) {
  if (!state) return params
  const next = { ...params }
  if (state.filters && typeof state.filters === 'object')
    next.filters = plain(state.filters)
  if (state.or_filters && Object.keys(state.or_filters).length)
    next.or_filters = plain(state.or_filters)
  if (state.order_by) next.order_by = state.order_by
  if (state.group_by_field && next.view)
    next.view = { ...next.view, group_by_field: state.group_by_field }
  if (count(state.page_length)) next.page_length = count(state.page_length)
  if (count(state.page_length_count))
    next.page_length_count = count(state.page_length_count)
  return next
}
