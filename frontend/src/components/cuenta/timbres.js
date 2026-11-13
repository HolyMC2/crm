// Tienda › CFDI in the owner's words (capability «stamp_packages»): the stamp
// package held and this month's stamps (bootstrap.stamp_packages), the ladder
// Boat's catalog sells with the price per stamp, and Boat's quote for a change
// (stamp_package_quote) before toggle_addon applies it. More stamps apply
// today and this month's difference is charged; fewer wait for the period's
// end; turning CFDI on charges the month it is ready whole. Every figure,
// price, date and rule is Boat's: this module only reads it back. Pure.
import { LOCALE, dayDiff, parseServerDate } from '@/utils/display'
import { longDate, money } from './autoservicio'

const t = (text, replace) => __(text, replace, 'Cuenta')
const whole = (value) => (Number.isInteger(value) ? value : null)
const STATES = ['active', 'kept', 'off']

/** The add-on whose packages these are (Boat's billable service). */
export const STAMPS_ADDON = 'cfdi_timbres'

/** «1,000»: whole stamps, as the meters show them. */
export const stamps = (value) =>
  new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(
    Number(value) || 0,
  )

/**
 * The CFDI row's lines from bootstrap.stamp_packages: «Paquete de 150 timbres
 * al mes», «87 de 150 timbres este mes» and a smaller package Boat scheduled
 * (the day it lands, and why it waits). null when Boat sent no state.
 */
export function stampsRow(state, now = new Date()) {
  if (!state || !STATES.includes(state.state)) return null
  const held = state.state !== 'off' ? whole(state.package_qty) : null
  const used = whole(state.used)
  const included = whole(state.included)
  const scheduled =
    state.scheduled && whole(state.scheduled.package_qty)
      ? state.scheduled
      : null
  let next = ''
  if (scheduled) {
    const n = stamps(scheduled.package_qty)
    const on = longDate(scheduled.effective_date, now)
    next = scheduled.lands_now
      ? t('Goes down to {0} stamps a month today', [n])
      : on
        ? t('Goes down to {0} stamps a month on {1}', [n, on])
        : t('Goes down to {0} stamps a month when the period ends', [n])
  }
  return {
    held: held !== null,
    package:
      held !== null ? t('Package of {0} stamps a month', [stamps(held)]) : '',
    use:
      held !== null && used !== null && included
        ? t('{0} of {1} stamps this month', [stamps(used), stamps(included)])
        : '',
    warn: Boolean(held !== null && included && used >= included * 0.8),
    scheduled: next,
    waits: typeof scheduled?.waits === 'string' ? scheduled.waits : '',
  }
}

/** Whether an answer carries Boat's stamp package state (a quote carries it too). */
export function hasStamps(answer) {
  return (
    answer?.ok === true &&
    STATES.includes(answer.state) &&
    Array.isArray(answer.ladder)
  )
}

/**
 * The ladder Boat sells, cheapest first: each package's stamps a month, its
 * monthly price and price per stamp (IVA included), the one held marked, and
 * Boat's note when it cannot be chosen here.
 */
export function ladderRows(answer) {
  if (!hasStamps(answer)) return []
  const held = answer.state !== 'off' ? whole(answer.package_qty) : null
  return answer.ladder
    .filter((step) => whole(step?.qty) && step.qty > 0)
    .map((step) => ({
      qty: step.qty,
      label: t('{0} stamps a month', [stamps(step.qty)]),
      price:
        Number(step.monthly_mxn) > 0
          ? t('{0} a month', [money(step.monthly_mxn)])
          : '',
      perStamp:
        Number(step.per_stamp_mxn) > 0
          ? t('{0} per stamp', [money(step.per_stamp_mxn)])
          : '',
      available: step.available === true,
      note: typeof step.note === 'string' ? step.note : '',
      current: step.qty === held,
    }))
}

/**
 * The package the sheet opens on, never one that changes something by itself:
 * `wanted` when Boat sells it here; a smaller package already scheduled (Boat
 * answers it is scheduled, nothing to confirm); else the one held; nothing on a
 * CFDI turned off that still runs (its own package would resume it); else the
 * first one on sale. null when nothing is chosen yet.
 */
export function startingPackage(answer, wanted = null) {
  const rows = ladderRows(answer)
  const pick = (qty) => rows.find((row) => row.qty === qty)
  if (wanted && (pick(wanted)?.available || pick(wanted)?.current))
    return wanted
  if (answer?.state === 'kept') return null
  const later = whole(answer?.scheduled?.package_qty)
  if (later && pick(later)) return later
  if (pick(answer?.package_qty)?.current) return answer.package_qty
  return rows.find((row) => row.available)?.qty ?? null
}

/** The sheet's title: «Activar CFDI» while it is off, else «Cambiar paquete». */
export function stampsTitle(answer) {
  return answer?.state === 'off' ? t('Turn on CFDI') : t('Change package')
}

/** Whether Boat's quote answers exactly this package (not an older tap). */
export function quoteFor(quote, qty) {
  return (
    quote?.ok === true && quote.changed === true && quote.package_target === qty
  )
}

const landsLater = (quote, now) => {
  const on = parseServerDate(quote.decrease_effective_date)
  return Boolean(on && dayDiff(on, now) > 0)
}

// A CFDI turned off that still runs: another size turns it on again.
const resumes = (quote) =>
  quote.state === 'kept' && ['increase', 'decrease'].includes(quote.direction)

/**
 * What «Confirmar» does with Boat's quote, in the verb its toast repeats.
 * null when nothing changes.
 */
export function stampsAction(quote, now = new Date()) {
  if (!quote || quote.ok !== true || !quote.changed) return null
  const n = stamps(quote.package_target)
  if (quote.direction === 'activate')
    return { label: t('Turn on CFDI'), done: t('CFDI turned on') }
  if (quote.direction === 'resume')
    return { label: t('Resume CFDI'), done: t('Add-on resumed') }
  if (resumes(quote))
    return {
      label: t('Resume with {0} stamps', [n]),
      done: t('CFDI resumed with {0} stamps a month', [n]),
    }
  if (quote.direction === 'increase')
    return {
      label: t('Go up to {0} stamps', [n]),
      done: t('You went up to {0} stamps a month', [n]),
    }
  if (quote.direction === 'decrease')
    return landsLater(quote, now)
      ? { label: t('Schedule the change'), done: t('Change scheduled') }
      : {
          label: t('Go down to {0} stamps', [n]),
          done: t('You went down to {0} stamps a month', [n]),
        }
  if (quote.direction === 'cancel')
    return {
      label: t('Keep {0} stamps', [stamps(quote.package_qty)]),
      done: t('Scheduled change cancelled'),
    }
  return null
}

/**
 * Boat's quote as the sheet reads it: today's charge and on which invoice
 * (else «Hoy no se cobra nada»), when the stamps change, the monthly price
 * from then, and the consent the button gives.
 */
export function stampsQuoteView(quote, now = new Date()) {
  if (!quote || quote.ok !== true) return null
  const message = typeof quote.message === 'string' ? quote.message : ''
  if (!quote.changed) return { changed: false, message }
  const today = Number(quote.charge_now_mxn) || 0
  const monthly = Number(quote.monthly_target_mxn) || 0
  const n = stamps(quote.package_target)
  const view = {
    changed: true,
    amount: '',
    per: '',
    nothingToday: false,
    lines: [],
    consent: '',
    message: '',
  }
  const consent = t(
    'When you confirm, you agree to pay {0} a month, IVA included, while CFDI stays on. You can change the package or turn CFDI off whenever you like.',
    [money(monthly)],
  )
  // A CFDI turned off that was going to stop: say first that it turns on again.
  if (resumes(quote)) {
    const until = longDate(quote.kept_until, now)
    view.lines.push(
      until
        ? t('CFDI turns back on: it no longer turns off on {0}.', [until])
        : t('CFDI turns back on.'),
    )
    view.consent = consent
  }
  if (quote.direction === 'activate') {
    view.nothingToday = true
    if (quote.is_trial) {
      view.lines.push(
        t(
          'Nothing is charged during your trial; when you activate your plan, your invoice includes {0} a month, IVA included.',
          [money(monthly)],
        ),
      )
      return view
    }
    view.lines.push(
      t(
        'The month it is ready is charged whole, {0}, because its stamps count whole that month.',
        [money(Number(quote.first_month_mxn) || monthly)],
      ),
      t('Then {0} a month, IVA included.', [money(monthly)]),
    )
    view.consent = consent
    return view
  }
  if (quote.direction === 'increase') {
    if (today > 0) {
      view.amount = money(today)
      view.per =
        quote.charge_on === 'this_invoice'
          ? t('Added to this month’s invoice, IVA included')
          : t(
              'Added to your next invoice: this month’s difference, IVA included',
            )
    } else view.nothingToday = true
    view.lines.push(
      t(
        '{0} stamps a month from today; the ones you already used this month count.',
        [n],
      ),
    )
    if (quote.charge_on === 'delivery')
      view.lines.push(t('It is charged the month it is ready.'))
    const back = Number(quote.saldo_back_mxn) || 0
    if (back > 0 && whole(quote.saldo_back_stamps))
      view.lines.push(
        t(
          'We return {0} to your saldo: {1} extra stamps already charged this month now fall inside your package.',
          [money(back), stamps(quote.saldo_back_stamps)],
        ),
      )
    if (quote.gate_back === true)
      view.lines.push(
        t(
          'Extra stamps charged to your saldo when stamped that now fall inside your package come back when the month closes.',
        ),
      )
    view.lines.push(
      t('From {0}: {1} a month, IVA included.', [
        longDate(quote.next_month, now),
        money(monthly),
      ]),
    )
    view.consent = consent
    return view
  }
  if (quote.direction === 'decrease') {
    view.nothingToday = true
    view.lines.push(
      landsLater(quote, now)
        ? t('You keep {0} stamps until {1}; from {2} you have {3} a month.', [
            stamps(quote.package_qty),
            longDate(quote.keeps_until, now),
            longDate(quote.decrease_effective_date, now),
            n,
          ])
        : t('It goes down to {0} stamps a month today.', [n]),
    )
    if (resumes(quote)) {
      // Compared with $0, not with the package that was ending.
      view.lines.push(
        landsLater(quote, now)
          ? t('From {0}: {1} a month, IVA included.', [
              longDate(quote.decrease_effective_date, now),
              money(monthly),
            ])
          : t('Then {0} a month, IVA included.', [money(monthly)]),
      )
      return view
    }
    const saved = Math.abs(Number(quote.monthly_delta_mxn) || 0)
    if (saved)
      view.lines.push(t('You save {0} a month, IVA included', [money(saved)]))
    if (landsLater(quote, now))
      view.lines.push(t('The month in progress is not refunded.'))
    return view
  }
  view.nothingToday = quote.direction === 'resume'
  view.message = message
  return view
}

/**
 * What a stamp beyond the package costs and how it is paid, and the rules,
 * in Boat's words (es-MX): shown before the owner chooses.
 */
export function stampsTerms(answer) {
  if (!hasStamps(answer)) return { extra: '', rules: [] }
  return {
    extra:
      typeof answer.extra_stamp?.message === 'string'
        ? answer.extra_stamp.message
        : '',
    rules: Array.isArray(answer.rules)
      ? answer.rules.filter((rule) => typeof rule === 'string' && rule)
      : [],
  }
}
