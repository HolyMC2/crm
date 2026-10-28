// What the calls page says about a call: when it happened in words a worker
// reads at a glance, who was on shift at that moment, and the analysis
// «Transcribir y analizar» leaves on it (doco_marketing services/call_analysis.py).
// Pure: every function takes its inputs, so tests pin the output.
import { formatDate, parseServerDate, relativeTime } from '@/utils/display'

/** «4:15 p. m.»: the 12-hour clock the counter speaks. */
export function time12(value, { timeZone } = {}) {
  const date = parseServerDate(value, { timeZone })
  if (!date) return ''
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'a. m.' : 'p. m.'}`
}

/** «mar 28 oct · 4:15 p. m.»; the year only when it is not this one. */
export function callWhen(value, { now = new Date(), timeZone } = {}) {
  const date = parseServerDate(value, { timeZone })
  if (!date) return ''
  const day = formatDate(date, { now, weekday: true, relative: false })
  return `${day} · ${time12(date)}`
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** «hace 3 h», «ayer» for a call in the last week; '' after that, where the date says it all. */
export function callAgo(value, { now = new Date(), timeZone } = {}) {
  const date = parseServerDate(value, { timeZone })
  if (!date || now - date >= WEEK_MS || date > now) return ''
  return relativeTime(date, { now })
}

/** Site-local «YYYY-MM-DDTHH:MM» of a server datetime, for comparing with shifts. */
function localKey(value) {
  const match = String(value || '').match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/,
  )
  return match ? `${match[1]}T${match[2]}` : ''
}

const firstName = (name) =>
  String(name || '')
    .trim()
    .split(/\s+/)[0] || ''

/**
 * Who was on shift when the call started: first names from
 * doco_marketing.api.calls.page_context shifts ({name, start, end}, site-local).
 */
export function onShift(startTime, shifts = []) {
  const at = localKey(startTime)
  if (!at) return []
  const names = shifts
    .filter((s) => s.start <= at && at < s.end)
    .map((s) => firstName(s.name))
    .filter(Boolean)
  return [...new Set(names)]
}

export const GOAL = Object.freeze({
  si: { label: 'Se logró', tone: 'success', icon: 'lucide-circle-check' },
  parcial: { label: 'En parte', tone: 'warning', icon: 'lucide-circle-dot' },
  no: { label: 'No se logró', tone: 'danger', icon: 'lucide-circle-x' },
})

/** The statuses of a call that never connected. */
export const MISSED = Object.freeze([
  'No Answer',
  'Missed',
  'Busy',
  'Failed',
  'Canceled',
])

export const SENTIMENT = Object.freeze({
  positivo: { label: 'Positivo', tone: 'success' },
  neutral: { label: 'Neutral', tone: 'neutral' },
  negativo: { label: 'Molesto', tone: 'danger' },
})

/**
 * The «Transcribir y analizar» action for a call: what the button says, whether
 * it can run, and the sentence under it.
 */
export function analysisAction(call = {}) {
  if (call.analysis_status === 'en_proceso')
    return {
      label: 'Transcribiendo…',
      allowed: false,
      hint: 'Tarda un par de minutos. Puedes cerrar esto; el resultado se queda en la llamada.',
    }
  if (!call.recording_url_path)
    return {
      label: 'Transcribir y analizar',
      allowed: false,
      hint: 'Esta llamada no tiene grabación. Solo las llamadas por Twilio con grabación se pueden transcribir.',
    }
  const done = !!call.transcript
  return {
    label: done ? 'Volver a analizar' : 'Transcribir y analizar',
    allowed: true,
    hint:
      call.analysis_status === 'error' || call.analysis_note
        ? call.analysis_note || ''
        : done
          ? ''
          : 'Convierte la grabación en texto y saca motivo, objetivo y ánimo del cliente.',
  }
}
