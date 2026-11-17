import { call } from 'frappe-ui'
import { LOCALE } from '@/utils/display'

// «¿A dónde va el dinero?» (crm docs/DINERO_EN_ORDEN.md §3b D3). Server:
// doco.workspaces.a_donde_va (doco/docoutils/books/a_donde_va.py, destinos.py).
const SERVICE = 'doco.workspaces.a_donde_va'

export function dineroApi(method, args = {}) {
  const params = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue
    params[key] = value
  }
  return call(`${SERVICE}.${method}`, params)
}

/** «noviembre 2026» for «2026-11». */
export function monthName(key, { short = false } = {}) {
  if (!key) return ''
  const [year, month] = key.split('-').map(Number)
  const name = new Intl.DateTimeFormat(LOCALE, {
    month: short ? 'short' : 'long',
  })
    .format(new Date(year, month - 1, 15))
    .replace('.', '')
  return `${name} ${year}`
}

/** The month before or after «2026-11». */
export function shiftMonth(key, delta) {
  const [year, month] = key.split('-').map(Number)
  const d = new Date(year, month - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function currentMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Against the average of the months before: «+12 % vs tu promedio», «−8 % …»,
 * «igual que tu promedio», or '' when there is no average to compare with.
 */
export function deltaText(amount, average) {
  if (!average) return ''
  const pct = Math.round(((amount - average) / average) * 100)
  if (Math.abs(pct) < 3) return 'igual que tu promedio'
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)} % vs tu promedio`
}

/** Bars: each line's width as a share of the biggest line that is money. */
export function barWidths(lines = []) {
  const max = Math.max(
    0,
    ...lines.filter((l) => !l.not_money).map((l) => l.amount),
  )
  return Object.fromEntries(
    lines.map((l) => [
      l.key,
      max > 0 ? Math.max(2, Math.round((l.amount / max) * 100)) : 0,
    ]),
  )
}

/** The cushion the essential expenses ask for: N months of the fixed average. */
export function cushion(data, months = 3) {
  const base = data?.fixed_average || data?.fixed || 0
  return Math.round(base * months * 100) / 100
}

export const FIXED_CHOICES = Object.freeze([
  { value: '', label: 'Lo que diga su destino' },
  { value: '1', label: 'Sí, es fijo' },
  { value: '0', label: 'No, varía' },
])
