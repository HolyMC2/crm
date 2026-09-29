// `/` command palette for the conversation composers (WhatsApp, Messenger, Email).
//
// Pure helpers first (parse, build, rank, keyboard, template holes); they carry
// no Vue or network state so they are unit-tested directly
// (tests/unit/slashCommands.test.js). `useSlashMenu()` wraps them in the small
// reactive state a composer needs. Contract: docs/COMPOSER_COMMANDS.md.
import { ref, computed } from 'vue'

// ── parsing ───────────────────────────────────────────────────────────────────

// A command lives at the ROOT of the message: optional leading whitespace, then
// `/token`. It is only "active" while the caret sits inside that token, so a
// message that merely starts with a path ("/tmp is full") stops matching the
// moment the operator types past the first word.
const ROOT_RE = /^(\s*)\/(\S*)/

export function parseSlash(text, caret) {
  const value = typeof text === 'string' ? text : ''
  const m = ROOT_RE.exec(value)
  if (!m) return null
  const slash = m[1].length
  const end = slash + 1 + m[2].length
  const pos = caret == null ? value.length : caret
  if (pos <= slash || pos > end) return null
  return { query: m[2], start: slash, end }
}

// The text left once the `/token` (and the space after it) is removed.
export function stripSlash(text, parsed) {
  const value = text || ''
  if (!parsed) return value
  return (value.slice(0, parsed.start) + value.slice(parsed.end)).replace(
    /^\s+/,
    '',
  )
}

// ── normalising / slugs ───────────────────────────────────────────────────────

export function normalize(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

// "Horario de atención" → "horario-de-atencion" (the Canned Reply shortcut shape).
export function slugify(s) {
  return normalize(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

// ── items ─────────────────────────────────────────────────────────────────────

function excerpt(text, n = 80) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

function templateFitsChannel(t, channel) {
  if (t.kind === 'whatsapp') return channel === 'whatsapp'
  const c = normalize(t.channel || 'Any')
  return !c || c === 'any' || c === normalize(channel)
}

export const CATALOG_COMMAND = Object.freeze({
  key: 'cat',
  aliases: ['catalogo', 'catalog', 'producto'],
})

// Flat, render-ready item list.
//   catalog      — get_command_catalog response, or null when it failed / is loading
//   quickReplies — [{label, text}] local chips (crm.api.whatsapp.get_quick_replies,
//                  or Messenger's canned replies)
//   channel      — 'whatsapp' | 'messenger' | 'email'
//   opts.catalogCommand — include `/cat` (true when the addon is available)
export function buildItems(
  catalog,
  quickReplies,
  channel,
  { catalogCommand = true } = {},
) {
  const items = []
  const cat = catalog && typeof catalog === 'object' ? catalog : {}
  for (const c of Array.isArray(cat.commands) ? cat.commands : []) {
    if (!c || !c.key) continue
    const available = c.available !== false
    let hint = ''
    if (!available) hint = c.reason || ''
    else if (c.kind === 'document' && c.count != null)
      hint = c.count === 1 ? __('1 documento') : __('{0} documentos', [c.count])
    items.push({
      id: `cmd:${c.key}`,
      type: 'command',
      label: c.label || c.key,
      hint,
      keywords: [c.key, ...(c.aliases || [])].map(normalize),
      shortcut: c.key,
      payload: {
        kind: c.kind,
        key: c.key,
        doctype: c.doctype || '',
        count: c.count ?? null,
      },
      available,
      reason: available ? '' : c.reason || '',
    })
  }
  if (catalogCommand && !items.some((i) => i.shortcut === CATALOG_COMMAND.key))
    items.push({
      id: 'cmd:cat',
      type: 'command',
      label: __('Buscar en el catálogo'),
      hint: __('Productos con foto y precio'),
      keywords: [CATALOG_COMMAND.key, ...CATALOG_COMMAND.aliases],
      shortcut: CATALOG_COMMAND.key,
      payload: { kind: 'catalog' },
      available: true,
      reason: '',
    })
  const seenText = new Set()
  for (const t of Array.isArray(cat.templates) ? cat.templates : []) {
    if (!t || !templateFitsChannel(t, channel)) continue
    const meta = t.kind === 'whatsapp'
    seenText.add(normalize(t.body))
    items.push({
      id: `${meta ? 'meta' : 'tpl'}:${t.id}`,
      type: meta ? 'meta' : 'template',
      label: t.title || t.id,
      hint: excerpt(t.body),
      keywords: [t.shortcut, t.title].filter(Boolean).map(normalize),
      shortcut: t.shortcut || '',
      payload: {
        id: t.id,
        kind: t.kind || 'reply',
        title: t.title || t.id,
        body: t.body || '',
        document_type: t.document_type || '',
      },
      available: true,
      reason: '',
    })
  }
  ;(Array.isArray(quickReplies) ? quickReplies : []).forEach((q, i) => {
    const text = typeof q === 'string' ? q : q?.text
    if (!text || seenText.has(normalize(text))) return
    seenText.add(normalize(text))
    const label = (typeof q === 'string' ? '' : q.label) || excerpt(text, 32)
    items.push({
      id: `quick:${i}`,
      type: 'quick',
      label,
      hint: excerpt(text),
      keywords: [normalize(label), slugify(label)],
      shortcut: '',
      payload: { label, text },
      available: true,
      reason: '',
    })
  })
  return items
}

// ── ranking ───────────────────────────────────────────────────────────────────

function isSubsequence(needle, hay) {
  let i = 0
  for (let j = 0; j < hay.length && i < needle.length; j++)
    if (hay[j] === needle[i]) i++
  return i === needle.length
}

// Lower is better; null = no match.
//   0 exact shortcut/alias · 1 shortcut/alias prefix · 2 label-word prefix · 3 fuzzy
export function matchTier(item, query) {
  const q = normalize(query)
  if (!q) return 0
  const keys = [item.shortcut, ...(item.keywords || [])]
    .filter(Boolean)
    .map(normalize)
  if (keys.includes(q)) return 0
  if (keys.some((k) => k.startsWith(q))) return 1
  const words = normalize(item.label).split(/[\s\-_/·.,:]+/)
  if (words.some((w) => w.startsWith(q))) return 2
  const hay = normalize(`${item.shortcut || ''} ${item.label}`).replace(
    /\s+/g,
    '',
  )
  if (isSubsequence(q, hay)) return 3
  return null
}

// Stable: equal tiers keep the catalog order; unavailable items sink to the end.
export function rankItems(items, query) {
  return (items || [])
    .map((item, index) => ({ item, index, tier: matchTier(item, query) }))
    .filter((r) => r.tier !== null)
    .sort(
      (a, b) =>
        (a.item.available === false) - (b.item.available === false) ||
        a.tier - b.tier ||
        a.index - b.index,
    )
    .map((r) => r.item)
}

// ── keyboard ──────────────────────────────────────────────────────────────────

// What a key does to an open menu. Pure: returns
//   { handled, activeIndex, action: 'pick' | 'close' | null }
// `handled: false` means the composer keeps its own behaviour (Enter-to-send,
// newline, caret moves), which is always the case while the menu is closed.
export function menuKeyAction(event, { open, count, activeIndex }) {
  const none = { handled: false, activeIndex, action: null }
  if (!open || !event || event.isComposing) return none
  const key = event.key
  if (key === 'Escape') return { handled: true, activeIndex, action: 'close' }
  if (!count) return none
  if (key === 'ArrowDown')
    return {
      handled: true,
      activeIndex: (activeIndex + 1) % count,
      action: null,
    }
  if (key === 'ArrowUp')
    return {
      handled: true,
      activeIndex: (activeIndex - 1 + count) % count,
      action: null,
    }
  if (
    (key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) ||
    (key === 'Tab' && !event.shiftKey)
  )
    return { handled: true, activeIndex, action: 'pick' }
  return none
}

// ── template holes ────────────────────────────────────────────────────────────

const HOLE_RE = /\{\{\s*([\w.-]+)\s*\}\}/g

export function findHoles(text) {
  const out = []
  const seen = new Set()
  for (const m of String(text || '').matchAll(HOLE_RE)) {
    if (seen.has(m[1])) continue
    seen.add(m[1])
    out.push({ key: m[1], label: m[1], value: null })
  }
  return out
}

export function fillHole(text, key, value) {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return String(text || '').replace(
    new RegExp(`\\{\\{\\s*${esc}\\s*\\}\\}`, 'g'),
    () => value,
  )
}

// Plain text → safe HTML for the tiptap email body.
export function textToHtml(text) {
  const escaped = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return escaped.replace(/\r?\n/g, '<br>')
}

// ── reactive state ────────────────────────────────────────────────────────────

// open/query/activeIndex + the key handler for one composer.
//   source()  — the unranked item list (reactive getter)
//   onPick(item, parsed) — called on Enter/Tab/click
// `scope` narrows the list ('templates' after picking /plantilla).
export function useSlashMenu({ source = () => [], onPick = () => {} } = {}) {
  const open = ref(false)
  const query = ref('')
  const activeIndex = ref(0)
  const scope = ref('')
  const parsed = ref(null)

  const ranked = computed(() => {
    let list = source() || []
    if (scope.value === 'templates')
      list = list.filter((i) => ['template', 'meta', 'quick'].includes(i.type))
    return rankItems(list, query.value)
  })

  function close() {
    open.value = false
    query.value = ''
    activeIndex.value = 0
    scope.value = ''
    parsed.value = null
  }

  // Re-read the composer after each input; opens, filters or closes the menu.
  function update(text, caret) {
    const p = parseSlash(text, caret)
    if (!p) return close()
    if (!open.value || p.query !== query.value) activeIndex.value = 0
    open.value = true
    query.value = p.query
    parsed.value = p
  }

  // Direct open (toolbar button / email search mode).
  function show(initialScope = '') {
    open.value = true
    scope.value = initialScope
    activeIndex.value = 0
  }

  function pick(item) {
    const target = item || ranked.value[activeIndex.value]
    if (!target) return
    const p = parsed.value
    onPick(target, p)
  }

  // Returns true when the key was consumed by the menu.
  function onKeydown(event) {
    const r = menuKeyAction(event, {
      open: open.value,
      count: ranked.value.length,
      activeIndex: activeIndex.value,
    })
    if (!r.handled) return false
    event.preventDefault?.()
    event.stopPropagation?.()
    activeIndex.value = r.activeIndex
    if (r.action === 'close') close()
    else if (r.action === 'pick') pick()
    return true
  }

  return {
    open,
    query,
    activeIndex,
    scope,
    parsed,
    ranked,
    update,
    show,
    close,
    pick,
    onKeydown,
  }
}
