import { onBeforeUnmount, ref, unref, watch } from 'vue'
import { liveHub } from '@/composables/liveHub'
import { globalStore } from '@/stores/global'
import { sessionStore } from '@/stores/session'

// A list on screen stays current: a teammate's new or changed record shows
// without reloading the page. Frappe announces every save as `list_update`
// to the doctype's room; the tab's live hub (composables/liveHub) joins it,
// once for every view that shows the doctype (the websocket server checks
// that the worker may read it), and turns a burst of saves into one refresh.
// The worker's own saves are already on screen. A hidden tab refreshes when
// the worker comes back; a reconnect and the hub's reconciliation each minute
// read the list again, since saves in between may have been missed. While the
// socket is down those reads wait for it: its reconnect reads the list again.

export const LIVE_DELAY_MS = 800

// Without the app's stores (a page mounted on its own) the list is just not live.
function appSocket() {
  try {
    return globalStore().$socket || null
  } catch {
    return null
  }
}
function sessionUser() {
  try {
    return unref(sessionStore().user)
  } catch {
    return ''
  }
}

/**
 * @param doctype  a doctype name or a list of them, or a ref / getter of that
 *                 ('' = none)
 * @param refresh  reloads the list (keeps its size and position)
 * @param options.minIntervalMs  floor between two refreshes, for lists that
 *                 a busy shop changes all day (stock moves)
 * @returns {{ fresh: Ref<Set<string>>, mark: (before: string[], after: string[]) => void }}
 *   `fresh` holds the names that just appeared, for a short highlight.
 */
export function useLiveList(doctype, refresh, options = {}) {
  const {
    socket = appSocket(),
    hub = socket ? liveHub(socket) : null,
    me = sessionUser,
    delay = LIVE_DELAY_MS,
    minIntervalMs = 0,
    freshFor = 2600,
  } = options
  const current = () => {
    const value = typeof doctype === 'function' ? doctype() : unref(doctype)
    return [value || []].flat().filter(Boolean).map(String).sort().join('\n')
  }
  let doctypes = []
  let unwatch = null

  // Names the worker saved here; a batch of only those is not read again.
  const own = new Set()
  function onSave(data) {
    if (!doctypes.includes(data?.doctype) || !data.name) return
    if (data.user && data.user === me()) own.add(data.name)
  }
  function onBatch(batch) {
    if (batch.reason !== 'change' && socket && !socket.connected) return
    const mine =
      !batch.full &&
      batch.names.length > 0 &&
      batch.names.every((name) => own.has(name))
    for (const name of batch.names) own.delete(name)
    if (!mine) return refresh()
  }

  // The next doctypes are watched before the last ones are left, so a room
  // both share is never left in between.
  function follow(key) {
    doctypes = key ? key.split('\n') : []
    own.clear()
    const next =
      hub && doctypes.length
        ? hub.watch(doctypes, onBatch, { debounceMs: delay, minIntervalMs })
        : null
    unwatch?.()
    unwatch = next
  }

  socket?.on('list_update', onSave)
  socket?.on('doc_update', onSave)
  const stop = watch(current, follow, { immediate: true })

  const fresh = ref(new Set())
  let freshTimer = 0
  /** Highlights the names in `after` that were not in `before`. */
  function mark(before = [], after = []) {
    const had = new Set(before)
    const added = after.filter((name) => !had.has(name))
    if (!added.length) return
    fresh.value = new Set(added)
    clearTimeout(freshTimer)
    freshTimer = setTimeout(() => (fresh.value = new Set()), freshFor)
  }

  onBeforeUnmount(() => {
    stop()
    follow('')
    clearTimeout(freshTimer)
    socket?.off('list_update', onSave)
    socket?.off('doc_update', onSave)
  })

  return { fresh, mark }
}
