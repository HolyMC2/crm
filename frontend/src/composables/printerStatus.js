import { ref, watch } from 'vue'
import { labelPrinter } from './labelPrinter'

// The top bar's printer item, only on a computer that prints labels straight
// to its printer (Etiquetas › Elegir impresora): whether Muelle QZ answers and
// still sees that printer. It checks a while after the shell opens, when the
// worker comes back to the tab, every few minutes while something is off, and
// on a tap; a QZ that closes says so at once. The other computers never load
// the QZ client.

export const PRINTER_FIRST_CHECK_MS = 8_000
export const PRINTER_RECHECK_MS = 120_000
const BACK_GAP_MS = 60_000

const findPrinters = () =>
  import('@/composables/etiquetasDirecto').then((m) => m.findLabelPrinters())
// Muelle QZ's connection, once the client is loaded: false when QZ closes.
const qzConnection = () =>
  import('@/services/doco/qzTray').then((m) => m.qzConnected)

/**
 * @returns {{ state: Ref<'ok'|'qz'|'missing'>, checking: Ref<boolean>, printer: Ref<string>, check: () => Promise<void>, start: () => void, stop: () => void }}
 *   `qz`: Muelle QZ does not answer; `missing`: QZ no longer sees the printer.
 */
export function createPrinterStatus({
  printer = labelPrinter,
  find = findPrinters,
  connection = qzConnection,
  now = () => Date.now(),
} = {}) {
  const state = ref('ok')
  const checking = ref(false)
  let checkedAt = 0
  let timer = null
  let started = false
  let stopClosed = null

  function schedule() {
    clearTimeout(timer)
    timer = null
    if (started && state.value !== 'ok')
      timer = setTimeout(check, PRINTER_RECHECK_MS)
  }

  async function follow() {
    if (stopClosed) return
    try {
      const connected = await connection()
      if (stopClosed || !started) return
      stopClosed = watch(connected, (on) => {
        if (on || !printer.value) return
        state.value = 'qz'
        schedule()
      })
    } catch {
      // No QZ client here: the next check says so.
    }
  }

  async function check() {
    const name = printer.value
    if (!name) {
      state.value = 'ok'
      schedule()
      return
    }
    if (checking.value) return
    checking.value = true
    checkedAt = now()
    try {
      const { printers = [], missing } = await find()
      // A printer chosen meanwhile gets its own check.
      if (name !== printer.value) return
      state.value = missing ? 'qz' : printers.includes(name) ? 'ok' : 'missing'
      if (!missing) follow()
    } catch {
      state.value = 'qz'
    } finally {
      checking.value = false
      if (name === printer.value) schedule()
      else check()
    }
  }

  function onVisible() {
    if (document.visibilityState !== 'visible') return
    if (printer.value && now() - checkedAt >= BACK_GAP_MS) check()
  }

  let first = null
  let stopPrinter = null
  function start() {
    if (started) return
    started = true
    first = setTimeout(check, PRINTER_FIRST_CHECK_MS)
    document.addEventListener('visibilitychange', onVisible)
    // Etiquetas chose or cleared the printer: check that one now.
    stopPrinter = watch(printer, () => check())
  }
  function stop() {
    started = false
    clearTimeout(first)
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
    stopPrinter?.()
    stopClosed?.()
    stopPrinter = stopClosed = null
  }
  return { state, checking, printer, check, start, stop }
}

let shared = null
/** The tab's one watch on this computer's label printer. */
export function printerStatus() {
  if (!shared) shared = createPrinterStatus()
  return shared
}
