// «App de tus clientes» (/negocio/app-clientes): what the owner reads of the
// customer app the cell publishes on the shop's online store
// (doco.docoutils.storefront_customer_app_admin). The cell owns the sections,
// their labels, help, availability and params; this module only groups them,
// says why a switch is off, words the params and builds what a tap sends.
// Pure: no Vue, no calls.
import { LOCALE, formatMoney } from '@/utils/display'

export const CTX = 'AppClientes'

/** The owner's groups, in order; a section the cell adds later lands in «Más». */
export const GROUPS = Object.freeze([
  {
    key: 'lealtad',
    sections: ['puntos', 'tarjeta', 'cupones', 'promos', 'premios'],
  },
  { key: 'dinero', sections: ['monedero', 'adeudos', 'facturacion'] },
  { key: 'servicio', sections: ['reparaciones', 'equipos', 'recargas'] },
  { key: 'contacto', sections: ['chat', 'avisos'] },
])

/** The master switch travels as `enabled`, never as a section row. */
export const MASTER = 'enabled'

function groupLabel(key) {
  if (key === 'lealtad') return __('Loyalty', null, CTX)
  if (key === 'dinero') return __('Money', null, CTX)
  if (key === 'servicio') return __('Service', null, CTX)
  if (key === 'contacto') return __('Contact', null, CTX)
  return __('More', null, CTX)
}

// Literal class names: an icon class built at runtime is never generated.
const SECTION_ICON = Object.freeze({
  puntos: 'lucide-coins',
  tarjeta: 'lucide-id-card',
  cupones: 'lucide-ticket',
  promos: 'lucide-badge-percent',
  premios: 'lucide-gift',
  monedero: 'lucide-wallet',
  adeudos: 'lucide-hand-coins',
  facturacion: 'lucide-receipt',
  reparaciones: 'lucide-wrench',
  equipos: 'lucide-smartphone',
  recargas: 'lucide-smartphone',
  chat: 'lucide-message-circle',
  avisos: 'lucide-bell',
})

const TAB_ICON = Object.freeze({
  inicio: 'lucide-home',
  promos: 'lucide-badge-percent',
  premios: 'lucide-gift',
  actividad: 'lucide-history',
  mas: 'lucide-menu',
  tienda: 'lucide-store',
})

function tabLabel(key) {
  if (key === 'inicio') return __('Home', null, CTX)
  if (key === 'promos') return __('Promos', null, CTX)
  if (key === 'premios') return __('Rewards', null, CTX)
  if (key === 'actividad') return __('Activity', null, CTX)
  if (key === 'mas') return __('More', null, CTX)
  if (key === 'tienda') return __('Shop', null, CTX)
  return ''
}

const text = (value) => (typeof value === 'string' ? value.trim() : '')
const list = (value) => (Array.isArray(value) ? value : [])

/**
 * Where a fix sends the owner. A /crm route opens in the shell (the router's
 * base is /crm); a Desk path or an https address opens as a page; anything
 * else, or a fix without its words, is no link at all.
 */
export function fixLink(fix) {
  if (!fix || typeof fix !== 'object') return null
  const label = text(fix.label)
  const route = text(fix.route)
  if (!label || !route) return null
  if (/^\/crm(?=$|[/?#])/.test(route))
    return { label, to: route.slice(4) || '/' }
  if (/^\/(app|desk)(?=$|[/?#])/.test(route)) return { label, href: route }
  if (route.startsWith('/') && !route.startsWith('//'))
    return { label, to: route }
  if (/^https:\/\/[^\s/]+/.test(route)) return { label, href: route }
  return null
}

/** Where the owner changes whether the online store takes coupons: its row in
 * «Ajustes del negocio» (doco storefront_online_coupons, one row per shop). */
export const ONLINE_COUPONS_ROUTE = '/negocio?ajuste=doco.online_coupons'

/**
 * The line the Cupones rules start with: whether the shop's online store
 * takes coupons at all (state.online_coupons), and the way to change it. Off,
 * «Also at online checkout» does nothing, so that rule is locked (`locks`,
 * with `lockedHelp` in place of its own help). null on an older cell.
 */
export function onlineCouponsNote(state) {
  const on = state?.online_coupons
  if (typeof on !== 'boolean') return null
  return {
    on,
    locks: on ? [] : ['online'],
    lockedHelp: on
      ? ''
      : __(
          'It can be turned on once your online store takes coupons.',
          null,
          CTX,
        ),
    text: on
      ? __('Your online store takes coupons.', null, CTX)
      : __(
          'Your online store takes no coupons: it sells at list prices. Coupons work only at the register.',
          null,
          CTX,
        ),
    link: {
      label: __('Change it in Business settings', null, CTX),
      to: ONLINE_COUPONS_ROUTE,
    },
  }
}

/** The customer's door to their account on the shop's store, or ''. */
export function customerLink(storeUrl) {
  const url = text(storeUrl).replace(/\/+$/, '')
  if (!/^https?:\/\/[^\s/]+(\/\S*)?$/.test(url)) return ''
  return `${url}/cuenta`
}

/** Money in the shop's currency; a plain number when the shop names none. */
export function money(value, currency) {
  const n = Number(value)
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    !Number.isFinite(n)
  )
    return '—'
  if (currency) return formatMoney(n, currency)
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(n)
}

function count(value) {
  return new Intl.NumberFormat(LOCALE).format(Number(value))
}

function optionLabel(options, value) {
  for (const option of list(options))
    if (option?.value === value) return text(option.label)
  return ''
}

/** One param's value in words: «Sí», «$500», «Comprar en la app», «SPEI, Tarjeta». */
export function paramValueText(param, value, currency = '') {
  const type = param?.type
  if (type === 'bool') return value ? __('Yes', null, CTX) : __('No', null, CTX)
  if (type === 'money') return money(value, currency)
  if (type === 'int') {
    const n = Number(value)
    return value === null || value === '' || !Number.isFinite(n)
      ? '—'
      : count(n)
  }
  if (type === 'select') return optionLabel(param.options, value) || '—'
  if (type === 'multiselect') {
    const labels = []
    for (const one of list(value)) {
      const label = optionLabel(param.options, one)
      if (label) labels.push(label)
    }
    return labels.length ? labels.join(', ') : __('None', null, CTX)
  }
  return ''
}

/** The section's params as one short line under its help («Modo: Solo ver»). */
export function paramsLine(params, currency = '') {
  const parts = []
  for (const param of list(params)) {
    const label = text(param?.label)
    const value = paramValueText(param, param?.value, currency)
    if (label && value) parts.push(`${label}: ${value}`)
  }
  return parts.join('; ')
}

/** {on, disabled, sentence, reason, fix, channels} of the master switch. */
export function masterView(state, pending = {}) {
  const login = state?.login || {}
  const loginOk = login.ok === true
  const canChange = state?.can_change === true
  const stored = Boolean(state?.enabled)
  const on = MASTER in pending ? Boolean(pending[MASTER]) : stored
  const channels = channelWords(login.channels)
  let sentence = on
    ? __(
        'Your customers sign in on your online store and see what you turn on below.',
        null,
        CTX,
      )
    : __(
        'Off: your online store keeps the account page it has today.',
        null,
        CTX,
      )
  if (on && channels)
    sentence = `${sentence} ${__('They get their code by {0}.', [channels], CTX)}`
  // Turning it off stays possible when the login broke after it went on.
  const reason = loginOk
    ? ''
    : on
      ? __(
          'Your customers cannot sign in right now. Connect email or WhatsApp so they can.',
          null,
          CTX,
        )
      : __(
          'Your customers sign in with a code by email or WhatsApp. Connect one so they can.',
          null,
          CTX,
        )
  return {
    on,
    disabled: !canChange || (!loginOk && !on),
    sentence,
    reason,
    fix: reason ? fixLink(login.fix) : null,
  }
}

function channelWords(channels) {
  const words = []
  for (const channel of list(channels)) {
    const key = typeof channel === 'string' ? channel : channel?.key
    const label =
      (typeof channel === 'object' && text(channel?.label)) ||
      (key === 'email'
        ? __('email', null, CTX)
        : key === 'whatsapp'
          ? 'WhatsApp'
          : key === 'sms'
            ? 'SMS'
            : '')
    if (label && !words.includes(label)) words.push(label)
  }
  if (words.length < 2) return words.join('')
  return `${words.slice(0, -1).join(', ')} ${__('or', null, CTX)} ${words.at(-1)}`
}

/** One section row as the owner reads it; `pending` holds taps on their way. */
export function sectionRow(
  section,
  { canChange, pending = {}, currency } = {},
) {
  const key = text(section?.key)
  const available = section?.available === true
  const stored = Boolean(section?.on) && available
  const on = key in pending ? Boolean(pending[key]) : stored
  const params = list(section?.params).filter(
    (param) => param && text(param.key),
  )
  const blockedText = available
    ? ''
    : text(section?.blocked?.text) ||
      __('This shop cannot offer it yet.', null, CTX)
  return {
    key,
    label: text(section?.label) || key,
    help: text(section?.help),
    icon: SECTION_ICON[key] || 'lucide-circle',
    on,
    available,
    disabled: !canChange || !available,
    blocked: available
      ? null
      : { text: blockedText, fix: fixLink(section?.blocked?.fix) },
    params,
    paramsLine: available ? paramsLine(params, currency) : '',
    // The pencil opens the params even read-only: the owner sees the rules.
    editable: available && params.length > 0,
  }
}

/**
 * The sections in the owner's groups, rows in the cell's order within each
 * group's own order. A section no group names goes to a last «Más» group;
 * the master key never shows as a row.
 */
export function sectionGroups(state, pending = {}, currency = '') {
  const canChange = state?.can_change === true
  const rows = new Map()
  for (const section of list(state?.sections)) {
    const row = sectionRow(section, { canChange, pending, currency })
    if (!row.key || row.key === MASTER || rows.has(row.key)) continue
    rows.set(row.key, row)
  }
  const groups = []
  const placed = new Set()
  for (const group of GROUPS) {
    const mine = []
    for (const key of group.sections) {
      const row = rows.get(key)
      if (row) {
        mine.push(row)
        placed.add(key)
      }
    }
    if (mine.length)
      groups.push({ key: group.key, label: groupLabel(group.key), rows: mine })
  }
  const rest = [...rows.values()].filter((row) => !placed.has(row.key))
  if (rest.length)
    groups.push({ key: 'otros', label: groupLabel('otros'), rows: rest })
  return groups
}

/** The bottom tabs the customer gets, as the preview draws them. */
export function previewTabs(tabs) {
  const out = []
  for (const tab of list(tabs)) {
    const key = typeof tab === 'string' ? tab : text(tab?.key || tab?.tab)
    if (!key || out.some((one) => one.key === key)) continue
    const label = (typeof tab === 'object' && text(tab?.label)) || tabLabel(key)
    if (!label) continue
    out.push({ key, label, icon: TAB_ICON[key] || 'lucide-circle' })
  }
  if (out.length) return out
  // A cell that sends no tabs: the shop's usual store and its account.
  return ['inicio', 'tienda', 'mas'].map((key) => ({
    key,
    label: tabLabel(key),
    icon: TAB_ICON[key],
  }))
}

/** What the preview card says: the sections customers see, in group order. */
export function previewView(state, pending = {}, currency = '') {
  const master = masterView(state, pending)
  const shown = []
  for (const group of sectionGroups(state, pending, currency))
    for (const row of group.rows)
      if (row.on && row.available)
        shown.push({ key: row.key, label: row.label, icon: row.icon })
  let line
  if (!master.on)
    line = __('Your customers see your store as always.', null, CTX)
  else if (!shown.length)
    line = __('Nothing turned on yet: they see their usual account.', null, CTX)
  else
    line = __('They see: {0}.', [shown.map((one) => one.label).join(', ')], CTX)
  return {
    on: master.on,
    chip: master.on
      ? { label: __('On', null, CTX), tone: 'success' }
      : { label: __('Off', null, CTX), tone: 'neutral' },
    line,
    shown,
    tabs: previewTabs(state?.tabs),
    link: customerLink(state?.store_url),
  }
}

const KPIS = Object.freeze([
  ['accounts', 'count'],
  ['active_30d', 'count'],
  ['cards', 'count'],
  ['coupons_used_30d', 'count'],
  ['rewards_30d', 'count'],
  ['debt_paid_online_30d', 'money'],
])

function kpiLabel(key) {
  if (key === 'accounts') return __('Customer accounts', null, CTX)
  if (key === 'active_30d') return __('Came in, last 30 days', null, CTX)
  if (key === 'cards') return __('Cards', null, CTX)
  if (key === 'coupons_used_30d')
    return __('Coupons used, last 30 days', null, CTX)
  if (key === 'rewards_30d') return __('Rewards taken, last 30 days', null, CTX)
  return __('Debts paid online, last 30 days', null, CTX)
}

/** The KPI tiles the cell answered; a figure it could not count stays out. */
export function kpiTiles(kpis, currency = '') {
  const tiles = []
  for (const [key, kind] of KPIS) {
    const value = kpis?.[key]
    if (value === null || value === undefined || value === '') continue
    const n = Number(value)
    if (!Number.isFinite(n)) continue
    tiles.push({
      key,
      label: kpiLabel(key),
      value: kind === 'money' ? money(n, currency) : count(n),
    })
  }
  return tiles
}

/**
 * «Cómo va», after the parts: null while the app is off (or the cell counted
 * nothing), one line while every figure is still zero, else the figures.
 */
export function kpiBlock(state, pending = {}, currency = '') {
  if (!masterView(state, pending).on) return null
  const tiles = kpiTiles(state?.kpis, currency)
  if (!tiles.length) return null
  if (tiles.every((tile) => Number(state.kpis[tile.key]) === 0))
    return {
      quiet: __(
        'No activity yet: here you will see how many customers use the app.',
        null,
        CTX,
      ),
      tiles: [],
    }
  return { quiet: '', tiles }
}

/** What one tap sends to `save`: the master, a section, or a section's params. */
export function changeFor(key, value) {
  if (key === MASTER) return { enabled: Boolean(value) }
  return { sections: { [key]: Boolean(value) } }
}
export function paramsChange(section, changes) {
  return { params: { [section]: changes } }
}

/** The toast after the server took a tap. */
export function tapToast(row, value) {
  if (row.key === MASTER)
    return value
      ? __('The app is on for your customers.', null, CTX)
      : __('The app is off. Your store keeps its usual account.', null, CTX)
  return value
    ? __('Your customers now see {0}.', [row.label], CTX)
    : __('Your customers no longer see {0}.', [row.label], CTX)
}

/**
 * What the server's answer to a tap says: {ok, text}. The answer can keep a
 * section off (it stopped being available): the switch shows what the
 * server says and the toast says why.
 */
export function tapOutcome(answer, row, value) {
  let now
  let section = null
  if (row.key === MASTER) now = Boolean(answer?.enabled)
  else {
    for (const one of list(answer?.sections))
      if (one?.key === row.key) section = one
    now = Boolean(section?.on) && section?.available === true
  }
  if (now === Boolean(value)) return { ok: true, text: tapToast(row, value) }
  const why =
    row.key === MASTER
      ? masterView(answer).reason
      : text(section?.blocked?.text)
  return {
    ok: false,
    text: why || __('It did not change. Try again.', null, CTX),
  }
}

// --- params sheet -----------------------------------------------------------

const isNumberType = (type) => type === 'int' || type === 'money'

/** The sheet's starting values: numbers as typed text, lists as copies. */
export function paramDraft(params) {
  const draft = {}
  for (const param of list(params)) {
    const value = param.value
    if (param.type === 'bool') draft[param.key] = Boolean(value)
    else if (param.type === 'multiselect') draft[param.key] = [...list(value)]
    else if (isNumberType(param.type))
      draft[param.key] =
        value === null || value === undefined ? '' : String(value)
    else draft[param.key] = value ?? ''
  }
  return draft
}

/** Why a typed value cannot be saved, in the owner's words, or ''. */
export function paramProblem(param, raw, currency = '') {
  if (!isNumberType(param?.type)) return ''
  const typed = String(raw ?? '').trim()
  const n = Number(typed)
  if (!typed || !Number.isFinite(n)) return __('Write a number.', null, CTX)
  if (param.type === 'int' && !Number.isInteger(n))
    return __('Whole numbers only.', null, CTX)
  const shown = (limit) =>
    param.type === 'money' ? money(limit, currency) : count(limit)
  const min = limitOf(param.min)
  const max = limitOf(param.max)
  if (min !== null && n < min) return __('At least {0}.', [shown(min)], CTX)
  if (max !== null && n > max) return __('At most {0}.', [shown(max)], CTX)
  return ''
}

function limitOf(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function sameSet(a, b) {
  const left = new Set(list(a))
  const right = new Set(list(b))
  if (left.size !== right.size) return false
  for (const value of left) if (!right.has(value)) return false
  return true
}

/** Only what the owner changed, typed the way the cell stores it. */
export function paramChanges(params, draft) {
  const changes = {}
  for (const param of list(params)) {
    const raw = draft?.[param.key]
    if (param.type === 'bool') {
      if (Boolean(raw) !== Boolean(param.value))
        changes[param.key] = Boolean(raw)
    } else if (param.type === 'multiselect') {
      if (!sameSet(raw, param.value)) {
        // The options' order, never the order of the taps.
        const picked = new Set(list(raw))
        const ordered = []
        for (const option of list(param.options))
          if (picked.has(option?.value)) ordered.push(option.value)
        changes[param.key] = ordered
      }
    } else if (isNumberType(param.type)) {
      const n = Number(String(raw ?? '').trim())
      if (
        String(raw ?? '').trim() &&
        Number.isFinite(n) &&
        n !== Number(param.value)
      )
        changes[param.key] = n
    } else if ((raw ?? '') !== (param.value ?? '')) changes[param.key] = raw
  }
  return changes
}

/** The currency's sign for a money field's prefix («$», «US$»), or ''. */
export function currencySign(currency) {
  if (!currency) return ''
  try {
    const parts = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
    }).formatToParts(0)
    for (const part of parts) if (part.type === 'currency') return part.value
  } catch {
    // An unknown code shows as itself.
  }
  return currency
}

// --- legal texts --------------------------------------------------------------

/** The four texts customers read, each with the cell's built-in key. */
export const LEGAL_FIELDS = Object.freeze([
  { key: 'terms_text', builtin: 'terms' },
  { key: 'returns_policy_text', builtin: 'returns' },
  { key: 'warranty_policy_text', builtin: 'warranty' },
  { key: 'privacy_notice', builtin: '' },
])

function legalLabel(key) {
  if (key === 'terms_text') return __('Terms and conditions', null, CTX)
  if (key === 'returns_policy_text') return __('Returns', null, CTX)
  if (key === 'warranty_policy_text') return __('Warranty', null, CTX)
  return __('Privacy notice', null, CTX)
}

/** [{key, label, suggested}]: the suggested text is the cell's built-in one. */
export function legalFields(texts) {
  return LEGAL_FIELDS.map((field) => ({
    key: field.key,
    label: legalLabel(field.key),
    suggested: field.builtin ? text(texts?.builtin?.[field.builtin]) : '',
  }))
}

export function legalDraft(texts) {
  const draft = {}
  for (const field of LEGAL_FIELDS)
    draft[field.key] =
      typeof texts?.[field.key] === 'string' ? texts[field.key] : ''
  const days = texts?.return_window_days
  draft.return_window_days =
    days === null || days === undefined ? '' : String(days)
  // The days to answer a privacy request, only where the cell has the field.
  if (Number.isFinite(texts?.arco_response_days))
    draft.arco_response_days = String(texts.arco_response_days)
  return draft
}

/** Why the texts cannot be saved, or ''. */
export function legalProblem(draft) {
  const typed = String(draft?.return_window_days ?? '').trim()
  const n = Number(typed)
  if (!typed || !Number.isInteger(n) || n < 0 || n > 365)
    return __('Write the days as a whole number from 0 to 365.', null, CTX)
  return ''
}

/**
 * The days to answer a privacy request: {default, max} from the shop's
 * country (the law's figure is the default and, where the law sets one, the
 * most it may be), or null where the cell does not offer the field.
 */
export function arcoRule(texts) {
  if (!Number.isFinite(texts?.arco_response_days)) return null
  const fallback = Number(texts.arco_response_days)
  const def = Number.isFinite(texts.arco_days_default)
    ? texts.arco_days_default
    : fallback
  const max = Number.isFinite(texts.arco_days_max) ? texts.arco_days_max : 90
  return { default: def, max }
}

/** Why the days to answer a privacy request cannot be saved, or ''. */
export function arcoProblem(draft, texts) {
  const rule = arcoRule(texts)
  if (!rule || !('arco_response_days' in (draft || {}))) return ''
  const typed = String(draft.arco_response_days ?? '').trim()
  const n = Number(typed)
  if (!typed || !Number.isInteger(n) || n < 1 || n > rule.max)
    return __(
      'Write the days as a whole number from 1 to {0}.',
      [rule.max],
      CTX,
    )
  return ''
}

export function legalDirty(texts, draft) {
  const start = legalDraft(texts)
  for (const key of Object.keys(start))
    if (String(start[key]) !== String(draft?.[key] ?? '')) return true
  return false
}

/** Every text as the owner left it (sent whole, so none is lost on the way). */
export function legalPayload(draft) {
  const texts = {}
  for (const field of LEGAL_FIELDS)
    texts[field.key] = String(draft?.[field.key] ?? '')
  texts.return_window_days = Number(
    String(draft?.return_window_days ?? '').trim(),
  )
  if (draft && 'arco_response_days' in draft)
    texts.arco_response_days = Number(
      String(draft.arco_response_days ?? '').trim(),
    )
  return texts
}

// --- doors --------------------------------------------------------------------

/** The row Fidelidad shows, or null where the shop has no online store. */
export function doorView(state) {
  if (!state || !text(state.profile)) return null
  const preview = previewView(state)
  let line
  if (!preview.on) line = __('Off. Turn it on in a few taps.', null, CTX)
  else if (!preview.shown.length)
    line = __('On, with nothing turned on yet.', null, CTX)
  else
    line = __(
      'On: {0}',
      [preview.shown.map((one) => one.label).join(', ')],
      CTX,
    )
  return { line }
}

/** The shop picker's choices; none when there is only one shop. */
export function profileScopes(state) {
  const scopes = []
  for (const profile of list(state?.profiles)) {
    const name = text(profile?.name)
    if (!name || scopes.some((one) => one.value === name)) continue
    scopes.push({ value: name, label: text(profile.label) || name })
  }
  return scopes.length > 1 ? scopes : []
}

/** The shop's name for the preview: its label among the profiles. */
export function profileLabel(state) {
  const name = text(state?.profile)
  for (const profile of list(state?.profiles))
    if (text(profile?.name) === name) return text(profile.label) || name
  return name
}

/**
 * The owner's published pages the app's own pages cover while it is on
 * (/devoluciones, /garantias…), as one line, or '' when none: customers see the
 * app's page at that address, so the owner renames theirs to keep it.
 */
export function pagesTakenLine(state) {
  const pages = Array.isArray(state?.pages_taken) ? state.pages_taken : []
  const paths = []
  for (const page of pages) {
    const path = typeof page?.path === 'string' ? page.path : ''
    if (path && !paths.includes(path)) paths.push(path)
  }
  if (!paths.length) return ''
  return paths.length === 1
    ? __(
        'While the app is on, {0} shows the app’s page instead of yours. Give your page another address to keep it.',
        [paths[0]],
        CTX,
      )
    : __(
        'While the app is on, {0} show the app’s pages instead of yours. Give your pages other addresses to keep them.',
        [paths.join(', ')],
        CTX,
      )
}
