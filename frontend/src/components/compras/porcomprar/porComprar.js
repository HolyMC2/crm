import { comprasApi, money, qty } from '@/composables/useCompras'

// Compras › Por comprar: Muelle proposes what to buy (doco
// workspaces/por_comprar.py). The server reads; this file groups its lines by
// supplier, sorts them, adds up each block and asks again when two purchases
// were saved at the same moment. Pure helpers, shared with the tests.

const SERVICE = 'doco.workspaces.por_comprar'

function tr(message, replace, context = 'PorComprar') {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

export function pcApi(method, args = {}) {
  return comprasApi(`${SERVICE}.${method}`, args)
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** The answers that asking again solves: the same request still saving
 *  (429), or a purchase that changed while this one was prepared (417
 *  TimestampMismatchError, «Vuelve a intentarlo.»). */
export function asksAgain(error) {
  const status = Number(error?.status)
  if (status === 429) return true
  return status === 417 && error?.exc_type === 'TimestampMismatchError'
}

/** put() with the same request id, asked again quietly up to `tries` times
 *  about `wait` ms apart before the refusal reaches the screen. */
export async function putLines(
  args,
  { api = pcApi, tries = 3, wait = 300 } = {},
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await api('put', args)
    } catch (error) {
      if (attempt >= tries || !asksAgain(error)) throw error
      await pause(wait)
    }
  }
}

export const SORTS = Object.freeze(['alcanza', 'vendido', 'quedan'])

/** The quantity a line shows, in its purchase unit: what the worker typed,
 *  else what its purchase holds, else the proposal. */
export function lineQty(line, typed = {}) {
  if (typed[line.item] !== undefined) return typed[line.item]
  if (line.in_draft) return Number(line.in_draft.qty) || 0
  return Number(line.qty) || 0
}

/** The pill: «Agotado», «mín N» when the minimums ask, else «N días». */
export function pillOf(line) {
  if (line.state === 'agotado')
    return { kind: 'agotado', label: tr('Out of stock') }
  if (line.state === 'min')
    return { kind: 'min', label: tr('min {0}', [qty(line.minimum)]) }
  if (line.cover_days === null || line.cover_days === undefined) return null
  return {
    kind: 'dias',
    label:
      Number(line.cover_days) === 1
        ? tr('1 day')
        : tr('{0} days', [qty(line.cover_days)]),
  }
}

function folded(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** The offer a line buys from: the supplier picked in the sheet (its
 *  home-currency row), else the server's pick. */
export function offerOf(line, picked) {
  const supplier = picked || line.supplier
  if (!supplier) return null
  if (!picked || picked === line.supplier)
    return {
      supplier,
      price: line.price ?? null,
      price_date: line.price_date || null,
      price_source: line.price_source || '',
      price_currency: line.price_currency || '',
      price_stale: Boolean(line.price_stale),
      price_foreign: Boolean(line.price_foreign),
    }
  const row = (line.offers || []).find(
    (o) => o.supplier === supplier && !o.price_extra,
  )
  return row ? { ...row, price: row.price ?? null } : { supplier, price: null }
}

/** One purchase unit's price (the server's is per stock unit). */
export function unitPrice(line, offer) {
  if (!offer || offer.price === null || offer.price === undefined) return null
  return Number(offer.price) * (Number(line.pack) || 1)
}

const URGENT = {
  alcanza: (a, b) => a.rank - b.rank,
  vendido: (a, b) =>
    Number(b.line.sold) - Number(a.line.sold) || a.rank - b.rank,
  quedan: (a, b) =>
    Number(a.line.on_hand) - Number(b.line.on_hand) || a.rank - b.rank,
}

/**
 * The queue as blocks, one per supplier, from the server's lines (most urgent
 * first) and the suppliers picked on screen. «Sin proveedor» goes last. Each
 * block carries its amount before taxes (the draft's own once it has one),
 * the lines «Agregar» would add, and the draft its lines are in.
 */
export function blocksOf(
  queue,
  { picks = {}, typed = {}, struck = [], sort = 'alcanza', search = '' } = {},
) {
  if (!queue?.on) return []
  const labels = new Map((queue.suppliers || []).map((s) => [s.supplier, s]))
  const drafts = new Map((queue.drafts || []).map((d) => [d.supplier, d]))
  const noMoney = Boolean(queue.quantities_only)
  const needle = folded(search).trim()
  const lines = [...(queue.lines || [])]
  // a product hidden on this screen keeps its place until the next visit
  for (const gone of struck)
    if (!lines.some((l) => l.item === gone.line.item))
      lines.splice(Math.min(gone.rank, lines.length), 0, {
        ...gone.line,
        struck: gone,
      })
  const entries = lines.map((line, rank) => {
    const picked = line.in_draft ? null : picks[line.item] || null
    const offer = offerOf(line, picked)
    const supplier = offer?.supplier || ''
    return { line, rank, offer, supplier }
  })
  const shown = needle
    ? entries.filter((e) =>
        [
          e.line.item,
          e.line.item_name,
          e.supplier,
          labels.get(e.supplier)?.label,
        ].some((text) => folded(text).includes(needle)),
      )
    : entries
  const bySupplier = new Map()
  for (const entry of [...shown].sort(URGENT[sort] || URGENT.alcanza)) {
    if (!bySupplier.has(entry.supplier)) bySupplier.set(entry.supplier, [])
    bySupplier.get(entry.supplier).push(entry)
  }
  const blocks = []
  for (const [supplier, group] of bySupplier) {
    const info = labels.get(supplier)
    const added = group.filter((e) => e.line.in_draft && !e.line.struck)
    const draft = added.length ? drafts.get(supplier) || null : null
    const open = group.filter(
      (e) => !e.line.in_draft && !e.line.struck && lineQty(e.line, typed) > 0,
    )
    let amount = null
    if (!noMoney) {
      if (draft && draft.net_total !== undefined && draft.net_total !== null)
        amount = Number(draft.net_total)
      else {
        amount = 0
        for (const e of group) {
          if (e.line.struck || e.offer?.price_foreign) continue
          const price = unitPrice(e.line, e.offer)
          if (price !== null) amount += price * lineQty(e.line, typed)
        }
      }
    }
    blocks.push({
      key: supplier || '__none',
      supplier,
      label: supplier ? info?.label || supplier : '',
      lead: info ? Number(info.lead_days) : Number(queue.lead) || 0,
      leadSource: info?.lead_source || 'ajustes',
      entries: group,
      draft,
      added: added.length,
      total: group.filter((e) => !e.line.struck).length,
      open,
      amount,
      currency: draft?.currency || queue.currency,
    })
  }
  return blocks.sort((a, b) => {
    if (!a.supplier !== !b.supplier) return a.supplier ? -1 : 1
    return 0
  })
}

/** What the title adds to the documents: proposed products not yet added. */
export function proposedCount(queue) {
  if (!queue?.on) return 0
  return (queue.lines || []).filter((l) => l.proposed && !l.in_draft).length
}

/** The drafts the queue shows as blocks: the list below leaves them out. */
export function draftsShown(queue) {
  const orders = new Set()
  for (const line of queue?.lines || [])
    if (line.in_draft?.order) orders.add(line.in_draft.order)
  return orders
}

/** «3 nov», with the year when it is not this year. */
export function shortDay(value, today = new Date()) {
  const day = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ''
  const [year, month, date] = day.split('-').map(Number)
  const lang =
    (typeof window !== 'undefined' && window.frappe?.boot?.lang) || undefined
  return new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'short',
    ...(year !== today.getFullYear() ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, date)))
}

export function sourceLabel(source) {
  return (
    {
      lista: tr('List'),
      compra: tr('Purchase'),
      precio: tr('Price list'),
    }[source] || ''
  )
}

export function priceText(value, currency) {
  return value === null || value === undefined ? '' : money(value, currency)
}

export function daysText(days) {
  return Number(days) === 1 ? tr('1 day') : tr('{0} days', [qty(days)])
}
