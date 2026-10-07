import { ref } from 'vue'
import { comprasApi } from '@/composables/useCompras'
import { withReturn } from '@/vendor/muelle-shell/contracts'

// Garantías: a customer comes back with a product → claim → assign → repair in
// Taller (or resolve) → notice → back to the queue. The native Warranty Claim
// is the record; Doco's garantias service owns every read and write.
// Pure helpers live here so the pages and tests share them.

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

const SERVICE = 'doco.garantias.service'
// Translation context: short generic words stay Garantías-only in the catalog.
export const CTX = 'Garantías'

/** POST to the Garantías service; a refusal keeps the server's message and type. */
export function garantiasApi(method, args = {}) {
  return comprasApi(
    method.includes('.') ? method : `${SERVICE}.${method}`,
    args,
  )
}

export const garantiasBoot = ref(null)
let bootPending
/** Garantías capability, cached per page load; refresh re-reads permissions. */
export function loadGarantiasBoot({ refresh = false } = {}) {
  if (garantiasBoot.value && !refresh)
    return Promise.resolve(garantiasBoot.value)
  if (bootPending) return bootPending
  bootPending = garantiasApi('crm.api.garantias.get_capabilities')
    .then((data) => (garantiasBoot.value = data || { enabled: false }))
    .catch(() => (garantiasBoot.value = { enabled: false, failed: true }))
    .finally(() => (bootPending = null))
  return bootPending
}

export const SEGMENTS = Object.freeze([
  { value: 'nuevas', label: 'New', icon: 'inbox' },
  { value: 'en-revision', label: 'In review', icon: 'tool' },
  { value: 'con-proveedor', label: 'With supplier', icon: 'truck' },
  { value: 'cerradas', label: 'Closed', icon: 'archive' },
])
export function segmentLabel(value) {
  return tr(SEGMENTS.find((s) => s.value === value)?.label || 'New', null, CTX)
}
export function normalizeSegment(value) {
  return SEGMENTS.some((s) => s.value === value) ? value : 'nuevas'
}

// Stored values are the native records' own (Spanish) names; labels translate.
export const KINDS = Object.freeze([
  { value: 'Garantía', label: 'Warranty' },
  { value: 'Devolución', label: 'Return' },
  { value: 'Reingreso', label: 'Back for repair' },
])
export function kindLabel(value) {
  const kind = KINDS.find((k) => k.value === value)
  return kind ? tr(kind.label, null, CTX) : value || ''
}

const STATES = {
  Nueva: ['New', 'blue'],
  'En revisión': ['In review', 'orange'],
  'Con proveedor': ['With supplier', 'orange'],
  Resuelta: ['Resolved', 'green'],
  Cancelada: ['Cancelled', 'gray'],
}
export function stateLabel(state) {
  return STATES[state] ? tr(STATES[state][0], null, CTX) : state || ''
}
export function stateTheme(state) {
  return STATES[state]?.[1] || 'gray'
}

const ACTIONS = {
  Revisar: 'Start review',
  Resolver: 'Mark resolved',
  'Sin procede': 'Does not apply',
  Cancelar: 'Cancel case',
  Reabrir: 'Reopen',
}
export function actionLabel(action) {
  return ACTIONS[action] ? tr(ACTIONS[action], null, CTX) : action
}

/** «Due in 3 h», «Overdue by 2 h» or «Due Oct 8» from the native SLA due time. */
export function dueLabel(due, now = new Date()) {
  if (!due) return ''
  const at = new Date(String(due).replace(' ', 'T'))
  if (Number.isNaN(at.getTime())) return ''
  const hours = Math.round((at.getTime() - now.getTime()) / 3_600_000)
  if (hours < 0) return tr('Overdue by {0} h', [Math.abs(hours)], CTX)
  if (hours < 48) return tr('Due in {0} h', [hours], CTX)
  return tr('Due {0}', [at.toLocaleDateString()], CTX)
}
export function dueTheme(due, now = new Date()) {
  if (!due) return 'gray'
  const at = new Date(String(due).replace(' ', 'T'))
  const hours = (at.getTime() - now.getTime()) / 3_600_000
  return hours < 0 ? 'red' : hours < 8 ? 'orange' : 'gray'
}

export function recordRoute(name) {
  return { name: 'Garantia', params: { name } }
}

/** Taller's order record, with the way back to this claim. */
export function tallerOrderUrl(order, claim) {
  return withReturn(`/taller/orders/${encodeURIComponent(order)}`, {
    to: `/crm/garantias/${encodeURIComponent(claim)}`,
    label: 'Garantías',
  })
}

/** Taller's intake for a product that has no repair order yet. */
export function tallerIntakeUrl(claim) {
  return withReturn('/taller/orders/new', {
    to: `/crm/garantias/${encodeURIComponent(claim)}`,
    label: 'Garantías',
  })
}

/** What the record's one primary next action is, given its state. */
export function primaryAction(claim) {
  if (!claim || !claim.can_write) return null
  if (claim.repair?.open) return { kind: 'open_repair' }
  if (claim.repair?.available) return { kind: 'repair' }
  const transitions = claim.transitions || []
  const resolve = transitions.find((t) => t.action === 'Resolver')
  if (resolve && claim.outcome)
    return { kind: 'transition', action: 'Resolver' }
  const review = transitions.find((t) => t.action === 'Revisar')
  if (review) return { kind: 'transition', action: 'Revisar' }
  return null
}
