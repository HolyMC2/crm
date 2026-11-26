import { ref, watch } from 'vue'
import { userScopedKey } from '@/utils/storageKeys'

// «Saltar con letras» (letterHints.js) is a switch per person and per browser,
// off until the worker turns it on (Alt+H, or Ctrl+K «Saltar con letras»).
const STORAGE_BASE = 'muelle.letterHints'

function readSwitch() {
  try {
    return localStorage.getItem(userScopedKey(STORAGE_BASE)) === 'on'
  } catch {
    return false
  }
}

/** The switch; set `letterHintsOn.value` to turn it on or off. */
export const letterHintsOn = ref(readSwitch())
watch(letterHintsOn, (on) => {
  try {
    if (on) localStorage.setItem(userScopedKey(STORAGE_BASE), 'on')
    else localStorage.removeItem(userScopedKey(STORAGE_BASE))
  } catch {
    // Private mode or full storage: the switch holds for this visit.
  }
})
