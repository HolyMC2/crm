import { call } from 'frappe-ui'
import { formatDate, formatTime } from '@/utils/display'

// Tickets de compra (crm docs/DINERO_EN_ORDEN.md §3f). Server: doco.workspaces.tickets
// (doco/docoutils/books/tickets.py, tickets_leer.py). The page's data comes with Por
// explicar's (`estado.tickets`); every write answers with the whole page.
const SERVICE = 'doco.workspaces.tickets'

export function ticketsApi(method, args = {}) {
  const params = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue
    params[key] = typeof value === 'object' ? JSON.stringify(value) : value
  }
  return call(`${SERVICE}.${method}`, params)
}

// how a ticket says it was paid (the stored words → the worker's)
const WAYS = Object.freeze({
  Cash: 'Efectivo',
  Card: 'Tarjeta',
  Mixed: 'Efectivo y tarjeta',
  Points: 'Puntos',
  Unknown: 'No dice cómo se pagó',
})

export const WAITING = 'To record'
export const WAITING_BANK = 'Waiting for the bank'
export const WITH_BANK = 'With the bank'
export const RECORDED = 'Recorded'
export const SET_ASIDE = 'Set aside'

/** Why a ticket is set aside, in the order they are offered. */
export const REASONS = Object.freeze([
  { key: 'No es del negocio', label: 'No es del negocio' },
  { key: 'Ya está en mis libros', label: 'Ya está en mis libros' },
  { key: 'Está repetido', label: 'Está repetido' },
])

/** An account's name from a {account: label} object or the page's Map. */
export function nameOf(names, account) {
  if (!account) return ''
  const label =
    typeof names?.get === 'function' ? names.get(account) : names?.[account]
  return label || account
}

export function wayText(way) {
  return WAYS[way] || WAYS.Unknown
}

/** «hoy 09:14», «ayer», «21 nov 18:40»: the purchase, without a midnight time. */
export function whenText(value, now = new Date()) {
  const day = formatDate(value, { now })
  if (!day) return ''
  const time = formatTime(value)
  return time && time !== '00:00' ? `${day} ${time}` : day
}

/** The second line of a ticket: what it bought and when. */
export function ticketDetail(t, now = new Date()) {
  return [t?.articulos_texto, whenText(t?.fecha, now)]
    .filter(Boolean)
    .join(' · ')
}

/** Whether one tap books it: its store's account and cash are known, it does not say card,
 *  and its total is the store's usual. */
export function oneTap(t) {
  const s = t?.sugerencia || {}
  return Boolean(
    s.cuenta &&
      s.caja &&
      t.forma_pago !== 'Card' &&
      t.forma_pago !== 'Mixed' &&
      !t.inusual,
  )
}

/** «Va a Café y comida, de Caja fuerte», or what is missing. */
export function suggestionText(t, names = {}) {
  const s = t?.sugerencia || {}
  if (t?.forma_pago === 'Card')
    return 'Dice que fue con tarjeta: espera su cargo del banco.'
  if (t?.forma_pago === 'Mixed')
    return 'Se pagó con efectivo y tarjeta: di cómo registrarlo.'
  if (!s.cuenta) return '¿En qué fue? Dilo una vez y la tienda lo recuerda.'
  const line = `Va a ${nameOf(names, s.cuenta)}${s.caja ? `, de ${nameOf(names, s.caja)}` : ''}`
  if (t.inusual)
    return `${line}. Es más de lo de siempre en esta tienda: revísalo.`
  return s.veces > 1 ? `${line}, como los últimos ${s.veces}.` : `${line}.`
}

/** «Al registrar: Salen $42.00 de Caja fuerte a Café y comida.» */
export function effectText(total, cuenta, caja, names = {}, fmt = String) {
  if (!cuenta || !caja) return ''
  return `Salen ${fmt(total)} de ${nameOf(names, caja)} a ${nameOf(names, cuenta)}.`
}

/** The tickets one tap books together (each with its store's answer). */
export function quickOnes(list) {
  return (list || []).filter(oneTap)
}

/** What a tap did to a ticket, as the done row says it. */
export function doneTitle(kind, t, names = {}, fmt = String) {
  const head = `${t?.tienda || 'Ticket'} ${fmt(t?.total)}`
  switch (kind) {
    case 'registrado':
      return `Registrado: ${head} en ${nameOf(names, t?.cuenta) || 'tus gastos'}`
    case 'tarjeta':
      return `${head}: con tarjeta, espera su cargo del banco`
    case 'apartado':
      return `Apartado: ${head}`
    case 'solo':
      return `Se registró solo: ${head} en ${nameOf(names, t?.cuenta) || 'tus gastos'}`
    default:
      return head
  }
}

/** The offer after the third ticket of a store booked the same way. */
export function aloneOffer(offer, names = {}) {
  if (!offer) return ''
  return `Ya van ${offer.veces} de ${offer.tienda} a ${nameOf(
    names,
    offer.cuenta,
  )}. ¿Registrar solos los que lleguen en efectivo? Los que digan otra cosa o sean más de lo de siempre te siguen preguntando.`
}

/** «Lo de siempre» chips for «Gasté en efectivo»: what each one fills in. */
export function frequentChips(list, names = {}, fmt = String) {
  return (list || []).map((f) => ({
    key: `${f.tienda}|${f.total}|${f.cuenta}`,
    label: `${f.tienda} ${fmt(f.total)}`,
    hint: nameOf(names, f.cuenta),
    fill: {
      amount: String(f.total),
      account: f.cuenta,
      cash: f.caja,
      note: f.nota || f.tienda,
      tags: [...(f.etiquetas || [])],
    },
  }))
}

/** What the waiting tickets need: one tap each, an answer once, or both. */
export function tapLine(count, quick) {
  if (!count) return ''
  if (quick >= count)
    return count === 1
      ? 'Un toque lo registra como gasto en efectivo.'
      : 'Un toque registra cada uno como gasto en efectivo.'
  if (!quick)
    return count === 1
      ? 'Di en qué fue y su tienda lo recuerda.'
      : 'Di en qué fue cada uno y su tienda lo recuerda.'
  return `${quick === 1 ? '1 va' : `${quick} van`} con su cuenta en un toque; los demás, di en qué fueron.`
}

/** The count line of a list: «1 ticket», «3 tickets». */
export function ticketsCount(n) {
  return n === 1 ? '1 ticket' : `${n} tickets`
}
