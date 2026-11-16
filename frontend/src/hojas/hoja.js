// Hojas (doco docs/HOJAS.md): live spreadsheets the person and Muelle edit
// together. doco owns the sheet (doco.hojas.api) and runs the bot's changes
// through Univer's engine; the page runs the same Univer (./univer.js). This
// file keeps what the page decides pure so tests share it.
import { comprasApi } from '@/composables/useCompras'

const SERVICE = 'doco.hojas.api'
export const HOME = '/hojas'
/** How long the page waits after the last edit before it saves. */
export const SAVE_DELAY_MS = 1200

/** Where scripts/build-univer.mjs leaves the editor bundle (crm/public/univer). */
export const EDITOR_BASE = '/assets/crm/univer'
let editor = null

let manifest = null

function editorManifest() {
  manifest ||= fetch(`${EDITOR_BASE}/manifest.json`, { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error('manifest')
      return response.json()
    })
    .catch((error) => {
      manifest = null
      throw error
    })
  return manifest
}

function addLink(rel, file, as) {
  const href = `${EDITOR_BASE}/${file}`
  if (document.head.querySelector(`link[rel="${rel}"][href="${href}"]`)) return
  const link = document.createElement('link')
  link.rel = rel
  link.href = href
  if (as) link.as = as
  document.head.append(link)
}

/** Warm the editor while the person is still on the list: the browser fetches its
 * files at idle priority, so opening a sheet starts from cache. */
export function prefetchEditor() {
  editorManifest()
    .then(({ js, css, preload = [] }) => {
      for (const file of [js, ...preload]) addLink('modulepreload', file)
      if (css) addLink('prefetch', css, 'style')
    })
    .catch(() => {})
}

/** The editor module (src/hojas/univer.js, bundled apart from Vite's build): its
 * stylesheet once, then its `mountSheet`. */
export function loadEditor() {
  editor ||= editorManifest()
    .then(({ js, css }) => {
      if (css) addLink('stylesheet', css)
      return import(/* @vite-ignore */ `${EDITOR_BASE}/${js}`)
    })
    .catch((error) => {
      editor = null
      throw error
    })
  return editor
}

/** POST to the Hojas API; a refusal keeps the server's message and type. */
export function hojasApi(method, args = {}) {
  return comprasApi(`${SERVICE}.${method}`, args)
}

/** The .xlsx download of a sheet (a GET the browser follows). */
export function excelUrl(name) {
  return `/api/method/${SERVICE}.exportar?name=${encodeURIComponent(name)}`
}

/**
 * What the open page does with a `doco_hoja` event (docs/HOJAS.md §8):
 * 'ignore' (another sheet, this page's own save, or already replayed),
 * 'wait' (this page's save is on its way: its answer brings the change),
 * 'apply' (the next revision, with its mutations: replay it in place) or
 * 'reload' (a gap, or a change too big to travel: open the sheet again).
 */
export function liveStep(event, { sheet, cliente, seen, inFlight }) {
  if (!sheet || event?.name !== sheet.name) return 'ignore'
  const revision = event.revision || 0
  if (event.cliente && event.cliente === cliente) return 'ignore'
  if (seen?.has(revision) || revision <= (sheet.revision || 0)) return 'ignore'
  if (inFlight) return 'wait'
  if (event.mutations?.length && revision === (sheet.revision || 0) + 1)
    return 'apply'
  return 'reload'
}

/** How long a person's place on the sheet shows after their last move. */
export const PRESENCE_MS = 60000

/**
 * The others on the sheet, newest first: «Ana · Ventas!B4».
 * `seen` maps a page id to {user_name, celda, at}.
 */
export function presenceRows(seen, now = Date.now()) {
  return Object.entries(seen || {})
    .filter(([, p]) => p?.celda && now - (p.at || 0) < PRESENCE_MS)
    .sort(([, a], [, b]) => (b.at || 0) - (a.at || 0))
    .map(([cliente, p]) => ({
      cliente,
      name: p.user_name || 'Alguien',
      celda: p.celda,
    }))
}

/** The note a change by Muelle leaves above the sheet. */
export function botNote(event) {
  if (event?.by !== 'bot') return ''
  const what = event.resumen
    ? `Muelle cambió ${event.resumen}`
    : 'Muelle cambió la hoja'
  return event.porque ? `${what}: ${event.porque}` : what
}

/** Who made a change, as «Cambios» says it. */
export function changeAuthor(change) {
  if (change?.by === 'bot') return 'Muelle'
  return change?.user_name || change?.user || 'Alguien'
}

/** The «Cambios» rows: who, what and why, newest first, as the sheet lists them. */
export function changeRows(sheet) {
  return (sheet?.cambios || []).map((c) => ({
    revision: c.revision,
    author: changeAuthor(c),
    what: c.resumen || 'Cambio',
    why: c.porque || '',
    at: c.at || '',
  }))
}

/** What «Pídeselo a Muelle» writes for the person to finish. */
export function askPrompt(sheet) {
  return sheet ? `En la hoja «${sheet.title}», ` : 'Hazme una hoja de '
}

/** The assistant's screen context for an open sheet. */
export function sheetContext(sheet) {
  return sheet
    ? { doctype: 'Hoja', name: sheet.name, title: sheet.title }
    : null
}

/** A snapshot ready for Univer: an empty or missing one becomes a blank book. */
export function bookOf(sheet) {
  const snapshot = sheet?.snapshot
  if (snapshot && snapshot.sheets && Object.keys(snapshot.sheets).length)
    return snapshot
  return {
    id: 'hoja',
    name: sheet?.title || 'Hoja',
    sheetOrder: ['s1'],
    sheets: { s1: { id: 's1', name: 'Hoja 1', cellData: {} } },
  }
}
