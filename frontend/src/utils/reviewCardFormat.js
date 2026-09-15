// Pure helpers for the WhatsApp review card (Aprobaciones + conversation strip).
// Kept out of the component so the display rules are unit-tested and the card
// stays a thin template.

const LOCAL_LEN = 10

// Display a phone the way a person reads it aloud: the last ten digits grouped
// 3-3-4, with whatever country prefix the stored value carries in front of
// them. The prefix comes from the data, never from a constant — a tenant in
// another country stores another prefix and this renders it as-is.
export function displayPhone(value) {
  const raw = String(value ?? '').trim()
  const digits = raw.replace(/\D/g, '')
  if (digits.length < LOCAL_LEN) return raw
  const local = digits.slice(-LOCAL_LEN)
  const grouped = `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
  const prefix = digits.slice(0, -LOCAL_LEN)
  return prefix ? `+${prefix} ${grouped}` : grouped
}

// Where a row's reference opens inside the SPA (router location). Falls back to
// the Contact resolved from the phone when the reference itself has no SPA page
// (a repair order, or a deleted record); null when there is nowhere to go.
export function recordRoute(kind, name, contact = '') {
  if (name && kind === 'CRM Deal') return { name: 'Deal 360', params: { dealId: name } }
  if (name && kind === 'CRM Lead') return { name: 'Lead', params: { leadId: name } }
  if (contact) return { name: 'Contact', params: { contactId: contact } }
  return null
}

// Desk form URL for a record — follows the SPA-wide `/app/<slug>/<name>` convention.
export function deskHref(doctype, name) {
  if (!doctype || !name) return null
  const slug = String(doctype).trim().toLowerCase().replace(/\s+/g, '-')
  return `/app/${slug}/${encodeURIComponent(name)}`
}

// "What is this about" in one line: repair type · device · deal title ·
// organization, skipping blanks and repeats. A deal title that merely restates
// what the card already shows (the customer's phone, or a composed
// "<device> — <customer>" name) is dropped so nothing reads twice.
export function aboutLine(ctx = {}) {
  const name = String(ctx.customer_name ?? '').trim().toLowerCase()
  const phoneKey = String(ctx.customer_phone ?? '').replace(/\D/g, '').slice(-LOCAL_LEN)
  const device = String(ctx.device ?? '').trim().toLowerCase()
  const title = String(ctx.title ?? '').trim()
  const titleDigits = title.replace(/\D/g, '')
  const titleLower = title.toLowerCase()
  const redundantTitle =
    !title ||
    (titleDigits.length >= LOCAL_LEN && titleDigits.slice(-LOCAL_LEN) === phoneKey) ||
    (name && titleLower.includes(name)) ||
    (device && titleLower.includes(device))
  const parts = []
  for (const v of [ctx.repair_type, ctx.device, redundantTitle ? '' : title, ctx.organization]) {
    const s = String(v ?? '').trim()
    if (s && !parts.some((p) => p.toLowerCase() === s.toLowerCase())) parts.push(s)
  }
  return parts.join(' · ')
}

// Lightweight relative age ("ahora", "12m", "3h", "7d"); `now` is injectable
// for tests. Returns '' for a missing or unparseable timestamp.
export function relativeAge(creation, now = Date.now(), labels = { now: 'ahora' }) {
  if (!creation) return ''
  const then = new Date(String(creation).replace(' ', 'T')).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.round((now - then) / 60000)
  if (mins < 1) return labels.now
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.round(hrs / 24)}d`
}
