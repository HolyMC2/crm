// Archivos › Connections: pure helpers for the settings page and the OCR action.
// Labels go through `__` at call time so tests can run without a catalog.

function tr(message, replace) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

export const CONNECTORS = 'doco.docoutils.documents.connectors'
/** Dotted path for archivosApi: `api('overview')` → full whitelisted method. */
export function connectorMethod(fn) {
  return `${CONNECTORS}.${fn}`
}

/** The saved secret comes back masked; sending it again means «unchanged». */
export const TOKEN_MASK = '********'

// --- health ----------------------------------------------------------------

const HEALTH = {
  ok: ['Working', 'green'],
  waiting: ['Waiting for its first check', 'gray'],
  paused: ['Paused', 'gray'],
  late: ['Running late', 'orange'],
  capacity: ['Monthly capacity used', 'orange'],
  error: ['Not working', 'red'],
  stopped: ['Stopped on this site', 'red'],
  unlicensed: ['Not in your plan', 'gray'],
}
export function healthLabel(status) {
  return tr((HEALTH[status] || HEALTH.waiting)[0])
}
export function healthTheme(status) {
  return (HEALTH[status] || HEALTH.waiting)[1]
}

const TYPES = {
  Paperless: ['Paperless archive', 'archive'],
  Mailbox: ['Invoice mailbox', 'mail'],
}
export function typeLabel(type) {
  return tr((TYPES[type] || TYPES.Paperless)[0])
}
export function typeIcon(type) {
  return (TYPES[type] || TYPES.Paperless)[1]
}

// --- time ------------------------------------------------------------------

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const date = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

/** «just now», «5 minutes ago», «3 hours ago», «2 days ago»; '' when unknown. */
export function relativeTime(value, now = new Date()) {
  const date = toDate(value)
  if (!date) return ''
  return agoLabel(Math.max(0, (now.getTime() - date.getTime()) / 1000))
}

/** The same phrasing from a number of seconds (health ages come as seconds). */
export function agoLabel(seconds) {
  if (seconds === null || seconds === undefined || seconds === '') return ''
  const s = Number(seconds)
  if (!Number.isFinite(s)) return ''
  if (s < 60) return tr('just now')
  // Own msgids: the shared «{0} minutes ago» is capitalised in es and these
  // read inside a sentence («Última revisión hace 5 min»).
  if (s < 3600) return tr('{0} min ago', [Math.floor(s / 60)])
  if (s < 86400) return tr('{0} h ago', [Math.floor(s / 3600)])
  return tr('about {0} days ago', [Math.floor(s / 86400)])
}

/** A span without «ago»: «5 min», «3 h», «2 days». */
export function durationLabel(seconds) {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s < 0) return ''
  if (s < 60) return tr('less than a minute')
  if (s < 3600) return tr('{0} min', [Math.floor(s / 60)])
  if (s < 86400) return tr('{0} h', [Math.floor(s / 3600)])
  return tr('{0} days', [Math.floor(s / 86400)])
}

export function formatWhen(value, locale) {
  const date = toDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(locale || undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

/**
 * The three timestamps the card shows, only those that exist:
 * [{ key, label, title }] where label is «Last checked 5 minutes ago».
 */
export function timeline(conn, now = new Date(), locale) {
  const rows = [
    ['last_checked', 'Last checked {0}'],
    ['last_success', 'Last success {0}'],
    ['last_error_at', 'Last error {0}'],
  ]
  return rows
    .filter(([key]) => toDate(conn?.[key]))
    .map(([key, text]) => ({
      key,
      label: tr(text, [relativeTime(conn[key], now)]),
      title: formatWhen(conn[key], locale),
    }))
}

// --- remote ----------------------------------------------------------------

/** «Paperless 3.0.5 · API 10» once probed; '' before the first probe. */
export function versionLabel(conn) {
  if (!conn || conn.connector_type === 'Mailbox' || !conn.remote_version)
    return ''
  const version = String(conn.remote_version).replace(/^v/i, '')
  return conn.api_version
    ? tr('Paperless {0} · API {1}', [version, conn.api_version])
    : tr('Paperless {0}', [version])
}

/** How new documents arrive: a Paperless notice, or periodic checks. */
export function deliveryLabel(conn, now = new Date()) {
  const health = conn?.health || {}
  const every = health.poll_minutes || 10
  if (conn?.connector_type !== 'Mailbox' && health.webhook) {
    if (toDate(conn.last_webhook_at))
      return tr('Paperless notified Muelle {0}; also checks every {1} min', [
        relativeTime(conn.last_webhook_at, now),
        every,
      ])
    return tr('Notices are set up; none received yet. Checks every {0} min', [
      every,
    ])
  }
  return tr('Checks every {0} min', [every])
}

/** Pending/failed work in one line, or '' when there is none. */
export function queueLabel(health) {
  if (!health) return ''
  const parts = []
  if (health.pending) {
    parts.push(
      health.oldest_pending_seconds
        ? tr('{0} pending, oldest {1}', [
            health.pending,
            agoLabel(health.oldest_pending_seconds),
          ])
        : tr('{0} pending', [health.pending]),
    )
  }
  if (health.failed) parts.push(tr('{0} failed', [health.failed]))
  return parts.join(' · ')
}

/** Filters arrive as a JSON string list; tolerate lists and junk. */
export function parseIds(value) {
  let list = value
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value || '[]')
    } catch {
      list = []
    }
  }
  if (!Array.isArray(list)) return []
  const ids = list
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0)
  return [...new Set(ids)]
}

// --- capacity and backfill -------------------------------------------------

export function percent(part, total) {
  const p = Number(part) || 0
  const t = Number(total) || 0
  if (t <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((100 * p) / t)))
}

/** Plan capacity summary; null when the plan has no monthly limit to show. */
export function capacity(overview) {
  const limit = Number(overview?.monthly_limit) || 0
  if (!limit) return null
  const used = Math.max(0, Number(overview?.used_this_month) || 0)
  return {
    limit,
    used,
    left: Math.max(0, limit - used),
    percent: percent(used, limit),
    full: used >= limit,
    label: tr('{0} of {1} documents used this month', [used, limit]),
  }
}

const BACKFILL = {
  Idle: ['Not started', 'gray'],
  Ready: ['Ready to import', 'blue'],
  Running: ['Importing', 'blue'],
  Paused: ['Paused', 'gray'],
  Capacity: ['Waiting for next month', 'orange'],
  Complete: ['All imported', 'green'],
  Failed: ['Stopped by an error', 'red'],
}
export function backfillLabel(state) {
  return tr((BACKFILL[state] || BACKFILL.Idle)[0])
}
export function backfillTheme(state) {
  return (BACKFILL[state] || BACKFILL.Idle)[1]
}

/** The dry run is valid for a day; after that the server asks for a new one. */
export function dryRunFresh(report, now = new Date()) {
  const at = toDate(report?.at)
  if (!at) return false
  return now.getTime() - at.getTime() < 24 * 3600 * 1000
}

/**
 * What the «Start import» button does and why it may be disabled:
 * { action: 'start'|'resume'|'restart'|null, label, disabled, reason }.
 */
export function backfillAction(backfill, now = new Date()) {
  const state = backfill?.state || 'Idle'
  const report = backfill?.report
  if (state === 'Running' || state === 'Capacity')
    return { action: null, label: '', disabled: true, reason: '' }
  let action = 'start',
    label = tr('Start import')
  if (state === 'Paused' && backfill?.resumable) {
    action = 'resume'
    label = tr('Resume import')
  } else if (state === 'Complete') {
    action = 'resume'
    label = tr('Import what was added since')
  } else if (state === 'Failed' && backfill?.resumable) {
    action = 'resume'
    label = tr('Continue import')
  }
  if (!report)
    return {
      action,
      label,
      disabled: true,
      reason: tr('First try without importing to see what would come in.'),
    }
  if (!dryRunFresh(report, now))
    return {
      action,
      label,
      disabled: true,
      reason: tr('The last try is more than a day old. Try again first.'),
    }
  return { action, label, disabled: false, reason: '' }
}

/** «Fits this month» or «Needs about 3 months at your plan's capacity». */
export function monthsLabel(report) {
  if (!report) return ''
  if (report.fits_this_month) return tr('Fits in what is left this month')
  if (report.months)
    return report.months === 1
      ? tr('Needs about one month of your plan capacity')
      : tr('Needs about {0} months of your plan capacity', [report.months])
  return tr('Your plan has no monthly capacity for imports')
}

// --- mappings --------------------------------------------------------------

const VIA = {
  RFC: ['Automatic by RFC', 'green'],
  Name: ['By name', 'blue'],
  Manual: ['Manual', 'gray'],
  Guess: ['Suggested', 'orange'],
}
export function viaLabel(via) {
  return VIA[via] ? tr(VIA[via][0]) : ''
}
export function viaTheme(via) {
  return VIA[via] ? VIA[via][1] : 'gray'
}

/** Rows of a mapping table that changed against the saved ones (for save_map). */
export function changedMaps(rows, saved) {
  const before = new Map(
    (saved || []).map((r) => [`${r.map_type}:${r.remote_id}`, r]),
  )
  const out = []
  for (const row of rows || []) {
    const old = before.get(`${row.map_type}:${row.remote_id}`)
    const same =
      old &&
      (row.map_type === 'Document Type'
        ? (old.document_kind || '') === (row.document_kind || '')
        : (old.party_type || '') === (row.party_type || '') &&
          (old.party || '') === (row.party || ''))
    if (same) continue
    if (row.map_type === 'Document Type' && !row.document_kind) continue
    // A row brought from the catalog counts only once it names who it is.
    if (
      !old &&
      row.map_type === 'Correspondent' &&
      !(row.party_type && String(row.party || '').trim())
    )
      continue
    const clean = {
      map_type: row.map_type,
      remote_id: Number(row.remote_id),
      remote_name: row.remote_name || '',
    }
    if (row.map_type === 'Document Type')
      clean.document_kind = row.document_kind
    else {
      clean.party_type = row.party_type || ''
      clean.party = String(row.party || '').trim()
    }
    out.push(clean)
  }
  return out
}

// --- mail rules ------------------------------------------------------------

export const ATTACHMENT_TYPES = Object.freeze([
  'xml',
  'pdf',
  'png',
  'jpg',
  'csv',
  'txt',
])

export function newRule() {
  return {
    enabled: 1,
    sender: '',
    subject: '',
    attachment_types: 'xml,pdf',
    visibility: 'Company',
  }
}

export function ruleTypes(rule) {
  return String(rule?.attachment_types || '')
    .split(',')
    .map((t) => t.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean)
}

/** «From @proveedor.mx · subject contains «Factura» · xml, pdf · Everyone». */
export function ruleText(rule) {
  if (!rule) return ''
  const parts = [rule.sender ? tr('From {0}', [rule.sender]) : tr('Any sender')]
  if (rule.subject) parts.push(tr('subject contains «{0}»', [rule.subject]))
  const types = ruleTypes(rule)
  if (types.length) parts.push(types.join(', '))
  parts.push(
    rule.visibility === 'Private'
      ? tr('only for you')
      : tr('for everyone in the company'),
  )
  let text = parts.join(' · ')
  if (rule.enabled === 0 || rule.enabled === false)
    text = tr('Off: {0}', [text])
  return text
}

/** A sender is a full address or @domain.tld; empty means any sender. */
export function senderProblem(sender) {
  const value = String(sender || '')
    .trim()
    .toLowerCase()
  if (!value) return ''
  return /^(@|[^@\s]+@)[a-z0-9.-]+\.[a-z]{2,}$/.test(value)
    ? ''
    : tr('Write a full address or @domain.mx')
}

// --- the edit form ---------------------------------------------------------

/** Editable copy of a connector (or defaults for a new one of `type`). */
export function formFromConnector(conn, type = 'Paperless') {
  const kind = conn?.connector_type || type
  return {
    name: conn?.name || '',
    connector_type: kind,
    title: conn?.title || '',
    base_url: conn?.base_url || '',
    api_token: '',
    has_token: Boolean(conn?.has_token),
    remote_owner: conn?.remote_owner ? Number(conn.remote_owner) : '',
    source_tag: Number(conn?.source_tag) || 0,
    remote_account: conn?.remote_account || '',
    mail_folder: conn?.mail_folder || 'INBOX',
    mail_rules: conn
      ? (conn.mail_rules || []).map((r) => ({ ...r }))
      : kind === 'Mailbox'
        ? [newRule()]
        : [],
    filter_document_types: parseIds(conn?.filter_document_types),
    filter_correspondents: parseIds(conn?.filter_correspondents),
    page_size: Number(conn?.page_size) || 25,
    download_archived: Boolean(Number(conn?.download_archived)),
    webhook_url: conn?.webhook_url || '',
    write_back: Boolean(Number(conn?.write_back)),
    enable: !conn,
  }
}

/** Problems the server would refuse anyway, said before the round trip. */
export function formProblems(form) {
  const out = {}
  if (!String(form.base_url || '').trim())
    out.base_url =
      form.connector_type === 'Mailbox'
        ? tr('Write the mail server address')
        : tr('Write the Paperless address')
  if (!form.has_token && !String(form.api_token || '').trim())
    out.api_token =
      form.connector_type === 'Mailbox'
        ? tr('Paste the app password')
        : tr('Paste the access token')
  if (form.connector_type === 'Mailbox') {
    if (!String(form.remote_account || '').trim())
      out.remote_account = tr('Write the email account to read')
    if (!(form.mail_rules || []).some((r) => Number(r.enabled)))
      out.mail_rules = tr('Add at least one rule that is on')
    const bad = (form.mail_rules || []).find((r) => senderProblem(r.sender))
    if (bad) out.mail_rules = senderProblem(bad.sender)
  } else {
    const owner = Number(form.remote_owner)
    if (!Number.isInteger(owner) || owner <= 0)
      out.remote_owner = tr('Write the owner user number (1 or more)')
    const tag = Number(form.source_tag)
    if (!Number.isInteger(tag) || tag < 0)
      out.source_tag = tr('Write a tag number, or 0 for all')
    const size = Number(form.page_size)
    if (!Number.isInteger(size) || size < 1 || size > 100)
      out.page_size = tr('Between 1 and 100')
  }
  return out
}

/** The `values` for save(): only fields of the type, the secret only when typed. */
export function saveValues(form) {
  const values = {
    title: String(form.title || '').trim(),
    connector_type: form.connector_type,
    base_url: String(form.base_url || '').trim(),
  }
  if (form.name) values.name = form.name
  else values.enabled = form.enable ? 1 : 0
  const token = String(form.api_token || '').trim()
  if (token && token !== TOKEN_MASK) values.api_token = token
  if (form.connector_type === 'Mailbox') {
    values.remote_account = String(form.remote_account || '').trim()
    values.mail_folder = String(form.mail_folder || '').trim() || 'INBOX'
    values.mail_rules = (form.mail_rules || []).map((r) => ({
      enabled: Number(r.enabled) ? 1 : 0,
      sender: String(r.sender || '').trim(),
      subject: String(r.subject || '').trim(),
      attachment_types: ruleTypes(r).join(','),
      visibility: r.visibility === 'Private' ? 'Private' : 'Company',
    }))
  } else {
    values.remote_owner = Number(form.remote_owner) || 0
    values.source_tag = Number(form.source_tag) || 0
    values.filter_document_types = parseIds(form.filter_document_types)
    values.filter_correspondents = parseIds(form.filter_correspondents)
    values.page_size = Math.max(1, Math.min(100, Number(form.page_size) || 25))
    values.download_archived = form.download_archived ? 1 : 0
    values.webhook_url = String(form.webhook_url || '').trim()
    values.write_back = form.write_back ? 1 : 0
  }
  return values
}

// --- OCR -------------------------------------------------------------------

/** The OCR task state as one phrase and a tone (busy / done / error). */
export function ocrStep(task) {
  const state = task?.state
  if (state === 'Queued' || state === 'Submitting')
    return { tone: 'busy', label: tr('Sending to the archive…') }
  if (state === 'Submitted') return { tone: 'busy', label: tr('Reading text…') }
  if (state === 'Complete') return { tone: 'done', label: tr('Text ready') }
  if (state === 'Failed' || state === 'Uncertain')
    return {
      tone: 'error',
      label: task.error_message || tr('We could not read the text.'),
    }
  return null
}
/** The archive reads PDF and photos; other files already carry their text. */
export function ocrReadable(mediaType) {
  return ['application/pdf', 'image/png', 'image/jpeg'].includes(
    String(mediaType || '').toLowerCase(),
  )
}
export const OCR_POLL_MS = 5000
export const OCR_POLL_LIMIT_MS = 10 * 60 * 1000
