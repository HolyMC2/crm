export const FOLLOW_UP_QUEUES = [
  { key: 'all', label: 'Todos', description: 'Todos los tratos que coinciden con tus filtros.' },
  { key: 'overdue', label: 'Vencidos', description: 'Seguimientos pendientes de días anteriores. Abre el trato para completar o reprogramar la tarea.' },
  { key: 'today', label: 'Para hoy', description: 'Seguimientos pendientes para hoy, según la zona horaria del sitio.' },
  { key: 'undated', label: 'Sin fecha', description: 'Ya tienen una tarea pendiente: abre el trato y asigna una fecha al seguimiento.' },
  { key: 'missing', label: 'Sin seguimiento', description: 'Tratos abiertos sin tarea pendiente. Programa el próximo paso desde el resumen.' },
]

// Frappe AND filters: the same constraints serve the rows, totals and export.
export function followUpFilters(queue, today, closedStatuses = []) {
  if (queue === 'missing') return [
    ['next_activity_task', 'is', 'not set'],
    ...(closedStatuses.length ? [['status', 'not in', closedStatuses]] : []),
  ]
  if (queue === 'undated') return [['next_activity_task', 'is', 'set'], ['next_activity_at', 'is', 'not set']]
  if (queue === 'overdue') return [['next_activity_task', 'is', 'set'], ['next_activity_at', '<', `${today} 00:00:00`]]
  if (queue === 'today') return [['next_activity_task', 'is', 'set'], ['next_activity_at', 'between', [`${today} 00:00:00`, `${today} 23:59:59.999999`]]]
  return []
}

// ── the canonical follow-up task ──────────────────────────────────────────────
// A follow-up IS a CRM Task pointing at the deal; `next_activity_*` on CRM Deal
// is derived from it by the hooks in crm/pipeline and must never be written by a
// caller. These builders produce exactly the document Deal 360's «Programar
// seguimiento» inserts, so the list and the record write the same shape.

// CRM Task.activity_type options. Labels are translated where they are rendered.
export const FOLLOW_UP_ACTIVITY_TYPES = [
  { value: 'Task', label: 'Tarea' },
  { value: 'Call', label: 'Llamada' },
  { value: 'WhatsApp', label: 'WhatsApp' },
  { value: 'Email', label: 'Correo' },
  { value: 'Meeting', label: 'Reunión' },
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

export function isFollowUpDate(value) {
  return DATE_RE.test(String(value || ''))
}

// Day arithmetic on the site's date string. UTC midnight so a browser west of
// the site's timezone cannot shift the day the queues are built from.
export function addDays(date, days) {
  if (!isFollowUpDate(date)) return ''
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + Number(days || 0))
  return d.toISOString().slice(0, 10)
}

// CRM Task.due_date is a Datetime and Frappe stores it naive, already in the
// site's timezone. An hour is optional: with none the task sits at the start of
// its day, the same midnight boundary the overdue/today queues cut on.
export function followUpDue(date, time) {
  if (!isFollowUpDate(date)) return ''
  const raw = TIME_RE.test(String(time || '')) ? String(time) : '00:00'
  return `${date} ${raw.length === 5 ? `${raw}:00` : raw}`
}

// The stored due_date split back into the two inputs the popover edits. The hour
// is dropped when it is the implicit midnight, so reopening an undated-hour task
// does not invent 00:00 as a deliberate choice.
export function followUpParts(due) {
  const [date = '', time = ''] = String(due || '').split(' ')
  if (!isFollowUpDate(date)) return { date: '', time: '' }
  const hhmm = time.slice(0, 5)
  return { date, time: TIME_RE.test(hhmm) && hhmm !== '00:00' ? hhmm : '' }
}

// New task: the defaults Deal 360 passes, plus what the popover collected.
export function followUpTaskDoc({ deal, owner, title, date, time, type } = {}) {
  const doc = {
    doctype: 'CRM Task',
    reference_doctype: 'CRM Deal',
    reference_docname: deal,
    status: 'Todo',
    activity_type: type || 'Task',
    title: String(title || '').trim(),
  }
  if (owner) doc.assigned_to = owner
  const due = followUpDue(date, time)
  if (due) doc.due_date = due
  return doc
}

// Reschedule: only the fields the popover edits. Status, assignee and the
// reference belong to whoever created the task.
export function followUpTaskValues({ title, date, time, type } = {}) {
  return {
    title: String(title || '').trim(),
    activity_type: type || 'Task',
    due_date: followUpDue(date, time) || null,
  }
}

// '' when the draft can be saved, else the rule it breaks. The caller owns the
// message so the copy stays with the UI.
export function followUpDraftError({ title, date, time } = {}) {
  if (!String(title || '').trim()) return 'title'
  if (!isFollowUpDate(date)) return 'date'
  if (time && !TIME_RE.test(String(time))) return 'time'
  return ''
}
