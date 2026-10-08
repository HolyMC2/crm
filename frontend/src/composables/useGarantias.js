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
  'Enviar a proveedor': 'Send to supplier',
  'Respuesta del proveedor': 'Supplier answered',
}
// Actions whose dialog asks for a note (what goes to the supplier, what it answered).
export const NOTE_ACTIONS = Object.freeze([
  'Enviar a proveedor',
  'Respuesta del proveedor',
])

const REMEDIES = {
  Reparación: 'Repair',
  Cambio: 'Exchange',
  Reembolso: 'Refund at the register',
  Proveedor: 'With the supplier',
}
export function remedyLabel(value) {
  return REMEDIES[value] ? tr(REMEDIES[value], null, CTX) : value || ''
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

/** The claim's outcome unless it was cancelled (a cancelled visit resolves nothing). */
export function liveOutcome(claim) {
  return claim?.outcome && !claim.outcome.void ? claim.outcome : null
}

/** What the record's one primary next action is, given its state. */
export function primaryAction(claim) {
  if (!claim || !claim.can_write) return null
  if (claim.repair?.open) return { kind: 'open_repair' }
  if (claim.repair?.available) return { kind: 'repair' }
  const transitions = claim.transitions || []
  const resolve = transitions.find((t) => t.action === 'Resolver')
  // An unrepaired delivered visit is an outcome that still needs a written reason.
  if (resolve && liveOutcome(claim) && !resolve.needs_details)
    return { kind: 'transition', action: 'Resolver' }
  // A refund already made at the register: link it instead of refunding twice.
  if (claim.remedies?.refund?.returns?.length) return { kind: 'link_return' }
  if (claim.can_pick_source && !claim.against) return { kind: 'pick_source' }
  const review = transitions.find((t) => t.action === 'Revisar')
  if (review) return { kind: 'transition', action: 'Revisar' }
  return null
}

/**
 * The picker's choices from `sources`: one per sold line (with the serial or batch
 * that left with it) and one per delivered Taller order.
 */
export function sourceOptions(found) {
  const options = []
  for (const sale of found?.sales || []) {
    for (const line of sale.items || []) {
      options.push({
        key: `${sale.doctype}:${sale.name}:${line.row}`,
        against_doctype: sale.doctype,
        against_name: sale.name,
        against_row: line.row,
        serial_no: line.serial_no?.length === 1 ? line.serial_no[0] : '',
        serials: line.serial_no || [],
        batch_no: line.batch_no?.length === 1 ? line.batch_no[0] : '',
        label: line.item_name || line.item_code,
        hint: [sale.name, sale.date, ...(line.serial_no || []).slice(0, 2)]
          .filter(Boolean)
          .join(' · '),
        kind: 'sale',
      })
    }
  }
  for (const order of found?.orders || []) {
    options.push({
      key: `Repair Order:${order.name}`,
      against_doctype: 'Repair Order',
      against_name: order.name,
      against_row: '',
      serial_no: order.serial_no?.length === 1 ? order.serial_no[0] : '',
      serials: order.serial_no || [],
      batch_no: '',
      label: order.title || order.name,
      hint: [order.name, order.date, ...(order.serial_no || []).slice(0, 1)]
        .filter(Boolean)
        .join(' · '),
      kind: 'order',
    })
  }
  return options
}

/** Hand-off query a Taller order or POS sale opens «Nuevo caso» with. */
export const CREATE_KEYS = Object.freeze([
  'against_doctype',
  'against_name',
  'against_row',
  'claim_kind',
  'serial_no',
])
export function createPrefill(query) {
  const values = {}
  for (const key of CREATE_KEYS)
    if (typeof query?.[key] === 'string' && query[key]) values[key] = query[key]
  return values
}
