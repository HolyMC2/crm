// Tienda › Almacenamiento in the owner's words (capability «storage_blocks»):
// the space used and allowed, the block Boat's catalog sells and its price, a
// reduction already scheduled, and Boat's quote for a change (storage_quote)
// before set_storage applies it. More space applies today; less waits for the
// period's end. Every figure and price is Boat's: this module only reads it
// back. Pure.
import { LOCALE, dayDiff, parseServerDate } from '@/utils/display'
import { longDate, money } from './autoservicio'

const t = (text, replace) => __(text, replace, 'Cuenta')
const num = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/** «4.2», «15»: one decimal at most, as the meters show it. */
export const gb = (value) =>
  new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(
    Number(value) || 0,
  )

/** Whether an answer carries Boat's storage state (a quote carries it too). */
export function hasSpace(answer) {
  return (
    answer?.ok === true &&
    num(answer.used_gb) !== null &&
    Number.isInteger(answer.extra_gb)
  )
}

/** Boat's block offer, or null when it sells nothing yet. */
function blockOffer(answer) {
  const offer = answer?.offer
  const blockGb = num(offer?.block_gb)
  if (
    offer?.available !== true ||
    !blockGb ||
    !Number.isInteger(offer.max_blocks) ||
    !num(offer.block_price_mxn)
  )
    return null
  return {
    blockGb,
    price: offer.block_price_mxn,
    maxBlocks: offer.max_blocks,
  }
}

/**
 * The card: «Tienes 4.2 de 15 GB», what the plan includes and the extra bought,
 * a reduction Boat scheduled (the day it lands, and why it waits), the block on
 * sale and its price, and which of «Agregar» / «Quitar espacio» / «Cancelar la
 * reducción programada» / «Ver planes» it offers. Space already bought can be lowered or kept
 * even while Boat sells no more. null for an answer that is not Boat's state.
 */
export function storageCard(answer, now = new Date()) {
  if (!hasSpace(answer)) return null
  const used = answer.used_gb
  const allowance = num(answer.allowance_gb)
  const included = num(answer.included_gb) ?? 0
  const extra = answer.extra_gb
  const offer = blockOffer(answer)
  // Boat's block: the one on sale, else the one the space was bought in.
  const blockGb = offer?.blockGb || num(answer.block_gb) || 0
  const blocks = Number.isInteger(answer.blocks) ? answer.blocks : null
  const scheduled =
    answer.scheduled && Number.isInteger(answer.scheduled.extra_gb)
      ? answer.scheduled
      : null
  const pct = allowance
    ? Math.max(0, Math.min(100, Math.round((used / allowance) * 100)))
    : null
  const planned =
    blockGb && blocks !== null && scheduled
      ? Math.round(scheduled.extra_gb / blockGb)
      : blocks
  // A reduction Boat scheduled: the total it leaves, from the day it lands
  // (the sheet's «desde el 1 de diciembre»).
  let scheduledText = ''
  if (scheduled && allowance) {
    const left = allowance - extra + scheduled.extra_gb
    const on = longDate(scheduled.effective_date, now)
    scheduledText = scheduled.lands_now
      ? t('Goes down to {0} GB today', [gb(left)])
      : on
        ? t('Goes down to {0} GB on {1}', [gb(left), on])
        : t('Goes down to {0} GB when the period ends', [gb(left)])
  }
  const held = Boolean(allowance && blocks !== null && blockGb)
  const canAdd = Boolean(held && offer && blocks < offer.maxBlocks)
  return {
    limitless: !allowance,
    text: allowance
      ? t('You have {0} of {1} GB', [gb(used), gb(allowance)])
      : t('{0} GB, no limit', [gb(used)]),
    pct,
    warn: pct !== null && pct >= 80,
    detail: !allowance
      ? ''
      : extra
        ? t('Your plan includes {0} GB, plus {1} GB extra', [
            gb(included),
            gb(extra),
          ])
        : t('Your plan includes {0} GB', [gb(included)]),
    scheduled: scheduledText,
    waits: typeof scheduled?.waits === 'string' ? scheduled.waits : '',
    offer:
      offer && allowance
        ? t('+{0} GB for {1} a month, IVA included', [
            gb(offer.blockGb),
            money(offer.price),
          ])
        : '',
    unavailable:
      !offer && allowance
        ? (typeof answer.offer?.message === 'string' && answer.offer.message) ||
          t('More space is not available yet.')
        : '',
    blockGb,
    blocks,
    planned,
    // The stepper's top: Boat's most blocks, or what is held when that is more.
    maxBlocks: Math.max(offer?.maxBlocks || 0, held ? blocks : 0),
    canAdd,
    // Where no block can be bought (none on sale, or the most already held) a
    // bigger plan is the way to more space.
    seePlans: Boolean(allowance) && !canAdd,
    canRemove: held && planned > 0,
    canUndo: held && Boolean(scheduled),
  }
}

/**
 * The sheet's title for a target (extra blocks in total), against the blocks
 * held today and a reduction already scheduled (`planned`, when it differs):
 * «Agregar 10 GB», «Quitar 10 GB», «Bajar a 10 GB extra», «Cancelar la
 * reducción programada».
 */
export function storageTitle(blockGb, blocks, target, planned = blocks) {
  const scheduled = Number.isInteger(planned) && planned !== blocks
  if (target > blocks) return t('Add {0} GB', [gb((target - blocks) * blockGb)])
  if (target < blocks)
    return scheduled
      ? t('Go down to {0} GB extra', [gb(target * blockGb)])
      : t('Remove {0} GB', [gb((blocks - target) * blockGb)])
  return scheduled ? t('Cancel the scheduled reduction') : t('Extra space')
}

/** Whether Boat's quote answers exactly this target (not an older tap). */
export function quoteFor(quote, target) {
  return quote?.ok === true && quote.blocks_target === target
}

/**
 * What «Confirmar» does with Boat's quote, in the verb its toast repeats.
 * null when nothing changes.
 */
export function storageAction(quote, now = new Date()) {
  if (!quote || quote.ok !== true || !quote.changed) return null
  const extra = Number(quote.extra_gb) || 0
  const target = Number(quote.extra_target_gb) || 0
  if (quote.direction === 'increase') {
    const n = gb(target - extra)
    return { label: t('Add {0} GB', [n]), done: t('You added {0} GB', [n]) }
  }
  if (quote.direction === 'decrease') {
    const on = parseServerDate(quote.decrease_effective_date)
    if (on && dayDiff(on, now) > 0)
      return {
        label: t('Schedule the reduction'),
        done: t('Reduction scheduled'),
      }
    const n = gb(extra - target)
    return {
      label: t('Remove {0} GB', [n]),
      done: t('You removed {0} GB', [n]),
    }
  }
  if (quote.direction === 'cancel')
    return {
      label: t('Cancel the scheduled reduction'),
      done: t('Scheduled reduction cancelled'),
    }
  return null
}

/**
 * Boat's quote as the sheet reads it: today's charge and on which invoice
 * (else «Hoy no se cobra nada»), when the space changes, what the extra space
 * costs a month from then, and the consent the button gives.
 */
export function storageQuoteView(quote, now = new Date()) {
  if (!quote || quote.ok !== true) return null
  if (!quote.changed)
    return {
      changed: false,
      message: typeof quote.message === 'string' ? quote.message : '',
    }
  const today = Number(quote.charge_now_mxn) || 0
  const monthly = Number(quote.monthly_target_mxn) || 0
  const total = Number(quote.allowance_target_gb) || 0
  const view = {
    changed: true,
    amount: '',
    per: '',
    nothingToday: false,
    lines: [],
    consent: '',
    message: '',
  }
  if (quote.direction === 'increase') {
    if (today > 0) {
      view.amount = money(today)
      view.per =
        quote.charge_on === 'this_invoice'
          ? t('Added to this month’s invoice, IVA included')
          : t(
              'Added to your next invoice for the rest of this month, IVA included',
            )
    } else view.nothingToday = true
    view.lines.push(
      t('More space applies today: {0} GB in total.', [gb(total)]),
      t('Your extra space: {0} a month, IVA included', [money(monthly)]),
    )
    view.consent = t(
      'When you confirm, you agree to pay {0} a month, IVA included, while you keep this space. You can reduce it whenever you like; it applies when the period ends.',
      [money(monthly)],
    )
    return view
  }
  if (quote.direction === 'decrease') {
    view.nothingToday = true
    const on = parseServerDate(quote.decrease_effective_date)
    const before = Number(quote.allowance_gb) || 0
    view.lines.push(
      !on || dayDiff(on, now) <= 0
        ? t('It goes down to {0} GB today.', [gb(total)])
        : t('You keep {0} GB until {1}; from {2} you have {3} GB.', [
            gb(before),
            longDate(quote.keeps_until, now),
            longDate(on, now),
            gb(total),
          ]),
    )
    const saved = Math.abs(Number(quote.monthly_delta_mxn) || 0)
    if (saved)
      view.lines.push(t('You save {0} a month, IVA included', [money(saved)]))
    return view
  }
  view.message = typeof quote.message === 'string' ? quote.message : ''
  return view
}
