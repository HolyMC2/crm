// The record's Actividad as RecordActivity filters it (pure, unit-tested):
// Todo, Comentarios, Correos and Cambios, with the record's emails
// (crm.api.correo.hilo) as events among the timeline's.

export const FILTERS = Object.freeze([
  { value: 'all', label: 'Todo' },
  { value: 'comment', label: 'Comentarios' },
  { value: 'email', label: 'Correos' },
  { value: 'change', label: 'Cambios' },
])

/** Does one event belong under this filter? Cambios = everything that is not said or mailed. */
export function inFilter(event, filter = 'all') {
  if (!event) return false
  if (!filter || filter === 'all') return true
  if (filter === 'comment' || filter === 'email') return event.kind === filter
  return event.kind !== 'comment' && event.kind !== 'email'
}

/** How many events each filter shows (the Segmented's counts). */
export function filterCounts(events = []) {
  const out = { all: 0, comment: 0, email: 0, change: 0 }
  for (const event of events || []) {
    if (!event) continue
    out.all++
    if (event.kind === 'comment') out.comment++
    else if (event.kind === 'email') out.email++
    else out.change++
  }
  return out
}

/**
 * The record's emails as Actividad events. `name(de)` turns a sender into the
 * worker's words (correo.js `senderName`); what the worker sent names them,
 * what came in names its sender.
 */
export function emailEvents(correos = [], name = (de) => de?.nombre || '') {
  return (correos || [])
    .filter((c) => c?.name)
    .map((c) => ({
      kind: 'email',
      id: c.name,
      at: c.fecha || '',
      who: name(c.de) || 'Alguien',
      text: c.asunto || '',
      snippet: c.snippet || '',
      direction: c.direccion === 'recibido' ? 'recibido' : 'enviado',
    }))
}

/** One tag as the server keeps it: no commas, single spaces, at most 40 characters. */
export function cleanTag(text) {
  return String(text || '')
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .slice(0, 40)
}
