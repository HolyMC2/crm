// Totals strip and pipeline quick filter of the Deals list.
import { stageValue, weightedTotal } from './pipelineMath'

function number(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * `aggregate_deal_metrics().stages` (one entry per status) as the strip's
 * count / value / weighted. `statuses` carries each stage's type so only open
 * stages weigh in, as on the board columns.
 */
export function summarizeDealMetrics(stages = [], statuses = []) {
  const byStatus = {}
  let count = 0
  let value = 0
  let missingFx = 0
  for (const entry of stages || []) {
    byStatus[entry.status || ''] = entry
    count += number(entry.count)
    value += stageValue(entry)
    missingFx += number(entry.missing_exchange_rate_count)
  }
  return {
    count,
    value,
    weighted: weightedTotal(byStatus, statuses),
    missingFx,
    byStatus,
  }
}

/** Stage choices for the chosen pipeline; every visible status without one. */
export function pipelineStageOptions(pipelines, pipelineName, statuses = []) {
  if (pipelineName) {
    const pipeline = (pipelines || []).find((p) => p.name === pipelineName)
    return (pipeline?.stages || [])
      .filter((stage) => !stage.archived)
      .map((stage) => ({
        value: stage.name,
        label: stage.name,
        type: stage.type,
        probability: stage.probability,
      }))
  }
  return (statuses || [])
    .filter((status) => !status.hidden)
    .map((status) => ({
      value: status.name,
      label: status.name,
      type: status.type,
      probability: status.probability,
    }))
}

/** A plain `pipeline = x` filter value, else '' (lists and operators are not). */
export function selectedEquals(filters, fieldname) {
  const value = filters?.[fieldname]
  return typeof value === 'string' ? value : ''
}

/**
 * Filters with `pipeline` set (or cleared). A single-stage filter that the new
 * pipeline does not have is dropped, so the list never lands empty on a stage
 * from another pipeline.
 */
export function withPipelineFilter(filters, pipeline, stageNames) {
  const next = { ...(filters || {}) }
  if (pipeline) next.pipeline = pipeline
  else delete next.pipeline
  const status = next.status
  if (
    pipeline &&
    typeof status === 'string' &&
    Array.isArray(stageNames) &&
    !stageNames.includes(status)
  ) {
    delete next.status
  }
  return next
}

export function withEqualsFilter(filters, fieldname, value) {
  const next = { ...(filters || {}) }
  if (value) next[fieldname] = value
  else delete next[fieldname]
  return next
}

// ── next-step cell ────────────────────────────────────────────────────────────
// `_v_next_step` is the crm provider's compact `{at, task, type, overdue, days}`
// (task = the CRM Task name); `title` is used when the provider sends it. The
// cell (FollowUpCell) speaks the CRM Deal `next_activity_*` field names.

function plainValue(value) {
  // parsed list cells: deal_owner is the user ({name: email}), organization
  // is {label, logo}
  if (value && typeof value === 'object')
    return value.name ?? value.label ?? value.value ?? ''
  return value ?? ''
}

export function nextStepRow(row = {}, value) {
  const v = value && typeof value === 'object' ? value : {}
  return {
    name: row.name,
    deal_name: plainValue(row.deal_name),
    organization: plainValue(row.organization),
    lead_name: plainValue(row.lead_name),
    deal_owner: plainValue(row.deal_owner),
    next_activity_task: v.task || '',
    next_activity_at: v.at || '',
    next_activity_title: v.title || '',
    next_activity_type: v.type || '',
  }
}

/** What readNextActivity returned, in the provider's `_v_next_step` shape. */
export function nextStepValue(activity = {}) {
  if (!activity?.next_activity_task) return null
  return {
    at: activity.next_activity_at || '',
    task: activity.next_activity_task,
    title: activity.next_activity_title || '',
    type: activity.next_activity_type || '',
  }
}

/** Deal 360 when this build has it, else the classic deal page. */
export function dealRowRoute(hasRoute, name, query = {}) {
  return hasRoute('Deal 360')
    ? { name: 'Deal 360', params: { dealId: name }, query }
    : { name: 'Deal', params: { dealId: name }, query }
}

// ── phone filter sheet ────────────────────────────────────────────────────────
// The sheet picks several values per field; the list stores `x`, `['in', [...]]`
// or nothing, the same shapes the desktop Filter writes.

export function filterValues(filters, fieldname) {
  const value = filters?.[fieldname]
  if (typeof value === 'string' && value) return [value]
  if (
    Array.isArray(value) &&
    String(value[0]).toLowerCase() === 'in' &&
    Array.isArray(value[1])
  )
    return value[1].filter((v) => typeof v === 'string')
  return []
}

export function withMultiFilter(filters, fieldname, values) {
  const next = { ...(filters || {}) }
  const picked = [...new Set((values || []).filter(Boolean))]
  if (!picked.length) delete next[fieldname]
  else if (picked.length === 1) next[fieldname] = picked[0]
  else next[fieldname] = ['in', picked]
  return next
}
