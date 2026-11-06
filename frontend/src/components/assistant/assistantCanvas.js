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
/** Loaded in the sandboxed frame from canvas.preview. */
const FRAME_KINDS = INLINE_KINDS
/** Read through the facade and drawn by Vue (text, never HTML). */
export const TABLE_KINDS = ['csv', 'xlsx', 'ods']
export const TEXT_KINDS = ['md', 'txt', 'json']
/** Rows the Lienzo view shows of a table; the download has them all. */
export const TABLE_ROWS = 200

/** What the person calls each kind of file (never the extension). */
export function kindLabel(kind) {
  return (
    {
      html: __('Page', null, 'Lienzo'),
      pdf: __('PDF'),
      png: __('Image', null, 'Lienzo'),
      jpg: __('Image', null, 'Lienzo'),
      csv: __('Table', null, 'Lienzo'),
      xlsx: __('Excel'),
      ods: __('Spreadsheet', null, 'Lienzo'),
      md: __('Notes', null, 'Lienzo'),
      txt: __('Text', null, 'Lienzo'),
      json: __('Data', null, 'Lienzo'),
    }[kind] || kind
  )
}

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

/** The kinds the sandboxed frame shows (a csv there downloads instead). */
export function canPreview(file) {
  return FRAME_KINDS.includes(file?.kind) && !isImage(file)
}

function facadeError(out) {
  return (
    out?.message ||
    __('Muelle could not open this file. Download it or try again.')
  )
}

/**
 * The Lienzo view's copy of one file: a table's first rows (`grid`) or a
 * text file's text (`get`). `{ grid }` | `{ text }` | `{ error }`.
 */
export async function readFile(file) {
  const tabular = TABLE_KINDS.includes(file?.kind)
  if (!tabular && !TEXT_KINDS.includes(file?.kind)) return {}
  const payload = { file: file.file }
  if (file.version) payload.version = file.version
  if (tabular) payload.limit = TABLE_ROWS
  try {
    const out = await call(`${CANVAS_API}.facade`, {
      command: tabular ? 'grid' : 'get',
      payload: JSON.stringify(payload),
    })
    if (out?.ok === false) return { error: facadeError(out) }
    return tabular ? { grid: out.grid || {} } : { text: out.text || '' }
  } catch (error) {
    return { error: facadeError({ message: error?.messages?.[0] }) }
  }
}

/** JSON as the person reads it: indented, or as it came when it is not JSON. */
export function prettyJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/** «Borrar» (two taps in place): the file and its versions leave the Lienzo. */
export async function deleteFile(file) {
  try {
    const out = await call(`${CANVAS_API}.facade`, {
      command: 'delete',
      payload: JSON.stringify({ file: file.file }),
    })
    if (out?.ok === false) {
      canvas.error = facadeError(out)
      return false
    }
  } catch (error) {
    canvas.error = facadeError({ message: error?.messages?.[0] })
    return false
  }
  canvas.files = canvas.files.filter((f) => f.file !== file.file)
  if (canvas.selected === file.file) canvas.selected = null
  canvas.error = ''
  return true
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
