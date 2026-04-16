// Adapted from POSAwesome's qzTray.ts. Stores printer selection and cert-
// ready flag under `doco_qz_*` localStorage keys so a site running both
// POSAwesome and the Doco CRM frontend keeps their QZ state independent.
// Talks to doco.docoutils.printing.qz.* endpoints so this module does not
// depend on POSAwesome being installed.

import qz from 'qz-tray'
import { ref } from 'vue'

export type QzCertStatus = 'unknown' | 'trusted' | 'untrusted'

export interface QzPrintHtmlOptions {
  printerName?: string
  widthMm?: number
  orientation?: 'portrait' | 'landscape'
}

export interface QzPrintDocumentOptions extends QzPrintHtmlOptions {
  doctype: string
  name: string
  printFormat?: string
  letterhead?: string | null
  noLetterhead?: string | number | null
}

const PRINTER_STORAGE_KEY = 'doco_qz_printer_name'
const CERT_READY_STORAGE_KEY = 'doco_qz_cert_ready'
const DEFAULT_PRINT_FORMAT = 'Standard'

const CERT_ENDPOINT = 'doco.docoutils.printing.qz.get_certificate'
const SIGN_ENDPOINT = 'doco.docoutils.printing.qz.sign_message'
const SETUP_ENDPOINT = 'doco.docoutils.printing.qz.setup_qz_certificate'
const DOWNLOAD_ENDPOINT = 'doco.docoutils.printing.qz.get_certificate_download'

export const qzConnected = ref(false)
export const qzConnecting = ref(false)
export const qzCertStatus = ref<QzCertStatus>('unknown')
export const qzPrinters = ref<string[]>([])
export const selectedQzPrinter = ref(getSavedPrinterName())
export const qzCertReady = ref(loadCertReady())

let securityInitialized = false
let cachedCertificate: string | null = null
let certificateProvided = false
let connectPromise: Promise<boolean> | null = null
let certificateChecked = false

function getCsrfToken(): string {
  try {
    return (window as any).csrf_token || (window as any).frappe?.csrf_token || ''
  } catch {
    return ''
  }
}

function extractMessage<T>(value: any): T {
  if (value && typeof value === 'object' && 'message' in value) {
    return value.message as T
  }
  return value as T
}

async function callServer<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`/api/method/${method}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Frappe-CSRF-Token': getCsrfToken(),
    },
    body: JSON.stringify(args),
  })
  if (!response.ok) throw new Error(`callServer ${method}: ${response.status}`)
  const json = await response.json()
  return extractMessage<T>(json)
}

function buildPrintHtml(html: string, style: string, widthMm: number = 80): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
@page { size: ${widthMm}mm auto; margin: 0; }
html { width: ${widthMm}mm; margin: 0; padding: 0; }
body { width: ${widthMm}mm; margin: 0; padding: 0 4mm; box-sizing: border-box; font-size: 10pt; line-height: 1.3; }
* { box-sizing: border-box; }
img { max-width: 100%; height: auto; }
.print-format { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
table { width: 100% !important; max-width: 100% !important; border-collapse: collapse; }
${style || ''}
</style>
</head>
<body>${html}</body>
</html>`
}

// Inline images as data URLs: QZ's HTML renderer has no base URL so relative
// src attributes break. Browser fetch carries the session cookie.
const inlinedImageCache = new Map<string, string>()

async function fetchImageAsDataUrl(url: string, timeoutMs = 5000): Promise<string | null> {
  if (url.startsWith('data:')) return url
  const cached = inlinedImageCache.get(url)
  if (cached) return cached

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { credentials: 'include', signal: controller.signal })
    if (!response.ok) return null
    const blob = await response.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    inlinedImageCache.set(url, dataUrl)
    return dataUrl
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function inlineImagesForQz(html: string): Promise<string> {
  if (!html || !html.includes('<img')) return html
  const doc = new DOMParser().parseFromString(`<div id="qz-inline-root">${html}</div>`, 'text/html')
  const container = doc.getElementById('qz-inline-root')
  if (!container) return html

  await Promise.all(
    Array.from(container.querySelectorAll('img')).map(async (img) => {
      const src = img.getAttribute('src')
      if (!src) return
      let absolute: string
      try {
        absolute = new URL(src, window.location.href).href
      } catch {
        return
      }
      const dataUrl = await fetchImageAsDataUrl(absolute)
      if (dataUrl) img.setAttribute('src', dataUrl)
    }),
  )

  return container.innerHTML
}

function loadCertReady() {
  try {
    return localStorage.getItem(CERT_READY_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function saveCertReady(value: boolean) {
  try {
    if (value) localStorage.setItem(CERT_READY_STORAGE_KEY, '1')
    else localStorage.removeItem(CERT_READY_STORAGE_KEY)
  } catch {
    // ignore
  }
}

function setupSecurity() {
  if (securityInitialized) return
  securityInitialized = true

  qz.security.setCertificatePromise((resolve: any) => {
    if (cachedCertificate) {
      certificateProvided = true
      resolve(cachedCertificate)
      return
    }

    callServer<string>(CERT_ENDPOINT)
      .then((certificate) => {
        if (certificate) {
          cachedCertificate = certificate
          certificateProvided = true
          qzCertReady.value = true
          saveCertReady(true)
        } else {
          certificateProvided = false
          qzCertStatus.value = 'untrusted'
        }
        resolve(certificate || undefined)
      })
      .catch((error) => {
        console.warn('[Doco Print] Unable to fetch QZ certificate', error)
        certificateProvided = false
        qzCertStatus.value = 'untrusted'
        resolve(undefined)
      })
  })

  qz.security.setSignatureAlgorithm('SHA512')
  qz.security.setSignaturePromise((toSign: string) => {
    return (resolve: any) => {
      callServer<string>(SIGN_ENDPOINT, { message: toSign })
        .then((signature) => {
          if (signature && certificateProvided) {
            qzCertStatus.value = 'trusted'
            qzCertReady.value = true
            saveCertReady(true)
          } else {
            qzCertStatus.value = 'untrusted'
          }
          resolve(signature || undefined)
        })
        .catch((error) => {
          console.warn('[Doco Print] Unable to sign QZ payload', error)
          qzCertStatus.value = 'untrusted'
          resolve(undefined)
        })
    }
  })
}

export function getSavedPrinterName() {
  try {
    return localStorage.getItem(PRINTER_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function savePrinterName(name: string) {
  try {
    if (name) localStorage.setItem(PRINTER_STORAGE_KEY, name)
    else localStorage.removeItem(PRINTER_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function setSelectedQzPrinter(name: string) {
  selectedQzPrinter.value = name || ''
  savePrinterName(name)
}

export function getPreferredPrinter(): string {
  // Priority: explicit localStorage → User custom field from bootinfo → empty
  const saved = getSavedPrinterName()
  if (saved) return saved
  try {
    const userPrinter = (window as any).frappe?.boot?.user?.doco_qz_printer_name
    if (userPrinter) return String(userPrinter)
  } catch {
    // ignore
  }
  return ''
}

export async function connectQzTray(): Promise<boolean> {
  if (qz.websocket.isActive()) {
    qzConnected.value = true
    return true
  }

  if (connectPromise) return connectPromise

  connectPromise = (async () => {
    setupSecurity()
    qzConnecting.value = true

    qz.websocket.setClosedCallbacks(() => {
      qzConnected.value = false
      qzConnecting.value = false
      qzCertStatus.value = 'unknown'
    })

    try {
      await qz.websocket.connect()
      qzConnected.value = true
      qz.printers.find().catch(() => undefined)
      return true
    } catch (error) {
      console.warn('[Doco Print] Unable to connect to QZ Tray', error)
      qzConnected.value = false
      return false
    } finally {
      qzConnecting.value = false
    }
  })()

  try {
    return await connectPromise
  } finally {
    connectPromise = null
  }
}

export async function disconnectQzTray() {
  if (!qz.websocket.isActive()) {
    qzConnected.value = false
    return
  }

  try {
    await qz.websocket.disconnect()
  } catch (error) {
    console.warn('[Doco Print] Unable to disconnect from QZ Tray', error)
  } finally {
    qzConnected.value = false
  }
}

export async function findQzPrinters(): Promise<string[]> {
  if (!qz.websocket.isActive()) {
    const connected = await connectQzTray()
    if (!connected) return []
  }

  try {
    const result = await qz.printers.find()
    const printers = Array.isArray(result) ? result : result ? [String(result)] : []

    qzPrinters.value = printers
    const saved = getSavedPrinterName()

    if (saved && printers.includes(saved)) {
      setSelectedQzPrinter(saved)
    } else if (selectedQzPrinter.value && printers.includes(selectedQzPrinter.value)) {
      setSelectedQzPrinter(selectedQzPrinter.value)
    } else if (printers.length > 0) {
      const firstPrinter = printers[0]
      if (firstPrinter) setSelectedQzPrinter(firstPrinter)
    } else {
      setSelectedQzPrinter('')
    }

    return printers
  } catch (error) {
    console.error('[Doco Print] Unable to load QZ printers', error)
    qzPrinters.value = []
    return []
  }
}

export async function checkQzCertificateOnce() {
  if (certificateChecked) return qzCertReady.value

  certificateChecked = true
  if (qzCertReady.value) return true

  try {
    const certificate = await callServer<string>(CERT_ENDPOINT)
    if (certificate) {
      cachedCertificate = certificate
      qzCertReady.value = true
      saveCertReady(true)
    }
  } catch {
    // cert may not exist yet
  }

  return qzCertReady.value
}

export async function setupQzCertificate() {
  const result = await callServer<{
    status: 'exists' | 'created'
    message?: string
    cert_path?: string
  }>(SETUP_ENDPOINT)

  qzCertReady.value = true
  saveCertReady(true)
  return result
}

export async function getQzCertificateDownload() {
  const result = await callServer<{ pem?: string; company?: string }>(DOWNLOAD_ENDPOINT)
  if (!result?.pem) throw new Error('QZ certificate is not available.')
  qzCertReady.value = true
  saveCertReady(true)
  return result
}

export function getQzCertificateFilename(company?: string | null) {
  const clean = (company || '').replace(/[^a-zA-Z0-9_\- ]/g, '').trim()
  return clean ? `${clean}.crt` : 'certificate.crt'
}

export async function printHtmlViaQz(html: string, options: QzPrintHtmlOptions = {}) {
  if (!html) throw new Error('Nothing to print.')

  if (!qz.websocket.isActive()) {
    const connected = await connectQzTray()
    if (!connected) throw new Error('QZ Tray is not available.')
  }

  let printer = options.printerName || selectedQzPrinter.value || getPreferredPrinter()
  if (!printer) {
    const printers = await findQzPrinters()
    const firstPrinter = printers[0]
    if (firstPrinter) {
      printer = firstPrinter
      setSelectedQzPrinter(firstPrinter)
    }
  }

  if (!printer) throw new Error('No QZ printer selected.')

  const config = qz.configs.create(printer, {
    size: { width: options.widthMm || 80, height: null },
    units: 'mm',
    orientation: options.orientation || 'portrait',
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    colorType: 'grayscale',
    interpolation: 'nearest-neighbor',
  })

  const data = [{ type: 'pixel', format: 'html', flavor: 'plain', data: html }]

  await qz.print(config, data)
}

export async function printDocumentViaQz(options: QzPrintDocumentOptions) {
  if (!options?.doctype || !options?.name) throw new Error('Invalid print document details.')

  const printFormat = options.printFormat || DEFAULT_PRINT_FORMAT
  const noLetterhead =
    options.letterhead && String(options.letterhead).trim() ? 0 : options.noLetterhead ?? 1

  const response = await callServer<{ html?: string; style?: string }>(
    'frappe.www.printview.get_html_and_style',
    {
      doc: options.doctype,
      name: options.name,
      print_format: printFormat,
      no_letterhead: noLetterhead,
      letterhead: options.letterhead || undefined,
    },
  )

  const html = (response as any)?.html || ''
  const style = (response as any)?.style || ''

  if (!html) throw new Error('Unable to load print HTML from server.')

  const inlinedHtml = await inlineImagesForQz(html)
  await printHtmlViaQz(buildPrintHtml(inlinedHtml, style, options.widthMm || 80), options)
}
