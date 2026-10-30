// Rows with no Lead/Deal status — «Sin asignar» orphans, «Archivados»,
// «Limpiados», Facebook comments — can't match a status, and an orphan is open
// by nature. So the default «Abiertos» view and «Todos los estados» keep them.
// Tere saw the badge count but an empty group (2026-10-30) because the default
// view counted as a filter and hid all of them. A hand-picked status,
// «Cerrados» on either side, an etiqueta or a date range asks for something
// these rows can't show, so it hides them.
export function filtersHideUnstatused(filters = {}) {
  const f = filters
  return !!(
    f.tag ||
    f.dealStatus?.length ||
    f.leadStatus?.length ||
    f.repairStatus?.length ||
    f.dealState === 'closed' ||
    f.leadState === 'closed' ||
    f.dateFrom ||
    f.dateTo
  )
}

// Orphans have a last-message time, so a date range keeps the ones last heard
// from inside it instead of hiding them all.
export function orphansForFilters(rows, filters = {}) {
  if (!rows?.length) return []
  const { dateFrom, dateTo, ...rest } = filters
  if (filtersHideUnstatused(rest)) return []
  if (!dateFrom && !dateTo) return rows
  return rows.filter((r) => {
    const day = String(r.last_message_ts || '').slice(0, 10)
    if (!day) return false
    if (dateFrom && day < dateFrom) return false
    return !(dateTo && day > dateTo)
  })
}
