import { getCurrentInstance, onBeforeUnmount, reactive } from 'vue'

// The shell-wide door of the barcode scanner. Tiny on purpose: MuelleShell
// imports it to know when to mount the sheet, and every door (the bar, ⌘K,
// Productos' «Escanear», a document's items) calls `openScan`. The sheet is a
// lazy chunk.
//
//   openScan()                      read a code; its product opens, or the page
//                                   that claimed scans takes the code
//   openScan({ code })              start from a code read elsewhere
//   openScan({ resolved })          start from resolveScan's answer (choose,
//                                   unknown) so nothing is asked twice
//   openScan({ onItem, doctype })   the caller takes the product: a line on a
//                                   document of that doctype
//
// Resolves with the product ({item_code, item_name, …}) or null when closed.

export const scan = reactive({
  open: false,
  wanted: false,
  options: {},
  resolve: null,
})

let loading
/** The sheet's chunk (preloaded on a door's hover or focus). */
export function loadScanSheet() {
  return (loading ||= import('./ScanSheet.vue'))
}

export function openScan(options = {}) {
  if (scan.resolve) scan.resolve(null)
  return new Promise((resolve) => {
    scan.options = { ...options }
    scan.resolve = resolve
    scan.wanted = true
    scan.open = true
  })
}

/** Called by the sheet when it is done (the product) or dismissed (null). */
export function settleScan(result = null) {
  const resolve = scan.resolve
  scan.resolve = null
  scan.open = false
  if (resolve) resolve(result)
}

// A page that reads codes itself (Recepción counts them against its order)
// claims the shell's scans while it is mounted: the code goes to it as read,
// and the page answers it the way its own field would.
const claims = []

export function claimScans(handler) {
  claims.push(handler)
  const release = () => {
    const at = claims.indexOf(handler)
    if (at >= 0) claims.splice(at, 1)
  }
  if (getCurrentInstance()) onBeforeUnmount(release)
  return release
}

/** The page's handler for a raw code, or null when no page claimed scans. */
export function scanClaim() {
  return claims.at(-1) || null
}
