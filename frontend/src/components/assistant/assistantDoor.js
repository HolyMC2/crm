// The shell's side of «Pregúntale a Muelle» before anyone asks (S1d, SPEC §4
// route budget): nothing of the assistant loads or calls the server at boot.
// The first door (⌘J, Más, the palette, a «Sugerencia») loads useAssistant,
// which asks shell_api.status; MuelleShell mounts the sheet once a door has
// opened it.
import { ref } from 'vue'

/** True once a door opened the sheet; the sheet stays mounted after that. */
export const assistantWanted = ref(false)

/** shell_api.status said yes (null until something asked). */
export const assistantOn = ref(null)

let loading = null
/** useAssistant, loaded on first use. */
export function loadAssistant() {
  return (loading ||= import('./useAssistant'))
}
