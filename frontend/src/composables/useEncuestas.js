import { ref } from 'vue'
import { comprasApi } from '@/composables/useCompras'
import { withReturn } from '@/vendor/muelle-shell/contracts'

// Encuestas: after a sale the customer answers «del 0 al 10, ¿nos recomendarías?»
// on the shop's link → the unhappy ones wait here → «Me encargo» → talk to them,
// open a warranty if needed → «Cerrar seguimiento» → next one. The native Quality
// Feedback is the answer and Quality Action its follow-up; Doco's encuestas
// service owns every read and write. Pure helpers live here so the pages and
// tests share them.

export {
  outcomeUnknown,
  problemOf,
  requestId,
  safeReturn,
} from '@/composables/useCompras'

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

const SERVICE = 'doco.encuestas.service'
// Translation context: short generic words stay Encuestas-only in the catalog.
export const CTX = 'Encuestas'

/** POST to the Encuestas service; a refusal keeps the server's message and type. */
export function encuestasApi(method, args = {}) {
  return comprasApi(
    method.includes('.') ? method : `${SERVICE}.${method}`,
    args,
  )
}

export const encuestasBoot = ref(null)
let bootPending
/** Encuestas capability, cached per page load; refresh re-reads permissions. */
export function loadEncuestasBoot({ refresh = false } = {}) {
  if (encuestasBoot.value && !refresh)
    return Promise.resolve(encuestasBoot.value)
  if (bootPending) return bootPending
  bootPending = encuestasApi('crm.api.encuestas.get_capabilities')
    .then((data) => (encuestasBoot.value = data || { enabled: false }))
    .catch(() => (encuestasBoot.value = { enabled: false, failed: true }))
    .finally(() => (bootPending = null))
  return bootPending
}

export const VIEWS = Object.freeze([
  { value: 'atender', label: 'To follow up', icon: 'frown' },
  { value: 'seguimiento', label: 'In progress', icon: 'phone' },
  { value: 'todas', label: 'All answers', icon: 'list' },
])
export function viewLabel(value) {
  return tr(
    VIEWS.find((v) => v.value === value)?.label || 'To follow up',
    null,
    CTX,
  )
}
export function normalizeView(value) {
  return VIEWS.some((v) => v.value === value) ? value : 'atender'
}

export const BUCKETS = Object.freeze([
  {
    value: 'detractor',
    label: 'Unhappy (0–6)',
    name: 'Unhappy',
    range: '0–6',
    theme: 'red',
  },
  {
    value: 'passive',
    label: 'Neutral (7–8)',
    name: 'Neutral',
    range: '7–8',
    theme: 'orange',
  },
  {
    value: 'promoter',
    label: 'Happy (9–10)',
    name: 'Happy',
    range: '9–10',
    theme: 'green',
  },
])
export function normalizeBucket(value) {
  return BUCKETS.some((b) => b.value === value) ? value : ''
}
/** The standard recommendation buckets: 9–10 happy, 7–8 neutral, 0–6 unhappy. */
export function bucketOf(score) {
  const value = Number(score)
  if (value >= 9) return 'promoter'
  if (value >= 7) return 'passive'
  return 'detractor'
}
export function bucketLabel(value) {
  return tr(BUCKETS.find((b) => b.value === value)?.label || '', null, CTX)
}
/** The group's name alone, for a card that shows its range on another line. */
export function bucketName(value) {
  return tr(BUCKETS.find((b) => b.value === value)?.name || '', null, CTX)
}
export function bucketTheme(value) {
  return BUCKETS.find((b) => b.value === value)?.theme || 'gray'
}
export function scoreLabel(score) {
  return tr('{0} of 10', [Number(score)], CTX)
}

export const PERIODS = Object.freeze([30, 90, 365])
export function normalizePeriod(value) {
  const days = Number(value)
  return PERIODS.includes(days) ? days : 30
}
export function periodLabel(days) {
  return days === 365
    ? tr('Last 12 months', null, CTX)
    : tr('Last {0} days', [days], CTX)
}
/** The headline number with its sign; «—» before the first answer. */
export function recommendationText(summary) {
  if (!summary || summary.value === null || summary.value === undefined)
    return '—'
  return summary.value > 0 ? `+${summary.value}` : String(summary.value)
}

export function followUpLabel(status) {
  if (status === 'Open') return tr('In progress', null, CTX)
  if (status === 'Completed') return tr('Followed up', null, CTX)
  return tr('Nobody yet', null, CTX)
}
export function followUpTheme(status) {
  if (status === 'Open') return 'blue'
  if (status === 'Completed') return 'green'
  return 'gray'
}

export function recordRoute(name) {
  return { name: 'Encuesta', params: { name } }
}

/** The ask is off or not ready: what to tell this worker and which step resolves it. */
export function askNotice(ask, capabilities = {}) {
  if (!ask || ask.state === 'on') return null
  const canSetup = Boolean(capabilities.setup)
  const action =
    ask.state === 'no_app' || !canSetup
      ? 'request'
      : ask.state === 'no_link'
        ? 'shop_page'
        : 'setup'
  return { state: ask.state, reason: ask.reason || '', action }
}

/** The way back to one answer, for the screens it hands off to. */
export function answerReturn(name) {
  return {
    to: `/crm/encuestas/${encodeURIComponent(name)}`,
    label: 'Encuestas',
  }
}
/** A router path inside this SPA (router base /crm) for a /crm/… href. */
export function inApp(href) {
  return href.replace(/^\/crm(?=\/)/, '')
}

/** Where the answer's customer opens in Contactos, with the way back. */
export function customerHref(record) {
  if (!record?.customer || !record?.name) return null
  return inApp(
    withReturn(
      `/crm/contactos/customer/${encodeURIComponent(record.customer)}`,
      answerReturn(record.name),
    ),
  )
}

/** Garantías «Nuevo caso» prefilled with the sale, coming back to this answer. */
export function garantiaHref(record) {
  if (!record?.sale || !record?.sale_doctype || !record?.name) return null
  const params = new URLSearchParams({
    create: '1',
    against_doctype: record.sale_doctype,
    against_name: record.sale,
  })
  return inApp(
    withReturn(
      `/crm/garantias?${params.toString()}`,
      answerReturn(record.name),
    ),
  )
}

/** wa.me on the worker's phone, with a short greeting in the shop's words. */
export function whatsappHref(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length < 8) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(text || '')}`
}
export function greeting(record) {
  const first = String(record?.buyer_name || record?.customer_name || '')
    .trim()
    .split(/\s+/)[0]
  return first
    ? tr(
        'Hi {0}, thanks for answering our survey. We would like to fix what went wrong — do you have a minute?',
        [first],
        CTX,
      )
    : tr(
        'Hi, thanks for answering our survey. We would like to fix what went wrong — do you have a minute?',
        null,
        CTX,
      )
}
