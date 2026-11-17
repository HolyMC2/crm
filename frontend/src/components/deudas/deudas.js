import { call } from 'frappe-ui'
import { LOCALE } from '@/utils/display'

// Deudas y plan de pago (crm docs/DINERO_EN_ORDEN.md §3b-§3c). Server:
// doco.workspaces.deudas (doco/docoutils/books/deudas.py, plan_pago.py).
const SERVICE = 'doco.workspaces.deudas'

export function deudasApi(method, args = {}) {
  const params = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue
    params[key] = typeof value === 'object' ? JSON.stringify(value) : value
  }
  return call(`${SERVICE}.${method}`, params)
}

/** «abr 2028» for the first day of a month (ISO). */
export function monthLabel(iso) {
  if (!iso) return ''
  const [year, month] = String(iso).split('-').map(Number)
  const name = new Intl.DateTimeFormat(LOCALE, { month: 'short' })
    .format(new Date(year, month - 1, 15))
    .replace('.', '')
  return `${name} ${year}`
}

/** «16 meses», «1 mes», «2 años y 3 meses». */
export function durationText(months) {
  if (months === null || months === undefined) return ''
  if (months < 12) return months === 1 ? '1 mes' : `${months} meses`
  const years = Math.floor(months / 12)
  const rest = months % 12
  const y = years === 1 ? '1 año' : `${years} años`
  if (!rest) return y
  return `${y} y ${rest === 1 ? '1 mes' : `${rest} meses`}`
}

export const SOURCE_WORDS = Object.freeze({
  banco: 'según el banco',
  libros: 'según tus libros',
  escrito: 'lo escribiste tú',
  ninguno: 'sin saldo',
})

export const METHODS = Object.freeze([
  { value: 'avalancha', label: 'Tasa más alta primero' },
  { value: 'bola_de_nieve', label: 'La más chica primero' },
])

export const KINDS = Object.freeze([
  { value: 'Credit card', label: 'Tarjeta' },
  { value: 'Loan', label: 'Préstamo' },
  { value: 'Supplier credit', label: 'Proveedor' },
  { value: 'Other', label: 'Otra' },
])

/**
 * The debts as the plan pays them: plan order first (with each one's payoff month),
 * then any the plan does not reach. → [{ ...debt, order, paidOff, months, interest }]
 */
export function orderedDebts(board) {
  const debts = board?.debts || []
  const plan = board?.plan
  if (!plan) return debts.map((d) => ({ ...d, order: null }))
  const byId = new Map(debts.map((d) => [d.name, d]))
  const out = []
  plan.debts.forEach((p, i) => {
    const d = byId.get(p.id)
    if (!d) return
    byId.delete(p.id)
    out.push({
      ...d,
      order: i + 1,
      paidOff: p.paid_off,
      months: p.months,
      interest: p.interest,
      estimatedMinimum: p.estimated_minimum,
    })
  })
  for (const d of byId.values()) out.push({ ...d, order: null })
  return out
}

/** What is missing for the plan to be right: debts without a rate. */
export function missingRates(board) {
  return (board?.debts || []).filter((d) => !d.annual_rate).map((d) => d.title)
}

/** The hero's second line: when the owner is free, or why the plan does not run. */
export function freeText(board) {
  if (!board) return ''
  if (board.problem) return board.problem
  const plan = board.plan
  if (!plan)
    return board.owed > 0
      ? 'Elige cuánto abonas al mes para ver cuándo terminas.'
      : ''
  if (!plan.finished) return 'Con este monto no se termina; súbelo.'
  return `Libre de deudas en ${monthLabel(plan.free_on)} (${durationText(plan.months)})`
}

/** The book's name as the switch shows it. */
export function bookLabel(book) {
  return book.personal ? `${book.company} (personal)` : book.company
}
