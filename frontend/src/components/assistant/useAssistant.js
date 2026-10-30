// «Pregúntale a Muelle» state (SHELL-S2, shell-program/design/ASSISTANT.md):
// one conversation per worker (doco's own, so closing the sheet loses
// nothing), the screen it is about, and the doors that open it. The server is
// doco's assistant through its shell adapter (doco.docoutils.assistant.
// shell_api): same principal and gates as the Desk, staff only. Replies
// arrive as user-addressed realtime events; history() is the backfill.
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
import { isImageFile } from './assistantFiles'
import { canvas, onCanvasEvent, takePendingCanvas } from './assistantCanvas'

export { ASSISTANT_API }
// A turn that stays silent this long gets an honest line and a history check.
export const SILENCE_MS = 120000

export const assistant = reactive({
  status: null,
  open: false,
  messages: [],
  thinking: false,
  progress: '',
  error: '',
  draft: '',
  /** The file waiting in the composer: { blob, name, size, type, previewUrl, url }. */
  attachment: null,
  focus: 0,
  /** The screen the sheet is about; null when the worker removed the chip. */
  context: null,
  contextOn: true,
  /** card id → 'sending' | 'confirmed' | 'changed' | 'failed' */
  cards: {},
  /** The card whose receipt is the next reply. */
  awaitingReceipt: null,
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
  retired.busy =
    retired.busy ||
    assistant.thinking ||
    assistant.messages.some((m) => m.pending)
  generation += 1
  clearTimeout(silence)
  // what the old turn wrote to the Lienzo stays there, not under a new answer
  canvas.pending = []
  Object.assign(assistant, {
    messages: [],
    cards: {},
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
  armWatchdog()
}

function isRetired(payload) {
  if (payload.client_id && retired.clients.has(payload.client_id)) {
    if (payload.mid) retired.mids.add(payload.mid)
    return true
  }
  return Boolean(payload.edit && payload.mid && retired.mids.has(payload.mid))
}

export async function loadHistory() {
  const asked = generation
  try {
    const rows = await call(`${ASSISTANT_API}.history`, { limit: 40 })
    if (asked !== generation) return
    const known = mergeHistory(
      (rows || [])
        .filter((row) => !retired.mids.has(row.mid))
        .map(normalizeRow),
      assistant.messages,
    )
    // Sends the server has not logged yet stay at the end.
    const unsent = assistant.messages.filter(
      (m) => m.role === 'user' && (m.pending || m.failed),
    )
    assistant.messages = [...known, ...unsent]
    assistant.loaded = true
  } catch (error) {
    assistant.error = errorText(error)
  }
}

function errorText(error) {
  const message = error?.messages?.[0] || error?.message || ''
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

/** A file in the composer or in a sent message; `url` is set once it is uploaded. */
function sentFile(file) {
  return {
    blob: file.blob,
    name: file.name,
    size: file.size,
    type: file.type,
    previewUrl: file.previewUrl || '',
    url: file.url || '',
  }
}

function objectUrl(blob) {
  return typeof URL.createObjectURL === 'function'
    ? URL.createObjectURL(blob)
    : ''
}

/** Puts a picked file in the composer until it goes with the next message. */
export function attachFile(blob) {
  clearAttachment()
  assistant.attachment = {
    blob,
    name: blob.name || __('File'),
    size: blob.size,
    type: blob.type || '',
    previewUrl: isImageFile(blob) ? objectUrl(blob) : '',
    url: '',
  }
}

export function clearAttachment() {
  const previous = assistant.attachment
  assistant.attachment = null
  if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl)
}

/** The composer hands its file to the message it goes with; the bubble keeps the preview. */
export function takeAttachment() {
  const file = assistant.attachment
  assistant.attachment = null
  return file
}

/** Uploads a picked file as private, as the Desk's clip does; resolves to its file_url. */
export async function uploadAssistantFile(blob) {
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
    const url = response.ok ? (await response.json())?.message?.file_url : ''
    if (url) return url
  } catch {
    // a dropped connection fails the same way a refused file does, below
  }
  throw new Error(
    __(
      'The file did not upload. Your message is still here: try again, or send a smaller file.',
    ),
  )
}

/** The file's url; uploads it first only when this message has not yet. */
async function uploadedUrl(id, file) {
  if (file.url) return file.url
  const url = await uploadAssistantFile(file.blob)
  patchMessage(id, { file: { ...file, url } })
  return url
}

export async function send(text, { context = undefined, file = null } = {}) {
  const value = String(text || '').trim()
  if (!value && !file) return
  const clientId = newClientId()
  const message = {
    id: clientId,
    role: 'user',
    text: value,
    pending: true,
    file: file ? sentFile(file) : null,
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
    const fileUrl = message.file
      ? await uploadedUrl(clientId, message.file)
      : ''
    await call(`${ASSISTANT_API}.say`, {
      text: value,
      context: JSON.stringify(ctx || {}),
      client_id: clientId,
      file_url: fileUrl || undefined,
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
  return send(message.text, { file: message.file || null })
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
  return send(question.text, { file: question.file || null })
}

function patchMessage(id, patch) {
  assistant.messages = assistant.messages.map((m) =>
    m.id === id ? { ...m, ...patch } : m,
  )
}

/** A tap on a card or a choice: the same callback strings as the Desk. */
export async function tap(data, cardId = null) {
  if (cardId) assistant.cards = { ...assistant.cards, [cardId]: 'sending' }
  assistant.error = ''
  try {
    await call(`${ASSISTANT_API}.callback`, { data })
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
  } catch (error) {
    if (cardId) assistant.cards = { ...assistant.cards, [cardId]: 'failed' }
    assistant.error = errorText(error)
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
  const incoming = {
    ...normalizeRow({ ...payload, kind: 'bot' }),
    answer: payload.answer || null,
  }
  const index = payload.edit
    ? assistant.messages.findIndex((m) => m.mid && m.mid === payload.mid)
    : -1
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
  socket.on('doco_assistant_canvas', onCanvasEvent)
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
    messages: [],
    thinking: false,
    progress: '',
    error: '',
    draft: '',
    attachment: null,
    focus: 0,
    context: null,
    contextOn: true,
    cards: {},
    awaitingReceipt: null,
    loaded: false,
  })
  _resetAssistantDoor()
  retired.clients.clear()
  retired.mids.clear()
  retired.busy = false
  generation = 0
  Object.assign(ownReset, { pending: false, cutoff: '' })
  boundSocket = null
  pageContexts.value = []
  clearTimeout(silence)
}
