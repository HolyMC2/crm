// The sheet editor: Univer (Apache-2.0), the same engine doco runs headless for
// the bot (doco/hojas/engine), so a formula gives the same number on both sides.
// Loaded on its own chunk by Hoja.vue after the page paints; it brings React,
// which only Univer's own UI uses.
import {
  CommandType,
  LocaleType,
  createUniver,
  defaultTheme,
  mergeLocales,
} from '@univerjs/presets'
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core'
import sheetsCoreEs from '@univerjs/preset-sheets-core/locales/es-ES'
import { UniverSheetsDataValidationPreset } from '@univerjs/preset-sheets-data-validation'
import validationEs from '@univerjs/preset-sheets-data-validation/locales/es-ES'
import '@univerjs/preset-sheets-core/lib/index.css'
import '@univerjs/preset-sheets-data-validation/lib/index.css'

// Mutations that are the engine's own (a recalculation after load), not an edit.
const OWN = /^formula\./

/**
 * Mount Univer in `container` with `book` (a workbook snapshot).
 * `onEdit()` runs after each edit the person makes; `changes()` returns the workbook
 * to save (or '' when nothing changed) and `markSaved(text)` records what the server
 * now holds. `readOnly` locks editing for a read share.
 */
export function mountSheet(container, book, { onEdit, dark, phone, readOnly }) {
  const { univer, univerAPI } = createUniver({
    locale: LocaleType.ES_ES,
    locales: { [LocaleType.ES_ES]: mergeLocales(sheetsCoreEs, validationEs) },
    theme: defaultTheme,
    darkMode: Boolean(dark),
    presets: [
      UniverSheetsCorePreset({
        container,
        header: !readOnly,
        toolbar: !readOnly,
        ribbonType: phone ? 'simple' : 'classic',
        footer: { sheetBar: true, statisticBar: !phone, zoomSlider: !phone },
      }),
      UniverSheetsDataValidationPreset(),
    ],
  })
  const workbook = univerAPI.createWorkbook(book)
  if (readOnly) workbook.setEditable?.(false)
  let ready = false
  // What the server holds, as text: a save that would send the same is skipped (Univer
  // fills defaults in on load, and some of its mutations change nothing to keep).
  let saved = ''
  // The load itself fires mutations; edits are the ones after it settles.
  const settle = setTimeout(() => {
    saved = JSON.stringify(workbook.save())
    ready = true
  }, 400)
  const listener = univerAPI.addEvent(
    univerAPI.Event.CommandExecuted,
    (event) => {
      if (!ready || event.type !== CommandType.MUTATION) return
      if (OWN.test(event.id || '')) return
      onEdit?.()
    },
  )
  return {
    /** The workbook as JSON text when it differs from the last saved, else ''. */
    changes() {
      const text = JSON.stringify(workbook.save())
      return text === saved ? '' : text
    },
    markSaved(text) {
      saved = text
    },
    setDark: (value) => univerAPI.toggleDarkMode?.(Boolean(value)),
    dispose() {
      clearTimeout(settle)
      listener?.dispose?.()
      univer.dispose()
    },
  }
}
