import { onBeforeUnmount } from 'vue'
import { registerSwapBlocker } from '@/vendor/muelle-shell/live-sync'

// An inline edit that lives only in component state (no draft storage, no
// save on blur) holds silent updates while it differs from what was saved.
// Unmounting discards the edit anyway, so the blocker goes with it.
export function useEditSwapBlocker(name, dirty) {
  onBeforeUnmount(registerSwapBlocker(name, () => Boolean(dirty())))
}
