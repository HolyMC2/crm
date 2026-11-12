// «Tu suscripción» (capability «cancel»): cancel at the end of the paid period,
// resume until then, over Boat's cancel_quote / cancel_subscription /
// resume_subscription. bootstrap's `cancel` says whether a cancel is recorded
// ({state: active | scheduled | ended, cancel_at, service_until, export_until,
// can_resume}); the quote gives the dates a cancel would set and Boat's
// reasons. Boat decides every date. Pure.
import { capable, longDate, money } from './autoservicio'

const t = (text, replace) => __(text, replace, 'Cuenta')

export const NOTE_MAX = 500

/**
 * The block as Resumen shows it, or null when Boat does not offer it here (no
 * capability, a trial: a trial ends by itself and is never charged).
 */
export function subscriptionView(data, now = new Date()) {
  if (!capable(data, 'cancel')) return null
  const trial = Boolean(data?.meters?.billing?.is_trial ?? data?.site?.is_trial)
  const cancel = data?.cancel || { state: 'active' }
  const until = longDate(cancel.service_until, now)
  const exportUntil = longDate(cancel.export_until, now)
  const copy = exportUntil
    ? t('You can ask for a copy of your data until {0}.', [exportUntil])
    : ''
  if (cancel.state === 'scheduled')
    return {
      state: 'scheduled',
      title: until
        ? t('Your subscription ends on {0}', [until])
        : t('Your subscription ends at the end of the paid period'),
      lines: [
        t(
          'Until then everything keeps working, and nothing is charged afterwards.',
        ),
        copy,
      ].filter(Boolean),
      canResume: cancel.can_resume === true,
      canCancel: false,
    }
  if (cancel.state === 'ended')
    return {
      state: 'ended',
      title: until
        ? t('Your subscription ended on {0}', [until])
        : t('Your subscription ended'),
      lines: [copy].filter(Boolean),
      canResume: false,
      canCancel: false,
    }
  if (trial) return null
  return {
    state: 'active',
    title: t('Your subscription'),
    lines: [
      t(
        'If you cancel, the service runs to the end of the period you paid and nothing is charged afterwards.',
      ),
    ],
    canResume: false,
    canCancel: true,
  }
}

/**
 * Boat's cancel_quote as the sheet reads it: the dates a cancel sets (the
 * service, the copy of the data, the archive, how long the data is kept),
 * what stays owed, the reasons to pick from; or a cancel already recorded.
 */
export function cancelQuoteView(quote, now = new Date()) {
  if (!quote || quote.ok !== true) return null
  if (quote.state && quote.state !== 'active')
    return {
      recorded: true,
      message:
        (typeof quote.message === 'string' && quote.message) ||
        t('Your cancellation is already recorded.'),
    }
  const rows = [
    [
      'service',
      t('Your service runs until'),
      longDate(quote.service_until, now),
    ],
    [
      'export',
      t('You can ask for a copy of your data until'),
      longDate(quote.export_until, now),
    ],
    [
      'archive',
      t('We archive your system on'),
      longDate(quote.archive_on, now),
    ],
    // Archiving deletes nothing: Boat keeps the data until this date.
    [
      'keep',
      t('We keep your information until'),
      longDate(quote.delete_after, now),
    ],
  ]
    .filter(([, , value]) => value)
    .map(([key, label, value]) => ({ key, label, value }))
  const lines = []
  if (quote.ends_now)
    lines.push(t('Your paid period already ended: your service ends today.'))
  const owed = Number(quote.unpaid_invoice?.amount_mxn) || 0
  if (owed > 0)
    lines.push(
      t('You have {0} to pay; it stays owed even if you cancel.', [
        money(owed),
      ]),
    )
  if (quote.pending)
    lines.push(
      t('The changes you had scheduled to your plan are cancelled too.'),
    )
  const reasons = (Array.isArray(quote.reasons) ? quote.reasons : [])
    .filter((row) => row?.value && row?.label)
    .map((row) => ({ value: row.value, label: row.label }))
  return { recorded: false, rows, lines, reasons }
}

/** A line that may keep the owner, by reason; it never blocks the cancel. */
export function retentionLine(reason, { planChange = false } = {}) {
  if (reason === 'expensive')
    return planChange
      ? {
          text: t('If it is the price, a cheaper plan may fit you.'),
          act: 'plans',
          label: t('See plans'),
        }
      : null
  if (reason === 'missing_feature')
    return {
      text: t('Tell us in the note what you are missing; we read every one.'),
      act: '',
      label: '',
    }
  return null
}

/** Why «Cancelar suscripción» cannot go yet, or ''. */
export function cancelGap({ reason, password }) {
  if (!reason && !password)
    return t('Choose a reason and type your password to confirm.')
  if (!reason) return t('Choose a reason.')
  if (!password) return t('Type your password to confirm.')
  return ''
}
