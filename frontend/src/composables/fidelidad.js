// «Fidelidad» (Ventas): the shop's promotions and coupons (the register's POS
// Offer and POS Coupon), the points members and the customer groups. The
// server is doco.fidelidad.api; this file holds the words and the date
// arithmetic the page and its quick sheets show, so they are tested without a
// browser.
import { call } from 'frappe-ui'
import { formatDate, formatMoney } from '@/utils/display'

const SERVICE = 'doco.fidelidad.api'

/** A promotion's amounts read whole when they are: «$150», not «$150.00». */
const money = (value, currency) =>
  formatMoney(value, currency, {
    decimals: Number.isInteger(Number(value)) ? 0 : 2,
  })

export function fidelidadApi(method, args = {}) {
  const params = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue
    params[key] =
      typeof value === 'object' && !Array.isArray(value)
        ? JSON.stringify(value)
        : value
  }
  return call(`${SERVICE}.${method}`, params)
}

export const ADJUST_POINTS = 'doco.clientes_frecuentes.api.adjust_points'

/** «10 %», «$50.00», «Regalo», «Precio especial $99.00». */
export function discountLabel(discount, currency = 'MXN') {
  if (!discount) return ''
  if (discount.kind === 'percent') return `${Number(discount.value) || 0} %`
  if (discount.kind === 'amount') return money(discount.value, currency)
  if (discount.kind === 'gift') return __('Free product')
  if (discount.kind === 'points') return __('{0} points', [discount.value])
  return __('Special price {0}', [money(discount.value, currency)])
}

/** What the promotion applies to, as the worker names it. */
export function targetLabel(offer, currency = 'MXN') {
  const target = offer?.target || {}
  if (target.kind === 'ticket') {
    return offer.min_amount
      ? __('The whole ticket from {0}', [money(offer.min_amount, currency)])
      : __('The whole ticket')
  }
  return target.label || target.name || ''
}

/** «10 % · Fundas y Carcasas». */
export function offerSummary(offer, currency = 'MXN') {
  return [
    discountLabel(offer?.discount, currency),
    targetLabel(offer, currency),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** When it runs, in the words that matter today. */
export function offerWhen(offer) {
  if (!offer) return ''
  if (offer.state === 'paused') return __('Paused')
  if (offer.state === 'scheduled')
    return __('Starts {0}', [formatDate(offer.valid_from)])
  if (offer.state === 'ended')
    return __('Ended {0}', [formatDate(offer.valid_upto)])
  if (!offer.valid_upto) return __('No end date')
  if (offer.ends_in === 0) return __('Ends today')
  if (offer.ends_in === 1) return __('Ends tomorrow')
  if (offer.ending_soon) return __('Ends in {0} days', [offer.ends_in])
  return __('Until {0}', [formatDate(offer.valid_upto)])
}

export const OFFER_STATES = Object.freeze({
  live: { label: 'Running', tone: 'success' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  paused: { label: 'Paused', tone: 'neutral' },
  ended: { label: 'Ended', tone: 'neutral' },
})

export function offerChip(offer) {
  if (offer?.ending_soon) return { label: __('Ends soon'), tone: 'warning' }
  const state = OFFER_STATES[offer?.state] || OFFER_STATES.ended
  return { label: __(state.label), tone: state.tone }
}

/** The discount as a table's figure, with what it is under it. */
export function discountFigure(discount, currency = 'MXN') {
  if (!discount) return { value: '', note: '' }
  if (discount.kind === 'percent')
    return { value: `${Number(discount.value) || 0} %`, note: __('Discount') }
  if (discount.kind === 'amount')
    return { value: money(discount.value, currency), note: __('Discount') }
  if (discount.kind === 'gift')
    return {
      value: `${Number(discount.value) || 1}×`,
      note: __('Free product'),
    }
  if (discount.kind === 'points')
    return { value: `+${Number(discount.value) || 0}`, note: __('Points') }
  return { value: money(discount.value, currency), note: __('Special price') }
}

/** A promotion's coupons in one cell: «2 of 5 used», or none needed. */
export function couponLine(offer) {
  if (!offer?.coupon_based) return __('No coupon needed')
  const { issued = 0, used = 0 } = offer.coupons || {}
  return issued ? __('{0} of {1} used', [used, issued]) : __('None given yet')
}

/** The board's figures: what runs, what the coupons did, who collects
 * points and which groups buy at their own prices. */
export function boardFigures(board, groups = null, currency = 'MXN') {
  const counts = board?.counts || {}
  const offers = board?.offers || []
  const program = board?.program
  const coupons = offers.reduce(
    (sum, o) => ({
      issued: sum.issued + (o.coupons?.issued || 0),
      used: sum.used + (o.coupons?.used || 0),
    }),
    { issued: 0, used: 0 },
  )
  const running = counts.live || 0
  const runningHint = counts.ending_soon
    ? __('{0} ending soon', [counts.ending_soon])
    : counts.scheduled
      ? __('{0} scheduled', [counts.scheduled])
      : counts.paused
        ? __('{0} paused', [counts.paused])
        : ''
  const active = program?.state === 'active'
  const priced = (groups || []).filter((g) => g.price_list)
  return [
    {
      key: 'promociones',
      label: __('Promotions running'),
      value: running,
      hint: runningHint,
    },
    {
      key: 'cupones',
      label: __('Coupons used'),
      value: coupons.used,
      hint: coupons.issued
        ? __('of {0} given', [coupons.issued])
        : __('None given yet'),
    },
    {
      key: 'puntos',
      label: __('Points members'),
      value: active ? program.members || 0 : '—',
      hint: !active
        ? __('No points program yet')
        : program.collection_factor
          ? __('1 pt per {0}', [
              formatMoney(program.collection_factor, currency, {
                decimals: 0,
              }),
            ])
          : '',
    },
    {
      key: 'grupos',
      label: __('Groups with their own prices'),
      value: groups ? priced.length : '—',
      hint: groups
        ? __('{0} customers buy at them', [
            priced.reduce((sum, g) => sum + (g.customers || 0), 0),
          ])
        : '',
    },
  ]
}

/** «852 customers · Mayoreo», the group's line in a list row. */
export function groupLine(group) {
  const people = __('{0} customers', [group.customers])
  return group.price_list
    ? `${people} · ${group.price_list}`
    : `${people} · ${__('Default price list')}`
}

/** How it reaches the ticket: by itself, or with a coupon. */
export function offerHow(offer) {
  return offer?.coupon_based
    ? __('With a coupon')
    : __('Applies by itself at the register')
}

export const COUPON_STATES = Object.freeze({
  active: { label: 'Active', tone: 'success' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  used: { label: 'Used', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
})

export function couponChip(coupon) {
  const state = COUPON_STATES[coupon?.state] || COUPON_STATES.expired
  return { label: __(state.label), tone: state.tone }
}

export function couponUses(coupon) {
  const { used = 0, maximum = 0 } = coupon?.uses || {}
  return maximum
    ? __('{0} of {1} uses', [used, maximum])
    : __('{0} uses', [used])
}

// --- dates ---------------------------------------------------------------

function iso(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** The «¿Hasta cuándo?» chips, from `now` (the device's day). */
export function untilChips(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const sunday = new Date(today)
  sunday.setDate(today.getDate() + ((7 - today.getDay()) % 7))
  const week = new Date(today)
  week.setDate(today.getDate() + 7)
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return [
    { value: iso(today), label: __('Today') },
    { value: iso(sunday), label: __('This weekend') },
    { value: iso(week), label: __('7 days') },
    { value: iso(monthEnd), label: __('End of month') },
    { value: 'none', label: __('No end') },
  ]
}

/** «Extender»: more days from the later of today and the current end. */
export function extendChips(offer, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = offer?.valid_upto
    ? new Date(`${offer.valid_upto}T00:00:00`)
    : null
  const from = end && end > today ? end : today
  const plus = (days) => {
    const d = new Date(from)
    d.setDate(from.getDate() + days)
    return iso(d)
  }
  const monthEnd = new Date(from.getFullYear(), from.getMonth() + 1, 0)
  const chips = [
    { value: plus(1), label: __('+1 day') },
    { value: plus(7), label: __('+7 days') },
  ]
  if (iso(monthEnd) > plus(7))
    chips.push({ value: iso(monthEnd), label: __('End of month') })
  chips.push({ value: 'none', label: __('No end') })
  return chips
}

// --- the «Nueva promoción» sheet ------------------------------------------

export const PERCENT_CHIPS = [5, 10, 15, 20, 25, 30]
export const AMOUNT_CHIPS = [50, 100, 200, 300, 500]
export const MINIMUM_CHIPS = [0, 300, 500, 1000]

/** The payload doco.fidelidad.api.create_offer takes, from the sheet's state. */
export function offerPayload(draft) {
  const ticket = draft.target === 'ticket'
  return {
    apply_on: ticket
      ? 'Transaction'
      : draft.target === 'item'
        ? 'Item Code'
        : 'Item Group',
    target: ticket ? '' : draft.pick?.name || '',
    target_label: ticket ? '' : draft.pick?.title || draft.pick?.name || '',
    discount_type:
      draft.kind === 'amount' ? 'Discount Amount' : 'Discount Percentage',
    value: Number(draft.value) || 0,
    min_amount: ticket ? Number(draft.minimum) || 0 : 0,
    valid_upto: draft.until && draft.until !== 'none' ? draft.until : '',
    coupon_based: draft.how === 'coupon',
    title: (draft.title || '').trim(),
  }
}

/** What is still missing before «Iniciar promoción», or ''. */
export function offerMissing(draft) {
  if (draft.target !== 'ticket' && !draft.pick?.name)
    return draft.target === 'item'
      ? __('Choose the product.')
      : __('Choose the category.')
  const value = Number(draft.value) || 0
  if (value <= 0) return __('Choose how much off.')
  if (draft.kind === 'percent' && value > 100)
    return __('A percentage off cannot be more than 100.')
  if (!draft.until) return __('Choose until when.')
  return ''
}

/** The sentence the sheet reads back before starting. */
export function offerPreview(draft, currency = 'MXN') {
  const value = Number(draft.value) || 0
  if (!value) return ''
  const amount = draft.kind === 'amount' ? money(value, currency) : `${value} %`
  const target =
    draft.target === 'ticket'
      ? Number(draft.minimum)
        ? __('the whole ticket from {0}', [money(draft.minimum, currency)])
        : __('the whole ticket')
      : draft.pick?.title || draft.pick?.name || '…'
  const until =
    !draft.until || draft.until === 'none'
      ? __('with no end date')
      : __('until {0}', [formatDate(draft.until)])
  const how =
    draft.how === 'coupon'
      ? __('with a coupon')
      : __('by itself at the register')
  return __('{0} off {1}, {2}, {3}.', [amount, target, until, how])
}

// --- coupons and points ---------------------------------------------------

/** A public code suggested from the promotion's title: «PATRIO10». */
export function suggestCode(title = '') {
  const letters = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const word = letters.find((w) => /[A-Z]/.test(w) && w.length >= 4) || 'PROMO'
  const number = letters.find((w) => /^\d{1,3}$/.test(w)) || ''
  return `${word.slice(0, 12)}${number}`
}

/** The text a seller shares with the customer for a coupon. */
export function couponMessage(coupon, offerTitle) {
  return __('Your coupon {0} for «{1}». Show it at the register.', [
    coupon?.code || '',
    offerTitle || '',
  ])
}

export const POINT_CHIPS = [10, 50, 100, 200]
export const REASON_CHIPS = [
  'Courtesy',
  'Compensation for a problem',
  'Correction',
  'Promotion',
]
