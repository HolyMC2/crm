// Adapted from POSAwesome's posapp/plugins/print.ts. Same hidden-iframe +
// MutationObserver silent-print machinery, minus POSAwesome's offline
// fallback (invoice re-rendering from IndexedDB) which is POS-specific.

interface PrintDebugInfo {
  printFormat?: string
  templatePath?: string
}

interface PrintOptions {
  triggerPrint?: string | number | null
  debugPrint?: boolean
  selectors?: string[] | string
  timeout?: number
  shouldPrint?: boolean
  showSessionMessage?: boolean
  debugInfo?: PrintDebugInfo
}

interface PrintDebugPayload {
  debugPrint: boolean
  location?: string | null
  online: boolean
  triggerPrint: string | null
  printFormat?: string | null
  templatePath?: string | null
  shouldPrint: boolean
  note?: string
}

const DEFAULT_READY_SELECTORS = ['#print-view', '.print-format']
const DEFAULT_TIMEOUT = 10000
const DEBUG_PRINT_PARAM = 'debug_print'
const TRIGGER_PRINT_PARAM = 'trigger_print'

function getWindowHref(targetWindow: Window | null | undefined) {
  try {
    return targetWindow?.location?.href || ''
  } catch {
    return ''
  }
}

function getSearchParamFromHref(href: string, param: string) {
  if (!href) return null
  try {
    const resolved = new URL(href, window.location.origin)
    return resolved.searchParams.get(param)
  } catch {
    return null
  }
}

function resolveTriggerPrint(
  targetWindow: Window | null | undefined,
  options: PrintOptions = {},
) {
  if (options.triggerPrint !== undefined && options.triggerPrint !== null) {
    return String(options.triggerPrint)
  }
  return getSearchParamFromHref(getWindowHref(targetWindow), TRIGGER_PRINT_PARAM)
}

function resolveDebugPrint(
  targetWindow: Window | null | undefined,
  options: PrintOptions = {},
) {
  if (typeof options.debugPrint === 'boolean') return options.debugPrint
  const href = getWindowHref(targetWindow)
  if (href) return getSearchParamFromHref(href, DEBUG_PRINT_PARAM) === '1'
  return isDebugPrintEnabled()
}

function resolveOnlineStatus(targetWindow: Window | null | undefined) {
  try {
    return Boolean(targetWindow?.navigator?.onLine)
  } catch {
    return Boolean(navigator?.onLine)
  }
}

function logPrintDebug(details: PrintDebugPayload) {
  if (!details?.debugPrint) return
  const payload: Record<string, unknown> = {
    location: details.location || null,
    online: details.online,
    trigger_print: details.triggerPrint,
    print_format: details.printFormat || null,
    template_path: details.templatePath || null,
    should_print: details.shouldPrint,
  }
  if (details.note) payload.note = details.note
  console.log('[Doco Print]', payload)
}

function isLoginRedirect(targetWindow: Window | null | undefined) {
  try {
    const path = targetWindow?.location?.pathname || ''
    if (path.includes('login')) return true
    const title = targetWindow?.document?.title || ''
    if (/login|session/i.test(title)) return true
    const loginForm = targetWindow?.document?.querySelector("form[action*='login']")
    return Boolean(loginForm)
  } catch {
    return false
  }
}

function showSessionMessage(targetWindow: Window | null | undefined) {
  if (!targetWindow) return
  try {
    targetWindow.document.open()
    targetWindow.document.write(
      `<div style="font-family:sans-serif;padding:24px;line-height:1.5;">
        <h2 style="margin:0 0 12px;">Print view unavailable</h2>
        <p style="margin:0 0 12px;">Your session may have expired. Please sign in again and retry.</p>
      </div>`,
    )
    targetWindow.document.close()
  } catch (err) {
    console.warn('[Doco Print] Unable to show session warning in print window', err)
  }
}

function waitForDocumentSelectors(
  targetWindow: Window | null | undefined,
  selectors: string[],
  timeout: number,
) {
  return new Promise<void>((resolve, reject) => {
    if (!targetWindow) {
      reject(new Error('No print target available'))
      return
    }

    let doc: Document
    try {
      doc = targetWindow.document
    } catch (err) {
      reject(err)
      return
    }
    if (!doc) {
      reject(new Error('Print target has no document'))
      return
    }

    let completed = false
    let observer: MutationObserver | null = null
    let interval: ReturnType<typeof setInterval> | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let handleUnload: (() => void) | null = null

    const cleanup = () => {
      if (observer) observer.disconnect()
      if (interval) clearInterval(interval)
      if (timer) clearTimeout(timer)
      if (handleUnload) {
        try {
          targetWindow.removeEventListener('beforeunload', handleUnload)
        } catch (err) {
          console.warn('[Doco Print] Failed to remove unload handler', err)
        }
      }
    }

    const finish = (err?: unknown) => {
      if (completed) return
      completed = true
      cleanup()
      if (err) reject(err)
      else resolve()
    }

    const isReady = () => {
      try {
        return selectors.some((selector) => doc.querySelector(selector))
      } catch (err) {
        console.warn('[Doco Print] Failed to query print selector', err)
        return false
      }
    }

    handleUnload = () => {
      finish(new Error('Print target navigated away before ready'))
    }

    if (isReady()) {
      finish()
      return
    }

    try {
      const root = doc.body || doc.documentElement
      if (root) {
        observer = new MutationObserver(() => {
          if (isReady()) finish()
        })
        observer.observe(root, { childList: true, subtree: true })
      }
    } catch (err) {
      console.warn('[Doco Print] Failed to observe print document mutations', err)
    }

    interval = setInterval(() => {
      if (targetWindow.closed) {
        finish(new Error('Print target closed before ready'))
        return
      }
      if (isReady()) finish()
    }, 200)

    timer = setTimeout(() => {
      finish(new Error('Timed out waiting for print markup'))
    }, timeout)

    try {
      targetWindow.addEventListener('beforeunload', handleUnload, { once: true })
    } catch (err) {
      console.warn('[Doco Print] Failed to attach unload handler', err)
    }
  })
}

async function ensureReadyAndPrint(
  targetWindow: Window | null | undefined,
  options: PrintOptions = {},
) {
  if (!targetWindow) return

  const {
    selectors = DEFAULT_READY_SELECTORS,
    timeout = DEFAULT_TIMEOUT,
    shouldPrint = true,
  } = options

  const readySelectors = Array.isArray(selectors)
    ? selectors.filter(Boolean)
    : [selectors].filter(Boolean)
  const resolvedDebugPrint = resolveDebugPrint(targetWindow, options)
  const resolvedOnline = resolveOnlineStatus(targetWindow)
  const resolvePrintState = () => {
    const triggerPrintValue = resolveTriggerPrint(targetWindow, options)
    return {
      triggerPrintValue,
      resolvedShouldPrint: shouldPrint && triggerPrintValue === '1',
    }
  }
  const initialPrintState = resolvePrintState()

  logPrintDebug({
    debugPrint: resolvedDebugPrint,
    location: getWindowHref(targetWindow),
    online: resolvedOnline,
    triggerPrint: initialPrintState.triggerPrintValue,
    printFormat: options?.debugInfo?.printFormat,
    templatePath: 'online-printview',
    shouldPrint: initialPrintState.resolvedShouldPrint,
  })

  try {
    await waitForDocumentSelectors(
      targetWindow,
      readySelectors.length ? readySelectors : DEFAULT_READY_SELECTORS,
      timeout,
    )
    const { triggerPrintValue, resolvedShouldPrint } = resolvePrintState()
    logPrintDebug({
      debugPrint: resolvedDebugPrint,
      location: getWindowHref(targetWindow),
      online: resolvedOnline,
      triggerPrint: triggerPrintValue,
      printFormat: options?.debugInfo?.printFormat,
      templatePath: 'online-printview',
      shouldPrint: resolvedShouldPrint,
      note: 'Print target ready',
    })
    if (resolvedShouldPrint) {
      targetWindow.focus()
      targetWindow.print()
    }
  } catch (err) {
    console.warn('[Doco Print] Print readiness check failed', err)
    const wantsSessionMessage = options.showSessionMessage !== false
    const { triggerPrintValue, resolvedShouldPrint } = resolvePrintState()
    if (wantsSessionMessage && isLoginRedirect(targetWindow)) {
      logPrintDebug({
        debugPrint: resolvedDebugPrint,
        location: getWindowHref(targetWindow),
        online: resolvedOnline,
        triggerPrint: triggerPrintValue,
        printFormat: options?.debugInfo?.printFormat,
        templatePath: 'login-redirect',
        shouldPrint: resolvedShouldPrint,
        note: 'Login redirect detected',
      })
      showSessionMessage(targetWindow)
      return
    }
    if (resolvedShouldPrint) {
      try {
        targetWindow.focus()
        targetWindow.print()
      } catch (printErr) {
        console.error('[Doco Print] Printing failed after readiness check error', printErr)
      }
    }
  }
}

export function watchPrintWindow(
  printWindow: Window | null | undefined,
  options: PrintOptions = {},
) {
  if (!printWindow) return

  const handleLoad = () => {
    ensureReadyAndPrint(printWindow, options)
  }

  try {
    const doc = printWindow.document
    if (doc?.readyState === 'complete') handleLoad()
    else printWindow.addEventListener('load', handleLoad, { once: true })
  } catch (err) {
    console.warn('[Doco Print] Unable to attach load handler to print window', err)
    setTimeout(() => ensureReadyAndPrint(printWindow, options), 0)
  }
}

export function silentPrint(url: string, options: PrintOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('Missing print URL'))
      return
    }
    try {
      const iframe = document.createElement('iframe')
      iframe.style.position = 'fixed'
      iframe.style.right = '0'
      iframe.style.bottom = '0'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = '0'
      iframe.onload = () => {
        const contentWindow = iframe.contentWindow
        const cleanup = () => setTimeout(() => iframe.remove(), 1000)
        Promise.resolve(ensureReadyAndPrint(contentWindow, options))
          .then(() => {
            cleanup()
            resolve()
          })
          .catch((err) => {
            cleanup()
            reject(err)
          })
      }
      iframe.onerror = (err) => {
        iframe.remove()
        reject(err instanceof Error ? err : new Error('Iframe load failed'))
      }
      iframe.src = url
      document.body.appendChild(iframe)
    } catch (err) {
      console.error('[Doco Print] Silent print failed', err)
      reject(err)
    }
  })
}

export function isDebugPrintEnabled(
  sourceWindow: Window | null | undefined = window,
) {
  try {
    const href = sourceWindow?.location?.href || ''
    return getSearchParamFromHref(href, DEBUG_PRINT_PARAM) === '1'
  } catch {
    return false
  }
}
