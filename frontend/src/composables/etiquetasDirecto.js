import { ref } from 'vue'
import { comprasApi } from '@/composables/useCompras'

// Etiquetas straight to this computer's label printer through Muelle QZ (QZ
// Tray): which printer, the printers QZ sees, and the print itself, with no
// print dialog. The printer belongs to the computer, so it is kept in this
// browser. The QZ client loads on first use; the page does not carry it.

const KEY = 'muelle:etiquetas:impresora'

function saved() {
  try {
    return localStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

/** This computer's label printer ('' = the browser's print dialog). */
export const labelPrinter = ref(saved())

export function chooseLabelPrinter(name) {
  labelPrinter.value = String(name || '').trim()
  try {
    if (labelPrinter.value) localStorage.setItem(KEY, labelPrinter.value)
    else localStorage.removeItem(KEY)
  } catch {
    // A browser that keeps nothing prints with the dialog after a reload.
  }
}

const qzClient = () => import('@/services/doco/qzTray')

/**
 * Whether a print goes straight to the printer: a computer with a printer
 * chosen and a label that says its size (QZ prints the PDF at that size).
 */
export function printsDirect({ printer = '', layout = null, phone = false }) {
  return !!printer && !phone && layout?.w_mm > 0 && layout?.h_mm > 0
}

// Whether QZ's error says this (it is classified, never shown).
const says = (error, pattern) =>
  pattern.test(String(error?.message ?? error ?? ''))

/** What a QZ failure means for the worker, with the way on. */
export function directProblem(error, printer) {
  if (says(error, /QZ Tray is not available/i))
    return 'Muelle QZ no está abierto en este equipo. Ábrelo y vuelve a intentar, o imprime con el diálogo.'
  if (says(error, /cannot find printer/i))
    return `Este equipo ya no tiene la impresora «${printer}». Elige otra en «Cambiar» o imprime con el diálogo.`
  return `La impresora «${printer}» no recibió las etiquetas. Revisa que esté encendida y vuelve a intentar, o imprime con el diálogo.`
}

/** The printers Muelle QZ sees here, or `{ missing: true }` when QZ does not answer. */
export async function findLabelPrinters() {
  try {
    const { listQzPrinters } = await qzClient()
    return { printers: await listQzPrinters(), missing: false }
  } catch {
    return { printers: [], missing: true }
  }
}

/** Sends the labels' PDF to the chosen printer: `{ ok }` or `{ ok: false, reason }`. */
export async function printDirect(base64, { printer, layout, title = '' }) {
  try {
    const { printLabelPdfViaQz } = await qzClient()
    await printLabelPdfViaQz(base64, {
      printerName: printer,
      widthMm: Number(layout.w_mm),
      heightMm: Number(layout.h_mm),
      jobName: title || 'Etiquetas',
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: directProblem(error, printer) }
  }
}

const PLATFORMS = [
  { key: 'win', label: 'Windows' },
  { key: 'linux', label: 'Linux' },
]

/**
 * The Muelle QZ installers this site offers (built with its certificate), as
 * `{ key, label, href }`; none when there are none or the worker may not
 * download them.
 */
export async function qzInstallers() {
  try {
    const info = await comprasApi(
      'doco.docoutils.printing.bundles.get_bundle_info',
    )
    if (!info?.available) return []
    return PLATFORMS.filter((p) => info.platforms?.[p.key]?.present).map(
      (p) => ({
        ...p,
        href: `/api/method/doco.docoutils.printing.bundles.download_bundle?platform=${p.key}`,
      }),
    )
  } catch {
    return []
  }
}
