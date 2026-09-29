// Field memory: values the operator typed before (recipients, subjects,
// captions, template holes), offered again next time.
//
// Server side: doco_marketing.api.composer.suggest_values / remember_values
// (owner-only `Composer Field Memory`). A per-user localStorage copy keeps
// suggestions working offline and before the backend is deployed; both are
// merged by the pure `rankSuggestions` (tests/unit/fieldMemory.test.js).
// Every network call fails soft: a failure only means fewer suggestions.
import { call } from 'frappe-ui'
import { useStorage } from '@vueuse/core'

export const SUGGEST_URL = 'doco_marketing.api.composer.suggest_values'
export const REMEMBER_URL = 'doco_marketing.api.composer.remember_values'
export const MEMORY_LIMIT = 8
export const LOCAL_PER_SCOPE = 50
// Recency half-life: a value used 14 days ago weighs half of one used today.
const HALF_LIFE_DAYS = 14
const DAY_MS = 86400000
const SERVER_CACHE_MS = 30000
const SERVER_BACKOFF_MS = 5 * 60000

// Logout sweeps keys with this prefix (stores/session.js).
export const LOCAL_KEY_PREFIX = 'doco-composer-memory:'

function norm(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function toMs(v) {
  if (!v) return 0
  if (typeof v === 'number') return v
  // Frappe datetimes come as "YYYY-MM-DD HH:MM:SS".
  const ms = Date.parse(String(v).replace(' ', 'T'))
  return Number.isNaN(ms) ? 0 : ms
}

// Merge server + local rows ({value, context, uses, last_used}) into at most
// `limit` distinct values. Order:
//   1. rows used with this same context (the contact / deal) first,
//   2. then values that START with the typed prefix (substring matches after),
//   3. then uses × recency decay, ties keep the input order (server first).
// With a prefix, values that do not contain it are dropped.
export function rankSuggestions(
  serverRows,
  localRows,
  { context = null, prefix = '', now = Date.now(), limit = MEMORY_LIMIT } = {},
) {
  const p = norm(prefix)
  const ctx = context ? norm(context) : ''
  const merged = new Map()
  let order = 0
  for (const row of [...(serverRows || []), ...(localRows || [])]) {
    const value = typeof row === 'string' ? row : row?.value
    if (value == null || String(value).trim() === '') continue
    const key = norm(value)
    const uses = Math.max(1, Number(row?.uses) || 1)
    const last = toMs(row?.last_used)
    const sameCtx = !!ctx && norm(row?.context) === ctx
    const prev = merged.get(key)
    if (!prev) {
      merged.set(key, {
        value: String(value),
        uses,
        last,
        sameCtx,
        order: order++,
      })
    } else {
      prev.uses = Math.max(prev.uses, uses)
      prev.last = Math.max(prev.last, last)
      prev.sameCtx = prev.sameCtx || sameCtx
    }
  }
  const scored = []
  for (const [key, r] of merged) {
    if (p && !key.includes(p)) continue
    const ageDays = r.last ? Math.max(0, (now - r.last) / DAY_MS) : 365
    scored.push({
      ...r,
      prefixHit: p ? key.startsWith(p) : true,
      score: r.uses * Math.pow(0.5, ageDays / HALF_LIFE_DAYS),
    })
  }
  scored.sort(
    (a, b) =>
      b.sameCtx - a.sameCtx ||
      b.prefixHit - a.prefixHit ||
      b.score - a.score ||
      a.order - b.order,
  )
  return scored.slice(0, limit).map((r) => r.value)
}

// ── local copy (per user) ─────────────────────────────────────────────────────

function currentUser() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)user_id=([^;]*)/)
    return m ? decodeURIComponent(m[1]) : 'guest'
  } catch {
    return 'guest'
  }
}

let _store = null
function localStore() {
  if (_store) return _store
  try {
    _store = useStorage(`${LOCAL_KEY_PREFIX}${currentUser()}`, {})
  } catch {
    _store = { value: {} }
  }
  return _store
}

export function localRows(scope) {
  const rows = localStore().value?.[scope]
  return Array.isArray(rows) ? rows : []
}

function rememberLocal(entry, now = Date.now()) {
  const store = localStore()
  const all = { ...(store.value || {}) }
  const rows = [...(all[entry.scope] || [])]
  const key = norm(entry.value)
  const i = rows.findIndex(
    (r) => norm(r.value) === key && (r.context || '') === (entry.context || ''),
  )
  if (i >= 0)
    rows[i] = { ...rows[i], uses: (rows[i].uses || 1) + 1, last_used: now }
  else
    rows.push({
      value: entry.value,
      context: entry.context || '',
      uses: 1,
      last_used: now,
    })
  // Keep the most recent LOCAL_PER_SCOPE rows.
  rows.sort((a, b) => toMs(b.last_used) - toMs(a.last_used))
  all[entry.scope] = rows.slice(0, LOCAL_PER_SCOPE)
  store.value = all
}

// ── server ────────────────────────────────────────────────────────────────────

const _cache = new Map()
let _serverDownUntil = 0

async function serverRows(scope, prefix, context) {
  if (Date.now() < _serverDownUntil) return []
  const key = `${scope}|${norm(prefix)}|${context || ''}`
  const hit = _cache.get(key)
  if (hit && Date.now() - hit.at < SERVER_CACHE_MS) return hit.rows
  try {
    const res = await call(SUGGEST_URL, {
      scope,
      prefix: prefix || '',
      context: context || undefined,
      limit: MEMORY_LIMIT,
    })
    const rows = Array.isArray(res) ? res : res?.values || []
    _cache.set(key, { at: Date.now(), rows })
    return rows
  } catch {
    // Not deployed yet / offline / no permission: back off, use the local copy.
    _serverDownUntil = Date.now() + SERVER_BACKOFF_MS
    return []
  }
}

// Ranked suggestions for one field. Never rejects.
export async function suggest(scope, prefix = '', context = null) {
  if (!scope) return []
  const rows = await serverRows(scope, prefix, context)
  return rankSuggestions(rows, localRows(scope), { context, prefix })
}

// Fire and forget. entries: [{scope, value, context}]
export function remember(entries) {
  const list = (entries || []).filter(
    (e) => e && e.scope && e.value != null && String(e.value).trim() !== '',
  )
  if (!list.length) return
  const clean = list.map((e) => ({
    scope: e.scope,
    value: String(e.value).trim(),
    context: e.context || '',
  }))
  for (const e of clean) {
    try {
      rememberLocal(e)
    } catch {
      /* storage unavailable */
    }
  }
  // Fresh values must show up next time: drop cached server answers for these scopes.
  for (const k of [..._cache.keys()])
    if (clean.some((e) => k.startsWith(`${e.scope}|`))) _cache.delete(k)
  if (Date.now() < _serverDownUntil) return
  Promise.resolve()
    .then(() => call(REMEMBER_URL, { entries: JSON.stringify(clean) }))
    .catch(() => {
      _serverDownUntil = Date.now() + SERVER_BACKOFF_MS
    })
}
