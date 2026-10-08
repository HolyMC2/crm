import { ref } from 'vue'
import { call } from 'frappe-ui'
import { errorKind, formatMoment } from '@/utils/contactos'

// English source strings; the es-MX catalog (crm/locale/es.po) translates them.
const t = (text, replace) =>
  globalThis.window?.__
    ? globalThis.window.__(text, replace)
    : replace
      ? text.replace(/{(\d+)}/g, (match, index) => replace[index] ?? match)
      : text

export const CATEGORIES = Object.freeze([
  'direct',
  'messages',
  'alerts',
  'system',
])
export const VIEWS = Object.freeze(['inbox', 'history', 'muted'])
export const MODES = Object.freeze(['badge', 'quiet', 'off'])

export function categoryMeta(category) {
  return (
    {
      direct: { label: t('For you'), icon: 'at-sign' },
      messages: { label: t('Messages'), icon: 'message-circle' },
      alerts: { label: t('Alerts'), icon: 'alert-triangle' },
      system: { label: t('System'), icon: 'activity' },
    }[category] || { label: t('Avisos'), icon: 'bell' }
  )
}

export function modeLabel(mode) {
  return {
    badge: t('Notify me'),
    quiet: t('List only'),
    off: t('Hide'),
  }[mode]
}

/** Sidebar lists: the inbox, one per category, then history and muted. */
export function listEntries(counts = {}) {
  const withCount = (label, count) => (count ? `${label} · ${count}` : label)
  const inbox = CATEGORIES.reduce((sum, cat) => sum + (counts[cat] || 0), 0)
  return [
    { value: 'inbox', label: withCount(t('To review'), inbox), icon: 'inbox' },
    ...CATEGORIES.map((cat) => ({
      value: cat,
      label: withCount(categoryMeta(cat).label, counts[cat]),
      icon: categoryMeta(cat).icon,
    })),
    { value: 'history', label: t('History'), icon: 'clock' },
    { value: 'muted', label: t('Muted'), icon: 'bell-off' },
  ]
}

/** URL query → list state; unknown values fall back to the inbox. */
export function avisosState(query = {}) {
  const pick = (value) => (Array.isArray(value) ? value[0] : value)
  const view = VIEWS.includes(pick(query.view)) ? pick(query.view) : 'inbox'
  const category =
    view === 'inbox' && CATEGORIES.includes(pick(query.category))
      ? pick(query.category)
      : 'all'
  const q = typeof pick(query.q) === 'string' ? pick(query.q).slice(0, 120) : ''
  return { view, category, q }
}

export function avisosQuery(state) {
  const query = {}
  if (state.view && state.view !== 'inbox') query.view = state.view
  if (state.view === 'inbox' && state.category && state.category !== 'all')
    query.category = state.category
  if (state.q) query.q = state.q
  return query
}

/** The sidebar entry a state selects, and the state an entry selects. */
export function activeEntry(state) {
  return state.view === 'inbox' && state.category !== 'all'
    ? state.category
    : state.view
}
export function entryState(value, q = '') {
  if (CATEGORIES.includes(value)) return { view: 'inbox', category: value, q }
  return { view: VIEWS.includes(value) ? value : 'inbox', category: 'all', q }
}

export function badgeLabel(badge) {
  const count = Number(badge?.count || 0)
  if (!count) return ''
  return count > 99 || (badge?.capped && count >= 99) ? '99+' : String(count)
}

/** One line under the title: «×3 · Trato DEAL-0042 · hace 5 minutos». */
export function metaLine(group, { lang, timezone, now } = {}) {
  const parts = []
  if (group.count > 1) parts.push(`×${group.count}`)
  const record = group.target?.label || group.docname
  if (record) parts.push(record)
  if (group.from_name && group.category === 'direct')
    parts.push(group.from_name)
  parts.push(formatMoment(group.latest, { lang, timezone, now }))
  return parts.filter(Boolean).join(' · ')
}

/**
 * Where «Open» goes: an SPA route this build knows (with return_to back to
 * the caller), else the Desk form, else nothing (the reason is shown).
 */
export function openTarget(group, router, returnTo = '', returnLabel = '') {
  const target = group?.target || {}
  if (target.route && router) {
    const url = new URL(target.route, 'https://muelle.invalid')
    const resolved = router.resolve(url.pathname + url.search)
    const known =
      resolved.matched.length &&
      !resolved.matched.some((record) => record.path === '/:invalidpath')
    if (known) {
      if (returnTo && returnTo.startsWith('/crm/')) {
        url.searchParams.set('return_to', returnTo)
        url.searchParams.set('return_label', returnLabel || t('Avisos'))
      }
      return { kind: 'route', to: url.pathname + url.search + url.hash }
    }
  }
  if (target.desk) return { kind: 'desk', href: target.desk }
  return { kind: 'none', reason: target.reason || '' }
}

export function errorText(error) {
  const kind = errorKind(error)
  if (kind === 'conflict')
    return t('Your avisos changed in another window. Refresh and try again.')
  if (kind === 'permission')
    return t(
      'Avisos is available to staff accounts only. Ask your manager to check your user.',
    )
  return (
    error?.messages?.[0] ||
    t('We could not load your avisos. Check your connection and try again.')
  )
}

// ── shared live state (badge, panel, change signal) ─────────────────────────

export const avisosBadge = ref({ count: 0, capped: false })
export const avisosPanelOpen = ref(false)
/** Bumped on every server-side change so open lists reload. */
export const avisosVersion = ref(0)

let badgeRequest
export function refreshBadge() {
  if (badgeRequest) return badgeRequest
  badgeRequest = call('crm.api.avisos.get_badge')
    .then((badge) => {
      avisosBadge.value = badge || { count: 0, capped: false }
      return avisosBadge.value
    })
    .catch(() => avisosBadge.value)
    .finally(() => {
      badgeRequest = null
    })
  return badgeRequest
}

function changed() {
  avisosVersion.value += 1
  refreshBadge()
}

let liveSocket
let liveTimer
/** Realtime + focus refresh, registered once per page whoever mounts first. */
export function startAvisosLive(socket) {
  if (socket && socket !== liveSocket) {
    liveSocket = socket
    for (const event of ['notification', 'crm_notification', 'avisos_changed'])
      socket.on(event, changed)
  }
  if (liveTimer || typeof document === 'undefined') return
  const visible = () => document.visibilityState !== 'hidden'
  document.addEventListener('visibilitychange', () => {
    if (visible()) changed()
  })
  liveTimer = setInterval(() => {
    if (visible()) refreshBadge()
  }, 120000)
  refreshBadge()
}

// ── server calls ─────────────────────────────────────────────────────────────

export function loadStream(state, start = 0) {
  return call('crm.api.avisos.get_stream', {
    view: state.view,
    category: state.category,
    q: state.q || '',
    start,
    limit: 50,
  })
}

export async function markRead({ keys = null, category = null, view } = {}) {
  const result = await call('crm.api.avisos.mark_read', {
    keys: keys ? JSON.stringify(keys) : null,
    category,
    view: view || 'inbox',
  })
  changed()
  return result
}

export async function undoRead(result) {
  await call('crm.api.avisos.mark_unread', {
    native: JSON.stringify(result?.native || []),
    crm: JSON.stringify(result?.crm || []),
  })
  changed()
}

export async function setMuted(kind, muted) {
  const prefs = await call('crm.api.avisos.set_muted', {
    kind,
    muted: muted ? 1 : 0,
  })
  changed()
  return prefs
}

export async function savePreferences(categories) {
  const prefs = await call('crm.api.avisos.save_preferences', {
    categories: JSON.stringify(categories),
  })
  changed()
  return prefs
}

// ── shared row actions (page and panel) ──────────────────────────────────────

/**
 * Open / mark read / undo / mute with one status line. `returnTo()` is the
 * caller's local path for the receiving page's «Volver»; `onNavigate` closes
 * a panel before leaving.
 */
export function useAvisosActions(
  router,
  { returnTo = () => '', returnLabel = '', onNavigate } = {},
) {
  const status = ref(null)
  const busy = ref(false)

  async function run(work) {
    busy.value = true
    try {
      return await work()
    } catch (error) {
      status.value = { text: errorText(error), error: true }
      return null
    } finally {
      busy.value = false
    }
  }

  async function open(group) {
    const where = openTarget(group, router, returnTo(), returnLabel)
    if (where.kind === 'none') return where
    const marking = group.unread
      ? markRead({ keys: [group.key] }).catch(() => null)
      : null
    if (where.kind === 'route') {
      onNavigate?.()
      await router.push(where.to)
    } else {
      // Desk is a full page load: keep the read mark from being cut off.
      await marking
      onNavigate?.()
      globalThis.window?.location.assign(where.href)
    }
    return where
  }

  async function read(group) {
    const result = await run(() => markRead({ keys: [group.key] }))
    if (result)
      status.value = { text: t('Aviso marked as read.'), undo: result }
    return result
  }

  async function readAll(category, view) {
    const result = await run(() =>
      markRead({ category: category || 'all', view }),
    )
    if (result) {
      const count = (result.native?.length || 0) + (result.crm?.length || 0)
      status.value = count
        ? { text: t('Avisos marked as read.'), undo: result }
        : { text: t('Nothing left to mark as read.') }
    }
    return result
  }

  async function undo() {
    const result = status.value?.undo
    if (!result) return
    if ((await run(() => undoRead(result))) !== null)
      status.value = { text: t('Restored as unread.') }
  }

  async function mute(group, muted) {
    const prefs = await run(() => setMuted(group.kind, muted))
    if (prefs)
      status.value = {
        text: muted
          ? t('Muted. Find it under Muted to turn it back on.')
          : t('Unmuted. New avisos of this kind will show again.'),
      }
    return prefs
  }

  return { status, busy, open, read, readAll, undo, mute }
}
