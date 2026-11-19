// Messenger: who sent each reply, whether the customer still waits, and Meta's reply window.
// Pure helpers for MessengerArea, the «Sin asignar» rows and tests. The server decides who sent
// a message (doco_marketing services/messenger_origin.py: sent_via = crm · bot · meta ·
// meta_auto); this only words it.

import { span } from '@/utils/atencion'

const WINDOW_MS = 24 * 3600 * 1000
const HUMAN_AGENT_MS = 7 * 24 * 3600 * 1000
// Under this much time left, the window notice turns amber.
const SOON_MS = 3 * 3600 * 1000

function tr(message, replace) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

/** A site datetime string («2026-11-18 15:36:49.242») as epoch ms, or NaN. */
export function tsMs(ts) {
  if (!ts) return NaN
  return new Date(String(ts).replace(' ', 'T')).getTime()
}

/**
 * The small label under an outgoing bubble, or null (customer messages, our own
 * optimistic bubble, rows from a server that does not say).
 * { text, title, auto } — auto: Meta sent it by itself (instant reply, opt-in card).
 */
export function originLabel(m) {
  if (!m || m.direction !== 'out' || m._optimistic) return null
  switch (m.sent_via) {
    case 'crm':
      return {
        text: m.sent_by || tr('CRM'),
        title: tr('Enviado desde el CRM'),
        auto: false,
      }
    case 'bot':
      return {
        text: tr('Bot'),
        title: tr('Lo envió el bot o una automatización del CRM'),
        auto: false,
      }
    case 'meta':
      return {
        text: tr('Desde Meta'),
        title: tr(
          'Alguien lo envió desde Business Suite o la app de Messenger, fuera del CRM. Meta no dice quién.',
        ),
        auto: false,
      }
    case 'meta_auto':
      return {
        text: tr('Automático de Meta'),
        title: tr(
          'Meta lo envió sola (respuesta instantánea o invitación a ofertas). No cuenta como respuesta: el cliente sigue esperando.',
        ),
        auto: true,
      }
    default:
      return null
  }
}

/** ✓ sent · ✓✓ delivered · ✓✓ read (blue) · ! failed. { text, title, read } or null. */
export function statusTick(m) {
  if (!m || m.direction !== 'out' || m._optimistic) return null
  const s = String(m.status || '').toLowerCase()
  if (s === 'read')
    return { text: '✓✓', title: tr('Visto por el cliente'), read: true }
  if (s === 'delivered')
    return { text: '✓✓', title: tr('Entregado'), read: false }
  if (s === 'failed')
    return { text: '!', title: tr('No se envió'), read: false }
  if (s === 'sent' || s === 'accepted')
    return { text: '✓', title: tr('Enviado'), read: false }
  return null
}

/**
 * Meta's reply window from the customer's last message: free replies for 24 h, then only
 * with the Human Agent tag up to 7 days, then none.
 * { state: 'open' | 'human_agent' | 'closed' | 'none', lastIn, closesAt, tagUntil } (ms).
 */
export function replyWindow(messages, now = Date.now()) {
  let lastIn = NaN
  for (const m of messages || []) {
    if (m?.direction !== 'in') continue
    const t = tsMs(m.timestamp)
    if (!Number.isNaN(t) && (Number.isNaN(lastIn) || t > lastIn)) lastIn = t
  }
  if (Number.isNaN(lastIn))
    return { state: 'none', lastIn: null, closesAt: null, tagUntil: null }
  const closesAt = lastIn + WINDOW_MS
  const tagUntil = lastIn + HUMAN_AGENT_MS
  const state =
    now < closesAt ? 'open' : now < tagUntil ? 'human_agent' : 'closed'
  return { state, lastIn, closesAt, tagUntil }
}

/** The same window from the server's reply_window dict (the «Sin asignar» rows). */
export function windowFromServer(w, now = Date.now()) {
  const last = w?.last_incoming
  return replyWindow(last ? [{ direction: 'in', timestamp: last }] : [], now)
}

function clock(ms) {
  return new Date(ms).toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** One line under the chat: can we still answer, and until when. { tone, text } or null. */
export function windowNotice(win, now = Date.now()) {
  if (!win || win.state === 'none') return null
  if (win.state === 'open') {
    const left = win.closesAt - now
    return {
      tone: left < SOON_MS ? 'amber' : 'gray',
      text: tr('Puedes responder hasta el {0} (quedan {1}).', [
        clock(win.closesAt),
        span(left / 1000),
      ]),
    }
  }
  if (win.state === 'human_agent')
    return {
      tone: 'amber',
      text: tr(
        'Pasaron más de 24 h desde su último mensaje: Meta solo acepta respuestas con la etiqueta «Agente humano», hasta el {0}.',
        [clock(win.tagUntil)],
      ),
    }
  return {
    tone: 'red',
    text: tr(
      'Pasaron más de 7 días desde su último mensaje: Meta ya no deja responderle por Messenger hasta que vuelva a escribir.',
    ),
  }
}

const VIA_SHORT = {
  crm: 'CRM',
  bot: 'Bot',
  meta: 'Meta',
}

/**
 * The chip of a Messenger «Sin asignar» row: answered (and from where) or how long the
 * customer has waited. { tone, text, title } or null (WhatsApp rows, older servers).
 */
export function orphanChip(row, now = Date.now()) {
  if (!row || row.last_channel !== 'messenger' || !row.last_direction)
    return null
  if (row.last_direction === 'out') {
    const via = VIA_SHORT[row.last_sent_via]
    return {
      tone: 'green',
      text: via ? tr('Respondido · {0}', [via]) : tr('Respondido'),
      title:
        row.last_sent_via === 'meta'
          ? tr(
              'La última respuesta salió desde Business Suite o la app de Messenger.',
            )
          : row.last_sent_by
            ? tr('Respondió {0}', [row.last_sent_by])
            : tr('La última palabra fue nuestra.'),
    }
  }
  const since = tsMs(row.waiting_since)
  if (Number.isNaN(since)) return null
  const win = windowFromServer(row.reply_window, now)
  const closed = win.state !== 'open'
  const left = win.state === 'open' ? win.closesAt - now : 0
  return {
    tone: closed ? 'red' : left < SOON_MS ? 'amber' : 'gray',
    text: closed
      ? tr('Sin respuesta · {0}', [span((now - since) / 1000)])
      : tr('Esperando {0} · quedan {1}', [
          span((now - since) / 1000),
          span(left / 1000),
        ]),
    title: closed
      ? tr(
          'Nadie le respondió y ya pasaron las 24 h que Meta da para contestar.',
        )
      : tr(
          'Nadie le ha respondido. Meta deja contestar 24 h después de su último mensaje.',
        ),
  }
}

export const ORIGIN_CHIP_CLASS = {
  green: 'bg-surface-green-2 text-ink-green-8',
  red: 'bg-surface-red-2 text-ink-red-8',
  amber: 'bg-surface-amber-2 text-ink-amber-9',
  gray: 'bg-surface-gray-2 text-ink-gray-7',
}
