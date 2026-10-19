// «Herramientas del asistente» (Shell Wave D, SPEC §6 DD17): what Pregúntale a
// Muelle may do, per tool, edited by the owner. The flags live in doco
// (docoutils/assistant/herramientas); this file only calls them and shapes rows.
import { call } from 'frappe-ui'

const API = 'doco.docoutils.assistant.herramientas.api'

export const listar = () => call(`${API}.herramientas`)
export const guardar = (herramienta, valores) =>
  call(`${API}.guardar`, { herramienta, valores: JSON.stringify(valores) })
export const restablecer = (herramienta) =>
  call(`${API}.guardar`, { herramienta, restablecer: 1 })
export const roles = () => call(`${API}.roles`)

export const GROUP_ORDER = [
  'Registros',
  'Ventas',
  'Compras',
  'Inventario',
  'Finanzas',
  'Fiscal',
  'Acciones',
  'Consultas',
]

export const CHIPS = [
  { value: 'todas', label: 'Todas' },
  { value: 'apagadas', label: 'Apagadas' },
  { value: 'escriben', label: 'Escriben' },
  { value: 'sensibles', label: 'Clientes y fiscal' },
  { value: 'cambiadas', label: 'Cambiadas' },
]

export function matches(row, chip, query) {
  if (chip === 'apagadas' && row.habilitada) return false
  if (chip === 'escriben' && row.efecto === 'lectura') return false
  if (chip === 'sensibles' && !row.categoria) return false
  if (chip === 'cambiadas' && !row.cambiada) return false
  const q = (query || '').trim().toLowerCase()
  if (!q) return true
  // what the owner sees, never the model's description or the tool id
  return [row.titulo, row.resumen, row.grupo]
    .filter(Boolean)
    .some((text) => text.toLowerCase().includes(q))
}

export function chipCounts(rows) {
  const count = (chip) => rows.filter((row) => matches(row, chip, '')).length
  return CHIPS.map((chip) => ({ ...chip, count: count(chip.value) }))
}

export function grouped(rows) {
  const out = new Map()
  for (const row of rows) {
    const key = row.grupo || 'Consultas'
    if (!out.has(key)) out.set(key, [])
    out.get(key).push(row)
  }
  const rank = (group) => {
    const i = GROUP_ORDER.indexOf(group)
    return i === -1 ? GROUP_ORDER.length : i
  }
  return [...out.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([group, items]) => ({ group, items }))
}

// The one supporting line under a tool's title: what it does, then its limits.
export function supporting(row) {
  const bits = []
  if (row.efecto !== 'lectura')
    bits.push(row.requiere_confirmacion ? 'Pide confirmación' : 'Sin tarjeta')
  if (row.roles?.length) bits.push(`Solo: ${row.roles.join(', ')}`)
  if (row.limite_diario) bits.push(`${row.limite_diario} al día`)
  if (!row.permitir_mcp) bits.push('Sin MCP')
  return bits.join(' · ')
}

export const EFECTO_LABEL = {
  lectura: 'Consulta',
  escritura: 'Escribe',
  envío: 'Envía',
}

export function errorText(failure, fallback = 'No se pudo guardar.') {
  const raw =
    failure?.messages?.[0] ||
    failure?.exc_type ||
    failure?.message ||
    String(failure || '')
  const text = String(raw)
    .replace(/<[^>]+>/g, '')
    .trim()
  return text && !/^\w+Error$/.test(text) ? text : fallback
}
