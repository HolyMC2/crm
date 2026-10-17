// Door 2 of «Pregúntale a Muelle»: the one «Sugerencia» a screen may show.
// Each rule needs a concrete reason quoted from data the screen already has
// (or one cheap read), and has one verb. No reason, no suggestion.

function day(iso, locale = 'es-MX') {
  const match = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(iso || ''))
  if (!match) return ''
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], 12))
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date)
}

export function money(value, currency = 'MXN', locale = 'es-MX') {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'MXN',
      maximumFractionDigits: Number(value) % 1 ? 2 : 0,
    }).format(Number(value) || 0)
  } catch {
    return `$${Number(value) || 0}`
  }
}

const plain = (html) =>
  String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Hoy: the oldest overdue pendiente, else a deal of mine without a next step.
 * `data` is crm.api.hoy.page() as Hoy already holds it.
 */
export function hoySuggestion(data) {
  const overdue = data?.pendientes?.available
    ? data.pendientes.overdue?.rows || []
    : []
  const oldest = overdue
    .filter((row) => row?.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0]
  if (oldest) {
    const what =
      plain(oldest.description).slice(0, 80) || oldest.reference_label || ''
    return {
      id: `hoy:pendiente:${oldest.doctype}:${oldest.name}:${oldest.date}`,
      reason: __('Overdue since {0}: {1}', [day(oldest.date), what]),
      verb: __('Resolve'),
      prompt: __(
        'My pendiente «{0}» is overdue since {1}. What should I do to close it?',
        [what, day(oldest.date)],
      ),
    }
  }
  const deal = data?.seguimiento?.available ? data.seguimiento.rows?.[0] : null
  if (deal?.title)
    return {
      id: `hoy:trato:${deal.name}`,
      reason: __('«{0}» has no next step', [deal.title]),
      verb: __('Schedule'),
      prompt: __(
        'The deal «{0}» has no next step. Propose a follow-up for it.',
        [deal.title],
      ),
    }
  return null
}

/**
 * Contacto: what the customer owes and since when (doco receivables'
 * get_customer). Only an overdue balance is a reason.
 */
export function contactoSuggestion(title, owed) {
  const amount = Number(owed?.overdue_amount) || 0
  if (!owed || amount <= 0) return null
  const since = (owed.invoices || [])
    .filter((row) => Number(row.overdue_days) > 0 && row.next_due)
    .map((row) => row.next_due)
    .sort()[0]
  const total = money(amount, owed.currency)
  return {
    id: `contacto:debe:${owed.customer}:${amount}`,
    reason: since
      ? __('Owes {0} since {1}', [total, day(since)])
      : __('Owes {0}, overdue', [total]),
    verb: __('Collect'),
    prompt: __(
      '{0} owes {1}{2}. How do I collect it? Prepare the reminder for me to confirm.',
      [
        title || owed.customer_name || owed.customer,
        total,
        since ? __(' since {0}', [day(since)]) : '',
      ],
    ),
  }
}
