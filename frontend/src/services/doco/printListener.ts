// Subscribes to the `doco:print_job` realtime event and dispatches prints
// to either QZ Tray (browser_qz) or a hidden iframe (browser_normal). Acks
// back to the server so Doco Print Job rows transition out of 'dispatched'.

import { printDocumentViaQz, getPreferredPrinter } from './qzTray'
import { silentPrint } from './silentPrint'

type BrowserBackend = 'browser_normal' | 'browser_qz'

interface PrintJobPayload {
  job_id: string
  doctype: string
  docname: string
  print_format: string
  no_letterhead: number
  copies: number
  backend: BrowserBackend
  fallback_backend?: BrowserBackend | null
  width_mm: number
  qz_printer_name?: string | null
  qz_algorithm?: string
}

const ACK_ENDPOINT = '/api/method/doco.docoutils.printing.dispatch.ack_print_job'
const EVENT = 'doco:print_job'

let registered = false

export function registerPrintListener(socket: any) {
  if (registered) {
    console.warn('[Doco Print] Listener already registered — skipping')
    return
  }
  if (!socket || typeof socket.on !== 'function') {
    console.warn('[Doco Print] Invalid socket; listener not registered')
    return
  }

  socket.on(EVENT, (payload: PrintJobPayload) => {
    handleJob(payload).catch((err) => {
      console.error('[Doco Print] Handler crashed', err)
    })
  })

  registered = true
  console.info('[Doco Print] Listener registered')
}

async function handleJob(payload: PrintJobPayload) {
  if (!payload || !payload.job_id || !payload.doctype || !payload.docname) {
    console.warn('[Doco Print] Ignoring malformed payload', payload)
    return
  }

  const primary = payload.backend
  const fallback = payload.fallback_backend || null

  try {
    await runBackend(primary, payload)
    await ack(payload.job_id, 'acked', primary)
    return
  } catch (primaryErr: any) {
    console.warn('[Doco Print] Primary backend failed', primary, primaryErr)
    if (!fallback || fallback === primary) {
      await ack(payload.job_id, 'failed', primary, primaryErr?.message || String(primaryErr))
      return
    }
    try {
      await runBackend(fallback, payload)
      const note = `Primary ${primary} failed: ${primaryErr?.message || primaryErr}. Used fallback ${fallback}.`
      await ack(payload.job_id, 'acked', fallback, note)
    } catch (fallbackErr: any) {
      const combined = `Primary ${primary} failed: ${primaryErr?.message || primaryErr}. Fallback ${fallback} failed: ${fallbackErr?.message || fallbackErr}`
      console.error('[Doco Print] Fallback also failed', fallbackErr)
      await ack(payload.job_id, 'failed', fallback, combined)
    }
  }
}

async function runBackend(backend: BrowserBackend, payload: PrintJobPayload) {
  if (backend === 'browser_qz') {
    await printViaQz(payload)
  } else if (backend === 'browser_normal') {
    await printViaIframe(payload)
  } else {
    throw new Error(`Unsupported browser backend: ${backend}`)
  }
}

async function printViaQz(payload: PrintJobPayload) {
  const copies = Math.max(1, Number(payload.copies) || 1)
  // Route-level override wins over user/localStorage default.
  const printerName = (payload.qz_printer_name && payload.qz_printer_name.trim())
    || getPreferredPrinter()
  for (let i = 0; i < copies; i++) {
    await printDocumentViaQz({
      doctype: payload.doctype,
      name: payload.docname,
      printFormat: payload.print_format,
      letterhead: null,
      noLetterhead: payload.no_letterhead ? 1 : 0,
      printerName,
      widthMm: payload.width_mm || 80,
    })
  }
}

async function printViaIframe(payload: PrintJobPayload) {
  const url = buildPrintviewUrl(payload)
  const copies = Math.max(1, Number(payload.copies) || 1)
  for (let i = 0; i < copies; i++) {
    // `trigger_print=1` makes the iframe's ensureReadyAndPrint actually call print()
    await silentPrint(url, {
      triggerPrint: '1',
      debugInfo: { printFormat: payload.print_format },
    })
  }
}

function buildPrintviewUrl(payload: PrintJobPayload): string {
  const params = new URLSearchParams({
    doctype: payload.doctype,
    name: payload.docname,
    format: payload.print_format,
    no_letterhead: payload.no_letterhead ? '1' : '0',
    trigger_print: '1',
  })
  return `/printview?${params.toString()}`
}

async function ack(
  jobId: string,
  status: 'acked' | 'failed',
  backendUsed?: string,
  error?: string,
) {
  try {
    const body = new URLSearchParams({ job_id: jobId, status })
    if (backendUsed) body.set('backend_used', backendUsed)
    if (error) body.set('error', error.slice(0, 2000))
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'X-Frappe-CSRF-Token': getCsrfToken(),
    }
    const response = await fetch(ACK_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: body.toString(),
    })
    if (!response.ok) {
      console.warn('[Doco Print] Ack returned', response.status, await response.text())
    }
  } catch (err) {
    console.warn('[Doco Print] Failed to ack print job', err)
  }
}

function getCsrfToken(): string {
  try {
    return (window as any).csrf_token || (window as any).frappe?.csrf_token || ''
  } catch {
    return ''
  }
}
