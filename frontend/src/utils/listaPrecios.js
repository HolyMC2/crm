// The price-list workbench's pure parts (/crm/compras/lista/:name): which lines
// show under a search, a filter and a section; the tier a quantity reaches; the
// change against the previous list; what the stock reads; the promo sentences'
// numbers; the files a drop or a paste brings. The rows come from
// doco.workspaces.lista_precios.workbench; the words stay in the page.
import { matchTokens } from '@/vendor/muelle-shell/contracts'

/** The filter chips, in the order the page shows them. */
export const FILTERS = Object.freeze([
  'nuevos',
  'subieron',
  'bajaron',
  'promo',
  'pedido',
  'bajo',
])

export const PICTURE_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
])
const PICTURE_EXT = /\.(jpe?g|png|webp)$/i
/** What the page takes in a drop: pictures of the list, a PDF or a sheet. */
export const LIST_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.xlsx,.xls,.ods,.csv'

export function isPicture(file) {
  return (
    PICTURE_TYPES.includes(file?.type) ||
    (!file?.type && PICTURE_EXT.test(file?.name || ''))
  )
}

/** The files of a drop or a file input, pictures first; nothing else is kept. */
export function dropFiles(list) {
  const files = Array.from(list || []).filter((f) => f && f.size > 0)
  const pictures = files.filter(isPicture)
  const documents = files.filter(
    (f) => !isPicture(f) && /\.(pdf|xlsx|xls|ods|csv)$/i.test(f.name || ''),
  )
  return { pictures, documents }
}

/** The pictures inside a paste (⌘V on the page). */
export function pastedPictures(event) {
  const items = Array.from(event?.clipboardData?.items || [])
  return items
    .filter((item) => item.kind === 'file' && PICTURE_TYPES.includes(item.type))
    .map((item) => item.getAsFile())
    .filter(Boolean)
}

/** The tier a quantity reaches: the largest minimum at or under it, the lowest
 *  tier under the first minimum; null without tiers (the server does the same). */
export function activeTier(tiers = [], qty = 0) {
  const rows = [...(tiers || [])]
    .filter((t) => t && t.price !== null && t.price !== undefined)
    .sort((a, b) => (a.min_qty || 1) - (b.min_qty || 1))
  if (!rows.length) return null
  let chosen = rows[0]
  for (const tier of rows) if (Number(qty) >= (tier.min_qty || 1)) chosen = tier
  return chosen
}

/** The tiers as the row prints them: each with whether the quantity reaches it. */
export function tierCells(line, qty = 0) {
  const tiers = line?.tiers?.length
    ? line.tiers
    : line?.price !== null && line?.price !== undefined
      ? [{ min_qty: 1, price: line.price, label: '' }]
      : []
  const active = activeTier(tiers, qty)
  return [...tiers]
    .sort((a, b) => (a.min_qty || 1) - (b.min_qty || 1))
    .map((t) => ({
      min_qty: t.min_qty || 1,
      price: Number(t.price),
      label: t.label || '',
      active: qty > 0 && active === t,
    }))
}

/** The price one more piece would cost now: the active tier's, else the base. */
export function unitPrice(line, qty = 0) {
  const tier = activeTier(line?.tiers, qty)
  return tier ? Number(tier.price) : Number(line?.price || 0)
}

/** How many more pieces reach the next tier, and what it costs there. */
export function nextTier(line, qty = 0) {
  const tiers = [...(line?.tiers || [])].sort(
    (a, b) => (a.min_qty || 1) - (b.min_qty || 1),
  )
  const next = tiers.find((t) => (t.min_qty || 1) > Math.max(1, Number(qty)))
  return next
    ? { missing: (next.min_qty || 1) - Number(qty), price: Number(next.price) }
    : null
}

/** The change against the previous list: kind and the percentage when both
 *  prices exist. */
export function changeOf(line) {
  const change = line?.change
  if (!change) return null
  const { kind, old_price: oldPrice, new_price: newPrice } = change
  let pct = null
  if (oldPrice && newPrice !== null && newPrice !== undefined)
    pct = Math.round(((newPrice - oldPrice) / oldPrice) * 1000) / 10
  return {
    kind,
    oldPrice,
    newPrice,
    pct,
    delta: oldPrice ? newPrice - oldPrice : null,
  }
}

/** The gap to the best price another supplier prints: positive when this list
 *  is dearer. */
export function otherGap(line) {
  if (!line?.other || line.price === null || line.price === undefined)
    return null
  return Math.round((Number(line.price) - Number(line.other.price)) * 100) / 100
}

/** Below its level: what the shop has and has coming is under the level's minimum. */
export function belowLevel(line) {
  if (!line?.level) return false
  const have = Number(line.stock?.have || 0) + Number(line.stock?.ordered || 0)
  return (
    have < Number(line.level.min || 0) ||
    have < Number(line.level.target || 0) * 0.5
  )
}

/** Pieces to the level's target, counting what is coming; 0 without a level. */
export function toTarget(line) {
  if (!line?.level) return 0
  const have = Number(line.stock?.have || 0) + Number(line.stock?.ordered || 0)
  return Math.max(0, Math.round(Number(line.level.target || 0) - have))
}

export function lineFilter(line, filter, row) {
  switch (filter) {
    case 'nuevos':
      return line.change?.kind === 'new'
    case 'subieron':
      return line.change?.kind === 'up'
    case 'bajaron':
      return line.change?.kind === 'down'
    case 'promo':
      return Boolean(line.promo)
    case 'pedido':
      return Boolean(row && row.qty > 0)
    case 'bajo':
      return belowLevel(line)
    default:
      return true
  }
}

/** The words a search matches on a line. */
export function lineText(line) {
  return [
    line.brand,
    line.model,
    line.name1,
    line.code,
    line.storage,
    line.ram,
    line.version,
    line.section,
    line.item_name,
    ...(line.tags || []),
  ]
    .filter(Boolean)
    .join(' ')
}

/** The sections with the lines the search, the filter and the chosen section
 *  leave; empty sections drop out. `promos` marks the lines a promo names. */
export function visibleSections(
  sections = [],
  { search = '', filter = '', section = '', rows = {}, promos = [] } = {},
) {
  const active = (promos || []).filter((p) => p.active !== false)
  return (sections || [])
    .filter((s) => !section || s.name === section)
    .map((s) => ({
      name: s.name,
      lines: s.lines
        .map((line) => ({ ...line, promo: promoFor(line, active) }))
        .filter(
          (line) =>
            matchTokens(search, lineText(line)) &&
            lineFilter(line, filter, rows[line.name]),
        ),
    }))
    .filter((s) => s.lines.length)
}

/** How many lines each filter chip would show, over every section. */
export function filterCounts(sections = [], rows = {}, promos = []) {
  const active = (promos || []).filter((p) => p.active !== false)
  const counts = Object.fromEntries(FILTERS.map((f) => [f, 0]))
  for (const s of sections || [])
    for (const line of s.lines) {
      const marked = { ...line, promo: promoFor(line, active) }
      for (const f of FILTERS)
        if (lineFilter(marked, f, rows[line.name])) counts[f] += 1
    }
  return counts
}

function compact(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/** The first active promo whose brand and model name the line (the server's
 *  `applies` rule): a promo without brand or model names every line. */
export function promoFor(line, promos = []) {
  for (const promo of promos) {
    const brand = compact(promo.brand)
    const model = compact(promo.model)
    const name = compact(line.name1)
    if (brand && brand !== compact(line.brand) && !name.includes(brand))
      continue
    if (model && model !== compact(line.model) && !name.includes(model))
      continue
    if (!brand && !model) continue
    return promo
  }
  return null
}

/** «64GB · 4GB · Nacional · NOM»: the facts of a phone line in one line. */
export function specParts(line) {
  return [
    line.storage,
    line.ram ? (/ram/i.test(line.ram) ? line.ram : `${line.ram} RAM`) : '',
    line.version,
    line.nom ? 'NOM' : '',
    line.collection,
    line.colour,
  ].filter(Boolean)
}

/** The row's total at its tier price (the server's row, else the line's price). */
export function rowTotal(row, line) {
  if (!row || !row.qty) return 0
  const price =
    row.catalog_price !== null && row.catalog_price !== undefined
      ? Number(row.catalog_price)
      : unitPrice(line, row.qty)
  return Math.round(row.qty * price * 100) / 100
}

/** The next quantity after a stepper tap: never under 0, whole pieces. */
export function stepQty(current, delta) {
  return Math.max(0, Math.round(Number(current || 0) + Number(delta)))
}

/**
 * Copy the order's text; false when the browser refuses (no clipboard on plain http,
 * a denied permission), so the sheet keeps the text on screen to copy by hand.
 */
export async function copyText(
  value,
  clipboard = globalThis.navigator?.clipboard,
) {
  if (!value || typeof clipboard?.writeText !== 'function') return false
  try {
    await clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

/**
 * Whether a paid read is still on offer: nothing read yet, or pages the owner picked that
 * no read has written (a page that failed after an earlier one succeeded).
 */
export function canReadMore(catalog = {}, lineCount = 0) {
  if (!['Indexado', 'Listo'].includes(catalog.status) || catalog.reading)
    return false
  return !lineCount || Number(catalog.pages_unread || 0) > 0
}

/** What the sum dock says: pieces and lines in the draft. */
export function draftCounts(rows = {}) {
  const values = Object.values(rows || {}).filter((r) => r.qty > 0)
  return {
    lines: values.length,
    pieces: values.reduce((sum, r) => sum + Number(r.qty), 0),
  }
}

/** Fields of the correction form that differ from the line, as `edit_line` takes them. */
export function changedFields(line, form) {
  const out = {}
  for (const key of [
    'brand',
    'model',
    'storage',
    'ram',
    'version',
    'section',
    'name1',
    'code',
    'note',
  ]) {
    const next = String(form[key] ?? '').trim()
    if (next !== String(line?.[key] ?? '').trim()) out[key] = next
  }
  if (Boolean(form.nom) !== Boolean(line?.nom)) out.nom = Boolean(form.nom)
  const tiers = cleanTiers(form.tiers)
  const before = JSON.stringify(
    (line?.tiers || []).map((t) => [
      t.min_qty || 1,
      Number(t.price),
      t.label || '',
    ]),
  )
  const after = JSON.stringify(tiers.map((t) => [t.min_qty, t.price, t.label]))
  if (tiers.length && before !== after) out.tiers = tiers
  else if (!tiers.length && form.price !== undefined) {
    const price = Number(form.price)
    if (!Number.isNaN(price) && price !== Number(line?.price)) out.price = price
  }
  if (Array.isArray(form.tags)) {
    const tags = form.tags.map((t) => String(t).trim()).filter(Boolean)
    if (JSON.stringify(tags) !== JSON.stringify(line?.tags || []))
      out.tags = tags
  }
  return out
}

/** The tier rows typed in the form that hold a price, sorted, one per minimum. */
export function cleanTiers(rows = []) {
  const byMin = new Map()
  for (const row of rows || []) {
    const price = Number(row?.price)
    if (row?.price === '' || row?.price === null || Number.isNaN(price))
      continue
    const min = Math.max(1, Math.round(Number(row.min_qty) || 1))
    byMin.set(min, {
      min_qty: min,
      price,
      label: String(row.label || '').trim(),
    })
  }
  return [...byMin.values()].sort((a, b) => a.min_qty - b.min_qty)
}

/** The form a line opens with (four tier rows, the last ones blank). */
export function formOf(line = null) {
  const tiers = (line?.tiers || []).map((t) => ({
    min_qty: t.min_qty || 1,
    price: t.price,
    label: t.label || '',
  }))
  while (tiers.length < 4) tiers.push({ min_qty: '', price: '', label: '' })
  return {
    brand: line?.brand || '',
    model: line?.model || '',
    name1: line?.name1 || '',
    code: line?.code || '',
    storage: line?.storage || '',
    ram: line?.ram || '',
    version: line?.version || '',
    nom: Boolean(line?.nom),
    section: line?.section || '',
    price: line?.price ?? '',
    tiers,
    tags: [...(line?.tags || [])],
    note: line?.note || '',
  }
}

/** The fields `add_line_manual` takes from the form: what was typed. */
export function manualFields(form) {
  const out = {}
  for (const key of [
    'brand',
    'model',
    'name1',
    'code',
    'storage',
    'ram',
    'version',
    'section',
    'note',
  ]) {
    const value = String(form[key] ?? '').trim()
    if (value) out[key] = value
  }
  if (form.nom) out.nom = true
  const tiers = cleanTiers(form.tiers)
  if (tiers.length) out.tiers = tiers
  else if (form.price !== '' && form.price !== undefined && form.price !== null)
    out.price = Number(form.price)
  if (Array.isArray(form.tags) && form.tags.length) out.tags = form.tags
  return out
}

/** The history points as the chart draws them: the supplier's list prices as
 *  steps that hold until the next list, the orders and receipts as dots. */
export function historySeries(points = []) {
  const steps = []
  const dots = []
  for (const p of points || []) {
    if (p.price === null || p.price === undefined) continue
    const t = Date.parse(`${p.date}T00:00:00Z`)
    if (Number.isNaN(t)) continue
    const entry = { ...p, t, value: Number(p.price) }
    if (p.source === 'lista') steps.push(entry)
    else dots.push(entry)
  }
  steps.sort((a, b) => a.t - b.t)
  dots.sort((a, b) => a.t - b.t)
  return { steps, dots }
}

const DAY = 86400000

function niceStep(span) {
  const raw = span / 4
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag) return m * mag
  return 10 * mag
}

/** Positions for the history chart: paths, dots, ticks and the month marks. */
export function historyModel(points = [], { width = 320, height = 180 } = {}) {
  const pad = { top: 14, right: 12, bottom: 22, left: 46 }
  const { steps, dots } = historySeries(points)
  const values = [...steps, ...dots].map((p) => p.value)
  if (!values.length)
    return { empty: true, steps: [], dots: [], ticks: [], months: [] }
  const lo0 = Math.min(...values)
  const hi0 = Math.max(...values)
  const step = niceStep(hi0 - lo0 || lo0 * 0.1 || 1)
  const lo = Math.floor((lo0 * 0.97) / step) * step
  const hi = Math.ceil((hi0 * 1.03) / step) * step || lo + step
  const ticks = []
  for (let v = lo; v <= hi + 1e-9 && ticks.length < 8; v += step) ticks.push(v)
  const times = [...steps, ...dots].map((p) => p.t)
  const x0 = Math.min(...times)
  const x1 = Math.max(Math.max(...times), x0 + DAY)
  const sx = (t) =>
    pad.left + ((t - x0) / (x1 - x0)) * (width - pad.left - pad.right)
  const sy = (v) =>
    pad.top + (1 - (v - lo) / (hi - lo || 1)) * (height - pad.top - pad.bottom)
  const stepPoints = steps.map((s) => ({ ...s, x: sx(s.t), y: sy(s.value) }))
  let path = ''
  stepPoints.forEach((s, i) => {
    path += i === 0 ? `M${s.x},${s.y}` : `H${s.x}V${s.y}`
  })
  if (stepPoints.length) path += `H${sx(x1)}`
  const months = []
  const first = new Date(x0)
  let cursor = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)
  while (cursor <= x1 && months.length < 24) {
    if (cursor >= x0) months.push({ t: cursor, x: sx(cursor) })
    const d = new Date(cursor)
    cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
  }
  if (!months.length) months.push({ t: x0, x: sx(x0) })
  return {
    empty: false,
    pad,
    lo,
    hi,
    x0,
    x1,
    steps: stepPoints,
    dots: dots.map((d) => ({ ...d, x: sx(d.t), y: sy(d.value) })),
    path,
    ticks: ticks.map((v) => ({ value: v, y: sy(v) })),
    months,
    timeAt(x) {
      return x0 + ((x - pad.left) / (width - pad.left - pad.right)) * (x1 - x0)
    },
    priceAt(t) {
      let found = null
      for (const s of stepPoints) if (s.t <= t) found = s
      return found ? found.value : null
    },
  }
}

// ── models the list no longer carries ──────────────────────────────────────

/** What the chosen retire rows allow: archive needs no stock on any of them,
 *  delete also needs no purchases or sales on record; `blocked` names the rows
 *  with pieces and `recorded` those with transactions, for the sentence beside
 *  the buttons. */
export function retireChoice(rows = [], picked = {}) {
  const chosen = rows.filter((r) => picked[r.item])
  const blocked = chosen.filter((r) => !r.can_archive)
  const recorded = chosen.filter((r) => r.can_archive && !r.can_delete)
  return {
    items: chosen.map((r) => r.item),
    canArchive: chosen.length > 0 && blocked.length === 0,
    canDelete:
      chosen.length > 0 && blocked.length === 0 && recorded.length === 0,
    blocked: blocked.map((r) => r.item_name || r.item),
    recorded: recorded.map((r) => r.item_name || r.item),
  }
}

/** The rows a sheet shows by default: every pending model chosen, those with
 *  stock left out (they cannot go yet). */
export function retireDefaults(rows = []) {
  const out = {}
  for (const r of rows) if (r.can_archive) out[r.item] = true
  return out
}
