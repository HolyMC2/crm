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
import { movesCells } from './moves.js'

// Mutations that are the engine's own (a recalculation after load), not an edit.
const OWN = /^formula\./

/**
 * Mount Univer in `container` with `book` (a workbook snapshot).
 * `onEdit()` runs after each edit the person makes; `takeMutations()` hands over the
 * edits as Univer mutations to save (doco docs/HOJAS.md §8) and `applyRemote()` replays
 * someone else's in place. `changes()` returns the whole workbook (or '' when nothing
 * changed) for the save that sends all of it, and `markSaved(text)` records what the
 * server now holds. `onSelect(cell)` says where the person is («Ventas!B4»).
 * `readOnly` locks editing for a read share.
 */
export function mountSheet(
  container,
  book,
  { onEdit, onSelect, dark, phone, readOnly },
) {
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
  const unitId = workbook.getId()
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
  // The person's edits since the last save, as mutations; replaying someone else's
  // change must not count as an edit.
  let pending = []
  let replaying = false
  const listener = univerAPI.addEvent(
    univerAPI.Event.CommandExecuted,
    (event) => {
      if (!ready || event.type !== CommandType.MUTATION) return
      if (OWN.test(event.id || '')) return
      // Replayed changes, and local-only ones: the formula engine writes computed values
      // back as onlyLocal mutations, and every page computes those itself.
      if (replaying || event.options?.fromCollab || event.options?.onlyLocal)
        return
      // Only the workbook's own changes travel: the cell editor is a document of its
      // own (doc.mutation.rich-text-editing while typing), which the sheet never holds.
      if (event.params?.unitId !== unitId) return
      pending.push({
        id: event.id,
        params: event.params ? JSON.parse(JSON.stringify(event.params)) : null,
      })
      onEdit?.()
    },
  )
  const where = onSelect
    ? univerAPI.addEvent(univerAPI.Event.SelectionChanged, (event) => {
        const range = workbook.getActiveRange?.()
        const tab = event?.worksheet?.getSheetName?.()
        onSelect(range && tab ? `${tab}!${range.getA1Notation()}` : null)
      })
    : null
  function replay(mutations) {
    if (!mutations?.length) return
    replaying = true
    try {
      for (const m of mutations)
        univerAPI.syncExecuteCommand(m.id, m.params ?? undefined, {
          onlyLocal: true,
          fromCollab: true,
        })
    } finally {
      replaying = false
    }
    // A replayed change does not mark its cells dirty for the formula engine: recompute,
    // so totals follow (and a later whole-sheet save never sends stale values).
    univerAPI.getFormula?.()?.executeCalculation?.()
  }
  return {
    /** The edits since the last call, as mutations; they leave the queue. */
    takeMutations() {
      const out = pending
      pending = []
      return out
    },
    /** Edits a save could not deliver go back to the front of the queue. */
    putBack(mutations) {
      pending = [...(mutations || []), ...pending]
    },
    hasPending: () => pending.length > 0,
    pendingMovesCells: () => movesCells(pending),
    /**
     * Someone else's change, in place. `mine` (the person's edits the server applied
     * after it) are replayed again on top so this page ends as the server did: the
     * same cell keeps the person's value, as on the server.
     */
    applyRemote(mutations, mine = []) {
      replay(mutations)
      replay([...mine, ...pending].filter((m) => !movesCells([m])))
    },
    snapshotText: () => JSON.stringify(workbook.save()),
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
      where?.dispose?.()
      univer.dispose()
    },
  }
}
