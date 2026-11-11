// Surtido as a shop: a supplier's list browsed like a store, a cart of the lines
// picked, and the order sent from the cart. Pure rules, shared by the page and
// its tests: search (words, or a /pattern/), categories, the shop's own history,
// similar products, the cart's totals and the price minimums it falls short of.
import { matchTokens } from '@/vendor/muelle-shell/contracts/search'

/** What a row is searched by: its name, model, code, category and printed marks. */
const hay = (row) =>
  [
    row.name,
    row.model,
    row.code,
    row.brand,
    row.colour,
    row.category,
    ...(row.printed || []),
  ]
    .filter(Boolean)
    .join(' ')

/**
 * The search box: words in any order («a17 latin»), or a pattern between
 * slashes («/a1[67]/», «/iphone 1[3-5] pro/»), case and accents aside. A pattern
 * that does not compile is searched as words.
 */
export function searchMatcher(query) {
  const q = String(query || '').trim()
  if (!q) return () => true
  const pattern = q.match(/^\/(.+)\/([a-z]*)$/u)
  if (pattern) {
    try {
      const re = new RegExp(fold(pattern[1]), 'iu')
      return (row) => re.test(fold(hay(row)))
    } catch {
      // not a pattern after all: the words inside the slashes
      return (row) => matchTokens(pattern[1], hay(row))
    }
  }
  return (row) => matchTokens(q, hay(row))
}

const fold = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

/** The list's categories in the order it shows them, with how many lines each. */
export function categoriesOf(rows = []) {
  const seen = new Map()
  for (const row of rows) {
    const key = row.category || ''
    if (!key) continue
    seen.set(key, (seen.get(key) || 0) + 1)
  }
  return [...seen].map(([value, count]) => ({ value, label: value, count }))
}

/** The shop's own history of a line: «vendo» it sold, «agotado» it sold and none is left,
 *  «nuevo» the shop never had it. */
export const HISTORY = ['vendo', 'agotado', 'nuevo']
export function historyPasses(row, key) {
  const sold = Number(row?.sold) || 0
  const stock = Number(row?.stock) || 0
  if (key === 'vendo') return sold > 0
  if (key === 'agotado') return sold > 0 && stock <= 0
  if (key === 'nuevo') return sold <= 0 && stock <= 0
  return true
}

/** A printed mark is on the row («pay joy» = «Pay Joy» = «PAYJOY»). */
export function hasMark(row, mark) {
  const want = fold(mark).replace(/[^a-z0-9]+/gu, '')
  return (row?.printed || []).some(
    (p) => fold(p).replace(/[^a-z0-9]+/gu, '') === want,
  )
}

/** The rows the shop shows for the chosen filters, in the list's order. */
export function shownRows(
  rows = [],
  {
    query = '',
    category = '',
    marks = [],
    history = '',
    similarTo = null,
  } = {},
) {
  const match = searchMatcher(query)
  const near = similarTo
    ? new Set(similarRows(rows, similarTo).map((r) => r.line))
    : null
  return rows.filter(
    (row) =>
      (!near || near.has(row.line) || row.line === similarTo.line) &&
      (!category || row.category === category) &&
      marks.every((m) => hasMark(row, m)) &&
      historyPasses(row, history) &&
      match(row),
  )
}

const WORDS = (text) =>
  fold(text)
    .split(/[^a-z0-9]+/u)
    .filter((w) => w.length >= 3)

/**
 * Products like this one: the same model or family first (other colours,
 * qualities, versions), then the same category sharing the most words of the
 * name. At most `limit`, never the row itself.
 */
export function similarRows(rows = [], row, limit = 24) {
  if (!row) return []
  const same = row.family
    ? rows.filter(
        (r) => r.line !== row.line && r.family && r.family === row.family,
      )
    : []
  if (same.length >= limit) return same.slice(0, limit)
  const words = new Set(WORDS(row.name))
  const scored = rows
    .filter(
      (r) =>
        r.line !== row.line && !same.includes(r) && r.category === row.category,
    )
    .map((r) => ({
      r,
      score: WORDS(r.name).filter((w) => words.has(w)).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r)
  return [...same, ...scored].slice(0, limit)
}

/** A list with pictures reads as a grid of cards; a spreadsheet as rows. */
export const pictureShop = (rows = [], pictures = 0) =>
  rows.length > 0 && pictures / rows.length >= 0.3

// ── the cart ──────────────────────────────────────────────────────────────

/** {line: pieces} → the cart's lines with their rows, in the list's order. */
export function cartLines(cart = {}, rows = []) {
  return rows
    .filter((row) => Number(cart[row.line]) > 0)
    .map((row) => ({ ...row, qty: Number(cart[row.line]) }))
}

export function cartTotals(lines = []) {
  return {
    lines: lines.length,
    pieces: lines.reduce((n, l) => n + l.qty, 0),
    total:
      Math.round(
        lines.reduce((s, l) => s + l.qty * (Number(l.price) || 0), 0) * 100,
      ) / 100,
  }
}

/**
 * The prices that ask for more pieces than the cart buys, by category: the
 * pieces asked, the pieces in the cart, and the lines under it. Whether the
 * supplier counts per model or per order is the supplier's to say.
 */
export function cartMinimums(lines = []) {
  const groups = new Map()
  for (const l of lines) {
    const need = Number(l.min_qty) || 1
    if (need <= 1) continue
    const key = `${l.category || ''}|${need}`
    const g = groups.get(key) || {
      category: l.category || '',
      need,
      pieces: 0,
      short: [],
    }
    g.pieces += l.qty
    if (l.qty < need) g.short.push(l)
    groups.set(key, g)
  }
  return [...groups.values()].filter((g) => g.short.length)
}

/** Set a line's pieces; zero or less takes it out. Returns a new cart. */
export function setPieces(cart = {}, line, qty) {
  const next = { ...cart }
  const n = Math.floor(Number(qty) || 0)
  if (n > 0) next[line] = Math.min(n, 9999)
  else delete next[line]
  return next
}

const KEY = 'muelle:surtido:cart:'

export function savedCart(catalog, storage = globalThis.localStorage) {
  try {
    const raw = catalog && storage?.getItem(KEY + catalog)
    const cart = raw ? JSON.parse(raw) : {}
    return cart && typeof cart === 'object' && !Array.isArray(cart) ? cart : {}
  } catch {
    return {}
  }
}

export function saveCart(catalog, cart, storage = globalThis.localStorage) {
  try {
    if (!catalog) return
    if (Object.keys(cart || {}).length)
      storage?.setItem(KEY + catalog, JSON.stringify(cart))
    else storage?.removeItem(KEY + catalog)
  } catch {
    // private mode or a full store: the cart lives until the page closes
  }
}

/** A plan's lines (the suggestion) as a cart. */
export const cartFromPlan = (plan) =>
  Object.fromEntries(
    (plan?.lines || []).map((l) => [l.line, Number(l.qty) || 1]),
  )

// ── what the shop knows of a product ────────────────────────────────────────
const fmt = (n) =>
  Number(n || 0).toLocaleString(undefined, {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  })

/** The margin selling at `selling` what costs `price`, as a whole percent, or null. */
export const marginOf = (price, selling) =>
  Number(selling) > 0 && Number(price) > 0
    ? Math.round(((Number(selling) - Number(price)) / Number(selling)) * 100)
    : null

/**
 * The numbers to decide on a product, in the order an owner reads them: what
 * the shop sold and keeps, what it paid last, what it sells it at and the
 * margin at this list's price, the change since the supplier's previous list,
 * and a cheaper price at another supplier.
 */
export function productFacts(row = {}) {
  const out = [
    {
      label: __('Sold in 12 months', null, 'Surtido'),
      value: String(Number(row.sold) || 0),
    },
    {
      label: __('In stock', null, 'Surtido'),
      value: String(Number(row.stock) || 0),
    },
  ]
  if (row.paid?.rate != null)
    out.push({
      label: __('You paid', null, 'Surtido'),
      value: fmt(row.paid.rate),
      note: row.paid.date || '',
    })
  if (Number(row.selling) > 0) {
    const m = marginOf(row.price, row.selling)
    out.push({
      label: __('You sell it at', null, 'Surtido'),
      value: fmt(row.selling),
    })
    if (m != null)
      out.push({
        label: __('Margin at this price', null, 'Surtido'),
        value: `${m}%`,
        tone: m < 15 ? 'text-ink-amber-7' : 'text-ink-gray-9',
      })
  }
  const change = changeText(row)
  if (change)
    out.push({
      label: __('Since the last list', null, 'Surtido'),
      value: change,
    })
  if (row.other?.price != null && Number(row.other.price) < Number(row.price))
    out.push({
      label: __('Cheaper at', null, 'Surtido'),
      value: fmt(row.other.price),
      note: row.other.supplier_name || '',
      tone: 'text-ink-green-8',
    })
  return out
}

/** The price against the supplier's previous list, in words. */
export function changeText(row = {}) {
  const c = row.change
  if (!c) return ''
  if (c.kind === 'new') return __('New in the list', null, 'Surtido')
  const diff = Math.abs(Number(c.new_price) - Number(c.old_price))
  if (c.kind === 'up') return __('Up {0}', [fmt(diff)], 'Surtido')
  if (c.kind === 'down') return __('Down {0}', [fmt(diff)], 'Surtido')
  return ''
}

/** One quiet line for a product's row: the change, the margin, a cheaper supplier. */
export function productLine(row = {}) {
  const bits = []
  const change = changeText(row)
  if (change) bits.push(change)
  const m = marginOf(row.price, row.selling)
  if (m != null) bits.push(__('margin {0}%', [m], 'Surtido'))
  if (row.other?.price != null && Number(row.other.price) < Number(row.price))
    bits.push(
      __(
        '{0} at {1}',
        [fmt(row.other.price), row.other.supplier_name || ''],
        'Surtido',
      ),
    )
  return bits.join(', ')
}
