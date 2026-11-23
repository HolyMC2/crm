// Fidelidad › «Premios y retos»: products the shop's customers take for points
// (Customer Reward) and challenges that give a coupon or bonus points
// (Customer Challenge). The server is doco.fidelidad.premios_api; this file
// holds the words, the sheets' drafts and what each one sends, so they are
// tested without a browser. The customers see them in their app
// (/cuenta/premios of the online store).
import { call } from 'frappe-ui'
import { LOCALE, formatDate, formatMoney } from '@/utils/display'

export const CTX = 'AppClientes'
const SERVICE = 'doco.fidelidad.premios_api'

export function premiosApi(method, args = {}) {
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

const money = (value, currency) =>
  formatMoney(value, currency, {
    decimals: Number.isInteger(Number(value)) ? 0 : 2,
  })
const count = (n) => new Intl.NumberFormat(LOCALE).format(Number(n) || 0)

// --- state chips and lines --------------------------------------------------

export const STATES = Object.freeze({
  live: { label: 'Running', tone: 'success' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  paused: { label: 'Paused', tone: 'neutral' },
  ended: { label: 'Ended', tone: 'neutral' },
})

export function stateChip(row) {
  if (row?.ending_soon)
    return { label: __('Ends soon', null, CTX), tone: 'warning' }
  const state = STATES[row?.state] || STATES.ended
  return { label: __(state.label, null, CTX), tone: state.tone }
}

/** «Hasta 30 nov», «Pausado», «Empieza 1 dic», «Terminó 30 nov», «Sin fin». */
export function whenLine(row) {
  if (!row) return ''
  if (row.state === 'paused') return __('Paused', null, CTX)
  if (row.state === 'scheduled')
    return __(
      'Starts {0}',
      [formatDate(row.valid_from, { relative: false })],
      CTX,
    )
  if (row.state === 'ended')
    return __(
      'Ended {0}',
      [formatDate(row.valid_upto, { relative: false })],
      CTX,
    )
  if (!row.valid_upto) return __('No end date', null, CTX)
  if (row.ends_in === 0) return __('Ends today', null, CTX)
  return __('Until {0}', [formatDate(row.valid_upto, { relative: false })], CTX)
}

export function pointsText(points) {
  return Number(points) === 1
    ? __('1 point', null, CTX)
    : __('{0} points', [count(points)], CTX)
}

/** The reward's row: «500 puntos · Funda transparente · Hasta 30 nov». */
export function rewardLine(row) {
  return [pointsText(row.points_cost), row.item_name, whenLine(row)]
    .filter(Boolean)
    .join(' · ')
}

/** «2 esperan en caja · 5 canjeados» (nothing when none). */
export function redeemedLine(row) {
  const waiting = row?.redeemed?.reserved || 0
  const used = row?.redeemed?.used || 0
  const parts = []
  if (waiting)
    parts.push(
      waiting === 1
        ? __('1 waiting at the register', null, CTX)
        : __('{0} waiting at the register', [waiting], CTX),
    )
  if (used)
    parts.push(
      used === 1 ? __('1 taken', null, CTX) : __('{0} taken', [used], CTX),
    )
  return parts.join(' · ')
}

/** The goal as the owner set it: «3 compras», «$2,000». */
export function goalText(row, currency = 'MXN') {
  if (row.kind === 'spend') return money(row.target, currency)
  return Number(row.target) === 1
    ? __('1 purchase', null, CTX)
    : __('{0} purchases', [count(row.target)], CTX)
}

/** What completing it gives: «Un café gratis», «+50 puntos». */
export function prizeText(row) {
  if (row.reward_kind === 'points')
    return __('+{0} points', [count(row.reward_points)], CTX)
  return row.reward_text || row.reward_offer_title || ''
}

export function challengeLine(row, currency = 'MXN') {
  return [goalText(row, currency), prizeText(row), whenLine(row)]
    .filter(Boolean)
    .join(' · ')
}

export function awardedLine(row) {
  const n = row?.awarded || 0
  if (!n) return ''
  return n === 1
    ? __('1 customer completed it', null, CTX)
    : __('{0} customers completed it', [n], CTX)
}

// --- the sheets' choices ---------------------------------------------------

export const POINT_CHIPS = [100, 250, 500, 1000]
export const PURCHASE_CHIPS = [3, 5, 10]
export const SPEND_CHIPS = [1000, 2000, 5000]
export const BONUS_CHIPS = [50, 100, 200]
export const CAP_CHIPS = [0, 1, 2]

function iso(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Until when: end of this month, 30 days, 3 months, or no end. */
export function endChips(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const plus = (days) => {
    const d = new Date(today)
    d.setDate(today.getDate() + days)
    return iso(d)
  }
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return [
    { value: '', label: __('No end', null, CTX) },
    { value: iso(monthEnd), label: __('End of month', null, CTX) },
    { value: plus(30), label: __('30 days', null, CTX) },
    { value: plus(90), label: __('3 months', null, CTX) },
  ]
}

export function capChips() {
  return CAP_CHIPS.map((value) => ({
    value,
    label: value
      ? value === 1
        ? __('Once', null, CTX)
        : __('{0} times', [value], CTX)
      : __('No limit', null, CTX),
  }))
}

// --- rewards: draft, check, payload ----------------------------------------

export function blankReward() {
  return {
    name: '',
    title: '',
    item: null,
    points_cost: 500,
    max_per_customer: 0,
    valid_upto: '',
    enabled: true,
    show_to_customers: true,
    description: '',
    stock_note: '',
  }
}

export function rewardDraft(row) {
  if (!row) return blankReward()
  return {
    name: row.name,
    title: row.title || '',
    item: row.item
      ? { name: row.item, title: row.item_name || row.item }
      : null,
    points_cost: row.points_cost,
    max_per_customer: row.max_per_customer || 0,
    valid_upto: row.valid_upto || '',
    enabled: !!row.enabled,
    show_to_customers: row.show_to_customers !== false,
    description: row.description || '',
    stock_note: row.stock_note || '',
  }
}

const whole = (value) => Number.isInteger(Number(value)) && Number(value) > 0

/** What is still missing, said once, or ''. */
export function rewardMissing(draft) {
  if (!draft.item) return __('Choose the product they take.', null, CTX)
  if (!whole(draft.points_cost))
    return __('Write how many points: a whole number above zero.', null, CTX)
  return ''
}

export function rewardPayload(draft, company = '') {
  const title = (draft.title || '').trim() || draft.item?.title || ''
  return {
    ...(draft.name ? { name: draft.name } : {}),
    ...(company && !draft.name ? { company } : {}),
    title,
    item: draft.item?.name || '',
    points_cost: Number(draft.points_cost),
    max_per_customer: Number(draft.max_per_customer) || 0,
    valid_upto: draft.valid_upto || null,
    enabled: !!draft.enabled,
    show_to_customers: !!draft.show_to_customers,
    description: (draft.description || '').trim(),
    stock_note: (draft.stock_note || '').trim(),
  }
}

/** «Así lo ven: Funda transparente por 500 puntos (valen $50).» */
export function rewardPreview(draft, currency = 'MXN', pointValue = 0) {
  const title = (draft.title || '').trim() || draft.item?.title
  if (!title || !whole(draft.points_cost)) return ''
  const worth = Number(pointValue) * Number(draft.points_cost)
  return worth > 0
    ? __(
        'Your customers see: {0} for {1} (worth {2}).',
        [title, pointsText(draft.points_cost), money(worth, currency)],
        CTX,
      )
    : __(
        'Your customers see: {0} for {1}.',
        [title, pointsText(draft.points_cost)],
        CTX,
      )
}

// --- challenges: draft, check, payload --------------------------------------

export function blankChallenge(now = new Date()) {
  return {
    name: '',
    title: '',
    kind: 'purchases',
    target: 3,
    min_ticket: 0,
    item_group: null,
    valid_from: iso(now),
    valid_upto: '',
    reward_kind: 'coupon',
    reward_offer: '',
    reward_points: 50,
    reward_text: '',
    coupon_valid_days: 30,
    enabled: true,
    show_to_customers: true,
    description: '',
  }
}

export function challengeDraft(row, now = new Date()) {
  if (!row) return blankChallenge(now)
  return {
    name: row.name,
    title: row.title || '',
    kind: row.kind === 'spend' ? 'spend' : 'purchases',
    target: row.target,
    min_ticket: row.min_ticket || 0,
    item_group: row.item_group
      ? { name: row.item_group, title: row.item_group }
      : null,
    valid_from: row.valid_from || iso(now),
    valid_upto: row.valid_upto || '',
    reward_kind: row.reward_kind === 'points' ? 'points' : 'coupon',
    reward_offer: row.reward_offer || '',
    reward_points: row.reward_points || 50,
    reward_text: row.reward_text || '',
    coupon_valid_days: row.coupon_valid_days ?? 30,
    enabled: !!row.enabled,
    show_to_customers: row.show_to_customers !== false,
    description: row.description || '',
  }
}

export function challengeMissing(draft) {
  if (!(draft.title || '').trim())
    return __('Write the name your customers read.', null, CTX)
  const target = Number(draft.target)
  if (!(target > 0)) return __('Choose the goal.', null, CTX)
  if (draft.kind === 'purchases' && (!Number.isInteger(target) || target > 100))
    return __('Purchases are a whole number from 1 to 100.', null, CTX)
  if (draft.reward_kind === 'coupon' && !draft.reward_offer)
    return __('Choose the coupon promotion they get.', null, CTX)
  if (draft.reward_kind === 'points' && !whole(draft.reward_points))
    return __('Write how many bonus points they get.', null, CTX)
  return ''
}

export function challengePayload(draft, company = '') {
  return {
    ...(draft.name ? { name: draft.name } : {}),
    ...(company && !draft.name ? { company } : {}),
    title: (draft.title || '').trim(),
    kind: draft.kind,
    target: Number(draft.target),
    min_ticket: Number(draft.min_ticket) || 0,
    item_group: draft.item_group?.name || null,
    valid_from: draft.valid_from || null,
    valid_upto: draft.valid_upto || null,
    reward_kind: draft.reward_kind,
    reward_offer: draft.reward_kind === 'coupon' ? draft.reward_offer : null,
    reward_points:
      draft.reward_kind === 'points' ? Number(draft.reward_points) : 0,
    reward_text: (draft.reward_text || '').trim(),
    coupon_valid_days: Number(draft.coupon_valid_days) || 0,
    enabled: !!draft.enabled,
    show_to_customers: !!draft.show_to_customers,
    description: (draft.description || '').trim(),
  }
}

/** «Así lo ven: Tres compras. Llevas 0 de 3 compras. Premio: Un café gratis.» */
export function challengePreview(draft, currency = 'MXN', offers = []) {
  const title = (draft.title || '').trim()
  if (!title || !(Number(draft.target) > 0)) return ''
  const goal = goalText({ kind: draft.kind, target: draft.target }, currency)
  const offer = offers.find((o) => o.name === draft.reward_offer)
  const prize = prizeText({
    reward_kind: draft.reward_kind,
    reward_points: draft.reward_points,
    reward_text: (draft.reward_text || '').trim(),
    reward_offer_title: offer?.title || '',
  })
  return prize
    ? __(
        'Your customers see: {0}. Goal: {1}. Reward: {2}.',
        [title, goal, prize],
        CTX,
      )
    : __('Your customers see: {0}. Goal: {1}.', [title, goal], CTX)
}

/** The row's next state after an action, shown before the server answers. */
export function afterAction(row, action, today = iso(new Date())) {
  if (action === 'pause') return { ...row, enabled: false, state: 'paused' }
  if (action === 'resume') return { ...row, enabled: true, state: 'live' }
  if (action === 'end') return { ...row, valid_upto: today, ends_in: 0 }
  if (action === 'show') return { ...row, show_to_customers: true }
  if (action === 'hide') return { ...row, show_to_customers: false }
  return row
}

/** The board's lists in the order the owner works them: running first. */
export function byState(rows = []) {
  const order = { live: 0, scheduled: 1, paused: 2, ended: 3 }
  return [...rows].sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9))
}
