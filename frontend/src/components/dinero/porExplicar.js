import { call } from 'frappe-ui'

// Por explicar (crm docs/DINERO_EN_ORDEN.md §3d). Server: doco.workspaces.por_explicar
// (doco/docoutils/books/por_explicar.py, explicar.py).
const SERVICE = 'doco.workspaces.por_explicar'

export function porExplicarApi(method, args = {}) {
  const params = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue
    params[key] = typeof value === 'object' ? JSON.stringify(value) : value
  }
  return call(`${SERVICE}.${method}`, params)
}

const WITHDRAWAL = 'Withdrawal'

// The answers a movement can take on each side, in the order they are offered.
const SIDE_KINDS = Object.freeze({
  Withdrawal: ['gasto', 'personal', 'traspaso'],
  Deposit: ['traspaso', 'ingreso', 'personal', 'gasto'],
})

/** The answers offered for a group, with their words for that side. */
export function kindsFor(direction) {
  return (SIDE_KINDS[direction] || []).map((kind) => ({
    kind,
    ...kindWords(kind, direction),
  }))
}

/** {label, hint} of an answer; a deposit reads the other way round. */
export function kindWords(kind, direction) {
  const out = direction === WITHDRAWAL
  switch (kind) {
    case 'gasto':
      return out
        ? { label: 'Gasto del negocio', hint: 'Lo pagó el negocio' }
        : { label: 'Devolución de un gasto', hint: 'Te regresaron un pago' }
    case 'personal':
      return out
        ? { label: 'Personal', hint: 'Fue para ti, no para el negocio' }
        : { label: 'Dinero que tú pusiste', hint: 'Lo metiste de tu bolsa' }
    case 'traspaso':
      return out
        ? {
            label: 'Entre mis cuentas',
            hint: 'Pago de tarjeta, retiro a efectivo, otra cuenta tuya',
          }
        : {
            label: 'Entre mis cuentas',
            hint: 'Efectivo que depositaste, dinero de otra cuenta tuya',
          }
    case 'ingreso':
      return { label: 'Ingreso', hint: 'Una venta, un cobro, otro ingreso' }
    default:
      return { label: kind, hint: '' }
  }
}

/** Account → its name, over every answer's list. */
export function accountNames(choices) {
  const names = new Map()
  for (const list of Object.values(choices || {})) {
    for (const a of list || []) names.set(a.account, a.label)
  }
  return names
}

/** Why the guess: the line under «Parece…». */
export function whyText(guess, names) {
  if (!guess) return ''
  const name = names?.get(guess.account) || guess.account
  switch (guess.why) {
    case 'pareja':
      return `El mismo dinero aparece en ${name}: se registra en las dos cuentas.`
    case 'antes':
      return guess.times === 1
        ? 'Así lo explicaste la vez pasada.'
        : `Así lo explicaste las últimas ${guess.times} veces.`
    case 'efectivo':
      return `Depósito en efectivo: sale de ${name}.`
    default:
      return ''
  }
}

/** «Gasto del negocio · Software» */
export function answerText(kind, account, direction, names) {
  const words = kindWords(kind, direction).label
  const name = names?.get(account) || account
  return name ? `${words} · ${name}` : words
}

/** The accounts an answer offers, filtered by what the person typed; most used first. */
export function accountsFor(choices, kind, query = '') {
  const list = choices?.[kind] || []
  const words = normalize(query).split(' ').filter(Boolean)
  if (!words.length) return list
  return list.filter((a) => {
    const text = normalize(`${a.label} ${a.account}`)
    return words.every((w) => text.includes(w))
  })
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The receipt after explaining: what went through and what did not. */
export function receiptText(done, label) {
  const results = done?.results || []
  const ok = results.filter((r) => r.ok)
  const twins = ok.filter((r) => r.twin).length
  const failed = results.length - ok.length
  const parts = []
  if (ok.length) {
    const n = ok.length + twins
    parts.push(
      n === 1
        ? `Listo: 1 movimiento de ${label} explicado.`
        : `Listo: ${n} movimientos de ${label} explicados.`,
    )
  }
  if (failed) {
    parts.push(
      failed === 1
        ? '1 no se pudo: ' + results.find((r) => !r.ok).message
        : `${failed} no se pudieron: ` + results.find((r) => !r.ok).message,
    )
  }
  return parts.join(' ')
}

/** The entries an undo cancels: one per explained movement (a pair shares one). */
export function journalsOf(done) {
  return [
    ...new Set((done?.results || []).filter((r) => r.ok).map((r) => r.journal)),
  ]
}

/** «12 movimientos» */
export function countText(n) {
  return n === 1 ? '1 movimiento' : `${n} movimientos`
}

/** «del 23 oct al 13 nov», or one day. */
export function rangeText(first, last) {
  const fmt = (d) =>
    new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'short',
    })
  if (!first) return ''
  if (!last || first === last) return fmt(first)
  return `del ${fmt(first)} al ${fmt(last)}`
}

// ---------------------------------------------------------------- cash and the reminder

/** The hours the reminder offers, in the evening after closing. */
export const REMIND_HOURS = Object.freeze([18, 19, 20, 21, 22])

/** Days between «¿cuánto hay en la caja?»; 0 never asks. */
export const COUNT_EVERY = Object.freeze([7, 14, 30, 0])

/** «8 de la noche», «6 de la tarde». */
export function hourText(hour) {
  const h = Number(hour)
  if (!Number.isFinite(h)) return ''
  const twelve = h % 12 === 0 ? 12 : h % 12
  if (h < 12) return `${twelve} de la mañana`
  if (h < 19) return `${twelve} de la tarde`
  return `${twelve} de la noche`
}

/** «Cada 7 días», «Nunca». */
export function everyText(days) {
  const n = Number(days)
  if (!n) return 'Nunca'
  return n === 1 ? 'Cada día' : `Cada ${n} días`
}

/** A count against the books: «Cuadra», «Faltan $1,200.00», «Sobran $200.00». */
export function differenceText(difference, fmt) {
  const d = Math.round(Number(difference || 0) * 100) / 100
  if (!d) return 'Cuadra con tus libros'
  return d < 0 ? `Faltan ${fmt(-d)}` : `Sobran ${fmt(d)}`
}

/** The side a difference books like a bank movement: missing money left the cash. */
export function differenceSide(difference) {
  return Number(difference) < 0 ? 'Withdrawal' : 'Deposit'
}

/** «Contada hoy», «Contada hace 9 días», «Nunca contada». */
export function lastCountText(day, today = new Date()) {
  if (!day) return 'Nunca contada'
  const then = new Date(`${day}T12:00:00`)
  const now = new Date(today)
  now.setHours(12, 0, 0, 0)
  const days = Math.round((now - then) / 86400000)
  if (days <= 0) return 'Contada hoy'
  if (days === 1) return 'Contada ayer'
  return `Contada hace ${days} días`
}

/** The day picked for cash spent: today or yesterday, as YYYY-MM-DD. */
export function dayOf(which, today = new Date()) {
  const d = new Date(today)
  if (which === 'ayer') d.setDate(d.getDate() - 1)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
