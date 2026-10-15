import { computed, getCurrentInstance, onBeforeUnmount, shallowRef } from 'vue'
import { registerPageKeys } from '@/composables/shellKeyboard'

// The actions of the record on screen (Deal 360, the Inbox deal workspace…).
// A page or record component declares them while it is mounted:
//
//   useRecordActions(() => [{ id, title, icon, keywords?, keys?, run }])
//
// * Ctrl+K lists them first in «Acciones» and runs `run` after it closes.
// * An action with `keys` (bare keys: ['l']) is also a page key: the shell's
//   one listener runs it (never while typing, never under a dialog) and the
//   Alt+H sheet lists it in «En esta página», so the sheet shows exactly the
//   keys that work here.
// `title` is the English source (the sheet and the palette translate it);
// the getter is reactive and returns [] when nothing applies.

const sources = shallowRef([])

/** A usable action: an id, a title and something to run. */
function usable(action) {
  return (
    !!action &&
    typeof action.id === 'string' &&
    !!action.id &&
    typeof action.title === 'string' &&
    typeof action.run === 'function'
  )
}

function read(getter) {
  const list = typeof getter === 'function' ? getter() : getter
  return (Array.isArray(list) ? list : []).filter(usable)
}

/** Page-key declaration of the keyed actions (registerPageKeys `extra`). */
export function recordActionKeys(actions) {
  return actions
    .filter((action) => Array.isArray(action.keys) && action.keys.length)
    .map((action) => ({
      id: `record.${action.id}`,
      keys: action.keys,
      description: action.title,
      run: () => action.run(),
    }))
}

/**
 * Declare the current record's actions while the calling component is
 * mounted; also returns the function that removes them.
 */
export function useRecordActions(getter) {
  const source = { actions: () => read(getter) }
  sources.value = [...sources.value, source]
  const removeKeys = registerPageKeys({
    extra: () => recordActionKeys(source.actions()),
  })
  const remove = () => {
    sources.value = sources.value.filter((entry) => entry !== source)
    removeKeys()
  }
  if (getCurrentInstance()) onBeforeUnmount(remove)
  return remove
}

/** The mounted records' actions, in mount order. */
export const recordActions = computed(() =>
  sources.value.flatMap((source) => source.actions()),
)

/** Run the action `id` of the record on screen; false when it is gone. */
export function runRecordAction(id) {
  const action = recordActions.value.find((entry) => entry.id === id)
  if (!action) return false
  action.run()
  return true
}
