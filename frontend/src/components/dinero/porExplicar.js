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
