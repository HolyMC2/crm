// One call for both sales panels («Creado desde» and «¿De dónde vino?»):
// crm.api.documentos_ventas.origen, shared per record version so the two
// panels never ask twice (SPEC §6.4 A2: after the record's first paint).
import { call } from 'frappe-ui'
import { documentRoute, listRoute, profileFor } from '@/documentos/registry'
import { formatDate, formatDateTime, formatMoney } from '@/utils/display'

const cache = new Map()

/** The list of `doctype` filtered to one customer («Filtros» › Cliente), all states. */
export function customerListRoute(doctype, field, customer) {
  const entry = profileFor(
    doctype,
    doctype === 'Payment Entry' ? { payment_type: 'Receive' } : null,
  )
  return entry
    ? listRoute(entry, { [`f_${field}`]: customer, estado: '' })
    : null
}

export function loadOrigen(record) {
  const key = `${record.doctype}:${record.name}:${record.modified}`
  if (!cache.has(key)) {
    if (cache.size > 20) cache.clear()
    const pending = call('crm.api.documentos_ventas.origen', {
      doctype: record.doctype,
      name: record.name,
    }).catch((e) => {
      cache.delete(key)
      throw e
    })
    cache.set(key, pending)
  }
  return cache.get(key)
}

// What a step says when it has no document yet, and when it is in part.
const PENDING = {
  cotizacion: 'Sin cotización',
  pedido: 'Sin pedido',
  entrega: 'Falta entregar',
  factura: 'Falta facturar',
  cobro: 'Falta cobrar',
}
const PARTIAL = {
  entrega: 'Entregado en parte',
  factura: 'Facturado en parte',
  cobro: 'Cobrado en parte',
}
const DONE = {
  cotizacion: 'Enviada',
  pedido: 'Confirmado',
  entrega: 'Entregado',
  factura: 'Facturado',
  cobro: 'Cobrado',
}

/**
 * One step as the stepper shows it: `{ key, label, state, current, line, to }`.
 * `line` is the worker's sentence («Entregado · 14 oct · $420.00»), `to` opens
 * the one document, or its list scoped to these documents when there are several.
 */
export function stepView(step, { boot = null, scopeLabel = '' } = {}) {
  const docs = step.docs || []
  const one = docs.length === 1 ? docs[0] : null
  let line
  if (step.state === 'none') line = PENDING[step.key] || 'Pendiente'
  else if (step.state === 'draft') line = 'En borrador'
  else if (step.partial) line = PARTIAL[step.key] || DONE[step.key]
  else line = DONE[step.key] || 'Listo'
  if (one) {
    const parts = [line, formatDate(one.date)]
    if (one.amount != null)
      parts.push(formatMoney(one.amount, one.currency || 'MXN'))
    line = parts.filter(Boolean).join(' · ')
  } else if (docs.length > 1) line = `${line} · ${docs.length} documentos`
  if (step.hidden && !docs.length) line = `${line} (sin permiso para verlo)`
  let to = null
  if (one) {
    to = documentRoute(step.doctype, one.name, {
      boot,
      hint: one.fields?.payment_type
        ? { payment_type: one.fields.payment_type }
        : null,
    })
  } else if (docs.length > 1) {
    const entry = profileFor(step.doctype, { payment_type: 'Receive' })
    if (entry)
      to = listRoute(entry, {
        de: JSON.stringify([
          [step.doctype, 'name', 'in', docs.map((d) => d.name)],
        ]),
        de_label: scopeLabel,
        estado: '',
      })
  }
  return {
    key: step.key,
    label: step.label,
    state: step.partial ? 'partial' : step.state,
    current: !!step.current,
    line,
    to,
  }
}

/** «Capturó Ana López · confirmó Karla Ruiz hoy 12:30» for one document of the chain. */
export function whoLine(entry) {
  const when = entry.confirmed_at ? formatDateTime(entry.confirmed_at) : ''
  if (entry.confirmed_by && entry.created_by === entry.confirmed_by)
    return `${entry.created_by} capturó y confirmó ${when}`.trim()
  const made = entry.created_by ? `Capturó ${entry.created_by}` : ''
  const confirmed = entry.confirmed_by
    ? `confirmó ${entry.confirmed_by} ${when}`.trim()
    : ''
  const line = [made, confirmed].filter(Boolean).join(' · ')
  return line.charAt(0).toUpperCase() + line.slice(1)
}

const CANAL_ICON = {
  tienda: 'lucide-store',
  web: 'lucide-shopping-cart',
  whatsapp: 'lucide-message-circle',
  mercado_libre: 'lucide-shopping-bag',
  mostrador: 'lucide-user-round',
}

/** The attribution's rows: canal, campaña, vendedor (icon rows, Xero style). */
export function attributionRows(data) {
  if (!data?.canal) return []
  const rows = [
    {
      key: 'canal',
      icon: CANAL_ICON[data.canal.kind] || 'lucide-store',
      label: 'Canal',
      value: data.canal.label,
      detail: data.canal.detail || '',
    },
  ]
  const c = data.campana
  if (c && (c.label || c.source)) {
    const detail = [c.source, c.medium].filter(Boolean).join(' / ')
    rows.push({
      key: 'campana',
      icon: 'lucide-target',
      label: 'Campaña',
      value: c.label || detail,
      detail: [
        c.label ? detail : '',
        c.first_touch ? `primer contacto ${formatDate(c.first_touch)}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }
  const v = data.vendedor
  if (v?.people?.length) {
    const team = v.kind === 'equipo'
    rows.push({
      key: 'vendedor',
      icon: v.people.length > 1 ? 'lucide-users' : 'lucide-user-round',
      label: team ? 'Vendedor' : 'Vendedor (quien la capturó)',
      value: v.people
        .map((p) =>
          team && p.percent && p.percent < 100
            ? `${p.name} (${Math.round(p.percent)} %)`
            : p.name,
        )
        .join(', '),
      detail: '',
    })
  }
  return rows
}
