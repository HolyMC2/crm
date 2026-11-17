import { call } from 'frappe-ui'

// Colchón (crm docs/DINERO_EN_ORDEN.md §3b D4). Server: doco.workspaces.colchon
// (doco/docoutils/books/colchon.py, ahorro.py).
const SERVICE = 'doco.workspaces.colchon'

export function colchonApi(method, args = {}) {
  const params = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue
    params[key] = typeof value === 'object' ? JSON.stringify(value) : value
  }
  return call(`${SERVICE}.${method}`, params)
}

export const MONTH_CHOICES = Object.freeze([1, 2, 3, 4, 6, 12])

/** How full the cushion is, 0–100. */
export function fullness(have, need) {
  if (!(need > 0)) return have > 0 ? 100 : 0
  return Math.max(0, Math.min(100, Math.round((have / need) * 100)))
}

/** «0.4 de 3 meses», «3 de 3 meses». */
export function coveredText(covered, goal) {
  if (covered === null || covered === undefined) return ''
  const shown = Math.min(covered, goal)
  return `${String(shown).replace('.0', '')} de ${goal} ${goal === 1 ? 'mes' : 'meses'}`
}

export const SOURCE_WORDS = Object.freeze({
  banco: 'según el banco',
  libros: 'según tus libros',
})

/** The words of each line of the month's plan. */
export function planLabel(key, debt) {
  switch (key) {
    case 'income':
      return 'Entra al mes'
    case 'fixed':
      return 'Gastos fijos'
    case 'variable':
      return 'Gastos que varían'
    case 'minimums':
      return 'Mínimos de tus deudas'
    case 'extra':
      return debt?.first ? `Extra a ${debt.first}` : 'Extra a tus deudas'
    case 'cushion':
      return 'Al colchón'
    case 'goods':
      return 'Mercancía'
    default:
      return key
  }
}

/** A number typed in es-MX («12,500.50», «12500») → 12500.5, or null. */
export function parseAmount(text) {
  const clean = String(text ?? '')
    .replace(/[^\d.,-]/g, '')
    .replace(/,/g, '')
  if (!clean) return null
  const value = Number(clean)
  return Number.isFinite(value) ? value : null
}

/** What a withdrawal takes from, in words: «$4,000.00 del colchón y $2,000.00 del extra». */
export function takeFromText(retiro, format) {
  const words = { cushion: 'del colchón', extra: 'del extra a tus deudas' }
  return (retiro?.from || [])
    .map((part) => `${format(part.amount)} ${words[part.key] || ''}`.trim())
    .join(' y ')
}

/** Two weeks of essential expenses: a small cushion while debts are paid. */
export function starterCushion(essential) {
  return Math.round(((essential || 0) / 2) * 100) / 100
}
