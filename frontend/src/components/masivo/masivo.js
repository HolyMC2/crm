// Ediciones masivas (Shell D12): the calls and the worker's sentences for the
// selection bar. Pure where it can be, so the words are tested.
import { call } from 'frappe-ui'
import { formatDate } from '@/utils/display'

export { errorText } from '@/documentos/api'

const SERVICE = 'crm.api.masivo'

/** One masivo endpoint (`opciones`, `aplicar`, `deshacer`); objects and arrays go as JSON. */
export function masivoApi(method, args = {}) {
  const params = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue
    params[key] = typeof value === 'object' ? JSON.stringify(value) : value
  }
  return call(`${SERVICE}.${method}`, params)
}

/** A fresh id per confirmed action: a retried POST returns the first result. */
export function newRequestId() {
  const random =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `masivo-${random}`
}

/** «1 factura» / «5 facturas»; the words come from the list («Facturas»). */
export function cuantos(count, { singular = '', plural = '' } = {}) {
  const one = (singular || 'documento').toLowerCase()
  const many = (plural || `${one}s`).toLowerCase()
  return count === 1 ? `1 ${one}` : `${count} ${many}`
}

/** A field's value in words: «Sí», an option's label, «20 oct», «vacío». */
export function valueText(field, value) {
  if (!field) return String(value ?? '')
  if (field.fieldtype === 'Check') return value ? 'Sí' : 'No'
  if (value === null || value === undefined || value === '') return 'vacío'
  if (field.fieldtype === 'Select') {
    const option = (field.options || []).find((o) => o.value === value)
    return option?.label || String(value)
  }
  if (field.fieldtype === 'Date')
    return formatDate(value, { relative: false }) || String(value)
  return String(value)
}

function quoted(list) {
  return list.map((t) => `«${t}»`).join(', ')
}

/**
 * The confirm sheet's copy for a write: { title, message, confirm, back }.
 * ctx: { count, singular, plural, persona, etiquetas, campo, valor, horas }
 */
export function confirmCopy(accion, ctx = {}) {
  const what = cuantos(ctx.count || 0, ctx)
  const undo = ctx.horas
    ? `Puedes deshacerlo durante ${ctx.horas} horas.`
    : 'Puedes deshacerlo al terminar.'
  if (accion === 'asignar')
    return {
      title: `Asignar ${what} a ${ctx.persona}`,
      message: `Le llegan a sus pendientes. ${undo}`,
      confirm: 'Asignar',
      back: 'Volver',
    }
  if (accion === 'etiquetar')
    return {
      title: `Etiquetar ${what} con ${quoted(ctx.etiquetas || [])}`,
      message: undo,
      confirm: 'Etiquetar',
      back: 'Volver',
    }
  if (accion === 'campo') {
    const field = ctx.campo || {}
    const note = field.solo_borrador
      ? 'Solo cambian los borradores; los confirmados se quedan igual y te digo cuáles. '
      : ''
    return {
      title: `Cambiar «${field.label}» a ${valueText(field, ctx.valor)} en ${what}`,
      message: `${note}${undo}`,
      confirm: 'Cambiar',
      back: 'Volver',
    }
  }
  return null
}

/** The snackbar after a write: «Listo: 5 facturas» (+ how many stayed as they were). */
export function doneText(result, ctx = {}) {
  const done = result?.hechos || 0
  const refused = result?.rechazados?.length || 0
  const same = result?.sin_cambio?.length || 0
  if (!done && !refused && same) return 'Nada que cambiar: ya estaban así.'
  if (!done) return `No se cambió ninguno (${cuantos(refused, ctx)}).`
  let text = `Listo: ${cuantos(done, ctx)}`
  if (refused) text += ` · ${refused} sin cambiar`
  return text
}

/** The refused documents as rows: the title in words, the reason under it. */
export function refusedRows(list = []) {
  return list.map((row) => ({
    key: row.name,
    title: row.titulo || row.name,
    subtitle: row.motivo || 'No se pudo cambiar.',
    meta: row.titulo && row.titulo !== row.name ? row.name : '',
  }))
}

/** After «Deshacer»: «Deshecho: 5 facturas» or what could not go back. */
export function undoneText(result, ctx = {}) {
  const back = result?.revertidos || 0
  const failed = result?.fallidos?.length || 0
  if (!failed) return `Deshecho: ${cuantos(back, ctx)}`
  if (!back) return `No se pudo deshacer (${cuantos(failed, ctx)}).`
  return `Deshecho: ${cuantos(back, ctx)} · ${failed} no se pudieron`
}

function query(params) {
  const out = new URLSearchParams()
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== null && value !== '')
      out.set(key, typeof value === 'object' ? JSON.stringify(value) : value)
  return out.toString()
}

/** One PDF with the selected documents (the server drops the ones you may not print). */
export function printUrl(doctype, names, formato = '') {
  return `/api/method/${SERVICE}.imprimir?${query({
    doctype,
    nombres: names,
    formato: formato && formato !== 'Standard' ? formato : '',
  })}`
}

/** The selected documents as an Excel file (the list export, your read permissions). */
export function exportUrl(doctype, names) {
  return `/api/method/${SERVICE}.exportar?${query({ doctype, nombres: names })}`
}

/** The actions in the bar's order, with the icon each uses (icons the shell already ships). */
export const ACTION_ICONS = Object.freeze({
  asignar: 'lucide-user-plus',
  etiquetar: 'lucide-tag',
  campo: 'lucide-pencil',
  imprimir: 'lucide-file-text',
  exportar: 'lucide-file-spreadsheet',
})
export const ACTION_ORDER = [
  'asignar',
  'etiquetar',
  'campo',
  'imprimir',
  'exportar',
]
// One short word each: five fit under their icons at 305px.
export const ACTION_SHORT = Object.freeze({
  asignar: 'Asignar',
  etiquetar: 'Etiqueta',
  campo: 'Cambiar',
  imprimir: 'Imprimir',
  exportar: 'Excel',
})

/** The bar's buttons from the server's options, in order, at most the five known. */
export function barActions(opciones) {
  const byKey = Object.fromEntries(
    (opciones?.acciones || []).map((a) => [a.clave, a]),
  )
  return ACTION_ORDER.filter((key) => byKey[key]).map((key) => ({
    ...byKey[key],
    icon: ACTION_ICONS[key],
    short: ACTION_SHORT[key],
  }))
}

/** The people Asignar offers: no lab/test users («_Test», «_Test'5»). */
export function visiblePeople(people = []) {
  return (people || []).filter(
    (p) => !String(p?.name || p?.user || '').startsWith('_'),
  )
}
