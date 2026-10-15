// es-MX formatting for the CFDI card and the fiscal gaps queue. CFDI amounts
// and dates are Mexican fiscal data, so they read in es-MX whatever the UI.

const LOCALE = 'es-MX'

/** «$1,160.00» for MXN, «US$100.00» for USD; an unknown code still reads. */
export function money(value, currency = 'MXN') {
  const n = Number(value) || 0
  const code = String(currency || 'MXN').toUpperCase()
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: code,
    }).format(n)
  } catch {
    return `${n.toFixed(2)} ${code}`
  }
}

/** Exchange rate with the precision the CFDI carries (up to 6 decimals). */
export function rate(value) {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(Number(value) || 0)
}

export function quantity(value) {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 6 }).format(
    Number(value) || 0,
  )
}

/** «16 %» for a Tasa, the amount for a Cuota, '' when exempt (caller says so). */
export function taxRate(tax) {
  const factor = String(tax?.tipo_factor || '')
  if (factor === 'Exento') return ''
  if (factor === 'Cuota') return money(tax?.tasa_o_cuota)
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    maximumFractionDigits: 4,
  }).format(Number(tax?.tasa_o_cuota) || 0)
}

/** A CFDI date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS) as «20 de septiembre de 2026». */
export function fiscalDate(value, { time = false } = {}) {
  const text = String(value || '')
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (!m) return text
  // Built from parts: the CFDI date is local Mexican time, never shifted by UTC.
  const date = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] || 0),
    Number(m[5] || 0),
  )
  const options = { day: 'numeric', month: 'long', year: 'numeric' }
  if (time && m[4])
    Object.assign(options, { hour: '2-digit', minute: '2-digit' })
  return new Intl.DateTimeFormat(LOCALE, options).format(date)
}

/** Serie and folio as printed on the invoice, «A-123». */
export function serieFolio(card) {
  return [card?.serie, card?.folio].filter(Boolean).join('-')
}
