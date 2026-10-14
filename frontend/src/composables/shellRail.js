import { computed, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import { shellBoot } from '@/composables/muelleShell'
import { userScopedKey } from '@/utils/storageKeys'
import {
  SIBLING_APPS,
  defaultReturnLabel,
  withReturn,
} from '@/vendor/muelle-shell/contracts'

// The desktop rail has two widths: «expanded» shows each app's name next to its
// icon (a worker still learning the apps reads them), «collapsed» keeps only the
// icons. The choice applies at once from this browser (localStorage, scoped per
// user for shared shop PCs) and follows the worker to other devices through the
// shell boot (crm.api.shell.boot → rail, saved by crm.api.shell.save_rail).

export const RAIL_STATES = Object.freeze(['expanded', 'collapsed'])
const STORAGE_BASE = 'muelle.rail'
/** Wide screens start expanded until the worker chooses. */
export const EXPANDED_MIN_WIDTH = 1280
export const RAIL_WIDTH = Object.freeze({ collapsed: 56, expanded: 216 })

function readLocal() {
  try {
    const value = localStorage.getItem(userScopedKey(STORAGE_BASE))
    return RAIL_STATES.includes(value) ? value : null
  } catch {
    return null
  }
}

function defaultState() {
  const width = typeof window !== 'undefined' ? window.innerWidth : 0
  return width >= EXPANDED_MIN_WIDTH ? 'expanded' : 'collapsed'
}

export const railState = ref(readLocal() || defaultState())
export const railExpanded = computed(() => railState.value === 'expanded')
export const railWidth = computed(() => RAIL_WIDTH[railState.value])

// The boot's saved choice wins over a stale local one (it is the latest from
// any device); a fresh toggle in this tab is saved back before the next boot.
let chosenHere = false
watch(
  () => shellBoot.value?.rail,
  (saved) => {
    if (chosenHere || !RAIL_STATES.includes(saved)) return
    railState.value = saved
    writeLocal(saved)
  },
  { immediate: true },
)

function writeLocal(state) {
  try {
    localStorage.setItem(userScopedKey(STORAGE_BASE), state)
  } catch {
    // Private mode or full storage: the in-memory choice still applies.
  }
}

let saveTimer = null
export const RAIL_SAVE_DELAY_MS = 600
export function setRail(state) {
  if (!RAIL_STATES.includes(state)) return
  chosenHere = true
  railState.value = state
  writeLocal(state)
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    call('crm.api.shell.save_rail', { state }).catch(() => {})
  }, RAIL_SAVE_DELAY_MS)
}

export function toggleRail() {
  setRail(railExpanded.value ? 'collapsed' : 'expanded')
}

/** Tests: start from a clean slate. */
export function resetRailForTests(state = null) {
  chosenHere = false
  clearTimeout(saveTimer)
  railState.value = state || readLocal() || defaultState()
}

// --- sibling apps («Otras apps») ------------------------------------------------

/** Frappe app that serves each sibling SPA; it shows only where installed. */
export const SIBLING_APP_NAMES = Object.freeze({
  pos: 'posawesome',
  taller: 'taller',
  clinica: 'clinica',
  mercado: 'mercado',
  scan: 'scanner_kit',
})

export function installedSiblings(apps = globalThis.window?.installed_apps) {
  const installed = Array.isArray(apps) ? apps : []
  return SIBLING_APPS.filter((app) =>
    installed.includes(SIBLING_APP_NAMES[app.key]),
  )
}

/**
 * The sibling's entry with the shell's return protocol: it can offer «Volver a
 * {label}» back to the page the worker left. `fullPath` is the router path
 * under /crm; an unusable one just opens the sibling without a way back.
 */
export function siblingHref(app, fullPath, label) {
  const back = `/crm${fullPath && fullPath !== '/' ? fullPath : '/'}`
  try {
    return withReturn(app.path, {
      to: back,
      label: label || defaultReturnLabel(back),
    })
  } catch {
    return app.path
  }
}
