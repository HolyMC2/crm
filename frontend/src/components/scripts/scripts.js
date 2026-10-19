// Scripts de usuario (Shell D12): the owner's calls and sentences for
// /scripts. Pure where it can be, so the words are tested.
import { call } from 'frappe-ui'
import { formatDate } from '@/utils/display'

export { errorText } from '@/documentos/api'

const SERVICE = 'crm.api.scripts'

export function scriptsApi(method, args = {}) {
  const params = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue
    params[key] = typeof value === 'object' ? JSON.stringify(value) : value
  }
  return call(`${SERVICE}.${method}`, params)
}

export const TABS = Object.freeze([
  { value: 'servidor', label: 'Servidor' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'campos', label: 'Campos' },
])
/** The Frappe doctype behind each tab (the assistant's context). */
export const DOCTYPES = Object.freeze({
  servidor: 'Server Script',
  cliente: 'Client Script',
  campos: 'Custom Field',
})
export const PAGE = 50
export const MAX_EXPLAIN_CODE = 6000

// A script is titled by what it applies to («Pedido de venta · el formulario
// del escritorio»); its raw name («Sales Order-doco-storefront-fulfillment»)
// is small meta on the second line. Custom fields keep their label.
function titledByUse(row) {
  return Boolean(!row?.campo && row?.aplica && row?.titulo)
}

/** A row's title: what it applies to, in words. */
export function rowTitle(row) {
  if (titledByUse(row)) return row.aplica
  return row?.titulo || row?.aplica || row?.name || ''
}

/** A row's second line: the script's name (or what a field applies to), then who changed it and when. */
export function rowSubtitle(row) {
  const when = row?.modificado
    ? formatDate(row.modificado, { relative: false })
    : ''
  const who = row?.modificado_por || ''
  const changed = who && when ? `${who}, ${when}` : who || when
  const first = titledByUse(row) ? row.titulo : row?.aplica
  return [first, changed].filter(Boolean).join(' · ')
}

/** The switch's confirm: what turning it on or off means, in words. */
export function toggleCopy(row, { tipo, motorActivo = true } = {}) {
  const on = !row?.activo
  const engineOff =
    tipo === 'servidor' && !motorActivo
      ? ' Ojo: en este sitio los scripts de servidor están apagados; aunque lo actives, no se ejecutará.'
      : ''
  if (on)
    return {
      title: '¿Activar este script?',
      message: `${row?.cuando || 'Se ejecutará cuando le toque.'}${engineOff}`,
      confirm: 'Activar',
      back: 'Volver',
      tone: 'primary',
    }
  return {
    title: '¿Apagar este script?',
    message:
      'Deja de ejecutarse desde ahora. El código se queda guardado y lo puedes volver a activar.',
    confirm: 'Apagar',
    back: 'Volver',
    tone: 'danger',
  }
}

export function saveCopy(detail) {
  return {
    title: '¿Guardar los cambios?',
    message: detail?.activo
      ? `Este script está activo: el cambio cuenta desde ahora. ${detail?.cuando || ''} La versión anterior queda en «Versiones».`.trim()
      : 'Está apagado: guardar no lo activa. La versión anterior queda en «Versiones».',
    confirm: 'Guardar',
    back: 'Seguir editando',
    tone: 'primary',
  }
}

/** The question for «¿Qué hace?»: the code goes with it (cut when very long). */
export function explainPrompt(detail) {
  const code = String(detail?.codigo || '')
  const cut = code.length > MAX_EXPLAIN_CODE
  const lang = detail?.lenguaje === 'python' ? 'python' : 'javascript'
  const lines = [
    'Explica en palabras sencillas qué hace este script y cuándo se ejecuta.',
    '',
    `Script «${detail?.name || ''}» (${detail?.aplica || ''}), ${detail?.activo ? 'activo' : 'apagado'}.`,
    '```' + lang,
    cut ? code.slice(0, MAX_EXPLAIN_CODE) : code,
    '```',
  ]
  if (cut) lines.push('(El código sigue; aquí va solo el principio.)')
  return lines.join('\n')
}

/** The code as numbered lines for the read-only view. */
export function numberedLines(code) {
  const text = String(code ?? '')
  if (!text) return []
  return text
    .replace(/\n$/, '')
    .split('\n')
    .map((line, index) => ({ n: index + 1, text: line }))
}
