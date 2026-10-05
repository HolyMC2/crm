// Vendored from muelle/workspace/packages/live-sync@0.1.0 (c813e3981ed0). DO NOT EDIT:
// change the package, then run its scripts/vendor.mjs against this directory.
import { getCurrentInstance, onBeforeUnmount, onMounted } from 'vue'
import type { LiveSync, Refetch, WatchOptions } from './types'

/**
 * Watch `doctypes` while the calling component is mounted. The view keeps its
 * own first load; this only adds the push refetch (plus resyncs after
 * reconnect, sibling-tab changes and long hidden spells).
 */
export function useLiveWatch(
  hub: LiveSync | null | undefined,
  doctypes: string | string[],
  refetch: Refetch,
  options?: WatchOptions,
): void {
  if (!hub) return
  let stop: (() => void) | null = null
  const start = () => {
    stop ??= hub.watch(doctypes, refetch, options)
  }
  if (getCurrentInstance()) {
    onMounted(start)
    onBeforeUnmount(() => {
      stop?.()
      stop = null
    })
  } else {
    start()
  }
}
