// Precios (Productos › Precios, `/productos/precios`): many products' selling
// prices against what they cost. The server is doco.workspaces.precios; every
// write goes through Mercado's owner path there. This file holds the words and
// the arithmetic the page shows (margins, suggestions, rounding, bulk rules,
// CSV, the chart), so they are tested without a browser.
import { productosApi, money, priceCheck, requestId } from './useProductos'
import { SOURCE_DOCTYPES } from './preciosLink'

export { money, requestId }
export {
  SOURCE_DOCTYPES,
  SOURCE_NAMES,
  preciosHref,
  sourceName,
} from './preciosLink'

const API = 'doco.workspaces.precios'
export const preciosApi = (method, args = {}) =>
  productosApi(`${API}.${method}`, args)

export const VIEWS = Object.freeze([
  {
    value: 'costo',
    label: 'Costo cambió',
    hint: 'Compraste a otro costo desde que pusiste el precio',
  },
  {
    value: 'sin-precio',
    label: 'Sin precio',
    hint: 'En existencia o comprados, sin precio en la lista',
  },
  {
    value: 'recientes',
    label: 'Cambiaron',
    hint: 'Precios cambiados en los últimos 7 días',
  },
  { value: 'todos', label: 'Todos', hint: 'Todos los productos' },
])
export function viewLabel(value) {
  return VIEWS.find((view) => view.value === value)?.label || ''
}

/** The page's query → where it starts: a document, a list of codes or a view. */
export function startFrom(query = {}) {
  const desde = String(query.desde || '')
  const at = desde.indexOf(':')
  if (at > 0) {
    const doctype = desde.slice(0, at)
    const name = desde.slice(at + 1)
    if (SOURCE_DOCTYPES.includes(doctype) && name)
      return { kind: 'source', doctype, name }
  }
  const codes = String(query.codigos || '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
  if (codes.length)
    return { kind: 'codes', codes: [...new Set(codes)].slice(0, 300) }
  const vista = String(query.vista || '')
  return {
    kind: 'view',
    view: VIEWS.some((view) => view.value === vista) ? vista : '',
  }
}

// ── one row ───────────────────────────────────────────────────────────

export const draftKey = (code, list) => `${code}|${list}`

/** The list's price cell of a row: rate, revision, who may write it. */
export function cellOf(row, list) {
  return row?.prices?.[list] || null
}

/** Units of stock in the price's unit («Caja» = 12 piezas). */
export function factorOf(row, cell) {
  const uom = cell?.uom || row?.stock_uom
  const factor = Number(row?.uoms?.[uom])
  return Number.isFinite(factor) && factor > 0 ? factor : 1
}

/** The cost a price compares to, in the price's unit: this document's, else the last purchase. */
export function costFor(row, cell) {
  const cost = Number(row?.cost?.new)
  if (!Number.isFinite(cost) || cost <= 0) return null
  return cost * factorOf(row, cell)
}

/** The cost when the price was set, in the price's unit. */
export function costAtPrice(row, cell) {
  const cost = Number(row?.cost?.at_price)
  if (!Number.isFinite(cost) || cost <= 0) return null
  return cost * factorOf(row, cell)
}

/** Gross margin over the price, in percent (one decimal), or null. */
export function marginPct(price, cost) {
  const p = Number(price)
  const c = Number(cost)
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(c) || c <= 0)
    return null
  return Math.round(((p - c) / p) * 1000) / 10
}

/** Percent change from `before` to `after` (one decimal), or null. */
export function changePct(after, before) {
  const a = Number(after)
  const b = Number(before)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null
  return Math.round(((a - b) / b) * 1000) / 10
}

// ── rounding ──────────────────────────────────────────────────────────

export const ROUNDINGS = Object.freeze([
  { value: 'centavos', label: 'Sin redondeo' },
  { value: 'peso', label: 'A peso' },
  { value: 'nueve', label: 'Terminar en 9' },
  { value: 'noventa', label: 'Terminar en .90' },
  { value: 'cinco', label: 'De 5 en 5' },
  { value: 'diez', label: 'De 10 en 10' },
])

const cents = (value) => Math.round((value + Number.EPSILON) * 100) / 100

/** Rounds a price up to the shop's habit; never below the value asked for. */
export function roundPrice(value, mode = 'centavos') {
  const v = Number(value)
  if (!Number.isFinite(v) || v <= 0) return null
  const up = (step) => Math.ceil(cents(v) / step - 1e-9) * step
  switch (mode) {
    case 'peso':
      return up(1)
    case 'nueve': {
      const whole = Math.ceil(cents(v) - 1e-9)
      return whole + ((9 - (whole % 10) + 10) % 10)
    }
    case 'noventa': {
      const whole = Math.floor(v)
      const candidate = cents(whole + 0.9)
      return candidate + 1e-9 >= v ? candidate : cents(whole + 1.9)
    }
    case 'cinco':
      return up(5)
    case 'diez':
      return up(10)
    default:
      return cents(v)
  }
}

/** The price that keeps the margin the product had when its price was set. */
export function keepMarginPrice(row, cell, rounding = 'centavos') {
  const now = costFor(row, cell)
  const then = costAtPrice(row, cell)
  const price = Number(cell?.rate)
  if (!now || !then || !(price > 0) || Math.abs(now - then) < 1e-9) return null
  return roundPrice((price * now) / then, rounding)
}

// ── bulk rules ────────────────────────────────────────────────────────

export const RULES = Object.freeze([
  {
    value: 'mantener',
    label: 'Mantener margen',
    hint: 'Sube o baja con el costo nuevo, como estaba',
  },
  {
    value: 'margen',
    label: 'Margen sobre precio',
    hint: 'Que el margen quede en el % que escribas',
    unit: '%',
  },
  {
    value: 'sobre-costo',
    label: 'Costo más %',
    hint: 'El costo más el % que escribas',
    unit: '%',
  },
  {
    value: 'porcentaje',
    label: 'Subir o bajar %',
    hint: 'Del precio de hoy; usa − para bajar',
    unit: '%',
  },
  {
    value: 'otra-lista',
    label: 'Desde otra lista',
    hint: 'El precio de otra lista más o menos un %',
    unit: '%',
  },
])

/**
 * The new price a rule gives one row on `list`, or `{ skip }` with why not.
 * rule = { kind, value, from, rounding }
 */
export function rulePrice(row, list, rule = {}) {
  const cell = cellOf(row, list)
  if (!cell) return { skip: 'Sin esa lista' }
  if (!cell.can_write) return { skip: 'No puedes cambiar esta lista' }
  const value = Number(String(rule.value ?? '').replace('−', '-'))
  const rounding = rule.rounding || 'centavos'
  const rate = Number(cell.rate)
  const cost = costFor(row, cell)
  let next
  switch (rule.kind) {
    case 'mantener': {
      if (!(rate > 0)) return { skip: 'Sin precio actual' }
      const price = keepMarginPrice(row, cell, rounding)
      if (price === null)
        return { skip: 'Sin costo anterior o el costo no cambió' }
      return { price }
    }
    case 'margen':
      if (!cost) return { skip: 'Sin costo' }
      if (!Number.isFinite(value) || value <= 0 || value >= 100)
        return { skip: 'Escribe un margen entre 1 y 99 %' }
      next = cost / (1 - value / 100)
      break
    case 'sobre-costo':
      if (!cost) return { skip: 'Sin costo' }
      if (!Number.isFinite(value) || value < 0)
        return { skip: 'Escribe un % de 0 en adelante' }
      next = cost * (1 + value / 100)
      break
    case 'porcentaje':
      if (!(rate > 0)) return { skip: 'Sin precio actual' }
      if (!Number.isFinite(value) || value <= -100)
        return { skip: 'Escribe un % mayor que −100' }
      next = rate * (1 + value / 100)
      break
    case 'otra-lista': {
      if (rule.from === list) return { skip: 'Elige otra lista' }
      const from = Number(cellOf(row, rule.from)?.rate)
      if (!(from > 0)) return { skip: 'Sin precio en la otra lista' }
      next = from * (1 + (Number.isFinite(value) ? value : 0) / 100)
      break
    }
    default:
      return { skip: 'Elige cómo calcular' }
  }
  const price = roundPrice(next, rounding)
  return price ? { price } : { skip: 'El precio quedaría en cero' }
}

// ── the one fact per row ──────────────────────────────────────────────

/** The chip that says why this row asks for a decision. */
export function signalChip(row) {
  const pct = row?.cost?.change_pct
  const shown = pct === null || pct === undefined ? '' : ` ${Math.abs(pct)} %`
  switch (row?.signal) {
    case 'costo-subio':
      return { label: `Costo subió${shown}`, tone: 'warning' }
    case 'costo-bajo':
      return { label: `Costo bajó${shown}`, tone: 'success' }
    case 'costo-nuevo':
      return { label: 'Primera compra con este precio', tone: 'info' }
    case 'sin-precio':
      return { label: 'Sin precio', tone: 'warning' }
    default:
      return null
  }
}

/** «Costo $182 · al poner el precio $162», in the price's unit. */
export function costLine(row, cell, currency) {
  if (!row?.cost) return ''
  const now = costFor(row, cell)
  const then = costAtPrice(row, cell)
  if (!now) return ''
  const bits = [
    `${row.line?.cost ? 'Costo aquí' : 'Costo'} ${money(now, currency)}`,
  ]
  if (then && Math.abs(now - then) > 1e-9)
    bits.push(`al poner el precio ${money(then, currency)}`)
  return bits.join(' · ')
}

// ── drafts → the save ─────────────────────────────────────────────────

/**
 * What a draft says against its cell: valid, changed, the % and whether it
 * needs the worker's OK (Mercado's large-change and multi-unit rules).
 */
export function draftCheck(cell, value) {
  if (!cell) return { valid: false, changed: false }
  return priceCheck(cell, value)
}

/**
 * `drafts`: Map key → { code, list, value }; `rows`: Map code → row;
 * `acks`: Set of keys the worker OK'd; `keep`: Set of codes «Sigue igual».
 * → { changes, keep, problems } for `precios.save`.
 */
export function savePayload(drafts, rows, acks = new Set(), keep = new Set()) {
  const byItem = new Map()
  const problems = []
  for (const [key, draft] of drafts) {
    const row = rows.get(draft.code)
    const cell = cellOf(row, draft.list)
    const check = draftCheck(cell, draft.value)
    if (!cell || !check.valid || !check.changed) continue
    if (!cell.can_write) {
      problems.push({ key, reason: 'blocked' })
      continue
    }
    if (check.needsAck && !acks.has(key)) {
      problems.push({ key, reason: 'ack' })
      continue
    }
    const entry = byItem.get(draft.code) || {
      item: draft.code,
      prices: {},
      expected: {},
      acknowledged: [],
    }
    entry.prices[draft.list] = Number(draft.value)
    entry.expected[draft.list] =
      cell.rate === null || cell.rate === undefined
        ? null
        : cell.revision || null
    if (check.needsAck) entry.acknowledged.push(draft.list)
    byItem.set(draft.code, entry)
  }
  return {
    changes: [...byItem.values()],
    keep: [...keep].filter((code) => !byItem.has(code)),
    problems,
  }
}

/** The sentence beside the OK a draft needs before it can save. */
export function ackText(cell, check) {
  if (cell?.requires_ack) {
    const units = (cell.impact || []).map((unit) => unit.uom).join(', ')
    return units
      ? `Este precio también cambia las otras presentaciones (${units}). Las revisé.`
      : 'Este precio también cambia las otras presentaciones. Las revisé.'
  }
  return `Es un cambio grande (${check?.percent ?? 0} %). Lo revisé.`
}

/**
 * The review's lines: every changed draft with its price today, the %, the
 * margin it leaves and whether it still needs the worker's OK. Drafts on a
 * list the worker cannot write come back by name in `blocked`.
 */
export function reviewEntries(drafts, rows, acks = new Set()) {
  const entries = []
  const blocked = []
  for (const [key, draft] of drafts) {
    const row = rows.get(draft.code)
    const cell = cellOf(row, draft.list)
    const check = draftCheck(cell, draft.value)
    if (!cell || !check.valid || !check.changed) continue
    if (!cell.can_write) {
      blocked.push(row.item_name)
      continue
    }
    const value = Number(draft.value)
    const before =
      cell.rate === null || cell.rate === undefined ? null : Number(cell.rate)
    entries.push({
      key,
      code: draft.code,
      name: row.item_name,
      list: draft.list,
      before,
      value,
      pct: before === null ? null : changePct(value, before),
      margin: marginPct(value, costFor(row, cell)),
      needsAck: Boolean(check.needsAck),
      acked: acks.has(key),
      ackText: ackText(cell, check),
    })
  }
  return { entries, blocked }
}

/**
 * A parsed CSV against the rows it names → the drafts to write, and what it
 * left alone: prices equal to today's and codes the shop does not have.
 */
export function importDrafts(parsed, rows) {
  const drafts = []
  let same = 0
  const missing = []
  for (const line of parsed?.rows || []) {
    const row = rows.get(line.code)
    if (!row) {
      missing.push(line.code)
      continue
    }
    for (const [list, price] of Object.entries(line.prices)) {
      const cell = cellOf(row, list)
      if (!cell) continue
      if (draftCheck(cell, price).changed)
        drafts.push({ code: row.item_code, list, value: String(price) })
      else same += 1
    }
  }
  return { drafts, same, missing }
}

/** «3 precios nuevos · 2 siguen igual» for the review bar. */
export function pendingLine(changes, kept) {
  const bits = []
  if (changes)
    bits.push(changes === 1 ? '1 precio nuevo' : `${changes} precios nuevos`)
  if (kept) bits.push(kept === 1 ? '1 sigue igual' : `${kept} siguen igual`)
  return bits.join(' · ')
}

/** The worker's next step for a product the save refused. */
export function refusalStep(result) {
  switch (result?.kind) {
    case 'conflict':
      return {
        title: 'Cambió en otro equipo',
        action: 'Comparar con el precio de ahora',
      }
    case 'permission':
      return { title: 'Necesitas autorización', action: 'Pedir el cambio' }
    case 'missing':
      return {
        title: 'Este producto ya no existe',
        action: 'Quitar de la lista',
      }
    default:
      return { title: 'No se guardó', action: 'Revisar el precio' }
  }
}

// ── CSV ───────────────────────────────────────────────────────────────

/** A cell a spreadsheet will never run as a formula. */
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text))
    text = `'${text}`
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const CSV_CODE = 'codigo'

/** Rows → CSV: código, producto, unidad, costo, then one column per list. */
export function toCsv(rows, lists) {
  const head = [CSV_CODE, 'producto', 'unidad', 'costo', ...lists]
  const lines = [head.map(csvCell).join(',')]
  for (const row of rows) {
    const cost = row.cost?.new ?? row.cost?.last ?? ''
    lines.push(
      [
        row.item_code,
        row.item_name,
        row.stock_uom,
        cost === '' || cost === null ? '' : Number(cost).toFixed(2),
        ...lists.map((list) => {
          const rate = cellOf(row, list)?.rate
          return rate === null || rate === undefined
            ? ''
            : Number(rate).toFixed(2)
        }),
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return `${lines.join('\r\n')}\r\n`
}

function splitCsv(text) {
  const first = text.split(/\r?\n/)[0] || ''
  const delimiter =
    (first.match(/;/g) || []).length > (first.match(/,/g) || []).length
      ? ';'
      : ','
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}

const fold = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

/** «$1,234.50» → 1234.5; a comma alone is the decimal («89,90»). */
export function parseAmount(text) {
  let t = String(text ?? '')
    .replace(/[$\s]/g, '')
    .replace(/^'/, '')
  if (!t) return null
  if (t.includes(',') && t.includes('.')) t = t.replace(/,/g, '')
  else if (t.includes(',')) t = t.replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

/**
 * CSV text → { rows: [{ code, prices: { list: rate } }], lists, problems }.
 * The code column is «codigo» (or «código», «item_code»); list columns are
 * matched to the shop's lists by name, accents and case aside.
 */
export function parseCsv(text, lists = []) {
  const table = splitCsv(String(text || '').replace(/^\uFEFF/, ''))
  if (!table.length)
    return { rows: [], lists: [], problems: ['El archivo está vacío.'] }
  const head = table[0].map(fold)
  const codeAt = head.findIndex((h) =>
    ['codigo', 'item_code', 'code', 'sku'].includes(h),
  )
  if (codeAt < 0)
    return {
      rows: [],
      lists: [],
      problems: ['Falta la columna «codigo» en la primera fila.'],
    }
  const columns = []
  for (const list of lists) {
    const at = head.indexOf(fold(list))
    if (at >= 0) columns.push({ list, at })
  }
  if (!columns.length)
    return {
      rows: [],
      lists: [],
      problems: [
        `Ninguna columna se llama como una lista de precios (${lists.join(', ')}).`,
      ],
    }
  const rows = []
  const problems = []
  table.slice(1).forEach((cells, index) => {
    const code = String(cells[codeAt] || '').trim()
    if (!code) return
    const prices = {}
    for (const { list, at } of columns) {
      const value = parseAmount(cells[at])
      if (value === null) continue
      if (!(value > 0)) {
        problems.push(`Fila ${index + 2}: ${list} no es un precio válido.`)
        continue
      }
      prices[list] = Math.round(value * 100) / 100
    }
    if (Object.keys(prices).length) rows.push({ code, prices })
  })
  return { rows, lists: columns.map((c) => c.list), problems }
}

// ── the history chart ─────────────────────────────────────────────────

export const RANGES = Object.freeze([
  { value: 90, label: '3 meses' },
  { value: 180, label: '6 meses' },
  { value: 365, label: '1 año' },
  { value: 730, label: '2 años' },
])

const DAY = 86400000
export const dayOf = (text) => {
  const [y, m, d] = String(text || '')
    .slice(0, 10)
    .split('-')
    .map(Number)
  return Date.UTC(y, (m || 1) - 1, d || 1)
}

/** «Nice» ticks for a money axis: about `count` round steps covering [lo, hi]. */
export function niceTicks(lo, hi, count = 4) {
  if (!(hi > lo)) {
    const pad = Math.max(1, Math.abs(hi) * 0.1)
    lo -= pad
    hi += pad
  }
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)
  const start = Math.floor(lo / step) * step
  const ticks = []
  for (let v = start; v < hi + step - 1e-9; v += step)
    ticks.push(Math.round(v * 100) / 100)
  if (ticks[ticks.length - 1] < hi)
    ticks.push(Math.round((start + ticks.length * step) * 100) / 100)
  return ticks
}

function monthTicks(x0, x1) {
  const out = []
  const start = new Date(x0)
  const months = Math.max(1, Math.round((x1 - x0) / (30 * DAY)))
  const every = months <= 4 ? 1 : months <= 8 ? 2 : months <= 14 ? 3 : 6
  let m = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)
  let i = 0
  while (m < x1) {
    if (i % every === 0) out.push(m)
    const d = new Date(m)
    m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
    i++
  }
  return out
}

/**
 * The chart's geometry in a `width` × `height` box: purchase points (cost per
 * stock unit, in the price's unit), the price's steps on one list from the
 * opening price through each change, and the axis ticks.
 */
export function chartModel(
  history,
  { list, width = 340, height = 200, pad = {} } = {},
) {
  const p = { top: 16, right: 12, bottom: 24, left: 48, ...pad }
  const since = dayOf(history?.since)
  const today = dayOf(history?.today)
  const row = history?.item
  const cell = cellOf(row, list)
  const factor = factorOf(row, cell)
  const purchases = (history?.purchases || []).map((pur) => ({
    ...pur,
    t: dayOf(pur.date),
    value: Number(pur.rate) * factor,
  }))
  const steps = []
  const opening = history?.opening?.[list]
  if (opening) steps.push({ t: since, value: Number(opening) })
  for (const change of history?.changes || []) {
    if (change.price_list !== list || change.new_rate === null) continue
    steps.push({ t: dayOf(change.at), value: Number(change.new_rate), change })
  }
  if (!steps.length && cell?.rate)
    steps.push({ t: since, value: Number(cell.rate) })
  const values = [
    ...purchases.map((x) => x.value),
    ...steps.map((s) => s.value),
  ]
  if (!values.length)
    return { empty: true, points: [], steps: [], ticks: [], months: [] }
  const ticks = niceTicks(Math.min(...values) * 0.9, Math.max(...values) * 1.05)
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]
  const x0 = Math.min(since, ...purchases.map((x) => x.t))
  const x1 = Math.max(today, x0 + DAY)
  const sx = (t) => p.left + ((t - x0) / (x1 - x0)) * (width - p.left - p.right)
  const sy = (v) =>
    p.top + (1 - (v - lo) / (hi - lo || 1)) * (height - p.top - p.bottom)
  const points = purchases.map((x) => ({ ...x, x: sx(x.t), y: sy(x.value) }))
  const stepPoints = steps
    .sort((a, b) => a.t - b.t)
    .map((s) => ({ ...s, x: sx(Math.max(s.t, x0)), y: sy(s.value) }))
  let pricePath = ''
  stepPoints.forEach((s, i) => {
    pricePath += i === 0 ? `M${s.x},${s.y}` : `H${s.x}V${s.y}`
  })
  if (stepPoints.length) pricePath += `H${sx(x1)}`
  const costPath = points
    .map((pt, i) => `${i ? 'L' : 'M'}${pt.x},${pt.y}`)
    .join('')
  return {
    empty: false,
    width,
    height,
    pad: p,
    lo,
    hi,
    x0,
    x1,
    points,
    steps: stepPoints,
    pricePath,
    costPath,
    ticks: ticks.map((v) => ({ value: v, y: sy(v) })),
    months: monthTicks(x0, x1).map((t) => ({ t, x: sx(t) })),
    priceAt(t) {
      let found = null
      for (const s of stepPoints) if (s.t <= t) found = s
      return found ? found.value : null
    },
    timeAt(x) {
      return x0 + ((x - p.left) / (width - p.left - p.right)) * (x1 - x0)
    },
  }
}

/** The window's facts: lowest, highest, average cost (by quantity), the change. */
export function historySummary(history, list) {
  const row = history?.item
  const factor = factorOf(row, cellOf(row, list))
  const purchases = history?.purchases || []
  if (!purchases.length) return null
  const rates = purchases.map((p) => Number(p.rate) * factor)
  const qty = purchases.reduce((sum, p) => sum + Number(p.qty || 0), 0)
  const avg = qty
    ? purchases.reduce(
        (sum, p) => sum + Number(p.rate) * factor * Number(p.qty || 0),
        0,
      ) / qty
    : rates.reduce((a, b) => a + b, 0) / rates.length
  return {
    min: Math.min(...rates),
    max: Math.max(...rates),
    avg: Math.round(avg * 100) / 100,
    change: changePct(rates[rates.length - 1], rates[0]),
    suppliers: new Set(purchases.map((p) => p.supplier).filter(Boolean)).size,
    count: purchases.length,
  }
}

/** Sparkline path of a row's last purchases in a w × h box. */
export function sparkPath(spark = [], w = 64, h = 20) {
  const values = spark.map((p) => Number(p[1])).filter(Number.isFinite)
  if (values.length < 2) return ''
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (w - 4) + 2
      const y = hi === lo ? h / 2 : 2 + (1 - (v - lo) / span) * (h - 4)
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join('')
}
