// Pure helpers for the Forms pages (list, builder, share). No Vue, no network:
// unit-tested in tests/unit/formModel.test.js.

export const BREAK_TYPES = ['Section Break', 'Column Break']
export const PUBLIC_PREFIX = '/crm-form/'
export const CONTACT_FIELDS = ['email', 'mobile_no', 'phone']
export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
]

export function slugify(value) {
  return (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isValidRoute(route) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route || '')
}

export function inputFields(fields) {
  return (fields || []).filter((f) => !BREAK_TYPES.includes(f.fieldtype))
}

// Section → columns → fields, from the flat Web Form rows (same grouping the
// public page uses in crm_form.py build_layout).
export function layoutFromFields(fields) {
  const sections = []
  let cur = { label: null, columns: [[]] }
  for (const f of fields || []) {
    if (f.fieldtype === 'Section Break') {
      sections.push(cur)
      cur = { label: f.label || null, columns: [[]] }
    } else if (f.fieldtype === 'Column Break') {
      cur.columns.push([])
    } else {
      cur.columns[cur.columns.length - 1].push(f)
    }
  }
  sections.push(cur)
  return sections.filter((s) => s.label || s.columns.some((c) => c.length))
}

export function fillBusiness(text, business) {
  if (!text) return text || ''
  return text.split('{business}').join(business || '')
}

// What must be true before a form goes live (blocking) and what makes it work
// well (advice). Mirrors the server's publish guard for the blocking items.
export function readiness({ form, hiddenFields, settings }) {
  const fields = inputFields(form.fields)
  const names = new Set(fields.map((f) => f.fieldname))
  const hiddenMissing = (hiddenFields || []).filter(
    (h) => !String(h.default ?? '').trim(),
  )
  const reachable = CONTACT_FIELDS.some((n) => names.has(n))
  return [
    {
      key: 'title',
      ok: Boolean((form.title || '').trim()),
      blocking: true,
      label: __('Give the form a title'),
    },
    {
      key: 'route',
      ok: isValidRoute(form.route),
      blocking: true,
      label: __('Choose a web address'),
      hint: __('Lowercase letters, numbers and dashes only.'),
    },
    {
      key: 'fields',
      ok: fields.length > 0,
      blocking: true,
      label: __('Add at least one field'),
    },
    {
      key: 'hidden',
      ok: hiddenMissing.length === 0,
      blocking: true,
      label: __('Set a value for every hidden field'),
      hint: hiddenMissing.map((h) => h.label || h.fieldname).join(', '),
    },
    {
      key: 'contact',
      ok: reachable,
      blocking: false,
      label: __('Ask for a phone or email so you can reply'),
    },
    {
      key: 'owner',
      ok: true,
      blocking: false,
      label:
        settings?.assign_mode === 'user'
          ? __('New submissions go to {0}', [settings.assign_to])
          : __('Assignment rules decide who follows up'),
      info: true,
    },
  ]
}

export function isPublishable(items) {
  return items.every((i) => !i.blocking || i.ok)
}

export function publicUrl(origin, route) {
  return `${origin}${PUBLIC_PREFIX}${route || ''}`
}

export function withUtm(url, params) {
  const q = new URLSearchParams()
  for (const key of UTM_KEYS) {
    if (params?.[key]) q.set(key, params[key])
  }
  const qs = q.toString()
  if (!qs) return url
  return url + (url.includes('?') ? '&' : '?') + qs
}

// Ready-made tagged links: each channel reports itself in the lead's UTM fields,
// so Submissions and Reports can tell Instagram from a printed flyer.
export function channelLinks(url, route) {
  const campaign = route || 'form'
  const make = (key, label, hint, source, medium) => ({
    key,
    label,
    hint,
    url: withUtm(url, {
      utm_source: source,
      utm_medium: medium,
      utm_campaign: campaign,
    }),
  })
  return [
    make(
      'instagram',
      __('Instagram bio'),
      __('Paste into your profile link.'),
      'instagram',
      'social',
    ),
    make(
      'facebook',
      __('Facebook'),
      __('Posts, page button or ads.'),
      'facebook',
      'social',
    ),
    make(
      'whatsapp',
      __('WhatsApp status'),
      __('Share in a status or a chat.'),
      'whatsapp',
      'social',
    ),
    make(
      'flyer',
      __('Printed flyer / QR'),
      __('For posters, receipts and the counter.'),
      'flyer',
      'print',
    ),
    make(
      'website',
      __('Your website'),
      __('A button or link on your own site.'),
      'website',
      'referral',
    ),
  ]
}

export function whatsappShareUrl(text, url) {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`.trim())}`
}

export function iframeSnippet(url, title) {
  const src = withUtm(`${url}?embed=1`, {
    utm_source: 'website',
    utm_medium: 'embed',
  })
  const safeTitle = (title || 'Form').replace(/"/g, '&quot;')
  return `<iframe src="${src}" width="100%" height="640" style="border:0" title="${safeTitle}"></iframe>`
}

// "3 deals · 1 won" style outcome for the list; null when nothing to say yet.
export function outcome(stats, documentType) {
  if (!stats || !stats.total) return null
  const pct = (n) => Math.round((n / stats.total) * 100)
  if (documentType === 'CRM Lead') {
    return {
      primary: stats.deals,
      rate: pct(stats.deals),
      won: stats.won,
      label: __('became deals'),
    }
  }
  return {
    primary: stats.won,
    rate: pct(stats.won),
    won: stats.won,
    label: __('won'),
  }
}

export const EMBEDDING_DOMAIN_RE =
  /^(https?:\/\/)?(\*\.)?[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?(?::\d+)?$/

export function invalidDomains(text) {
  return (text || '')
    .split(/\s+/)
    .filter(Boolean)
    .filter((d) => !EMBEDDING_DOMAIN_RE.test(d))
}
