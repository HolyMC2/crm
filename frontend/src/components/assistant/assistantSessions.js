// The sheet's sessions (bot-sessions-20261027): «Nueva conversación», the
// earlier conversations (doco's conversations module, the Desk bubble's
// sidebar, through shell_api) and «Abierto», the work the chat left open:
// captures to finish and proposals waiting for a yes. That work lives on the
// server, not in the conversation, so a new conversation never strands it.
import { reactive } from 'vue'
import { call } from 'frappe-ui'
import { parseServerDate, dayDiff } from '@/utils/display'
import { newClientId, normalizeRow } from './assistantText'
import { ASSISTANT_API, assistant, loadHistory } from './useAssistant'

export const ACTIONS_API = 'doco.docoutils.assistant.herramientas.api'
/** The server's «current» id: a search hit in the live conversation. */
export const CURRENT = 'current'
export const SEARCH_MIN = 2

export const sessions = reactive({
  /** 'chat' | 'list' | 'transcript' | 'open' */
  view: 'chat',
  list: [],
  current: null,
  archivedCount: 0,
  showArchived: false,
  available: true,
  query: '',
  /** null until a search ran; then the server's results. */
  results: null,
  /** { conversation, messages } of the one opened read-only. */
  transcript: null,
  work: { captures: [], proposals: [], count: 0 },
  /** proposal name → 'confirm' | 'applying' | 'rejecting' */
  proposals: {},
  /** proposal name → { summary, text }: the receipt once applied or declined. */
  receipts: {},
  busy: false,
  error: '',
})

function errorText(error) {
  const message = error?.messages?.[0] || error?.message || ''
  return message && !/^\s*</.test(message)
    ? String(message)
    : __('Muelle did not answer. Check your connection and try again.')
}

async function guarded(work) {
  sessions.error = ''
  try {
    return await work()
  } catch (error) {
    sessions.error = errorText(error)
    return null
  }
}

export function showView(view) {
  sessions.view = view
  sessions.error = ''
  if (view === 'list') return loadConversations()
  if (view === 'open') return loadOpenWork()
}

function freshChat() {
  assistant.messages = []
  assistant.cards = {}
  assistant.awaitingReceipt = null
  assistant.error = ''
  sessions.view = 'chat'
  sessions.transcript = null
  assistant.focus += 1
  return Promise.all([loadHistory(), loadOpenWork()])
}

/** «Nueva conversación»: the bubble's /clear; open work stays in «Abierto». */
export async function newConversation() {
  if (sessions.busy) return
  sessions.busy = true
  const done = await guarded(() =>
    call(`${ASSISTANT_API}.new_conversation`, { client_id: newClientId() }),
  )
  sessions.busy = false
  if (done !== null) await freshChat()
}

export async function loadConversations() {
  const out = await guarded(() =>
    call(`${ASSISTANT_API}.conversations`, {
      archived: sessions.showArchived ? 1 : 0,
    }),
  )
  if (!out) return
  sessions.available = out.available !== false
  sessions.current = out.current || null
  sessions.list = out.conversations || []
  sessions.archivedCount = out.archived || 0
}

export function toggleArchived() {
  sessions.showArchived = !sessions.showArchived
  return loadConversations()
}

/** An earlier conversation, read-only; the live one is the chat itself. */
export async function openConversation(id) {
  if (!id || id === CURRENT) {
    sessions.view = 'chat'
    return
  }
  const out = await guarded(() =>
    call(`${ASSISTANT_API}.conversation`, { conversation_id: id }),
  )
  if (!out) return
  sessions.transcript = {
    conversation: out.conversation,
    messages: (out.messages || []).map(normalizeRow),
  }
  sessions.view = 'transcript'
}

/** «Seguir esta conversación»: a new conversation seeded with its questions. */
export async function continueConversation(id) {
  if (sessions.busy) return
  sessions.busy = true
  const out = await guarded(() =>
    call(`${ASSISTANT_API}.conversation_continue`, { conversation_id: id }),
  )
  sessions.busy = false
  if (out) await freshChat()
}

async function change(method, args) {
  const out = await guarded(() => call(`${ASSISTANT_API}.${method}`, args))
  if (out !== null) await loadConversations()
  return out
}

export function renameConversation(id, title) {
  return change('conversation_rename', {
    conversation_id: id,
    title: String(title || '').trim(),
  })
}

export function pinConversation(id, pinned) {
  return change('conversation_pin', {
    conversation_id: id,
    pinned: pinned ? 1 : 0,
  })
}

export function archiveConversation(id, archived) {
  return change('conversation_archive', {
    conversation_id: id,
    archived: archived ? 1 : 0,
  })
}

let searchTurn = 0
export async function searchConversations(query) {
  sessions.query = query
  const text = String(query || '').trim()
  const turn = ++searchTurn
  if (text.length < SEARCH_MIN) {
    sessions.results = null
    return
  }
  const out = await guarded(() =>
    call(`${ASSISTANT_API}.conversation_search`, { query: text }),
  )
  // an older search that answers late does not replace a newer one
  if (out && turn === searchTurn) sessions.results = out
}

/**
 * The list as the Desk bubble groups it: pinned first, then by the day the
 * conversation ended (today, this week, before).
 */
export function groupConversations(rows, now = new Date()) {
  const groups = [
    { key: 'pinned', label: __('Pinned', null, 'Conversations'), rows: [] },
    { key: 'today', label: __('Today'), rows: [] },
    { key: 'week', label: __('This week'), rows: [] },
    { key: 'before', label: __('Earlier'), rows: [] },
  ]
  const [pinned, today, week, before] = groups
  for (const row of rows || []) {
    if (row.pinned) {
      pinned.rows.push(row)
      continue
    }
    const date = parseServerDate(row.ended_at)
    const diff = date ? dayDiff(date, now) : -Infinity
    if (diff === 0) today.rows.push(row)
    else if (diff > -7) week.rows.push(row)
    else before.rows.push(row)
  }
  return groups.filter((g) => g.rows.length)
}

// --- «Abierto» ----------------------------------------------------------------

export async function loadOpenWork() {
  const out = await guarded(() => call(`${ASSISTANT_API}.open_work`))
  if (!out) return
  sessions.work = {
    captures: out.captures || [],
    proposals: out.proposals || [],
    count: out.count || 0,
  }
}

/** «Aplicar» asks once more on the row itself: the tray shows no preview. */
export async function applyProposal(name) {
  if (sessions.proposals[name] !== 'confirm') {
    sessions.proposals = { ...sessions.proposals, [name]: 'confirm' }
    return
  }
  await settle(name, 'applying', 'aplicar')
}

export function rejectProposal(name) {
  return settle(name, 'rejecting', 'rechazar')
}

export function keepProposal(name) {
  const next = { ...sessions.proposals }
  delete next[name]
  sessions.proposals = next
}

async function settle(name, state, method) {
  sessions.proposals = { ...sessions.proposals, [name]: state }
  const out = await guarded(() =>
    call(`${ACTIONS_API}.${method}`, { accion: name }),
  )
  keepProposal(name)
  if (!out) return
  // the row leaves the list once settled; its receipt stays on top of the tray
  const row = sessions.work.proposals.find((p) => p.name === name)
  sessions.receipts = {
    ...sessions.receipts,
    [name]: { summary: row?.summary || name, text: out.recibo || __('Done.') },
  }
  await loadOpenWork()
}

/** Tests only. */
export function _resetSessions() {
  Object.assign(sessions, {
    view: 'chat',
    list: [],
    current: null,
    archivedCount: 0,
    showArchived: false,
    available: true,
    query: '',
    results: null,
    transcript: null,
    work: { captures: [], proposals: [], count: 0 },
    proposals: {},
    receipts: {},
    busy: false,
    error: '',
  })
  searchTurn = 0
}
