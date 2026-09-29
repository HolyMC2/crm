const filterKeys = ['from_date', 'to_date', 'owner', 'pipeline', 'company']
export const periodKeys = [
  'today',
  '7d',
  '30d',
  'month',
  'last-month',
  'custom',
]
const day = 86400000

// Calendar arithmetic in UTC avoids shortening a comparison across a DST change.
function dateStamp(value) {
  return new Date(`${value}T00:00:00Z`).getTime()
}
function dateString(value) {
  return new Date(value).toISOString().slice(0, 10)
}
export function validReportDate(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(dateStamp(value)) &&
    dateString(dateStamp(value)) === value
  )
}
export function todayDate() {
  const timezone =
    window.sysdefaults?.time_zone || window.frappe?.boot?.time_zone?.system
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date())
      return ['year', 'month', 'day']
        .map((key) => parts.find((p) => p.type === key).value)
        .join('-')
    } catch {
      /* Fall back to the browser calendar if the site has no valid timezone. */
    }
  }
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
export function periodRange(preset, today = todayDate()) {
  const end = dateStamp(today)
  const first = `${today.slice(0, 7)}-01`
  if (preset === 'last-month') {
    const last = dateString(dateStamp(first) - day)
    return { from_date: `${last.slice(0, 7)}-01`, to_date: last }
  }
  return {
    from_date:
      preset === 'month'
        ? first
        : dateString(
            end - (preset === 'today' ? 0 : preset === '7d' ? 6 : 29) * day,
          ),
    to_date: today,
  }
}
export function previousPeriod(filters) {
  if (
    !validReportDate(filters.from_date) ||
    !validReportDate(filters.to_date) ||
    filters.from_date > filters.to_date
  )
    return null
  const start = dateStamp(filters.from_date)
  const days = (dateStamp(filters.to_date) - start) / day + 1
  return {
    ...filters,
    from_date: dateString(start - days * day),
    to_date: dateString(start - day),
  }
}
export function periodDelta(current, previous) {
  if (
    current == null ||
    previous == null ||
    !Number.isFinite(Number(current)) ||
    !Number.isFinite(Number(previous))
  ) {
    return { percent: null, difference: null, state: 'unavailable' }
  }
  const difference = Number(current) - Number(previous)
  return {
    difference,
    percent:
      Number(previous) === 0
        ? difference === 0
          ? 0
          : null
        : (difference / Math.abs(Number(previous))) * 100,
    state:
      difference === 0 ? 'flat' : Number(previous) === 0 ? 'new' : 'change',
  }
}
export function readReportQuery(query, today = todayDate()) {
  const preset = periodKeys.includes(query.period)
    ? query.period
    : query.from_date || query.to_date
      ? 'custom'
      : '30d'
  const dates = periodRange(preset, today)
  return {
    preset,
    ...Object.fromEntries(
      filterKeys.map((key) => [
        key,
        typeof query[key] === 'string' ? query[key] : dates[key] || '',
      ]),
    ),
  }
}
export function reportApiFilters(state) {
  return Object.fromEntries(
    filterKeys.filter((key) => state[key]).map((key) => [key, state[key]]),
  )
}
export function reportFilterQuery(query, state) {
  const result = { ...query }
  for (const key of [
    ...filterKeys,
    'period',
    'drill_kind',
    'drill_bucket',
    'drill_title',
  ])
    delete result[key]
  return { ...result, period: state.preset, ...reportApiFilters(state) }
}
export function readReportDrill(query) {
  if (!['leads', 'deals', 'tasks'].includes(query.drill_kind)) return null
  try {
    const bucket = JSON.parse(query.drill_bucket || '{}')
    const allowed = [
      'source',
      'status',
      'owner',
      'pipeline',
      'outcome',
      'converted',
      'task_state',
    ]
    if (
      !bucket ||
      Array.isArray(bucket) ||
      typeof bucket !== 'object' ||
      Object.entries(bucket).some(
        ([key, value]) =>
          !allowed.includes(key) ||
          !['string', 'number', 'boolean'].includes(typeof value),
      )
    )
      return null
    return {
      kind: query.drill_kind,
      bucket,
      title:
        typeof query.drill_title === 'string'
          ? query.drill_title
          : __('Report records'),
    }
  } catch {
    return null
  }
}
