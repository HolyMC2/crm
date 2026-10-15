// Duplicate contact review (CRM-S3.2, decision D3): pure helpers for the review page.
// The server suggests groups (doco.contactos.api.duplicates); a person always confirms.

// Linked records a merge moves, in the words a shop uses. Unknown doctypes keep their name.
const LINK_LABELS = {
  'CRM Deal': ['trato', 'tratos'],
  'Repair Order': ['orden de reparación', 'órdenes de reparación'],
  'Sales Invoice': ['factura', 'facturas'],
  'POS Invoice': ['ticket', 'tickets'],
  'Sales Order': ['pedido', 'pedidos'],
  Quotation: ['cotización', 'cotizaciones'],
  'Payment Entry': ['pago', 'pagos'],
  Customer: ['cliente', 'clientes'],
  'CRM Call Log': ['llamada', 'llamadas'],
  'WhatsApp Message': ['mensaje de WhatsApp', 'mensajes de WhatsApp'],
  Communication: ['correo', 'correos'],
  Comment: ['comentario', 'comentarios'],
  'FCRM Note': ['nota', 'notas'],
  'CRM Task': ['tarea', 'tareas'],
  ToDo: ['pendiente', 'pendientes'],
  File: ['archivo', 'archivos'],
  Event: ['evento', 'eventos'],
  'Dynamic Link': ['dirección', 'direcciones'],
  'Contact Channel Identity': ['canal', 'canales'],
  'CRM Touchpoint': ['interacción', 'interacciones'],
  'Marketing Consent Log': ['consentimiento', 'consentimientos'],
}
// What a seller looks at first when deciding which record to keep.
const ORDER = [
  'CRM Deal',
  'Repair Order',
  'Sales Invoice',
  'POS Invoice',
  'Sales Order',
  'Quotation',
  'Payment Entry',
]

export function linkLabel(doctype, n) {
  const [one, many] = LINK_LABELS[doctype] || [doctype, doctype]
  return `${n} ${n === 1 ? one : many}`
}

/** «7 tratos · 3 facturas · 1 orden de reparación» — business records first. */
export function linkSummary(links = {}, max = 4) {
  const entries = Object.entries(links || {}).filter(([, n]) => n > 0)
  entries.sort(([a, na], [b, nb]) => {
    const ia = ORDER.indexOf(a)
    const ib = ORDER.indexOf(b)
    if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    return nb - na
  })
  const shown = entries
    .slice(0, max)
    .map(([doctype, n]) => linkLabel(doctype, n))
  const rest = entries.length - shown.length
  if (rest > 0) shown.push(rest === 1 ? '1 tipo más' : `${rest} tipos más`)
  return shown.length ? shown.join(' · ') : 'Sin registros vinculados'
}

export function linkTotal(links = {}) {
  return Object.values(links || {}).reduce((sum, n) => sum + (n || 0), 0)
}

/** The record to keep by default: the one carrying the customer's work, then the oldest. */
export function defaultSurvivor(members = []) {
  return [...members].sort((a, b) => {
    const work = linkTotal(b.links) - linkTotal(a.links)
    if (work) return work
    return String(a.creation || '').localeCompare(String(b.creation || ''))
  })[0]
}

export const STRENGTH = {
  same: {
    label: 'Probablemente la misma persona',
    theme: 'green',
  },
  shared_phone: {
    label: 'Comparten teléfono; los nombres no coinciden',
    theme: 'orange',
  },
}

export function reasonLabel(reason) {
  return reason.kind === 'email'
    ? `Mismo correo: ${reason.label}`
    : `Mismo teléfono: ${reason.label}`
}

// Fields a person may take from the record that goes away (mirrors merge.CHOOSABLE).
export const FIELD_LABELS = {
  first_name: 'Nombre',
  middle_name: 'Segundo nombre',
  last_name: 'Apellidos',
  salutation: 'Tratamiento',
  gender: 'Género',
  designation: 'Puesto',
  company_name: 'Empresa',
}

/** Fields whose values differ, so the person chooses; equal or empty ones need no choice. */
export function differingFields(choosable, keep, drop) {
  const a = keep?.fields || {}
  const b = drop?.fields || {}
  return (choosable || []).filter(
    (field) =>
      String(b[field] || '').trim() &&
      String(a[field] || '').trim() !== String(b[field] || '').trim(),
  )
}

/** The merge payload: only fields the person moved to the duplicate's value are sent. */
export function mergePayload(keep, drop, choices = {}) {
  const chosen = Object.fromEntries(
    Object.entries(choices).filter(([, side]) => side === 'source'),
  )
  return {
    source: drop.name,
    target: keep.name,
    expected: { source: drop.modified, target: keep.modified },
    keep: chosen,
    confirmed: true,
  }
}
