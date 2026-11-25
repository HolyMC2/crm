import { comprasApi } from '@/composables/useCompras'
import { relativeTime } from '@/utils/display'

// Servidor GSM › Fuentes: where «Novedades» come from (the tools' feeds, public Telegram
// channels and news pages), how each one's last reading went, and what it brought. The
// owner pastes a link and the kind follows it; a save reads the source at once, so the
// result shows in the sheet. Reads and writes go only through
// dhru_connector.gsm_server.feeds_admin.

const SERVICE = 'dhru_connector.gsm_server.feeds_admin'

export function fuentesApi(method, args = {}) {
  return comprasApi(`${SERVICE}.${method}`, args)
}

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

// «Todas» leads (shell rule); `key` is the server's count.
export const VIEWS = Object.freeze([
  { value: 'todas', label: 'All', key: 'todas' },
  { value: 'activas', label: 'Active', key: 'activas' },
  { value: 'con_fallas', label: 'Failing', key: 'con_fallas' },
])

export function normalizeView(value) {
  return VIEWS.some((v) => v.value === value) ? value : 'todas'
}

export function inView(row, view) {
  if (view === 'activas') return Boolean(row?.enabled)
  if (view === 'con_fallas') return row?.state === 'failing'
  return true
}

export const KINDS = Object.freeze([
  { value: 'feed', label: 'Feed' },
  { value: 'telegram', label: 'Telegram channel' },
  { value: 'page', label: 'News page' },
])

export function kindLabel(kind) {
  const hit = KINDS.find((k) => k.value === kind)
  return hit ? tr(hit.label, null, 'Gsm') : ''
}

const TELEGRAM = /^(?:@|(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/)/i

/** The kind a pasted address most likely is (the server decides the same way). */
export function guessKind(url, prefix = '') {
  const text = String(url || '').trim()
  if (TELEGRAM.test(text)) return 'telegram'
  if (String(prefix || '').replace(/[/\s]/g, '')) return 'page'
  return 'feed'
}

/** A name to start from: the channel, or the site without www. */
export function suggestTitle(url) {
  const text = String(url || '').trim()
  const channel = text.match(
    /^(?:@|(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:s\/)?)([A-Za-z0-9_]+)/i,
  )
  if (channel) return channel[1]
  try {
    return new URL(text).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function stateChip(state) {
  return (
    {
      ok: { label: tr('Up to date', null, 'Gsm'), tone: 'success' },
      new: { label: tr('Not read yet', null, 'Gsm'), tone: 'neutral' },
      failing: { label: tr('Failing', null, 'Gsm'), tone: 'danger' },
      off: { label: tr('Off', null, 'Gsm'), tone: 'neutral' },
    }[state] || { label: '', tone: 'neutral' }
  )
}

/** «Canal de Telegram · leída hace 20 min · 24 novedades», or the failure. */
export function rowSubtitle(row, now = new Date()) {
  const parts = [kindLabel(row?.kind)]
  if (row?.state === 'failing' && row?.error) parts.push(row.error)
  else if (row?.last_ok)
    parts.push(tr('read {0}', [relativeTime(row.last_ok, { now })], 'Gsm'))
  if (row?.count)
    parts.push(
      row.count === 1
        ? tr('1 item', null, 'Gsm')
        : tr('{0} items', [row.count], 'Gsm'),
    )
  if (row?.enabled && !row?.on_site) parts.push(tr('team only', null, 'Gsm'))
  return parts.filter(Boolean).join(' · ')
}

/** What a save or a check brought, for the toast. */
export function checkReceipt(result) {
  if (!result?.ok) return { ok: false, line: result?.error || '' }
  if (result.unchanged)
    return { ok: true, line: tr('Read: nothing new', null, 'Gsm') }
  const n = Number(result.new) || 0
  return {
    ok: true,
    line:
      n === 0
        ? tr('Read: nothing new', null, 'Gsm')
        : n === 1
          ? tr('Read: 1 new item', null, 'Gsm')
          : tr('Read: {0} new items', [n], 'Gsm'),
  }
}
