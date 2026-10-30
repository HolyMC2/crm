// The Lienzo in the sheet (S40): the files and charts a turn writes to the
// assistant's private canvas (doco canvas.py, Session 12) show under the
// answer they came with, and «Abrir en Lienzo» opens them in the sheet's
// Lienzo view. Model HTML is never put in this page: it loads in an iframe
// sandboxed with no permissions from canvas.preview, which answers with its
// own CSP (default-src 'none'), so it runs no script and reaches nothing.
import { reactive } from 'vue'
import { call } from 'frappe-ui'

export const CANVAS_API = 'doco.docoutils.assistant.canvas'
/** Shown inline under an answer; the rest is listed in the Lienzo. */
export const INLINE_KINDS = ['html', 'png', 'jpg', 'pdf']
/** Served by canvas.preview; xlsx and ods only download. */
const PREVIEW_KINDS = [...INLINE_KINDS, 'md', 'txt', 'json', 'csv']

export const canvas = reactive({
  files: [],
  loaded: false,
  available: true,
  /** the file name open in the Lienzo view */
  selected: null,
  /** files the running turn wrote: they go with its answer */
  pending: [],
  error: '',
})

export async function loadCanvas() {
  if (!canvas.available) return
  try {
    const out = await call(`${CANVAS_API}.facade`, { command: 'list' })
    if (out?.ok === false) {
      canvas.error = out.message || ''
      return
    }
    canvas.files = out?.files || []
    canvas.loaded = true
    canvas.error = ''
  } catch {
    // a site without the Lienzo: no inline files, no view
    canvas.available = false
  }
}

function query(file) {
  const params = new URLSearchParams({ file: file.file })
  if (file.version) params.set('version', String(file.version))
  return params.toString()
}

export function previewUrl(file) {
  return `/api/method/${CANVAS_API}.preview?${query(file)}`
}

export function downloadUrl(file) {
  return `/api/method/${CANVAS_API}.download?${query(file)}`
}

export function canPreview(file) {
  return PREVIEW_KINDS.includes(file?.kind)
}

export function isImage(file) {
  return file?.kind === 'png' || file?.kind === 'jpg'
}

/** `doco_assistant_canvas`: {kind: <file kind> | 'deleted', file, version}. */
export function onCanvasEvent(payload) {
  if (!payload?.file) return
  if (payload.kind === 'deleted') {
    canvas.pending = canvas.pending.filter((f) => f.file !== payload.file)
    canvas.files = canvas.files.filter((f) => f.file !== payload.file)
    return
  }
  if (INLINE_KINDS.includes(payload.kind))
    canvas.pending = [
      ...canvas.pending.filter((f) => f.file !== payload.file),
      { file: payload.file, version: payload.version, kind: payload.kind },
    ]
  canvas.loaded = false
}

/** The answer that ends the turn takes what the turn wrote. */
export function takePendingCanvas() {
  const files = canvas.pending
  canvas.pending = []
  return files
}

/**
 * After a reload the live link is gone: each inline file goes under the
 * answer of the turn it was written in (server times), once, and only within
 * the conversation on screen.
 */
export function canvasByAnswer(messages, files) {
  const out = {}
  const answers = (messages || []).filter(
    (m) => m.role === 'bot' && m.at && !m.stale,
  )
  if (!answers.length) return out
  const first = (messages || []).find((m) => m.at)?.at || answers[0].at
  const shown = new Set(
    (messages || []).flatMap((m) => (m.canvas || []).map((f) => f.file)),
  )
  for (const file of files || []) {
    if (!INLINE_KINDS.includes(file.kind) || shown.has(file.file)) continue
    const when = String(file.modified || '')
    if (!when || when < first) continue
    // the turn it was written in: the first answer after the person's last
    // message before it (an answer row keeps its progress line's time, so
    // it can read earlier than the file)
    let asked = -1
    messages.forEach((m, i) => {
      if (m.role === 'user' && m.at && String(m.at) <= when) asked = i
    })
    const answer =
      asked >= 0
        ? messages
            .slice(asked + 1)
            .find((m) => m.role === 'bot' && m.at && !m.stale)
        : answers.find((m) => String(m.at) >= when)
    if (!answer) continue
    out[answer.id] = [...(out[answer.id] || []), file]
  }
  return out
}

export function openInCanvas(file) {
  canvas.selected = file?.file || null
}

/** Tests only. */
export function _resetCanvas() {
  Object.assign(canvas, {
    files: [],
    loaded: false,
    available: true,
    selected: null,
    pending: [],
    error: '',
  })
}
