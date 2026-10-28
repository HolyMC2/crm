import { onBeforeUnmount, ref, unref, watch } from 'vue'
import { globalStore } from '@/stores/global'
import { sessionStore } from '@/stores/session'

// A list on screen stays current: a teammate's new or changed record shows
// without reloading the page. Frappe announces every save as `list_update`
// to the doctype's room; joining it (`doctype_subscribe`) checks that the
// worker may read the doctype. A burst of saves becomes one refresh; while
// the tab is hidden the refresh waits for the worker to come back; after a
// dropped connection the room is joined again and the list refreshed, since
// the saves in between were missed.

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
 * @returns {{ fresh: Ref<Set<string>>, mark: (before: string[], after: string[]) => void }}
 *   `fresh` holds the names that just appeared, for a short highlight.
 */
export function useLiveList(doctype, refresh, options = {}) {
  const {
    socket = appSocket(),
    me = sessionUser,
    delay = LIVE_DELAY_MS,
    freshFor = 2600,
  } = options
  const current = () => {
    const value = typeof doctype === 'function' ? doctype() : unref(doctype)
    return [value || []].flat().filter(Boolean).map(String).sort().join('\n')
  }
  let joined = []
  let timer = 0
  let waiting = false

  function join(key) {
    const next = key ? key.split('\n') : []
    for (const name of joined)
      if (!next.includes(name)) socket?.emit('doctype_unsubscribe', name)
    for (const name of next)
      if (!joined.includes(name)) socket?.emit('doctype_subscribe', name)
    joined = next
  }

  function run() {
    timer = 0
    if (typeof document !== 'undefined' && document.hidden) {
      waiting = true
      return
    }
    waiting = false
    refresh()
  }
  function soon() {
    clearTimeout(timer)
    timer = setTimeout(run, delay)
  }

  function onUpdate(data) {
    if (!joined.includes(data?.doctype)) return
    if (data.user && data.user === me()) return
    soon()
  }
  function onVisible() {
    if (waiting && !document.hidden) run()
  }
  // The first connect only joins; a later one also catches up on what was missed.
  let connectedBefore = !!socket?.connected
  function onConnect() {
    const names = joined
    joined = []
    join(names.join('\n'))
    if (names.length && connectedBefore) soon()
    connectedBefore = true
  }

  socket?.on('list_update', onUpdate)
  socket?.on('connect', onConnect)
  document.addEventListener('visibilitychange', onVisible)
  const stop = watch(current, join, { immediate: true })

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
    join('')
    clearTimeout(timer)
    clearTimeout(freshTimer)
    socket?.off('list_update', onUpdate)
    socket?.off('connect', onConnect)
    document.removeEventListener('visibilitychange', onVisible)
  })

  return { fresh, mark }
}
