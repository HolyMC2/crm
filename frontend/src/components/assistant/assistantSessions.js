// The sheet's sessions (bot-sessions-20261027): «Nueva conversación», the
// earlier conversations (doco's conversations module, the Desk bubble's
// sidebar, through shell_api) and «Abierto», the work the chat left open:
// captures to finish and proposals waiting for a yes. That work lives on the
// server, not in the conversation, so a new conversation never strands it.
// «Nueva conversación» is «Liquidar» (S40): one tap closes the conversation
// into the list, archives the finished ones older than SETTLE_DAYS and says
// in one line what stays open; «Deshacer» brings both back.
import { reactive } from 'vue'
import { call } from 'frappe-ui'
import { parseServerDate, dayDiff } from '@/utils/display'
import { normalizeRow } from './assistantText'
import { loadAgenda } from './assistantAgenda'
import { loadCanvas } from './assistantCanvas'
import {
  ASSISTANT_API,
  assistant,
  loadHistory,
  ownReset,
  restoreConversation,
  retireConversation,
} from './useAssistant'

export const ACTIONS_API = 'doco.docoutils.assistant.herramientas.api'
/** The server's «current» id: a search hit in the live conversation. */
export const CURRENT = 'current'
export const SEARCH_MIN = 2
/** Finished conversations older than this many days leave the list on «Liquidar». */
export const SETTLE_DAYS = 7

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
  /** The last «Liquidar»: { closed, archived, open } until the next reset or its undo. */
  settled: null,
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
  if (view === 'agenda') return loadAgenda()
  if (view === 'canvas') return loadCanvas()
}

/** A `client` command of the «/» list (doco comandos.py): `new`, `open`, `list`, `canvas`. */
export function runCommand(action) {
  if (action === 'new') return newConversation()
  if (['open', 'list', 'canvas', 'agenda'].includes(action))
    return showView(action)
}

/**
 * One reset of the live conversation: the log empties before the server
 * answers (useAssistant.retireConversation keeps the old turns out), and comes
 * back as it was when the server refuses. `work` resolves to the server's
 * answer, or null.
 */
async function reset(work) {
  if (sessions.busy) return null
  sessions.busy = true
  const before = retireConversation()
  sessions.view = 'chat'
  sessions.transcript = null
  assistant.focus += 1
  ownReset.pending = true
  const out = await work()
  ownReset.pending = false
  sessions.busy = false
  if (!out) {
    restoreConversation(before)
    assistant.error = sessions.error
    return null
  }
  ownReset.cutoff = out.cutoff || out.conversation_cutoff || ownReset.cutoff
  await Promise.all([loadHistory(), loadOpenWork(), loadAgenda()])
  return out
}

/**
 * «Nueva conversación» = «Liquidar» (shell_api.liquidar): no model turn, so it
 * never waits behind an answer. A server without it gets the plain reset.
 */
export async function newConversation() {
  const out = await reset(async () => {
    const settled = await guarded(() =>
      call(`${ASSISTANT_API}.liquidar`, { dias: SETTLE_DAYS }),
    )
    if (settled) return settled
    return guarded(() => call(`${ASSISTANT_API}.new_conversation`))
  })
  if (out)
    sessions.settled = {
      closed: out.closed || null,
      archived: out.archived || [],
      open: out.open || null,
    }
}

/** «Deshacer»: the archived conversations come back and the closed one continues. */
export async function undoSettle() {
  const settled = sessions.settled
  if (!settled || sessions.busy) return
  for (const id of settled.archived) {
    const out = await guarded(() =>
      call(`${ASSISTANT_API}.conversation_archive`, {
        conversation_id: id,
        archived: 0,
      }),
    )
    if (out === null) return
  }
  sessions.settled = { ...settled, archived: [] }
  if (settled.closed && !(await continueConversation(settled.closed))) return
  sessions.settled = null
}

/** The one line «Liquidar» leaves on the clean chat: what was put away, what stays open. */
export function settledLine(settled) {
  if (!settled) return ''
  const n = settled.archived?.length || 0
  const parts = [__('Settled.')]
  if (n === 1) parts.push(__('Archived 1 finished conversation.'))
  else if (n > 1) parts.push(__('Archived {0} finished conversations.', [n]))
  const open = settled.open
  if (!open) return parts.join(' ')
  const counts = [
    [
      open.proposals,
      __('1 change waiting for your yes'),
      __('{0} changes waiting for your yes'),
    ],
    [open.captures, __('1 capture to finish'), __('{0} captures to finish')],
    [open.encargos, __('1 task on the agenda'), __('{0} tasks on the agenda')],
  ]
    .filter(([count]) => count > 0)
    .map(([count, one, many]) =>
      count === 1 ? one : many.replace('{0}', String(count)),
    )
  if (open.encargos_hoy)
    counts[counts.length - 1] += ` ${__('({0} today)', [open.encargos_hoy])}`
  parts.push(
    counts.length
      ? __('Still open: {0}.', [counts.join(', ')])
      : __('Nothing stays open.'),
  )
  return parts.join(' ')
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
  sessions.settled = null
  return reset(() =>
    guarded(() =>
      call(`${ASSISTANT_API}.conversation_continue`, { conversation_id: id }),
    ),
  )
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
    settled: null,
  })
  searchTurn = 0
}
