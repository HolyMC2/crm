// «Avísame…» and «Disparadores» (Shell Wave D, SPEC §6 DD8). The rules live in
// doco (docoutils/assistant/automation/disparadores.py); this file only calls
// them. Personal avisos belong to the session user; the server checks that the
// user can read the record when subscribing and again when the aviso fires.
import { call } from 'frappe-ui'

const API = 'doco.docoutils.assistant.automation.disparadores'

// Records that offer «Avísame…» in their tools sheet (Producto offers the
// stock version separately).
export const AVISAME_DOCTYPES = Object.freeze([
  'Sales Invoice',
  'Sales Order',
  'Quotation',
  'Purchase Order',
  'Material Request',
  'Purchase Invoice',
])

export function offersAvisame(doctype) {
  return doctype === 'Item' || AVISAME_DOCTYPES.includes(doctype)
}

export const avisameOptions = (doctype, name) =>
  call(`${API}.avisame_options`, { doctype, name })
export const avisame = (doctype, name, key, untilDate = null) =>
  call(`${API}.avisame`, { doctype, name, key, until_date: untilDate })
export const avisameStock = (itemCode, warehouse, threshold) =>
  call(`${API}.avisame_stock`, {
    item_code: itemCode,
    warehouse,
    threshold,
  })
export const misAvisos = (doctype = null, name = null) =>
  call(`${API}.mis_avisos`, { doctype, name })
export const quitarAviso = (name) => call(`${API}.quitar`, { name })
export const recetas = () => call(`${API}.recetas`)
export const guardarReceta = (recipe, changes) =>
  call(`${API}.guardar_receta`, {
    recipe,
    ...Object.fromEntries(
      Object.entries(changes).map(([key, value]) => [
        key,
        Array.isArray(value) ? JSON.stringify(value) : value,
      ]),
    ),
  })
export const personas = (txt = '') => call(`${API}.personas`, { txt })

/** The server's message for a failed call, else a plain Spanish fallback. */
export function errorText(
  failure,
  fallback = 'No se pudo guardar. Intenta de nuevo.',
) {
  const messages = failure?.messages || failure?.exc_messages
  if (Array.isArray(messages) && messages.length) return String(messages[0])
  if (
    typeof failure?.message === 'string' &&
    !/^\s*\w+Error\b/.test(failure.message)
  )
    return failure.message
  return fallback
}

/** Today in the browser as YYYY-MM-DD (a date input's min). */
export function todayIso(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** A threshold the user may save: a positive number, at most 2 decimals. */
export function cleanThreshold(value) {
  const number = Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(number) || number <= 0) return null
  return Math.round(number * 100) / 100
}

/** Who gets a team recipe, as short chips: groups, the seller, people. */
export function recipientChips(recipe) {
  const chips = (recipe?.groups || []).map((label) => ({
    key: `g:${label}`,
    label,
  }))
  if (recipe?.seller && recipe.seller_label !== null)
    chips.push({ key: 'seller', label: recipe.seller_label || 'Vendedor' })
  for (const person of recipe?.people || [])
    chips.push({ key: `u:${person.user}`, label: person.name || person.user })
  return chips
}
