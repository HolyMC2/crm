// Tienda › Usuarios y cajas in the owner's words (capability «seats»): what the
// plan includes, the extras bought, how many are in use, and Boat's quote for a
// change (seats_quote) before set_seats applies it. More seats apply now and
// their share rides an invoice; fewer wait for the period's end. Every figure
// is Boat's: this module only reads it back. Pure, except `readSeats`, which
// asks Boat through the seam it is given.
import { dayDiff, parseServerDate } from '@/utils/display'
import { longDate, money } from './autoservicio'

const t = (text, replace) => __(text, replace, 'Cuenta')

export const KEYS = ['users', 'sucursales']
const FIELD = { users: 'extra_users', sucursales: 'extra_sucursales' }
const USED = { users: 'users_used', sucursales: 'sucursales_used' }

function dim(value) {
  return (
    value &&
    typeof value === 'object' &&
    Number.isInteger(value.included) &&
    Number.isInteger(value.extra)
  )
}

/** Whether an answer carries both of Boat's seat dimensions. */
export function hasDims(answer) {
  return answer?.ok === true && dim(answer.users) && dim(answer.sucursales)
}

/**
 * Boat has no read of the extras alone; its quote answers them. Asked for no
 * extra users, it answers the current state, or, while more users are active
 * than the plan includes, how many to deactivate, which with the cap the
 * bootstrap carries names the extras bought; a second quote for exactly those
 * confirms them. Resolves to {quote} or {refusal: Boat's answer}.
 */
export async function readSeats(seam, data) {
  const first = await seam('seats_quote', { extra_users: 0 })
  if (hasDims(first)) return { quote: first }
  const cap = Number(data?.meters?.seats?.max_users) || 0
  const active = first?.active
  const over = first?.deactivate?.users
  if (
    first?.reason === 'seats_in_use' &&
    Number.isInteger(active) &&
    Number.isInteger(over) &&
    cap > 0
  ) {
    const extra = cap - (active - over)
    if (extra > 0) {
      const again = await seam('seats_quote', { extra_users: extra })
      if (hasDims(again) && again.users.extra === extra) return { quote: again }
    }
  }
  return { refusal: first }
}

const NAMES = {
  users: () => [t('Users'), t('user'), t('users')],
  sucursales: () => [t('Registers'), t('register'), t('registers')],
}
/** {label, one, many}: «Usuarios», «usuario», «usuarios». */
export function seatNames(key) {
  const [label, one, many] = (NAMES[key] || NAMES.users)()
  return { label, one, many }
}
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** The extras a dimension will have: a scheduled decrease, else today's. */
export function planned(d) {
  return Number.isInteger(d?.scheduled_extra) ? d.scheduled_extra : d.extra
}

/**
 * One row per dimension: what the plan includes, the extras, in use, its
 * scheduled decrease and Boat's unit price; `limitless` when the plan has no cap.
 */
export function seatRows(quote, data) {
  const local = data?.seats_local || {}
  const pending = quote?.pending?.seats || null
  return KEYS.map((key) => {
    const d = quote[key]
    const [label, one, many] = NAMES[key]()
    const used = Number.isInteger(local[USED[key]]) ? local[USED[key]] : null
    if (!d.included)
      return {
        key,
        label,
        one,
        limitless: true,
        summary: t('No limit on your plan'),
        used: used == null ? '' : t('{0} in use', [used]),
      }
    const later = planned(d)
    const unit = Number(d.unit_price_mxn) || 0
    const on = longDate(pending?.effective_date)
    return {
      key,
      label,
      one,
      limitless: false,
      extra: d.extra,
      planned: later,
      // «Tu plan incluye 2, más 1 caja extra»: no adjective to agree with.
      summary: d.extra
        ? t('Your plan includes {0}, plus {1} extra', [
            d.included,
            count(d.extra, one, many),
          ])
        : t('Your plan includes {0}', [d.included]),
      used: used == null ? '' : t('{0} in use', [used]),
      scheduled:
        later === d.extra
          ? ''
          : on
            ? t('Goes down to {0} extra on {1}', [later, on])
            : t('Goes down to {0} extra at the end of the period', [later]),
      price: unit
        ? t('{0} a month for each extra {1}, IVA included', [money(unit), one])
        : '',
      sold: unit > 0,
      maxTotal: Number(d.max_total) || 0,
    }
  })
}

/**
 * The sheet's title for a target, against the extras the site has today
 * (`extra`) and a decrease already scheduled (`planned`, when it differs):
 * «Agregar 1 usuario», «Quitar 2 cajas»; with a decrease scheduled, a target
 * still under today's count changes that decrease («Bajar a 2 usuarios
 * extra») and today's count drops it («Cancelar la baja programada»).
 */
export function changeTitle(key, extra, to, planned = extra) {
  const [, one, many] = NAMES[key]()
  const scheduled = Number.isInteger(planned) && planned !== extra
  if (to > extra) return t('Add {0}', [count(to - extra, one, many)])
  if (to < extra)
    return scheduled
      ? t('Go down to {0} extra', [count(to, one, many)])
      : t('Remove {0}', [count(extra - to, one, many)])
  return scheduled
    ? t('Cancel the scheduled decrease')
    : t('Users and registers')
}

/**
 * What «Confirmar» does with Boat's quote for one dimension, in the verb its
 * toast repeats: add now, remove today, schedule a decrease for the period's
 * end, or cancel the decrease already scheduled. null when nothing changes.
 */
export function seatAction(key, quote, now = new Date()) {
  if (!quote || quote.ok !== true || !quote.changed) return null
  const d = quote[key]
  if (!dim(d) || !Number.isInteger(d.extra_target)) return null
  const [, one, many] = NAMES[key]()
  const list = (value) => (Array.isArray(value) ? value : [])
  if (list(quote.increase).includes(key)) {
    const n = count(d.extra_target - d.extra, one, many)
    return { label: t('Add {0}', [n]), done: t('You added {0}', [n]) }
  }
  if (list(quote.decrease).includes(key)) {
    const on = parseServerDate(quote.decrease_effective_date)
    if (on && dayDiff(on, now) > 0)
      return {
        label: t('Schedule the decrease'),
        done: t('Decrease scheduled'),
      }
    const n = count(d.extra - d.extra_target, one, many)
    return { label: t('Remove {0}', [n]), done: t('You removed {0}', [n]) }
  }
  return {
    label: t('Cancel the scheduled decrease'),
    done: t('Scheduled decrease cancelled'),
  }
}

/** Whether Boat's quote answers exactly this target (not an older one). */
export function quoteFor(quote, key, target) {
  return quote?.ok === true && quote?.[key]?.extra_target === target
}

/** The payload of a quote or a change: only the dimension that changes. */
export function seatTarget(key, value) {
  return { [FIELD[key]]: value }
}

/**
 * Boat's quote for one change as the sheet reads it: the amount and when it
 * is charged (else the monthly difference), when it applies, and Boat's own
 * sentence, which says the monthly price and what to leave active.
 */
export function seatQuoteView(quote, now = new Date()) {
  if (!quote || quote.ok !== true) return null
  if (!quote.changed)
    return { changed: false, message: quote.message || t('No changes.') }
  const today = Number(quote.charge_now_mxn) || 0
  const delta = Number(quote.monthly_delta_mxn) || 0
  const up = Array.isArray(quote.increase) && quote.increase.length > 0
  const down = Array.isArray(quote.decrease) && quote.decrease.length > 0
  let amount = ''
  let per = ''
  if (today > 0) {
    amount = money(today)
    per =
      quote.charge_on === 'this_invoice'
        ? t('Added to this month’s invoice, IVA included')
        : t(
            'Added to your next invoice for the rest of this month, IVA included',
          )
  } else if (delta) {
    amount = money(Math.abs(delta))
    per =
      delta > 0
        ? t('more a month, IVA included')
        : t('less a month, IVA included')
  }
  const when = []
  if (up) when.push(t('The increase applies today.'))
  if (down) {
    const on = parseServerDate(quote.decrease_effective_date)
    when.push(
      !on
        ? t('The decrease applies when the period ends.')
        : dayDiff(on, now) <= 0
          ? t('The decrease applies today.')
          : t('The decrease applies on {0}, when the period ends.', [
              longDate(on, now),
            ]),
    )
  }
  return {
    changed: true,
    amount,
    per,
    when,
    message: typeof quote.message === 'string' ? quote.message : '',
  }
}
