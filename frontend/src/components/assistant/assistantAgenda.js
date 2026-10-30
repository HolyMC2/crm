// «Agenda del bot» (S40): what the person left on the assistant's agenda
// (doco encargos_bot through shell_api.encargos). A timer is an encargo at a
// time, a reminder the same with a «recuérdame», a snooze is «posponer». Rows
// come grouped hoy (overdue too) / próximos / esperando; each one is put off
// with a quick pick, cancelled in two taps in place, or marked done.
import { reactive } from 'vue'
import { call } from 'frappe-ui'
import { shellPathFor } from './assistantText'
import { ASSISTANT_API } from './useAssistant'

export const agenda = reactive({
  items: [],
  loaded: false,
  /** false once the server says it has no agenda (an older doco). */
  available: true,
  /** encargo → 'posponer' | 'cancelar' | 'cerrar' while it runs */
  busy: {},
  /** the encargo whose «Posponer» picks are open */
  picking: null,
  /** the encargo whose bin was tapped once */
  confirming: null,
  error: '',
})

function errorText(error) {
  const message = error?.messages?.[0] || error?.message || ''
  return message && !/^\s*</.test(message)
    ? String(message)
    : __('Muelle did not answer. Check your connection and try again.')
}

export async function loadAgenda() {
  if (!agenda.available) return
  try {
    const out = await call(`${ASSISTANT_API}.encargos`)
    agenda.items = out?.items || []
    agenda.loaded = true
    agenda.error = ''
  } catch (error) {
    // a server without the agenda: the tab goes away instead of erroring
    if (
      /not whitelisted|has no attribute|Failed to get method/i.test(
        String(error?.message || error?.exc_type || ''),
      )
    )
      agenda.available = false
    else agenda.error = errorText(error)
  }
}

/** «2026-10-29 18:30» (the server's site time, the shop's clock) → a Date. */
export function parseWhen(text) {
  const m = String(text || '').match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/,
  )
  if (!m) return null
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
}

/** A Date → «YYYY-MM-DD HH:MM», the form encargos_bot reads. */
export function stamp(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function endOfDay(now) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
}

/** hoy (overdue too) / próximos / esperando, each by time; empty groups are left out. */
export function groupEncargos(items, now = new Date()) {
  const groups = [
    { key: 'hoy', label: __('Today'), rows: [] },
    { key: 'proximos', label: __('Coming up'), rows: [] },
    { key: 'esperando', label: __('Waiting'), rows: [] },
  ]
  const [hoy, proximos, esperando] = groups
  const end = endOfDay(now)
  const sorted = [...(items || [])].sort((a, b) =>
    String(a.cuando || '').localeCompare(String(b.cuando || '')),
  )
  for (const row of sorted) {
    if (row.estado === 'Esperando') esperando.rows.push(row)
    else {
      const when = parseWhen(row.cuando)
      if (!when || when <= end) hoy.rows.push(row)
      else proximos.rows.push(row)
    }
  }
  return groups.filter((g) => g.rows.length)
}

/** What the header's badge counts: open encargos due today or overdue. */
export function dueCount(items, now = new Date()) {
  const end = endOfDay(now)
  return (items || []).filter((row) => {
    if (row.estado === 'Esperando') return false
    const when = parseWhen(row.cuando)
    return !when || when <= end
  }).length
}

/** «Posponer»'s quick picks: +1 h, mañana 9:00, el lunes 9:00. */
export function quickPicks(now = new Date()) {
  const hour = new Date(now.getTime() + 3600000)
  hour.setSeconds(0, 0)
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    9,
    0,
  )
  const ahead = (8 - now.getDay()) % 7 || 7
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + ahead,
    9,
    0,
  )
  return [
    { key: 'hora', label: __('In 1 hour'), at: stamp(hour) },
    { key: 'manana', label: __('Tomorrow 9:00'), at: stamp(tomorrow) },
    { key: 'lunes', label: __('Monday 9:00'), at: stamp(monday) },
  ]
}

/** The `<input type="datetime-local">` value → the server's form. */
export function fromPicker(value) {
  return String(value || '')
    .replace('T', ' ')
    .slice(0, 16)
}

/** Where the record an encargo is about opens: its shell screen, else the Desk form. */
export function recordTarget(row) {
  const ref = row?.registro
  if (!ref?.doctype || !ref?.name) return null
  const slug = String(ref.doctype).trim().toLowerCase().replace(/\s+/g, '-')
  const href = `/app/${slug}/${encodeURIComponent(ref.name)}`
  const to = shellPathFor(href)
  return to
    ? { to, label: ref.title || ref.name }
    : { href, label: ref.title || ref.name }
}

async function act(row, accion, args = {}) {
  const name = row.encargo
  if (agenda.busy[name]) return null
  agenda.busy = { ...agenda.busy, [name]: accion }
  agenda.error = ''
  let out = null
  try {
    out = await call(`${ASSISTANT_API}.encargo_accion`, {
      encargo: name,
      accion,
      ...args,
    })
  } catch (error) {
    agenda.error = errorText(error)
  }
  const next = { ...agenda.busy }
  delete next[name]
  agenda.busy = next
  if (out) {
    agenda.picking = null
    agenda.confirming = null
    await loadAgenda()
  }
  return out
}

export function snooze(row, hasta) {
  return act(row, 'posponer', { hasta })
}

/** The bin asks once in place («Cancelar» where the bin was), then cancels. */
export function cancelEncargo(row) {
  if (agenda.confirming !== row.encargo) {
    agenda.confirming = row.encargo
    return null
  }
  return act(row, 'cancelar')
}

export function doneEncargo(row) {
  return act(row, 'cerrar')
}

export function togglePicks(row) {
  agenda.picking = agenda.picking === row.encargo ? null : row.encargo
  agenda.confirming = null
}

/** Tests only. */
export function _resetAgenda() {
  Object.assign(agenda, {
    items: [],
    loaded: false,
    available: true,
    busy: {},
    picking: null,
    confirming: null,
    error: '',
  })
}
