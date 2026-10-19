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
  // Same site: doco may write its links as http:// behind the https proxy.
  if (
    url.origin !== 'https://muelle.invalid' &&
    url.host !== globalThis.location?.host
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

// A Desk record link the shell has no screen for reads as its record name
// («CAP-2026-00087»), not as a long URL that wraps over three lines.
function linkLabel(href) {
  try {
    const url = new URL(href, 'https://muelle.invalid')
    const desk = url.pathname.match(/^\/(?:app|desk)\/[^/]+\/([^/]+)\/?$/)
    if (desk) return decodeURIComponent(desk[1])
  } catch {
    // not a URL: shown as written
  }
  return href
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
    parts.push(
      to ? { href: raw, label: raw, to } : { href: raw, label: linkLabel(raw) },
    )
    last = match.index + raw.length
  }
  if (last < value.length) parts.push({ text: value.slice(last) })
  return parts
}

/**
 * One line → [{ text, strong? }] and link parts: the model writes `**bold**`
 * (a key figure, a record) and the sheet shows it bold instead of asterisks.
 */
export function inlineParts(text) {
  const parts = []
  String(text || '')
    .split(/\*\*(?=\S)(.+?\S)\*\*/g)
    .forEach((piece, i) => {
      if (!piece) return
      // *a name* is emphasis: shown without its asterisks
      piece
        .split(/(?<![*\w])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![*\w])/g)
        .forEach((bit, j) => {
          if (!bit) return
          for (const part of textParts(bit)) {
            if (part.href) parts.push(part)
            else if (i % 2) parts.push({ ...part, strong: true })
            else if (j % 2) parts.push({ ...part, em: true })
            else parts.push(part)
          }
        })
    })
  return parts
}

const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const LIST_ITEM = /^(\s*)(?:([-*•])|(\d{1,2})[.)])\s+(.*)$/
const HEADING = /^\s*#{1,6}\s+(.*)$/
const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => inlineParts(cell.trim()))

/**
 * A reply's prose → blocks the sheet renders without v-html: paragraphs,
 * headings, list items and tables (the model answers in Markdown; the
 * worker should read a list, not pipes and asterisks).
 */
export function proseBlocks(text) {
  const blocks = []
  let para = []
  const flush = () => {
    if (para.length)
      blocks.push({ type: 'p', parts: inlineParts(para.join('\n')) })
    para = []
  }
  const lines = String(text || '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[i + 1] || '')) {
      flush()
      const head = cells(line)
      const rows = []
      i += 2
      while (i < lines.length && TABLE_ROW.test(lines[i]))
        rows.push(cells(lines[i++]))
      i -= 1
      blocks.push({ type: 'table', head, rows })
      continue
    }
    const item = line.match(LIST_ITEM)
    if (item) {
      flush()
      blocks.push({
        type: 'li',
        marker: item[3] ? `${item[3]}.` : '•',
        // «   - Cita…» under «2. ¿Cómo lo quieres?» stays under it
        nested: item[1].length >= 2,
        parts: inlineParts(item[4]),
      })
      continue
    }
    const heading = line.match(HEADING)
    if (heading) {
      flush()
      blocks.push({ type: 'h', parts: inlineParts(heading[1]) })
      continue
    }
    if (!line.trim()) flush()
    else para.push(line)
  }
  flush()
  return blocks
}

/**
 * The messages the log shows. Left out: an answer doco cannot replay (and its
 * question), the progress lines («Consultando…» shows once, as the status
 * line), and an outage line that a later answer has made old news (and its
 * question): «Muelle no puede responder ahora» only while it is still true.
 */
export function visibleMessages(messages) {
  const all = Array.isArray(messages) ? messages : []
  let answeredAfter = false
  const oldOutage = new Set()
  for (let i = all.length - 1; i >= 0; i--) {
    const message = all[i]
    if (message.role !== 'bot' || isProgress(message)) continue
    if (message.down && answeredAfter) oldOutage.add(i)
    if (!message.down && !message.stale) answeredAfter = true
  }
  const hide = (i) => all[i]?.stale || oldOutage.has(i)
  return all.filter(
    (message, i) =>
      !hide(i) &&
      !(message.role === 'user' && hide(i + 1)) &&
      !(message.role === 'bot' && isProgress(message)),
  )
}

/** The first record link of a reply: the receipt's «Abrir». */
export function firstRecordLink(text) {
  return textParts(text).find((part) => part.to) || null
}

/**
 * A receipt's reply without the record link its card already opens: one
 * «Abrir», on the card (SHELL-S2c walk: «Abrir» on the card and again under
 * the reply). A line that was only the link goes; «…10:00. <link>.» keeps
 * its own sentence.
 */
export function withoutLink(text, href) {
  const value = String(text || '')
  if (!href || !value.includes(href)) return value
  const esc = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rx = new RegExp(
    `[ \\t]*(?:\\[[^\\]\\n]*\\]\\(${esc}\\)|<${esc}>|${esc})[.,;]?`,
  )
  const lines = value.split('\n')
  const at = lines.findIndex((line) => rx.test(line))
  const line = lines[at].replace(rx, '').replace(/[\s:→-]+$/u, '')
  if (/[\p{L}\p{N}]/u.test(line)) lines[at] = line
  else lines.splice(at, 1)
  return lines.join('\n').trim()
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
      const at = n ? lines.findIndex((l) => l.trim().startsWith(`${n}.`)) : -1
      const line = at >= 0 ? lines[at] : null
      // its indented lines are the change itself: «Llamar…» sobre … · para …
      const more = []
      for (let i = at + 1; at >= 0 && i < lines.length; i++) {
        if (!/^\s+\S/.test(lines[i])) break
        more.push(lines[i].trim())
      }
      cards.push({
        id: approve.callback_data,
        summary: stripEmoji(
          line ? line.trim().replace(/^\d+\.\s*/, '') : approve.text,
        ),
        detail: more.length ? stripEmoji(more.join('\n')) : null,
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

const APPROVAL_FRAME = [
  /^\W*El agente propone y espera tu decisión:?\s*$/u,
  /^\s*Al aprobar se guardan los cambios mostrados\./u,
]

/** The reply text without the approval lines its cards already show. */
export function proseOf(message, cards) {
  const text = String(message?.text || '')
  if (!cards.some((card) => card.id.startsWith('agr:'))) return stripEmoji(text)
  // the numbered approval lines and their indented detail are on the cards,
  // and so is what doco's frame around them says (the card asks, «Confirmar»
  // saves): «El agente propone…», «Al aprobar se guardan…»
  const kept = []
  let inItem = false
  for (const line of text.split('\n')) {
    if (/^\s*\d+\.\s/.test(line)) inItem = true
    else if (!(inItem && /^\s+\S/.test(line))) inItem = false
    if (!inItem && !APPROVAL_FRAME.some((rx) => rx.test(line))) kept.push(line)
  }
  return stripEmoji(kept.join('\n').trim())
}

// Which record chips fit which doctype: a customer owes, a person gets a
// message, a sale or a purchase gets a follow-up. A pendiente, an Item's
// settings or a catalog get «Resumen» only (SHELL-S2c walk: «¿Qué debe?» on
// a pendiente).
const OWES = new Set(['Customer', 'Contact'])
const PEOPLE = new Set([
  'Customer',
  'Contact',
  'Lead',
  'CRM Lead',
  'CRM Organization',
  'CRM Deal',
  'Supplier',
])
const FOLLOW_UP = new Set([
  ...PEOPLE,
  'Opportunity',
  'Quotation',
  'Sales Order',
  'Delivery Note',
  'Sales Invoice',
  'Material Request',
  'Request for Quotation',
  'Supplier Quotation',
  'Purchase Order',
  'Purchase Invoice',
])

/**
 * The chips of the screen the sheet opened on (ASSISTANT.md «It knows the
 * screen»): a record (by its doctype), Hoy, a list, or none.
 */
export function chipsFor(context) {
  if (context?.doctype && context?.name) {
    const doctype = context.doctype
    return [
      { label: __('Summary'), prompt: __('Give me a summary of this record.') },
      OWES.has(doctype) && {
        label: __('What do they owe?'),
        prompt: __('What does this customer owe, and since when?'),
      },
      FOLLOW_UP.has(doctype) && {
        label: __('Schedule a follow-up'),
        prompt: __('Schedule a follow-up for this record.'),
      },
      PEOPLE.has(doctype) && {
        label: __('Draft a message'),
        prompt:
          doctype === 'Customer'
            ? __('Draft a message for this customer.')
            : __('Draft a message for this contact.'),
      },
    ].filter(Boolean)
  }
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
        prompt: `${__('Search this list for:')} `,
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
// doco's history (chat_usage.for_history) cannot replay an old answer with
// today's access and writes one of these in its place; the sheet shows it as a
// quiet note instead of a full answer, once per run of them.
const NOT_REPLAYED = [
  'Este resultado necesita una consulta nueva',
  'Esta respuesta no se vuelve a mostrar',
]
export function isNotReplayed(text) {
  const value = String(text || '').trim()
  return NOT_REPLAYED.some((start) => value.startsWith(start))
}

// The brain could not reach its model: doco says so at length (or, on the
// analytics path, with the raw provider error). The sheet shows one line and
// its own «Reintentar» instead.
const DOWN = [
  /El asistente inteligente no está disponible/u,
  /LLM provider unavailable/u,
]
export function isServiceDown(text) {
  return DOWN.some((pattern) => pattern.test(String(text || '')))
}

/**
 * History rows merged with what this page saw live. doco's history cannot
 * replay an answer: it writes «Este resultado necesita una consulta nueva…» in
 * its place, or leaves an action card's row out. So a reload (reconnect, a
 * route change with the dock open) keeps the live copy of a row it has, keeps
 * a live action card it lacks after the row it followed, and keeps which card
 * a receipt belongs to (SHELL-S2c walk: the 1440 return lost its card).
 */
export function mergeHistory(rows, live) {
  const seen = new Map((live || []).filter((m) => m.mid).map((m) => [m.mid, m]))
  const out = rows.map((row) => {
    const mine = seen.get(row.mid)
    if (!mine) return row
    if (row.stale) return mine
    return mine.receiptOf ? { ...row, receiptOf: mine.receiptOf } : row
  })
  const have = new Set(out.map((m) => m.mid).filter(Boolean))
  let after = null
  for (const message of live || []) {
    if (!message.mid) continue
    if (have.has(message.mid)) {
      after = message.mid
      continue
    }
    if (message.role !== 'bot' || !message.buttons?.length) continue
    const at = after ? out.findIndex((m) => m.mid === after) + 1 : 0
    out.splice(at, 0, message)
    have.add(message.mid)
    after = message.mid
  }
  return out
}

export function normalizeRow(row) {
  const bot = row.kind === 'bot' || row.kind === 'answer'
  const text = row.message ?? row.text ?? ''
  return {
    id: row.mid || row.client_id || `${row.kind}-${row.creation}`,
    mid: row.mid || null,
    role: bot ? 'bot' : 'user',
    text,
    buttons: bot ? row.buttons || [] : [],
    at: row.creation || null,
    stale: bot && isNotReplayed(text),
    down: bot && isServiceDown(text),
  }
}
