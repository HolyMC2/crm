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

/** A realtime `doco_hoja` event that should reload the open sheet. */
export function isNewer(event, sheet) {
  if (!sheet || event?.name !== sheet.name) return false
  return (event.revision || 0) > (sheet.revision || 0)
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
