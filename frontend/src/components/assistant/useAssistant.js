// «Pregúntale a Muelle» state (SHELL-S2, shell-program/design/ASSISTANT.md):
// one conversation per worker (doco's own, so closing the sheet loses
// nothing), the screen it is about, and the doors that open it. The server is
// doco's assistant through its shell adapter (doco.docoutils.assistant.
// shell_api): same principal and gates as the Desk, staff only. Replies
// arrive as user-addressed realtime events; history() is the backfill.
import { errorText as sentenceOf } from '@/utils/errorText'
import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  reactive,
  shallowRef,
} from 'vue'
import { call } from 'frappe-ui'
import {
  firstRecordLink,
  isProgress,
  mergeHistory,
  newClientId,
  normalizeRow,
} from './assistantText'
import {
  ASSISTANT_API,
  _resetAssistantDoor,
  assistantWanted,
  loadAssistantStatus,
} from './assistantDoor'
import { ASSISTANT_MAX_FILES, isImageFile } from './assistantFiles'
import {
  dropCachedList,
  readCachedList,
  writeCachedList,
} from '@/utils/listCache'
import { canvas, onCanvasEvent, takePendingCanvas } from './assistantCanvas'
import { answeredLocally, cardKey } from './decisionCardState'
import { onBtwEvent } from './assistantBtw'
import {
  _resetActivity,
  loadActivity,
  missingSteps,
  onActivity,
  onUsage,
  resetActivity,
  restoreActivity,
  snapshotActivity,
} from './assistantActivity'

export { ASSISTANT_API }
// A turn that stays silent this long gets an honest line and a history check.
export const SILENCE_MS = 120000

export const assistant = reactive({
  status: null,
  open: false,
  /** Full screen instead of the sheet or the dock; kept from one open to the next. */
  full: false,
  messages: [],
  thinking: false,
  progress: '',
  error: '',
  draft: '',
  /** The files waiting in the composer, in the order picked:
   *  { id, blob, name, size, type, previewUrl, fileId, url }. */
  attachments: [],
  focus: 0,
  /** The screen the sheet is about; null when the worker removed the chip. */
  context: null,
  contextOn: true,
  /** card id → 'sending' | 'confirmed' | 'changed' | 'failed' */
  cards: {},
  /** The card whose receipt is the next reply. */
  awaitingReceipt: null,
  /** decision card (sid:di) → { state: 'sending' | 'failed', error } */
  decisions: {},
  loaded: false,
})

export const assistantEnabled = computed(() =>
  Boolean(assistant.status?.enabled),
)

// --- what the screen says about itself ---------------------------------------

const pageContexts = shallowRef([])

/**
 * A page tells the assistant what it shows: `getter()` returns
 * `{ doctype, name, title, filters }` (the route is added by the sheet).
 * Lasts until the component unmounts. A page without one still gets its route.
 */
export function useAssistantContext(getter) {
  const entry = { getter }
  pageContexts.value = [...pageContexts.value, entry]
  const remove = () => {
    pageContexts.value = pageContexts.value.filter((e) => e !== entry)
  }
  if (getCurrentInstance()) onBeforeUnmount(remove)
  return remove
}

/** The context payload of the current screen: `{ route, doctype, name, title, filters }`. */
export function screenContext(route, fallbackTitle = '') {
  const own = pageContexts.value.at(-1)?.getter?.() || {}
  const clean = (value, limit) =>
    typeof value === 'string' ? value.trim().slice(0, limit) : ''
  const filters = {}
  for (const key of ['company', 'status', 'query'])
    if (clean(own.filters?.[key], 140))
      filters[key] = clean(own.filters[key], 140)
  return {
    route: clean(route?.fullPath ? `/crm${route.fullPath}` : '', 140),
    doctype: clean(own.doctype, 140),
    name: clean(own.name, 140),
    title: clean(own.title, 140) || clean(fallbackTitle, 140),
    filters,
  }
}

// --- server ---------------------------------------------------------------------

export function loadStatus(options) {
  return loadAssistantStatus(options).then(
    (status) => (assistant.status = status),
  )
}

// --- a reset ------------------------------------------------------------------
// «Nueva conversación» empties the log at once; the server's reset follows. A
// turn of the conversation that ended may still answer (a message sent before
// the reset is still the person's): its reply, its edits and its typing are
// the old conversation's and never land in the new one, and a history read
// that started before the reset is dropped when it arrives.
const retired = { clients: new Set(), mids: new Set(), busy: false }
let generation = 0
/** Our own reset: `pending` while the call runs, then the cutoff it returned. */
export const ownReset = { pending: false, cutoff: '' }

/** Empties the log for a new conversation; returns what `restoreConversation` puts back. */
export function retireConversation() {
  const before = {
    messages: assistant.messages,
    cards: assistant.cards,
    awaitingReceipt: assistant.awaitingReceipt,
    thinking: assistant.thinking,
    progress: assistant.progress,
    busy: retired.busy,
    clients: [],
    mids: [],
    work: snapshotActivity(),
  }
  for (const m of assistant.messages) {
    if (m.role === 'user' && m.id && !retired.clients.has(m.id)) {
      retired.clients.add(m.id)
      before.clients.push(m.id)
    }
    if (m.mid && !retired.mids.has(m.mid)) {
      retired.mids.add(m.mid)
      before.mids.push(m.mid)
    }
  }
  // the conversation that ended is not painted again on the next open
  dropCachedList(HISTORY_CACHE)
  retired.busy =
    retired.busy ||
    assistant.thinking ||
    assistant.messages.some((m) => m.pending)
  generation += 1
  clearTimeout(silence)
  // what the old turn wrote to the Lienzo stays there, not under a new answer
  canvas.pending = []
  resetActivity()
  Object.assign(assistant, {
    messages: [],
    cards: {},
    decisions: {},
    awaitingReceipt: null,
    thinking: false,
    progress: '',
    error: '',
  })
  return before
}

/** The reset failed: the conversation comes back as it was. */
export function restoreConversation(before) {
  for (const id of before.clients) retired.clients.delete(id)
  for (const mid of before.mids) retired.mids.delete(mid)
  retired.busy = before.busy
  generation += 1
  Object.assign(assistant, {
    messages: before.messages,
    cards: before.cards,
    awaitingReceipt: before.awaitingReceipt,
    thinking: before.thinking,
    progress: before.progress,
  })
  restoreActivity(before.work)
  armWatchdog()
}

function isRetired(payload) {
  if (payload.client_id && retired.clients.has(payload.client_id)) {
    if (payload.mid) retired.mids.add(payload.mid)
    return true
  }
  return Boolean(payload.edit && payload.mid && retired.mids.has(payload.mid))
}

// The conversation as it was last read, kept with the lists (utils/
// listCache.js, swept on logout): the sheet opens with it painted while the
// read runs, and the fresh answer replaces it.
const HISTORY_CACHE = 'assistant:history'
const HISTORY_LIMIT = 40
// A door's hover or press asks before the click lands (prefetchHistory);
// an ask this young is the open's own.
const PREFETCH_FRESH_MS = 20000
let prefetched = null

function askHistory() {
  return call(`${ASSISTANT_API}.history`, { limit: HISTORY_LIMIT })
}

/** A door is about to open the sheet: the history is on the wire before the click. */
export function prefetchHistory() {
  if (assistant.loaded || assistant.open) return
  if (prefetched && Date.now() - prefetched.at < PREFETCH_FRESH_MS) return
  prefetched = { at: Date.now(), generation, rows: askHistory() }
  // a failure is loadHistory's to show
  prefetched.rows.catch(() => {})
}

function paintCachedHistory() {
  if (assistant.loaded || assistant.messages.length) return
  const rows = readCachedList(HISTORY_CACHE)
  if (!Array.isArray(rows) || !rows.length) return
  assistant.messages = rows
    .filter((row) => !retired.mids.has(row.mid))
    .map((row) => ({ ...normalizeRow(row), cached: true }))
}

export async function loadHistory() {
  const asked = generation
  const early = prefetched
  prefetched = null
  paintCachedHistory()
  try {
    const rows = await (early &&
    early.generation === asked &&
    Date.now() - early.at < PREFETCH_FRESH_MS
      ? early.rows
      : askHistory())
    if (asked !== generation) return
    writeCachedList(HISTORY_CACHE, rows || [])
    // the painted copy only held the place: what the server says replaces it
    const live = assistant.messages.filter((m) => !m.cached)
    const known = mergeHistory(
      (rows || [])
        .filter((row) => !retired.mids.has(row.mid))
        .map(normalizeRow),
      live,
    )
    // Sends the server has not logged yet stay at the end.
    const unsent = live.filter(
      (m) => m.role === 'user' && (m.pending || m.failed),
    )
    assistant.messages = [...known, ...unsent]
    assistant.loaded = true
    // the latest turns' steps: a running turn's line and the answers' «Trabajó …»
    loadActivity(() => asked === generation)
  } catch (error) {
    assistant.error = errorText(error)
  }
}

function errorText(error) {
  const message = sentenceOf(error)
  return message && !/^\s*</.test(message)
    ? String(message)
    : __('Muelle did not answer. Check your connection and try again.')
}

let silence = null
function armWatchdog() {
  clearTimeout(silence)
  if (!assistant.thinking) return
  silence = setTimeout(() => {
    assistant.thinking = false
    assistant.progress = ''
    assistant.error = __(
      'This is taking longer than usual. The answer will appear here when it is ready.',
    )
    loadHistory()
  }, SILENCE_MS)
}

/** A file in the composer or in a sent message; `fileId` and `url` are set
 *  once it is uploaded, so a retry sends the same File, not a second copy. */
function sentFile(file) {
  return {
    id: file.id || newClientId(),
    blob: file.blob,
    name: file.name,
    size: file.size,
    type: file.type,
    previewUrl: file.previewUrl || '',
    fileId: file.fileId || '',
    url: file.url || '',
  }
}

function objectUrl(blob) {
  return typeof URL.createObjectURL === 'function'
    ? URL.createObjectURL(blob)
    : ''
}

function revokePreview(file) {
  if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl)
}

/** Puts picked files in the composer until they go with the next message.
 *  Past ASSISTANT_MAX_FILES the rest stay out and the sheet says so. */
export function attachFiles(blobs) {
  const picked = Array.from(blobs || [])
  const room = ASSISTANT_MAX_FILES - assistant.attachments.length
  const kept = picked.slice(0, Math.max(0, room))
  assistant.attachments = [
    ...assistant.attachments,
    ...kept.map((blob) =>
      sentFile({
        blob,
        name: blob.name || __('File'),
        size: blob.size,
        type: blob.type || '',
        previewUrl: isImageFile(blob) ? objectUrl(blob) : '',
      }),
    ),
  ]
  if (picked.length > kept.length)
    assistant.error = __(
      'A message takes up to {0} files. Remove one to add another.',
      [ASSISTANT_MAX_FILES],
    )
}

export function removeAttachment(file) {
  assistant.attachments = assistant.attachments.filter((f) => f.id !== file.id)
  revokePreview(file)
}

export function clearAttachments() {
  const previous = assistant.attachments
  assistant.attachments = []
  previous.forEach(revokePreview)
}

/** The composer hands its files to the message they go with; the bubble keeps the previews. */
export function takeAttachments() {
  const files = assistant.attachments
  assistant.attachments = []
  return files
}

/** Uploads a picked file as private, as the Desk's clip does; resolves to the
 *  File's { name, file_url }. */
async function uploadPrivateFile(blob) {
  const form = new FormData()
  form.append('file', blob)
  form.append('is_private', '1')
  try {
    const response = await fetch('/api/method/upload_file', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      headers: { 'X-Frappe-CSRF-Token': window.csrf_token || '' },
    })
    const doc = response.ok ? (await response.json())?.message : null
    if (doc?.name && doc?.file_url) return doc
  } catch {
    // a dropped connection fails the same way a refused file does, below
  }
  throw new Error(
    __(
      'The file did not upload. Your message is still here: try again, or send a smaller file.',
    ),
  )
}

/** A private upload's file_url (the decision card's photo). */
export async function uploadAssistantFile(blob) {
  return (await uploadPrivateFile(blob)).file_url
}

/** Uploads the message's files together, each only once: the ones that went up
 *  keep their File when another fails, so «Reintentar» sends just the rest. */
async function uploadedFiles(id, files) {
  const results = await Promise.allSettled(
    files.map(async (file) => {
      if (file.fileId) return file
      const doc = await uploadPrivateFile(file.blob)
      return { ...file, fileId: doc.name, url: doc.file_url }
    }),
  )
  const done = results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : files[i],
  )
  patchMessage(id, { files: done })
  const failed = results.find((r) => r.status === 'rejected')
  if (failed) throw failed.reason
  return done
}

/** The files as the Desk composer submits them (doco workspace_turns.submit):
 *  each its own File and send id, «Automático» so the server picks what each
 *  one is (a receipt, a price list, a product photo) with the message's words. */
function attachmentsOf(files) {
  return files.map((file) => ({
    file_id: file.fileId,
    attachment_id: file.id,
    owning_intent_id: '',
    purpose: 'auto',
    caption: '',
  }))
}

export async function send(text, { context = undefined, files = [] } = {}) {
  const value = String(text || '').trim()
  if (!value && !files.length) return
  const clientId = newClientId()
  const message = {
    id: clientId,
    role: 'user',
    text: value,
    pending: true,
    files: files.map(sentFile),
  }
  assistant.messages = [...assistant.messages, message]
  assistant.error = ''
  assistant.thinking = true
  // from here a typing event may be this turn's
  retired.busy = false
  armWatchdog()
  const ctx =
    context !== undefined
      ? context
      : assistant.contextOn
        ? assistant.context
        : { route: assistant.context?.route || '' }
  try {
    const uploaded = message.files.length
      ? await uploadedFiles(clientId, message.files)
      : []
    await call(`${ASSISTANT_API}.say`, {
      text: value,
      context: JSON.stringify(ctx || {}),
      client_id: clientId,
      attachments: uploaded.length
        ? JSON.stringify(attachmentsOf(uploaded))
        : undefined,
    })
    patchMessage(clientId, { pending: false })
  } catch (error) {
    patchMessage(clientId, { pending: false, failed: true })
    assistant.thinking = false
    assistant.error = errorText(error)
    clearTimeout(silence)
  }
}

export function retry(message) {
  assistant.messages = assistant.messages.filter((m) => m.id !== message.id)
  return send(message.text, { files: message.files || [] })
}

/** «Reintentar» on a reply that failed: ask the question before it again. */
export function retryAnswer(message) {
  const at = assistant.messages.findIndex((m) => m.id === message.id)
  const question = assistant.messages
    .slice(0, at)
    .reverse()
    .find((m) => m.role === 'user')
  if (!question) return
  assistant.messages = assistant.messages.filter((m) => m.id !== message.id)
  return send(question.text, { files: question.files || [] })
}

function patchMessage(id, patch) {
  assistant.messages = assistant.messages.map((m) =>
    m.id === id ? { ...m, ...patch } : m,
  )
}

/**
 * A choice under a reply: the message closes at once with the option as its
 * state (doco closes it too and tells every screen showing it); a refusal opens
 * it again.
 */
export async function choose(message, choice) {
  patchMessage(message.id, { answered: choice.label })
  const ok = await tap(choice.data, null, message.mid)
  if (!ok) patchMessage(message.id, { answered: null })
  return ok
}

/** A tap on a card or a choice: the same callback strings as the Desk. */
export async function tap(data, cardId = null, mid = null) {
  if (cardId) assistant.cards = { ...assistant.cards, [cardId]: 'sending' }
  assistant.error = ''
  try {
    await call(`${ASSISTANT_API}.callback`, mid ? { data, mid } : { data })
    if (cardId) {
      const approved = /:a$|^act:/.test(data)
      assistant.cards = {
        ...assistant.cards,
        [cardId]: approved ? 'confirmed' : 'changed',
      }
      if (approved) assistant.awaitingReceipt = cardId
    }
    assistant.thinking = true
    armWatchdog()
    return true
  } catch (error) {
    if (cardId) assistant.cards = { ...assistant.cards, [cardId]: 'failed' }
    assistant.error = errorText(error)
    return false
  }
}

/**
 * An answer on a decision card (DecisionCard.vue): applied inline through
 * doco's decision_apply, the same resolvers and gates as a tap, so a refusal
 * shows on the card itself. The card closes at once; doco's edit of the
 * message follows with the result it rebuilt. Resolves true when applied.
 */
export async function answerCard(card, choice) {
  const key = cardKey(card)
  const mark = (value) => {
    const next = { ...assistant.decisions }
    if (value) next[key] = value
    else delete next[key]
    assistant.decisions = next
  }
  mark({ state: 'sending' })
  try {
    const result = await call(`${ASSISTANT_API}.decision_apply`, {
      session_id: card.sid,
      choices: JSON.stringify([choice]),
    })
    if (!result?.ok) {
      mark({
        state: 'failed',
        error:
          result?.reason === 'expired'
            ? __(
                'This question is closed. Send the document again if something is missing.',
              )
            : __('It was not applied. Try again.'),
      })
      return false
    }
    if (result.errors?.length) {
      mark({ state: 'failed', error: String(result.errors[0].summary || '') })
      return false
    }
    if (result.applied) {
      const done = answeredLocally(card, result.rows?.[0])
      assistant.messages = assistant.messages.map((m) =>
        m.card && cardKey(m.card) === key ? { ...m, card: done } : m,
      )
    }
    mark(null)
    return true
  } catch (error) {
    mark({ state: 'failed', error: errorText(error) })
    return false
  }
}

// --- realtime -------------------------------------------------------------------

function ours(payload) {
  const chat = assistant.status?.chat_id
  return (
    Boolean(payload) && (!chat || !payload.chat_id || payload.chat_id === chat)
  )
}

export function onMessage(payload) {
  if (!ours(payload)) return
  if (isRetired(payload)) {
    if (!isProgress({ text: payload.text, buttons: payload.buttons }))
      retired.busy = false
    return
  }
  const incoming = normalizeRow({ ...payload, kind: 'bot' })
  const index = payload.edit
    ? assistant.messages.findIndex((m) => m.mid && m.mid === payload.mid)
    : -1
  if (payload.edit && payload.answered) {
    // a message closed by its answer: only that message changes; the turn the
    // tap started keeps its progress
    if (index >= 0) patchMessage(assistant.messages[index].id, incoming)
    return
  }
  if (!isProgress(incoming) && canvas.pending.length)
    incoming.canvas = takePendingCanvas()
  if (index >= 0) {
    const next = assistant.messages.slice()
    next[index] = {
      ...next[index],
      ...incoming,
      receiptOf: next[index].receiptOf,
    }
    assistant.messages = next
  } else {
    // The receipt is the reply that names the saved record; the agent's own
    // words may land first («Quedó ligado…»), so the card keeps waiting for
    // the line with the link (SHELL-S2c walk, 305px).
    if (assistant.awaitingReceipt && !isProgress(incoming)) {
      incoming.receiptOf = assistant.awaitingReceipt
      if (firstRecordLink(incoming.text)) assistant.awaitingReceipt = null
    }
    assistant.messages = [...assistant.messages, incoming]
  }
  if (isProgress(incoming)) {
    assistant.progress = incoming.text
    assistant.thinking = true
  } else {
    assistant.progress = ''
    assistant.thinking = false
    assistant.error = ''
  }
  armWatchdog()
}

/**
 * canvas.py publishes once the turn commits, so the answer a file belongs to
 * is usually on screen already and takes it now; while the turn still runs
 * (the last line is the question or a progress line) it waits for the answer.
 * On an empty log (a reset since) it only reaches the Lienzo.
 */
export function onCanvasWritten(payload) {
  onCanvasEvent(payload)
  if (!canvas.pending.length) return
  const last = assistant.messages[assistant.messages.length - 1]
  if (!last) {
    takePendingCanvas()
    return
  }
  if (last.role !== 'bot' || isProgress(last)) return
  const files = takePendingCanvas()
  const kept = (last.canvas || []).filter(
    (f) => !files.some((n) => n.file === f.file),
  )
  assistant.messages = [
    ...assistant.messages.slice(0, -1),
    { ...last, canvas: [...kept, ...files] },
  ]
}

/** A step of a turn (doco_assistant_activity): the thinking line's detail. */
export function onActivityEvent(payload) {
  if (!ours(payload) || retired.clients.has(payload.client_id)) return
  const turn = onActivity(payload)
  if (turn && missingSteps(turn)) healSteps(turn)
}

// A step the socket lost comes back from doco's snapshot: once per turn, after
// a moment for an event that is only late (it may still arrive on its own).
export const HEAL_MS = 400
const healed = new Set()
function healSteps(turn) {
  if (healed.has(turn)) return
  healed.add(turn)
  const asked = generation
  setTimeout(() => {
    if (asked === generation && missingSteps(turn))
      loadActivity(() => asked === generation)
  }, HEAL_MS)
}

/** A turn's receipt (doco_assistant_usage): its model calls and tokens. */
export function onUsageEvent(payload) {
  if (!ours(payload) || retired.clients.has(payload.client_id)) return
  onUsage(payload)
}

export function onTyping(payload) {
  if (!ours(payload) || retired.busy) return
  assistant.thinking = true
  armWatchdog()
}

/** A reset from another tab or the Desk; our own one already emptied the log. */
export function onReset(payload) {
  if (!ours(payload) || ownReset.pending) return
  if (payload?.cutoff && payload.cutoff === ownReset.cutoff) return
  retireConversation()
  loadHistory()
}

let boundSocket = null
function onReconnected() {
  if (assistant.open) loadHistory()
}
/** Listen on the app's socket once; a reconnect reloads what was missed. */
export function bindSocket(socket) {
  if (!socket || boundSocket === socket) return
  boundSocket = socket
  socket.on('doco_assistant_message', onMessage)
  socket.on('doco_assistant_typing', onTyping)
  socket.on('doco_assistant_reset', onReset)
  socket.on('doco_assistant_canvas', onCanvasWritten)
  socket.on('doco_assistant_activity', onActivityEvent)
  socket.on('doco_assistant_usage', onUsageEvent)
  // «/btw»: answers on the side sheet, never in this conversation
  socket.on('doco_assistant_btw', (payload) =>
    onBtwEvent(payload, assistant.status?.chat_id),
  )
  window.addEventListener('socket:reconnected', onReconnected)
}

// --- the doors --------------------------------------------------------------------

/**
 * Open the sheet. `text` with `send: true` asks at once (a suggestion's
 * prepared question); without it the text waits in the composer.
 */
export async function openAssistant({ text = '', send: ask = false } = {}) {
  const status = await loadStatus()
  if (!status?.enabled) return false
  assistantWanted.value = true
  assistant.open = true
  assistant.contextOn = true
  if (!assistant.loaded) await loadHistory()
  // The first door can ask before the sheet has mounted and named the screen.
  if (!assistant.context) assistant.context = screenContext(currentRoute())
  if (text && ask) await send(text)
  else if (text) assistant.draft = text
  assistant.focus += 1
  return true
}

function currentRoute() {
  const { pathname = '', search = '' } = globalThis.location || {}
  return { fullPath: `${pathname.replace(/^\/crm(?=\/|$)/u, '')}${search}` }
}

export function closeAssistant() {
  assistant.open = false
}

export function toggleAssistant() {
  return assistant.open ? closeAssistant() : openAssistant()
}

/** Tests only. */
export function _resetAssistant() {
  Object.assign(assistant, {
    status: null,
    open: false,
    full: false,
    messages: [],
    thinking: false,
    progress: '',
    error: '',
    draft: '',
    attachments: [],
    focus: 0,
    context: null,
    contextOn: true,
    cards: {},
    decisions: {},
    awaitingReceipt: null,
    loaded: false,
  })
  _resetAssistantDoor()
  _resetActivity()
  healed.clear()
  prefetched = null
  dropCachedList(HISTORY_CACHE)
  retired.clients.clear()
  retired.mids.clear()
  retired.busy = false
  generation = 0
  Object.assign(ownReset, { pending: false, cutoff: '' })
  boundSocket = null
  pageContexts.value = []
  clearTimeout(silence)
}
