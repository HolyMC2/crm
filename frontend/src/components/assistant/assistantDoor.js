// The shell's side of «Pregúntale a Muelle» before anyone asks. Boot asks
// shell_api.status once (E7: the rail item, the AppBar icon, ⌘J and the
// Surtido button show only when it says yes); nothing else of the assistant
// loads until a door opens it. MuelleShell mounts the sheet once a door has.
import { ref } from 'vue'
import { call } from 'frappe-ui'

export const ASSISTANT_API = 'doco.docoutils.assistant.shell_api'

/** True once a door opened the sheet; the sheet stays mounted after that. */
export const assistantWanted = ref(false)

/** shell_api.status said yes (null until the answer is in). */
export const assistantOn = ref(null)

let statusPromise = null
/** shell_api.status, asked once; every door reuses the answer. */
export function loadAssistantStatus({ refresh = false } = {}) {
  if (statusPromise && !refresh) return statusPromise
  statusPromise = call(`${ASSISTANT_API}.status`)
    .then((status) => status || { enabled: false })
    .catch(() => ({ enabled: false }))
    .then((status) => {
      assistantOn.value = Boolean(status.enabled)
      return status
    })
  return statusPromise
}

/** Tests only. */
export function _resetAssistantDoor() {
  statusPromise = null
  assistantWanted.value = false
  assistantOn.value = null
}

let loading = null
/** useAssistant, loaded on first use. */
export function loadAssistant() {
  return (loading ||= import('./useAssistant'))
}
