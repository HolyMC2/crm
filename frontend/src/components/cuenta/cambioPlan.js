// «Cambiar de plan» over Boat's plan_change_quote / change_plan (capability
// «plan_change»): today's amount and on which invoice, the new price in its
// cycle, when the plan and the cycle change, and Boat's own sentence for what
// changes. An upgrade applies today; a cheaper plan, fewer seats or a cycle
// switch wait for the period's end. Every figure is Boat's. Pure.
import { dayDiff, parseServerDate } from '@/utils/display'
import { longDate, money } from './autoservicio'

const t = (text, replace) => __(text, replace, 'Cuenta')

export const CYCLES = ['Mensual', 'Anual']

/** The cycle choice the sheet offers, in the owner's words. */
export function cycleOptions() {
  return [
    { value: 'Mensual', label: t('Monthly') },
    { value: 'Anual', label: t('Yearly') },
  ]
}

// «Tu plan cambia hoy» or «… el 1 de diciembre»; '' without a date.
function changesOn(value, now, today, later) {
  const date = parseServerDate(value)
  if (!date) return ''
  return dayDiff(date, now) <= 0 ? today : later(longDate(date, now))
}

/**
 * Boat's quote for one plan change as the sheet reads it, or null when it is
 * not a quote. `verb` is the confirm button's; none when there is nothing to do.
 */
export function planQuoteView(quote, now = new Date()) {
  if (!quote || quote.ok !== true) return null
  const target = quote.target || {}
  const name = target.plan_name || target.plan || ''
  const message = typeof quote.message === 'string' ? quote.message : ''
  if (!quote.changed) return { changed: false, name, message, verb: '' }
  if (quote.action === 'cancel')
    return {
      changed: true,
      cancel: true,
      name,
      // Boat's sentence is the whole answer: the scheduled change goes away.
      message,
      notes: [],
      amount: '',
      per: '',
      when: [],
      verb: t('Cancel the scheduled change'),
      danger: false,
    }
  const now_ = Number(quote.charge_now_mxn) || 0
  const yearly = (quote.new_cycle || target.cycle) === 'Anual'
  const when = [
    changesOn(
      quote.plan_effective_date,
      now,
      t('Your plan changes today.'),
      (day) => t('Your plan changes on {0}.', [day]),
    ),
    changesOn(
      quote.cycle_effective_date,
      now,
      t('Your billing cycle changes today.'),
      (day) => t('Your billing cycle changes on {0}.', [day]),
    ),
  ].filter(Boolean)
  // What the figures and dates do not say: the plan kept until a later
  // change, the apps a plan brings. Boat's own sentence repeats the rest.
  const notes = []
  const later = parseServerDate(quote.plan_effective_date)
  if (later && dayDiff(later, now) > 0 && quote.current?.plan_name)
    notes.push(t('Until then you keep {0}.', [quote.current.plan_name]))
  if (Array.isArray(quote.installs) && quote.installs.length)
    notes.push(t('We install the plan’s apps; it takes a few minutes.'))
  return {
    changed: true,
    name,
    message: '',
    notes,
    // Today's amount and the invoice it rides; nothing today says so.
    amount: now_ > 0 ? money(now_) : '',
    per:
      now_ > 0
        ? quote.charge_on === 'this_invoice'
          ? t('Added to this month’s invoice, IVA included')
          : t(
              'Added to your next invoice for the rest of the period, IVA included',
            )
        : '',
    nothingToday: now_ <= 0,
    price: Number.isFinite(Number(quote.new_price_mxn))
      ? yearly
        ? t('Then {0} a year, IVA included', [money(quote.new_price_mxn)])
        : t('Then {0} a month, IVA included', [money(quote.new_price_mxn)])
      : '',
    when,
    verb:
      quote.applies === 'scheduled'
        ? t('Schedule the change')
        : t('Change plan'),
    danger: false,
  }
}

/** What the toast says once Boat applied (or scheduled) the change. */
export function planDoneText(answer) {
  if (answer?.installing) return t('We are installing your new plan’s apps.')
  if (answer?.action === 'cancel') return t('Scheduled change cancelled')
  return answer?.applies === 'scheduled'
    ? t('Plan change scheduled')
    : t('Plan changed')
}

/**
 * A plan or cycle change Boat has scheduled for the period's end, read from
 * its quote for the plan and cycle the site has today (Boat answers that one
 * with action «cancel» while something is scheduled, else refuses it): the
 * sentence under the plans, the plan it lands on, the cycle it switches to,
 * and why it waits when Boat says so. null when nothing is scheduled.
 */
export function scheduledPlanView(quote, plans = [], now = new Date()) {
  if (!quote || quote.ok !== true || quote.action !== 'cancel') return null
  const item = quote.pending?.plan
  if (!item || typeof item !== 'object' || (!item.plan && !item.cycle))
    return null
  const on = longDate(item.effective_date, now)
  const name = item.plan
    ? plans.find((row) => row.name === item.plan)?.display || ''
    : ''
  const yearly = item.cycle === 'Anual'
  let text
  if (!on) text = t('You have a change to your plan scheduled.')
  else if (item.plan && !name) text = t('Your plan changes on {0}.', [on])
  else if (item.plan && item.cycle)
    text = yearly
      ? t('You switch to {0} and pay yearly from {1}.', [name, on])
      : t('You switch to {0} and pay monthly from {1}.', [name, on])
  else if (item.plan) text = t('You switch to {0} on {1}.', [name, on])
  else
    text = yearly
      ? t('You pay yearly from {0}.', [on])
      : t('You pay monthly from {0}.', [on])
  const waits =
    typeof item.blocked?.message === 'string' ? item.blocked.message : ''
  return {
    text,
    waits,
    on,
    plan: item.plan || '',
    cycle: item.cycle || '',
  }
}
