import { comprasApi, requestId } from '@/composables/useCompras'

// Compras › En línea: what the business bought through Mercado Pago and Mercado
// Libre (mercadopago_connector brings each purchase in). The screen registers
// them with the same cards the assistant proposes (doco.workspaces.compras_en_linea),
// so a tap and a chat request follow one rule set and share «Deshacer».

const SERVICE = 'doco.workspaces.compras_en_linea'

export function enLineaApi(method, args = {}) {
  return comprasApi(`${SERVICE}.${method}`, args)
}

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

// `value` is the server's state; `label` the scope (context EnLinea).
export const STATES = Object.freeze([
  { value: 'todas', label: 'All' },
  { value: 'por_revisar', label: 'To register', key: 'por revisar' },
  { value: 'registradas', label: 'Registered', key: 'registrada' },
  { value: 'apartadas', label: 'Set aside', key: 'apartada' },
])

export function normalizeState(value) {
  return STATES.some((s) => s.value === value) ? value : 'por_revisar'
}

export function stateTitle(value) {
  return (
    {
      todas: tr('Online purchases', null, 'EnLinea'),
      por_revisar: tr('Online purchases to register', null, 'EnLinea'),
      registradas: tr('Registered online purchases', null, 'EnLinea'),
      apartadas: tr('Online purchases set aside', null, 'EnLinea'),
    }[value] || tr('Online purchases', null, 'EnLinea')
  )
}

// A row's state as the server words it («por revisar», «registrada», «apartada»).
export function stateChip(estado) {
  return (
    {
      'por revisar': {
        label: tr('To register', null, 'EnLinea'),
        tone: 'warning',
      },
      registrada: { label: tr('Registered', null, 'EnLinea'), tone: 'success' },
      apartada: { label: tr('Set aside', null, 'EnLinea'), tone: 'neutral' },
    }[estado] || { label: estado || '', tone: 'neutral' }
  )
}

// What the purchase is: its lines' titles, else what Mercado Pago called it.
export function purchaseTitle(row) {
  const lines = row?.articulos || []
  if (lines.length) return lines.map((l) => l.titulo).join('; ')
  return row?.concepto || row?.tipo || ''
}

export function purchaseSubtitle(row) {
  return [row?.vendedor, row?.fecha ? String(row.fecha).slice(0, 10) : '']
    .filter(Boolean)
    .join(', ')
}

// The card a tap would apply, then the same card applied with one request id
// (a retry after a lost answer reuses it).
export async function previewCard(tool, args) {
  return enLineaApi('preview', { tool, args })
}
export async function applyCard(tool, args, rid = requestId()) {
  return enLineaApi('apply', { tool, args, request_id: rid })
}
export async function undoAction(action) {
  return enLineaApi('undo', { action })
}

// A card line the server refused carries its reason.
export function lineError(line) {
  return line?.error || ''
}
export function acceptableCount(lines) {
  return (lines || []).filter((l) => !l.error).length
}

// The shop purchase card's arguments from the form (registrar_compra_en_linea).
export function shopArgs(purchase, form) {
  return {
    compra_mp: purchase.compra_mp,
    tienda: purchase.tienda,
    almacen: form.almacen || undefined,
    lineas: form.lineas.map((l) =>
      l.articulo
        ? {
            articulo: l.articulo,
            descripcion: l.descripcion,
            cantidad: l.cantidad,
            precio: l.precio,
          }
        : {
            descripcion: l.descripcion,
            nombre: l.nombre,
            grupo: l.grupo || undefined,
            cantidad: l.cantidad,
            precio: l.precio,
          },
    ),
    reparaciones: form.reparaciones.map((r) => r.value),
    tratos: form.tratos.map((t) => t.value),
    sin_seguimiento: true,
  }
}

// The form a reading starts from: each line takes its catalog match, else the
// name and group a new item gets.
export function formFrom(reading) {
  return {
    almacen: '',
    almacenLabel: '',
    lineas: (reading?.articulos || []).map((a) => ({
      descripcion: a.nombre,
      cantidad: a.cantidad || 1,
      precio: a.precio || 0,
      articulo: a.catalogo?.articulo || '',
      articuloLabel: a.catalogo?.nombre || '',
      nombre: a.nuevo?.nombre || a.nombre,
      grupo: a.nuevo?.grupo || '',
    })),
    reparaciones: [],
    tratos: [],
  }
}
