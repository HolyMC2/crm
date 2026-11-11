// Surtido's request in the owner's words: the budget, the marks the list prints
// («Pay Joy», «Telcel»), one of its sections, the shop's item group to count
// sales with, and the models first with their pieces («A16 2, A27 1»). Pure, so
// the page and its tests read the same rules.

const QTY =
  /^(.+?)\s*(?:[x×*]\s*)?\(?\s*(\d{1,3})\s*\)?\s*(?:pz|pzas|piezas)?$/iu

/**
 * «A16 2, A27 (1), iPhone 16 x3, Moto G06» → models first and the pieces the
 * owner named. A number that is the model's own («iPhone 16») stays in the name
 * unless something follows it.
 */
export function parseFocus(text = '') {
  const models = []
  const qty = {}
  for (const raw of String(text).split(/[,;\n]+/u)) {
    const part = raw.trim().replace(/\s+/gu, ' ')
    if (!part) continue
    const hit = part.match(QTY)
    // «iPhone 16» alone: the 16 is the model; «iPhone 16 2», «A16 2» or «A16 (2)»
    // carry pieces (the name has its own number, or x / ( mark the pieces)
    const sep = hit ? part.slice(hit[1].length) : ''
    const pieces =
      hit && (/[x×*(]/u.test(sep) || (/\d/u.test(hit[1]) && /\s/u.test(sep)))
        ? Number(hit[2])
        : 0
    const name = pieces ? hit[1].trim() : part
    if (!name || models.includes(name)) continue
    models.push(name)
    if (pieces > 0) qty[name] = pieces
  }
  return { models: models.slice(0, 8), qty }
}

/** The plan request the page sends (doco.workspaces.sourcing.plan). */
export function planArgs(ask, catalog) {
  const { models, qty } = parseFocus(ask.focus)
  const marks = [...(ask.marks || [])]
  if (ask.section) marks.push(ask.section)
  const terms = String(ask.terms || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  // the pieces the owner named: every line of that model takes them
  const changes = Object.entries(qty).map(([match, n]) => ({
    op: 'qty',
    match,
    qty: n,
  }))
  return {
    budget: Number(ask.budget) || 0,
    catalog,
    months: Number(ask.months) || 12,
    cover_days: Number(ask.cover_days) || 60,
    terms: terms.length ? JSON.stringify(terms) : '',
    focus: models.length ? JSON.stringify(models) : '',
    changes: changes.length ? JSON.stringify(changes) : '',
    marks: marks.length ? JSON.stringify(marks) : '',
    item_group: ask.item_group || '',
    model: String(ask.model || '').trim(),
    colour: String(ask.colour || '').trim(),
    low_stock: ask.low_stock === false ? 0 : 1,
    new_models: ask.new_models === false ? 0 : 1,
    missing: ask.missing ? 1 : 0,
  }
}

/** A plan can be asked: a list with products and a budget above zero. */
export const canPlan = (ask, list) =>
  Boolean(list?.lines) && Number(ask?.budget) > 0

export const DEFAULT_ASK = Object.freeze({
  budget: '',
  marks: [],
  section: '',
  item_group: '',
  focus: '',
  months: 12,
  cover_days: 60,
  terms: '',
  model: '',
  colour: '',
  low_stock: true,
  new_models: true,
  missing: false,
})

const KEY = 'muelle:surtido:ask:'

/** The owner's last request on this list, so coming back keeps it. */
export function savedAsk(catalog, storage = globalThis.localStorage) {
  try {
    const raw = catalog && storage?.getItem(KEY + catalog)
    return raw ? { ...DEFAULT_ASK, ...JSON.parse(raw) } : null
  } catch {
    return null
  }
}

export function saveAsk(catalog, ask, storage = globalThis.localStorage) {
  try {
    if (catalog) storage?.setItem(KEY + catalog, JSON.stringify(ask))
  } catch {
    // private mode or a full store: the request simply is not remembered
  }
}

/** How many of the advanced settings differ from the defaults (the fold's count). */
export function settingsChanged(ask) {
  const keys = [
    'months',
    'cover_days',
    'terms',
    'model',
    'colour',
    'low_stock',
    'new_models',
    'missing',
  ]
  return keys.filter((k) => String(ask?.[k] ?? '') !== String(DEFAULT_ASK[k]))
    .length
}

/** What the list prints on a plan line, with commas: «Latin, 128GB/4GB, Pay Joy». */
export function printedText(line) {
  const name = String(line?.name || '').toLowerCase()
  return (line?.printed || [])
    .filter((b) => b && !name.includes(String(b).toLowerCase()))
    .join(', ')
}

/** A price that asks for more pieces than this line buys. */
export const underMinimum = (line) =>
  Number(line?.min_qty) > 1 && Number(line?.qty) < Number(line.min_qty)
