// The shell's side of «Pregúntale a Muelle» before anyone asks. Boot asks
// shell_api.status once (E7: the rail item, the AppBar icon, ⌘J and the
// Surtido button show only when it says yes); nothing else of the assistant
// loads until a door opens it. MuelleShell mounts the sheet once a door has.
// The last answer is kept with the lists (utils/listCache.js), so the doors
// show at once and the check (about 800 ms on the server) waits until the
// first screen has its data.
import { ref } from 'vue'
import { call } from 'frappe-ui'
import { refused } from '@/composables/muelleShell'
import {
  dropCachedList,
  readCachedList,
  writeCachedList,
} from '@/utils/listCache'
import { afterFirstRoute } from '@/utils/prefetch'

export const ASSISTANT_API = 'doco.docoutils.assistant.shell_api'

/** True once a door opened the sheet; the sheet stays mounted after that. */
export const assistantWanted = ref(false)

/** shell_api.status said yes (null until the answer is in). */
export const assistantOn = ref(null)

const SAVED = 'assistant:status'
// After the first route: the check never competes with the first screen.
const CHECK_DELAY_MS = 1500
// A copy this young is not checked again: the answer changes when the Dueño
// turns the assistant on or off, which is rare, and the check is the
// heaviest call of the boot (about 400 ms and 300 queries on the server).
export const STATUS_FRESH_MS = 5 * 60 * 1000

let statusPromise = null
/** shell_api.status, asked once; every door reuses the answer. */
export function loadAssistantStatus({ refresh = false } = {}) {
  if (statusPromise && !refresh) return statusPromise
  statusPromise = call(`${ASSISTANT_API}.status`)
    .then((status) => {
      if (status) writeCachedList(SAVED, status)
      return status || { enabled: false }
    })
    .catch((error) => {
      // Offline or a blip keeps the last answer; a refusal drops it.
      if (!refused(error)) return readCachedList(SAVED) || { enabled: false }
      dropCachedList(SAVED)
      return { enabled: false }
    })
    .then((status) => {
      assistantOn.value = Boolean(status.enabled)
      return status
    })
  return statusPromise
}

/**
 * The boot's ask: the last answer shows the doors at once and the fresh
 * check runs once the first route has its data, unless the answer is
 * younger than STATUS_FRESH_MS. A first visit asks then too: the check is
 * the heaviest call of the boot and asking with the boot held the route's
 * own requests back on a phone (the doors appear a moment later, once).
 */
export function bootAssistantStatus(router) {
  if (statusPromise || assistantOn.value !== null) return
  const saved = readCachedList(SAVED)
  if (saved) {
    assistantOn.value = Boolean(saved.enabled)
    if (readCachedList(SAVED, undefined, STATUS_FRESH_MS)) return
  }
  afterFirstRoute(router, () => loadAssistantStatus(), {
    delay: CHECK_DELAY_MS,
  })
}

/** Tests only. */
export function _resetAssistantDoor() {
  statusPromise = null
  warmed = false
  assistantWanted.value = false
  assistantOn.value = null
  dropCachedList(SAVED)
}

let loading = null
/** useAssistant, loaded on first use. */
export function loadAssistant() {
  return (loading ||= import('./useAssistant'))
}

let warmed = false
/**
 * A door's hover, focus or press: the sheet's code and the conversation are
 * fetched while the pointer is still on its way, so the click opens a sheet
 * with its messages instead of an empty one.
 */
export function warmAssistant() {
  if (assistantOn.value !== true) return
  if (!warmed) {
    warmed = true
    import('./AssistantSheet.vue').catch(() => {
      warmed = false
    })
  }
  loadAssistant()
    .then((module) => module.prefetchHistory())
    .catch(() => {})
}
