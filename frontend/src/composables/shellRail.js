import { computed, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import { shellBoot } from '@/composables/muelleShell'
import { userScopedKey } from '@/utils/storageKeys'
import {
  SIBLING_APP_NAMES,
  installedSiblings,
  sortSiblings,
} from '@/composables/siblingApps'
import {
  defaultReturnLabel,
  readDone,
  safeReturn,
  withReturn,
} from '@/vendor/muelle-shell/contracts'

// The desktop rail has two widths: «collapsed» (the default) keeps only the
// icons, each with its count and a label on hover; «expanded» shows each app's
// name next to its icon for a worker still learning the apps. The choice
// applies at once from this browser (localStorage, scoped per user for shared
// shop PCs) and follows the worker to other devices through the shell boot
// (crm.api.shell.boot → rail, saved by crm.api.shell.save_rail).

export const RAIL_STATES = Object.freeze(['expanded', 'collapsed'])
const STORAGE_BASE = 'muelle.rail'
export const RAIL_WIDTH = Object.freeze({ collapsed: 56, expanded: 216 })

function readLocal() {
  try {
    const value = localStorage.getItem(userScopedKey(STORAGE_BASE))
    return RAIL_STATES.includes(value) ? value : null
  } catch {
    return null
  }
}

const defaultState = () => 'collapsed'

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

// --- counts («3» on Ventas, like the unread count beside a chat) ---------------

/** {module key: {count, urgent}} from crm.api.shell.rail_counts. */
export const railCounts = ref({})
export const RAIL_COUNTS_GAP_MS = 20000
let countsAt = 0
let countsLoading = null

/** Reads the counts again unless they are fresher than RAIL_COUNTS_GAP_MS. */
export function refreshRailCounts({ force = false } = {}) {
  if (countsLoading) return countsLoading
  if (!force && Date.now() - countsAt < RAIL_COUNTS_GAP_MS)
    return Promise.resolve()
  countsAt = Date.now()
  countsLoading = call('crm.api.shell.rail_counts')
    .then((found) => (railCounts.value = found || {}))
    .catch(() => {})
    .finally(() => (countsLoading = null))
  return countsLoading
}

/**
 * A module's count: the fresh read first, else what the boot said (Equipo's
 * badge). `null` when nothing waits.
 */
export function moduleCount(module, counts = railCounts.value) {
  const found = counts[module?.key] ?? module?.badge
  const count = Number(typeof found === 'object' ? found?.count : found) || 0
  if (count <= 0) return null
  return {
    count,
    text: count > 99 ? '99+' : String(count),
    urgent: !!(typeof found === 'object' && found?.urgent),
  }
}

/** Tests: start from a clean slate. */
export function resetRailCountsForTests() {
  railCounts.value = {}
  countsAt = 0
  countsLoading = null
}

// --- sibling apps («Otras apps») ------------------------------------------------

// Which sibling apps this site has, in the shell's order (siblingApps.js, which
// the boot's layout also reads without this module's rail state).
export { SIBLING_APP_NAMES, installedSiblings, sortSiblings }

// Where a sibling's home opens when it is not its bare root: Frappe answers
// /scan/ with a redirect to /scan, outside Escáner's service-worker scope, so
// the home goes through its /scan/inicio alias (instant and offline-ready).
const SIBLING_HOME = Object.freeze({ '/scan/': '/scan/inicio' })

/**
 * The sibling's entry with the shell's return protocol: it can offer «Volver a
 * {label}» back to the page the worker left. `fullPath` is the router path
 * under /crm; an unusable one just opens the sibling without a way back.
 * The other roots open bare (/taller, /posapp): Frappe answers /taller/ with
 * an uncached 301, a round trip per switch that also voids the hover prefetch.
 */
export function siblingHref(app, fullPath, label) {
  const back = `/crm${fullPath && fullPath !== '/' ? fullPath : '/'}`
  const entry = SIBLING_HOME[app.path] || app.path.replace(/(.)\/$/, '$1')
  try {
    return withReturn(entry, {
      to: back,
      label: label || defaultReturnLabel(back),
    })
  } catch {
    return entry
  }
}

// --- «Escanear»: Escáner as the shell's scanner ---------------------------------

/** Marks a return that carries a scan, so no page takes it for its own `done`. */
export const SCAN_PICK_PARAM = 'escaneo'

/**
 * Escáner's picker (/scan/pick) for the page the worker is on: it opens the
 * camera (or a wedge scanner), resolves the code and comes back here with
 * `done=Item:<code>`. `null` where Escáner is not installed.
 */
export function scanPickHref(fullPath, label, apps) {
  if (!installedSiblings(apps).some((app) => app.key === 'scan')) return null
  const [path, query = ''] = (fullPath || '/').split('?')
  const params = new URLSearchParams(query)
  params.delete('done')
  params.set(SCAN_PICK_PARAM, '1')
  const back = `/crm${path === '/' ? '/' : path}?${params}`
  try {
    return withReturn('/scan/pick?want=item', {
      to: back,
      label: label || defaultReturnLabel(back),
    })
  } catch {
    return null
  }
}

/**
 * Where a scan picked in Escáner leads: an artículo opens its Productos record
 * (when the worker has Productos) with «Volver a {label}» to the page they
 * scanned from; otherwise they stay on that page. Either way the scan marker
 * and `done` leave the URL. `null` when the route carries no scan.
 */
export function scanPickTarget(route, { productos = false, label = '' } = {}) {
  const query = route?.query || {}
  if (query[SCAN_PICK_PARAM] === undefined) return null
  const done = readDone(new URLSearchParams({ done: String(query.done || '') }))
  const rest = { ...query }
  delete rest[SCAN_PICK_PARAM]
  delete rest.done
  if (done?.doctype === 'Item' && productos) {
    const search = new URLSearchParams(
      Object.entries(rest).flatMap(([key, value]) =>
        [value].flat().map((one) => [key, String(one ?? '')]),
      ),
    ).toString()
    const back = `/crm${route.path}${search ? `?${search}` : ''}`
    return {
      path: `/productos/${encodeURIComponent(done.name)}`,
      query: safeReturn(back)
        ? { return_to: back, return_label: label || defaultReturnLabel(back) }
        : {},
    }
  }
  return { path: route.path, query: rest, hash: route.hash }
}
