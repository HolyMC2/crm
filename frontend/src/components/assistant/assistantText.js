// Pure helpers of «Pregúntale a Muelle» (SHELL-S2, shell-program/design/ASSISTANT.md):
// what a reply says, which of its buttons are action cards, the chips of a
// screen, and whether a palette query is a question. No Vue, no network.
import { sourceSlugs } from '@/utils/shellRoutes'

// Leading pictographs only: the words carry the meaning (the Desk bubble does
// the same; the emoji were a Telegram habit).
const LEADING_EMOJI =
  /^(?:\p{Extended_Pictographic}|[\u2600-\u27BF]|\uFE0F|\u200D|\s)+/u

export function stripEmoji(text) {
  return String(text || '').replace(LEADING_EMOJI, '')
}

// Desk URL slug → doctype, for the records the shell has a screen for.
const DESK_SLUGS = {
  contact: 'Contact',
  customer: 'Customer',
  supplier: 'Supplier',
  'crm-organization': 'CRM Organization',
  lead: 'Lead',
  'crm-lead': 'CRM Lead',
  address: 'Address',
  todo: 'ToDo',
  'crm-task': 'CRM Task',
  'crm-deal': 'CRM Deal',
}
const TASK_SLUGS = { ToDo: 'todo', 'CRM Task': 'crm-task' }

/**
 * The shell route of a Desk record URL (`/app/contact/X` → `/contactos/contact/X`),
 * or null when the shell has no screen for it. A reply never strands a
 * worker in the Desk when Muelle has the record (SPEC §1.5).
 */
export function shellPathFor(href) {
  let url
  try {
    url = new URL(href, 'https://muelle.invalid')
  } catch {
    return null
  }
  if (
    url.origin !== 'https://muelle.invalid' &&
    url.origin !== globalThis.location?.origin
  )
    return null
  const crm = url.pathname.match(/^\/crm(\/.*)$/)
  if (crm) return crm[1] + url.search
  const desk = url.pathname.match(/^\/(?:app|desk)\/([^/]+)\/([^/]+)\/?$/)
  if (!desk) return null
  const doctype = DESK_SLUGS[decodeURIComponent(desk[1]).toLowerCase()]
  const name = decodeURIComponent(desk[2])
  if (sourceSlugs[doctype])
    return `/contactos/${sourceSlugs[doctype]}/${encodeURIComponent(name)}`
  if (TASK_SLUGS[doctype])
    return `/pendientes/${TASK_SLUGS[doctype]}/${encodeURIComponent(name)}`
  if (doctype === 'CRM Deal') return `/deal/${encodeURIComponent(name)}`
  return null
}

const URL_RX = /(https?:\/\/[^\s<>«»"]+|\/(?:app|desk|crm)\/[^\s<>«»"]+)/g

/** Text → [{ text }] and [{ href, label, to? }] parts, for rendering without v-html. */
export function textParts(text) {
  const parts = []
  let last = 0
  const value = String(text || '')
  for (const match of value.matchAll(URL_RX)) {
    const raw = match[0].replace(/[.,;:)]+$/, '')
    if (match.index > last) parts.push({ text: value.slice(last, match.index) })
    const to = shellPathFor(raw)
    parts.push(to ? { href: raw, label: raw, to } : { href: raw, label: raw })
    last = match.index + raw.length
  }
  if (last < value.length) parts.push({ text: value.slice(last) })
  return parts
}

/** The first record link of a reply: the receipt's «Abrir». */
export function firstRecordLink(text) {
  return textParts(text).find((part) => part.to) || null
}

/**
 * A reply's buttons split into action cards (they change data and need a
 * confirmation) and plain choices. Two shapes of doco's action buttons:
 * `act:<card>` (one proposal, the text is its label) and the run approvals
 * `agr:<run>:<pid>:a|r` (one row per proposal, its line in the reply text).
 */
export function splitButtons(message) {
  const rows = Array.isArray(message?.buttons) ? message.buttons : []
  const lines = String(message?.text || '').split('\n')
  const cards = []
  const choices = []
  for (const row of rows) {
    const buttons = (Array.isArray(row) ? row : [row]).filter(
      (button) => button && typeof button.callback_data === 'string',
    )
    const approve = buttons.find((b) => /^agr:.+:a$/.test(b.callback_data))
    const reject = buttons.find((b) => /^agr:.+:r$/.test(b.callback_data))
    if (approve) {
      const n = (approve.text.match(/(\d+)\s*$/) || [])[1]
      const line = n && lines.find((l) => l.trim().startsWith(`${n}.`))
      cards.push({
        id: approve.callback_data,
        summary: stripEmoji(
          line ? line.trim().replace(/^\d+\.\s*/, '') : approve.text,
        ),
        confirm: approve.callback_data,
        change: reject?.callback_data || null,
      })
      continue
    }
    for (const button of buttons) {
      if (button.callback_data.startsWith('act:'))
        cards.push({
          id: button.callback_data,
          summary: stripEmoji(button.text),
          confirm: button.callback_data,
          change: null,
        })
      else
        choices.push({
          label: stripEmoji(button.text),
          data: button.callback_data,
        })
    }
  }
  return { cards, choices }
}

/** The reply text without the approval lines its cards already show. */
export function proseOf(message, cards) {
  const text = String(message?.text || '')
  if (!cards.some((card) => card.id.startsWith('agr:'))) return stripEmoji(text)
  return stripEmoji(
    text
      .split('\n')
      .filter((line) => !/^\s*\d+\.\s/.test(line))
      .join('\n')
      .trim(),
  )
}

/**
 * The chips of the screen the sheet opened on (ASSISTANT.md «It knows the
 * screen»): a record, Hoy, a list, or none.
 */
export function chipsFor(context) {
  if (context?.doctype && context?.name)
    return [
      { label: __('Summary'), prompt: __('Give me a summary of this record.') },
      {
        label: __('What do they owe?'),
        prompt: __('What does this customer owe, and since when?'),
      },
      {
        label: __('Schedule a follow-up'),
        prompt: __('Schedule a follow-up for this record.'),
      },
      {
        label: __('Draft a message'),
        prompt: __('Draft a message for this customer.'),
      },
    ]
  if (/^\/(crm\/)?hoy\b/.test(context?.route || ''))
    return [
      {
        label: __('What do I do first?'),
        prompt: __('What should I do first today?'),
      },
    ]
  if (context?.doctype)
    return [
      {
        label: __('Search this list'),
        prompt: __('Search this list for: '),
        fill: true,
      },
    ]
  return []
}

// A question in the search field: ¿…?, a question word, or a sentence.
const QUESTION_WORDS =
  /^(qu[eé]|cu[aá]nt[oa]s?|cu[aá]ndo|c[oó]mo|d[oó]nde|qui[eé]n(es)?|cu[aá]l(es)?|por ?qu[eé]|hay|tengo|me (puedes|ayudas)|ay[uú]dame|dime|mu[eé]strame|what|how|who|when|where|why|which)\b/i

export function looksLikeQuestion(text) {
  const value = String(text || '').trim()
  if (!value) return false
  if (/^[¿?]/.test(value) || /\?$/.test(value)) return true
  if (QUESTION_WORDS.test(value)) return true
  return value.split(/\s+/).length >= 5
}

/** The question a palette query asks: `?algo` and `¿algo?` both ask «algo». */
export function questionText(text) {
  return String(text || '')
    .trim()
    .replace(/^\?\s*/, '')
}

/** A client id api.say accepts (^[A-Za-z0-9_-]{1,64}$): a retry is then a replay. */
export function newClientId() {
  const random =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return `shell-${random.replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 64)
}

/**
 * A progress line («Buscando en ventas…»): one line ending in an ellipsis,
 * without buttons. It is proof of work, not the answer (the bubble's rule).
 */
export function isProgress(message) {
  if (message?.buttons?.length || message?.answer) return false
  const text = String(message?.text || '').trim()
  return !text.includes('\n') && /(…|\.\.\.)\s*(\([^()]*\))?\s*$/.test(text)
}

/** History rows (doco api.history) and live events → one message shape. */
export function normalizeRow(row) {
  const bot = row.kind === 'bot' || row.kind === 'answer'
  return {
    id: row.mid || row.client_id || `${row.kind}-${row.creation}`,
    mid: row.mid || null,
    role: bot ? 'bot' : 'user',
    text: row.message ?? row.text ?? '',
    buttons: bot ? row.buttons || [] : [],
    at: row.creation || null,
  }
}
