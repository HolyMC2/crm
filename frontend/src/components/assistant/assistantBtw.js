// «/btw»: a quick question on the side (doco assistant/btw.py). It opens a sheet
// with its own short thread over the conversation; the conversation, the turn it
// may be running, its cards and its memory stay as they are. The answer arrives
// as `doco_assistant_btw` (never `doco_assistant_message`), btw_historial is the
// backfill, btw_cerrar empties the side thread. A write it proposes is a card
// whose buttons go through the same callback as the conversation's.
import { reactive } from 'vue'
import { call } from 'frappe-ui'
import { errorText } from '@/utils/errorText'
import { ASSISTANT_API } from './assistantDoor'
import { isProgress } from './assistantText'

export const btw = reactive({
  open: false,
  mounted: false,
  rows: [],
  draft: '',
  thinking: false,
  error: '',
  focus: 0,
  /** callback data → 'sending' | 'done' | 'failed' */
  taps: {},
})

function row(raw) {
  const bot = raw.kind !== 'user'
  return {
    id: raw.mid || raw.id || `${raw.kind}-${raw.creation}`,
    mid: raw.mid || null,
    role: bot ? 'bot' : 'user',
    text: raw.text ?? raw.message ?? '',
    buttons: bot ? raw.buttons || [] : [],
  }
}

/** Open the side sheet; a question typed with «/btw» goes out at once. */
export function openBtw(text = '') {
  btw.mounted = true
  btw.open = true
  btw.error = ''
  const question = String(text || '').trim()
  if (!btw.rows.length) loadBtw()
  if (question) return askBtw(question)
  btw.focus += 1
}

/** «Cerrar»: one tap; the next «/btw» starts an empty side thread. */
export async function closeBtw() {
  btw.open = false
  btw.rows = []
  btw.thinking = false
  btw.taps = {}
  try {
    await call(`${ASSISTANT_API}.btw_cerrar`)
  } catch {
    // the server keeps its own cutoff; a failed close only means the old rows
    // come back on the next open
  }
}

export async function loadBtw() {
  try {
    const rows = await call(`${ASSISTANT_API}.btw_historial`)
    if (Array.isArray(rows) && rows.length) btw.rows = rows.map(row)
  } catch (error) {
    btw.error = errorText(error)
  }
}

export async function askBtw(text) {
  const question = String(text || '').trim()
  if (!question) return
  btw.rows = [
    ...btw.rows,
    row({ kind: 'user', text: question, id: `q-${Date.now()}` }),
  ]
  btw.draft = ''
  btw.thinking = true
  btw.error = ''
  try {
    await call(`${ASSISTANT_API}.btw`, { text: question })
  } catch (error) {
    btw.thinking = false
    btw.error = errorText(error)
  }
}

/** A button on a side answer (an approval card, a choice). */
export async function tapBtw(data) {
  btw.taps = { ...btw.taps, [data]: 'sending' }
  btw.error = ''
  try {
    await call(`${ASSISTANT_API}.callback`, { data })
    btw.taps = { ...btw.taps, [data]: 'done' }
    btw.thinking = true
  } catch (error) {
    btw.taps = { ...btw.taps, [data]: 'failed' }
    btw.error = errorText(error)
  }
}

/** `doco_assistant_btw`: a side answer, its edit, or the side turn typing. */
export function onBtwEvent(payload, chat = null) {
  if (!payload || (chat && payload.chat_id && payload.chat_id !== chat)) return
  if (payload.typing) {
    btw.thinking = true
    return
  }
  const incoming = row({ ...payload, kind: 'bot' })
  const at = payload.mid ? btw.rows.findIndex((r) => r.mid === payload.mid) : -1
  if (at >= 0) {
    const next = btw.rows.slice()
    next[at] = { ...next[at], ...incoming }
    btw.rows = next
  } else btw.rows = [...btw.rows, incoming]
  btw.thinking = isProgress({ text: incoming.text, buttons: incoming.buttons })
  // an answer that arrives while the sheet is closed opens it: it is the reply
  // to a «/btw» the person sent
  if (!btw.open) {
    btw.mounted = true
    btw.open = true
  }
}

/** Tests only. */
export function _resetBtw() {
  Object.assign(btw, {
    open: false,
    mounted: false,
    rows: [],
    draft: '',
    thinking: false,
    error: '',
    focus: 0,
    taps: {},
  })
}
