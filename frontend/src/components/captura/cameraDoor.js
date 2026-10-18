import { reactive } from 'vue'

// The shell-wide door of the document camera (Shell D7, SPEC DD14). Tiny on
// purpose: MuelleShell imports it to know when to mount the sheet, and every
// door (bar, palette, Más, «Capturar documento», a record's «Tomar foto»)
// calls `openCamera`. The sheet itself is a lazy chunk (DD12).
//
//   openCamera()                                  «¿Qué es?» decides what to draft
//   openCamera({ targets, supplier, invoice })    a «Capturar documento» door
//   openCamera({ record: { doctype, name } })     «Tomar foto»: filed on the record
//   openCamera({ onFiles: async (files) => … })   the caller keeps its own upload
//
// Resolves with the result (capture review, filed file, the caller's onFiles
// value) or null when the worker closes the sheet.

export const camera = reactive({
  open: false,
  wanted: false,
  options: {},
  resolve: null,
})

let loading
/** The sheet's chunk (preloaded on a door's hover/focus). */
export function loadCameraSheet() {
  return (loading ||= import('./CameraSheet.vue'))
}

export function openCamera(options = {}) {
  if (camera.resolve) camera.resolve(null)
  return new Promise((resolve) => {
    camera.options = { ...options }
    camera.resolve = resolve
    camera.wanted = true
    camera.open = true
  })
}

/** Called by the sheet when it is done (result) or dismissed (null). */
export function settleCamera(result = null) {
  const resolve = camera.resolve
  camera.resolve = null
  camera.open = false
  if (resolve) resolve(result)
}

/** «Escanear documento» in the worker's words, for doors that look for it. */
const DOCUMENT_WORDS =
  /\b(escane|escan|foto|camara|cámara|ticket|factura|recibo|comprobante|transferencia|spei|cotizaci|ine\b|identificaci|domicilio|captur|ocr|scan)/i

/** Whether a palette query reads like «I want to scan a paper». */
export function looksLikeDocument(text) {
  return DOCUMENT_WORDS.test(String(text || ''))
}
