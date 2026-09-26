// Saved views for the deals list, stored as ordinary «CRM View Settings» rows.
//
// They are written with the same server API the upstream ViewControls uses
// (crm_view_settings.create / update / pin / public / set_as_default / delete), so
// ownership, the Sales Manager gate on publishing and the shared pin/default
// behaviour are upstream's, not a second implementation.
//
// Two rules keep a row written here safe to open in the upstream list, which
// feeds a view straight to frappe.get_list:
//   1. `filters`, `order_by`, `columns` and `rows` only ever name real CRM Deal
//      fields — group_by_field too, so a repair-status grouping is left out of it.
//   2. Everything this list adds and the doctype has no column for (follow-up
//      queue, search text, list/board/funnel mode, group-by, visible columns)
//      rides as one JSON object in `kanban_fields`, which a list-type view never
//      reads.
// `route_name` marks the row as this list's, which is how the picker tells its
// own views from the ones made in the classic list.
import { FOLLOW_UP_QUEUES } from './dealFollowUp'
import { isGroupBy } from './dealGroups'

export const DEAL_VIEW_DOCTYPE = 'CRM Deal'
// The router name of this list (see router.js: path '/deals').
export const DEAL_VIEW_ROUTE = 'Deals List'

// Multi-select filters, as a Frappe filter dict. Empty selections are left out
// rather than stored as an empty `in`, which would match nothing.
export function viewFilters(context = {}) {
  const filters = {}
  if (context.pipeline) filters.pipeline = context.pipeline
  if (context.status?.length) filters.status = ['in', [...context.status]]
  if (context.source?.length) filters.source = ['in', [...context.source]]
  if (context.owner?.length) filters.deal_owner = ['in', [...context.owner]]
  return filters
}

export function filtersToContext(raw) {
  const filters = parseJson(raw, {})
  return {
    ...(typeof filters.pipeline === 'string' && filters.pipeline
      ? { pipeline: filters.pipeline }
      : {}),
    status: valuesOf(filters.status),
    source: valuesOf(filters.source),
    owner: valuesOf(filters.deal_owner),
  }
}

// Only a real CRM Deal column may reach `group_by_field`: upstream appends it to
// the fields it selects. The doco blob keeps the grouping either way.
function storedGroupByField(groupBy) {
  return ['status', 'deal_owner'].includes(groupBy) ? groupBy : ''
}

export function viewPayload(context = {}, meta = {}) {
  const payload = {
    label: String(meta.label || '').trim(),
    type: 'list',
    icon: meta.icon || '',
    doctype: DEAL_VIEW_DOCTYPE,
    route_name: DEAL_VIEW_ROUTE,
    filters: viewFilters(context),
    order_by: `${context.sort?.field || 'modified'} ${context.sort?.dir === 'asc' ? 'asc' : 'desc'}`,
    group_by_field: storedGroupByField(context.groupBy),
    // Left empty so the classic list fills in its own defaults for this row.
    columns: [],
    rows: [],
    kanban_fields: JSON.stringify({
      doco_deal_list: 1,
      followUp: context.followUp || 'all',
      search: context.search || '',
      view: context.view || 'list',
      groupBy: isGroupBy(context.groupBy) ? context.groupBy : 'none',
      columns: (context.columns || []).filter((c) => typeof c === 'string'),
    }),
  }
  if (meta.name) payload.name = meta.name
  return payload
}

// A view this list wrote. Views made in the classic list carry another route and
// none of the context below, so the picker leaves them where they were made.
export function isDealListView(row) {
  return (
    Boolean(row) && row.route_name === DEAL_VIEW_ROUTE && Boolean(docoBlob(row))
  )
}

export function dealListViews(rows) {
  return (rows || []).filter(isDealListView)
}

// The list context a saved view restores. Unknown or missing pieces fall back to
// this list's defaults; dealListState() does the final validation.
export function viewContext(row) {
  const blob = docoBlob(row) || {}
  const [field, dir] = String(row?.order_by || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return {
    ...filtersToContext(row?.filters),
    followUp: FOLLOW_UP_QUEUES.some((q) => q.key === blob.followUp)
      ? blob.followUp
      : 'all',
    search: typeof blob.search === 'string' ? blob.search : '',
    view: ['list', 'board', 'funnel'].includes(blob.view) ? blob.view : 'list',
    groupBy: isGroupBy(blob.groupBy) ? blob.groupBy : 'none',
    sort: { field: field || 'modified', dir: dir === 'asc' ? 'asc' : 'desc' },
    columns: Array.isArray(blob.columns)
      ? blob.columns.filter((c) => typeof c === 'string')
      : [],
  }
}

function docoBlob(row) {
  const blob = parseJson(row?.kanban_fields, null)
  return blob && typeof blob === 'object' && blob.doco_deal_list ? blob : null
}

function parseJson(raw, fallback) {
  if (raw && typeof raw === 'object') return raw
  try {
    const parsed = JSON.parse(raw || 'null')
    return parsed == null ? fallback : parsed
  } catch {
    return fallback
  }
}

// Stored as ['in', [...]]; a bare value (what the classic list writes when a user
// clicks a cell) is one selection.
function valuesOf(filter) {
  if (Array.isArray(filter)) {
    const values = Array.isArray(filter[1]) ? filter[1] : [filter[1]]
    return values.filter((v) => typeof v === 'string')
  }
  return typeof filter === 'string' && filter ? [filter] : []
}
