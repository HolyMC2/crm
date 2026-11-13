// The decision card of «Pregúntale a Muelle» (doco books/decision_cards.py,
// asistente S41c): a question the assistant asks about a document (which
// article a line is, which supplier, which warehouse) drawn as a card with the
// line as printed, the matches with their photo, stock and last price, and the
// article «Crear» would make, editable. Pure helpers: which card a message
// carries, what its header says, what an answer sends. No Vue, no network.
import { formatMoney } from '@/utils/display'

export {
  CARD_TYPES,
  answeredLocally,
  cardKey,
  cardOf,
  isPending,
  leadOf,
} from './decisionCardState'

/** «Pregunta 2 de 12» and «3 resueltas»: where this question sits. */
export function progressText(card) {
  const p = card?.progress || {}
  if (!p.total || p.total < 2) return ''
  const where = __('Question {0} of {1}', [p.n, p.total])
  if (!p.done) return where
  return `${where} · ${
    p.done === 1 ? __('1 answered') : __('{0} answered', [p.done])
  }`
}

/** «1 × $1,967.00» and the line's total when it is more than one. */
export function lineFigures(card) {
  const line = card?.line || {}
  const currency = line.currency || 'MXN'
  if (line.qty == null || line.rate == null) return ''
  const each = `${formatQtyNumber(line.qty)} × ${formatMoney(line.rate, currency)}`
  return line.qty > 1 && line.amount != null
    ? `${each} = ${formatMoney(line.amount, currency)}`
    : each
}

function formatQtyNumber(qty) {
  const n = Number(qty)
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '')
}

/** The IMEIs or serial numbers the paper printed under the line. */
export function serialsOf(card) {
  const line = card?.line || {}
  return {
    shown: Array.isArray(line.serials) ? line.serials : [],
    more: Number(line.serials_more) || 0,
  }
}

/** A match's second line: what is on hand and what was last paid. */
export function matchFacts(match, currency = 'MXN') {
  const bits = []
  if (match?.stock != null) {
    bits.push(
      match.stock > 0
        ? __('{0} in stock', [formatQtyNumber(match.stock)])
        : __('None in stock'),
    )
  }
  if (match?.last_price) {
    bits.push(__('last paid {0}', [formatMoney(match.last_price, currency)]))
  }
  if (match?.disabled) bits.push(__('disabled'))
  return bits.join(' · ')
}

/** What the person may change before «Crear»: the proposal as the card shows it. */
export function draftFrom(card) {
  const p = card?.proposal || {}
  return {
    item_name: p.item_name || '',
    item_group: p.item_group || '',
    stock_uom: p.stock_uom || '',
    has_serial: Boolean(p.has_serial),
    image: '',
  }
}

/** The draft's name, trimmed; «Crear» waits for one. */
export function draftName(draft) {
  return String(draft?.item_name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
}

/**
 * What «Crear» sends (doco decision_cards.EDITABLE): every field as it reads on
 * the card, so what the person saw is what gets made; the photo only once it
 * is uploaded.
 */
export function createFields(draft) {
  const fields = {
    item_name: draftName(draft),
    has_serial: Boolean(draft?.has_serial),
  }
  if (draft?.item_group) fields.item_group = draft.item_group
  if (draft?.stock_uom) fields.stock_uom = draft.stock_uom
  if (draft?.image) fields.image = draft.image
  return fields
}

/** The choice an answer sends to decision_apply: { di, op, i?, text?, fields? }. */
export function choiceFor(card, action, value) {
  const di = card.di
  if (action === 'link') return { di, op: 'o', i: value.i }
  if (action === 'code') return { di, op: 'w', text: String(value) }
  if (action === 'write') return { di, op: 'w', text: String(value).trim() }
  if (action === 'create') return { di, op: 'n', fields: createFields(value) }
  if (action === 'new') return { di, op: 'n' }
  if (action === 'skip') return { di, op: 'k' }
  throw new Error(`unknown card action ${action}`)
}

/** What «Crear» makes: the code it takes, or the variant plan that names it. */
export function codeLine(proposal) {
  if (proposal?.plan) return proposal.plan
  if (proposal?.item_code)
    return __('{0} (next free code)', [proposal.item_code])
  return __('Given by the item naming series')
}

const RESULT_ICONS = {
  create: 'lucide-circle-plus',
  link: 'lucide-link',
  skip: 'lucide-skip-forward',
  update: 'lucide-check',
  rename: 'lucide-pencil',
}

/** The answered card's line: what the answer did, as doco wrote it. */
export function resultOf(card) {
  const result = card?.result || {}
  const summary = String(result.summary || card?.subject || '').trim()
  return {
    text: summary ? summary[0].toUpperCase() + summary.slice(1) : '',
    icon: RESULT_ICONS[result.action] || 'lucide-check',
    skipped: card?.status === 'skipped' || result.action === 'skip',
    to:
      result.doctype === 'Item' && result.name
        ? { name: 'Producto', params: { item: result.name } }
        : null,
    name: result.name || '',
  }
}
