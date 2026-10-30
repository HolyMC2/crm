// The composer's «/» and «@» (S40): «/» at the start of the message lists the
// commands of doco's one registry (assistant/comandos.py), «@» anywhere lists
// coworkers; both through shell_api.autocompletar. Arrow keys move, Enter or
// Tab picks, Esc closes; on a phone a tap picks. A `client` command runs here
// (a new conversation, a view of the sheet), a `say` command sends its text,
// and one with a template («/recuerdame …») stays in the composer until sent,
// when it goes out expanded («Recuérdame …»).
import { reactive } from 'vue'
import { call } from 'frappe-ui'
import { ASSISTANT_API } from './useAssistant'

export const DEBOUNCE_MS = 150

// a server without autocompletar (an older doco): asked once, then no list
// and typed commands go out as written
let available = true
const MISSING = /not whitelisted|has no attribute|Failed to get method/i
function unavailable(error) {
  if (MISSING.test(String(error?.message || error?.exc_type || '')))
    available = false
}

export const complete = reactive({
  open: false,
  /** 'comando' | 'persona' */
  kind: '',
  query: '',
  items: [],
  active: 0,
  /** the typed token's place in the draft: [start, end) */
  start: 0,
  end: 0,
})

/**
 * The token the caret is in, or null: «/word» only as the first word of the
 * message, «@word» after a space or at the start (an email is not a mention).
 */
export function tokenAt(text, caret = String(text || '').length) {
  const before = String(text || '').slice(0, caret)
  const slash = before.match(/^\s*\/([^\s/]*)$/u)
  if (slash)
    return {
      kind: 'comando',
      query: slash[1],
      start: before.lastIndexOf('/'),
      end: caret,
    }
  const at = before.match(/(^|\s)@([^\s@]*)$/u)
  if (at)
    return {
      kind: 'persona',
      query: at[2],
      start: caret - at[2].length - 1,
      end: caret,
    }
  return null
}

let turn = 0
let timer = null

export function closeComplete() {
  clearTimeout(timer)
  turn += 1
  Object.assign(complete, {
    open: false,
    kind: '',
    query: '',
    items: [],
    active: 0,
  })
}

/** The draft changed (typing or the caret moved): open, refine or close the list. */
export function updateComplete(text, caret) {
  const token = tokenAt(text, caret)
  if (!token) return closeComplete()
  Object.assign(complete, {
    kind: token.kind,
    query: token.query,
    start: token.start,
    end: token.end,
  })
  clearTimeout(timer)
  const mine = ++turn
  timer = setTimeout(() => fetchItems(token, mine), DEBOUNCE_MS)
}

async function fetchItems(token, mine) {
  if (!available) return
  let items
  try {
    const out = await call(`${ASSISTANT_API}.autocompletar`, {
      q: token.query,
      kind: token.kind,
    })
    items = out?.items || []
  } catch (error) {
    unavailable(error)
    items = []
  }
  // an older answer never replaces a newer one, nor reopens a closed list
  if (mine !== turn) return
  complete.items = items
  complete.active = 0
  complete.open = items.length > 0
}

export function moveActive(delta) {
  const n = complete.items.length
  if (!n) return
  complete.active = (complete.active + delta + n) % n
}

/** What the composer does with a pick: the new draft, a text to send, or a client action. */
export function pickItem(text, index = complete.active) {
  const item = complete.items[index]
  if (!item) return null
  const draft = String(text || '')
  const head = draft.slice(0, complete.start)
  const tail = draft.slice(complete.end)
  closeComplete()
  if (item.cmd) {
    if (item.kind === 'client') return { action: item.action, text: '' }
    if (!item.template)
      return { send: item.say || item.label, text: (head + tail).trim() }
    const next = `${head}${item.cmd} ${tail.trimStart()}`
    return { text: next, caret: head.length + item.cmd.length + 1 }
  }
  const mention = `@${item.label} `
  return {
    text: head + mention + tail.trimStart(),
    caret: head.length + mention.length,
  }
}

/** One command of the registry → its turn text («/recuerdame mañana…» → «Recuérdame mañana…»), as comandos.expand. */
export function expandWith(item, rest) {
  if (!item || item.kind !== 'say') return null
  const texto = String(rest || '')
    .split(/\s+/u)
    .filter(Boolean)
    .join(' ')
  if (item.template) return item.template.replace('{texto}', texto).trim()
  return item.say || null
}

/**
 * A message that starts with a registered «/command», looked up when it is
 * sent: `{ action }` for a client one, `{ text }` for a say one, null for a
 * message that is not a command (it goes as typed).
 */
export async function resolveCommand(text) {
  const m = String(text || '').match(/^\s*\/([^\s/]+)\s*([\s\S]*)$/u)
  if (!m || !available) return null
  let items
  try {
    const out = await call(`${ASSISTANT_API}.autocompletar`, {
      q: m[1],
      kind: 'comando',
    })
    items = out?.items || []
  } catch (error) {
    unavailable(error)
    return null
  }
  const fold = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
  const item = items.find((c) => fold(c.cmd) === `/${fold(m[1])}`)
  if (!item) return null
  if (item.kind === 'client') return { action: item.action }
  const expanded = expandWith(item, m[2])
  return expanded ? { text: expanded } : null
}

/** Tests only. */
export function _resetComplete() {
  closeComplete()
  turn = 0
  available = true
}
