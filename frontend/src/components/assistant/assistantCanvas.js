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

/**
 * A restore made here: the file while the call runs, then `file@version`.
 * Its event comes back like a turn's and must not go under an answer.
 */
const restored = new Set()

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

/** One facade command: `{ out }`, or `{ error }` in the person's words. */
async function ask(command, payload) {
  try {
    const out = await call(`${CANVAS_API}.facade`, {
      command,
      payload: JSON.stringify(payload),
    })
    return out?.ok === false ? { error: facadeError(out) } : { out: out || {} }
  } catch (error) {
    return { error: facadeError({ message: error?.messages?.[0] }) }
  }
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
  const { out, error } = await ask(tabular ? 'grid' : 'get', payload)
  if (error) return { error }
  return tabular ? { grid: out.grid || {} } : { text: out.text || '' }
}

/** «Versiones»: the versions the Lienzo keeps of one file, newest first. */
export async function loadVersions(file) {
  const { out, error } = await ask('versions', { file: file.file })
  return error ? { error } : { versions: out.versions || [] }
}

/**
 * What `version` changed against the version before it (doco canvas_diff):
 * a table by rows and cells, a text by lines, any other file only whether it
 * changed. `{ changes }` | `{ error }`.
 */
export async function compareVersion(file, version) {
  const { out, error } = await ask('compare', { file: file.file, new: version })
  if (error) return { error }
  // the facade answers {ok, compare}; without it the row says so, never blank
  return out.compare ? { changes: out.compare } : { error: facadeError(out) }
}

/**
 * The content of `version` as a new current version of `file` (the current
 * one), which stays in the history. Content equal to the current one saves
 * nothing and answers with the current version: `unchanged`.
 */
export async function restoreVersion(file, version) {
  // the event is published on commit: it can arrive before the answer
  restored.add(file.file)
  const { out, error } = await ask('restore', { file: file.file, version })
  restored.delete(file.file)
  if (error) return { error }
  const now = out.file || {}
  restored.add(`${now.file}@${now.version}`)
  canvas.files = canvas.files.map((f) =>
    f.file === now.file ? { ...f, ...now } : f,
  )
  return { file: now, unchanged: now.version === file.version }
}

/** Who wrote a version, as the version list says it. */
export function originLabel(origin) {
  return (
    {
      person: __('Edited by you', null, 'Lienzo'),
      materialized: __('Made by Muelle from your data', null, 'Lienzo'),
      restored: __('Restored', null, 'Lienzo'),
      converted: __('Converted', null, 'Lienzo'),
    }[origin] || __('Made by Muelle', null, 'Lienzo')
  )
}

/** A cell that reads as an amount or a count: a csv brings every cell as text. */
export function isFigure(cell) {
  if (typeof cell === 'number') return true
  return (
    typeof cell === 'string' &&
    /^[-+]?\$?\s?\d[\d,]*(\.\d+)?\s?%?$/.test(cell.trim())
  )
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
  const { error } = await ask('delete', { file: file.file })
  if (error) {
    canvas.error = error
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
  const ours =
    restored.has(payload.file) ||
    restored.has(`${payload.file}@${payload.version}`)
  if (INLINE_KINDS.includes(payload.kind) && !ours)
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
  restored.clear()
  Object.assign(canvas, {
    files: [],
    loaded: false,
    available: true,
    selected: null,
    pending: [],
    error: '',
  })
}
