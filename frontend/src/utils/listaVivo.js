// The list page as a shared sheet: what the server announces when a supplier's
// order changes (doco books/catalogs/pedido_vivo.py, event `pedido_catalogo`),
// which rows someone else changed, who is in the order, and each row's price
// story on every supplier's lists (lista_precios.historias). Pure.

import { personName } from '@/utils/display'

export const LIVE_EVENT = 'pedido_catalogo'
export const ORDER_DOCTYPE = 'Pedido Catalogo'
/** How long a row someone else changed stays marked, and the bot shows as present. */
export const FLASH_MS = 12000
export const BOT_PRESENT_MS = 60000

/** Whether an announcement is about this supplier's order. */
export function concerns(event, supplier) {
  return Boolean(event && supplier && event.supplier === supplier)
}

/** Who made a change, or null when it is this page's own tap (the page already
 *  shows it). The assistant acting for this same person is still someone else. */
export function editorOf(event, me) {
  if (!event) return null
  if (event.bot) return { bot: true, name: '', user: event.user || '' }
  if (event.user && event.user === me) return null
  return { bot: false, name: event.by || '', user: event.user || '' }
}

/** [{line, was, now}] of the rows whose quantity differs between two row maps,
 *  leaving out the lines this page is still sending (`skip`). */
export function changedLines(before = {}, after = {}, skip = {}) {
  const names = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ])
  const out = []
  for (const line of names) {
    if (skip && line in skip) continue
    const was = Number(before?.[line]?.qty || 0)
    const now = Number(after?.[line]?.qty || 0)
    if (was !== now) out.push({ line, was, now })
  }
  return out
}

/** The people in the order besides this page's own person, once each. */
export function othersIn(users = [], me = '') {
  return [...new Set((users || []).filter((u) => u && u !== me))]
}

/** A person in the order by name, never by login. The users store answers a
 *  login it has not loaded yet with the login's local part as the full name. */
export function viewerName(user, fullName = '') {
  if (fullName && fullName !== String(user || '').split('@')[0]) return fullName
  return personName(user)
}

/** Two initials from a name. */
export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/u).filter(Boolean)
  if (!parts.length) return '?'
  return (
    parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  ).toUpperCase()
}

/** A row's price story drawn small: this supplier's lists as a line, the other
 *  suppliers' lists as rings, what the shop paid and ordered as dots, on one time
 *  and price scale inside `width` × `height` (with `pad` around). */
export function storyShape(
  points = [],
  { width = 76, height = 26, pad = 3 } = {},
) {
  const usable = (points || []).filter(
    (p) => p && Number.isFinite(Number(p.price)) && p.date,
  )
  if (!usable.length) return null
  const times = usable.map((p) => Date.parse(p.date))
  const prices = usable.map((p) => Number(p.price))
  const [t0, t1] = [Math.min(...times), Math.max(...times)]
  const [p0, p1] = [Math.min(...prices), Math.max(...prices)]
  const x = (t) =>
    t1 === t0 ? width / 2 : pad + ((t - t0) / (t1 - t0)) * (width - 2 * pad)
  const y = (p) =>
    p1 === p0
      ? height / 2
      : height - pad - ((p - p0) / (p1 - p0)) * (height - 2 * pad)
  const at = (p, i) => ({
    x: Math.round(x(times[i]) * 10) / 10,
    y: Math.round(y(Number(p.price)) * 10) / 10,
  })
  const mine = []
  const others = []
  const paid = []
  usable.forEach((p, i) => {
    const spot = at(p, i)
    if (p.source === 'lista' && p.mine) mine.push(spot)
    else if (p.source === 'lista') others.push(spot)
    else paid.push(spot)
  })
  return {
    width,
    height,
    line: mine.map((s) => `${s.x},${s.y}`).join(' '),
    mine,
    others,
    paid,
    low: p0,
    high: p1,
  }
}

/** Whether a row's points make a story worth drawing: prices on two days at least.
 *  The same list read twice on one day is one point. */
export function tellsAStory(points = []) {
  const days = new Set(
    (points || [])
      .filter((p) => p && p.date && Number.isFinite(Number(p.price)))
      .map((p) => String(p.date).slice(0, 10)),
  )
  return days.size > 1
}

/** The newest point of each kind: this supplier's list, the cheapest other
 *  supplier on its latest list, and the last time the shop paid. */
export function storyFacts(points = []) {
  const usable = (points || []).filter((p) => p && p.date)
  const newest = (rows) => rows[rows.length - 1] || null
  const mine = newest(usable.filter((p) => p.source === 'lista' && p.mine))
  const paid = newest(usable.filter((p) => p.source === 'recibo'))
  const latestBy = {}
  for (const p of usable)
    if (p.source === 'lista' && !p.mine) latestBy[p.supplier_name] = p
  const other =
    Object.values(latestBy).sort((a, b) => a.price - b.price)[0] || null
  return { mine, other, paid, count: usable.length }
}

/** Which rows the page asks the price story of: the shown ones without one yet,
 *  at most `limit` (the server's HISTORY_LINES). */
export function storiesToAsk(names = [], have = {}, limit = 60) {
  return names.filter((n) => !(n in (have || {}))).slice(0, limit)
}
