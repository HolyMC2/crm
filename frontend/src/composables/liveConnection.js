import { ref } from 'vue'
import { globalStore } from '@/stores/global'

// Live is the normal state, so the shell marks only its absence: while the
// tab's socket is down, every live list (liveList, Hoy, the Bandeja) keeps
// what it last read without saying so. A drop shorter than the grace is a
// blink the worker never needs to see; after it the shell shows the time the
// lists last followed along. A reconnect reloads them (the live hub re-joins
// and reads again), so the sign just leaves.

export const LIVE_GRACE_MS = 10_000
const RETRY_SPIN_MS = 6_000

/**
 * @param socket  a socket.io client socket (`on`, `connect`, `disconnect`, `connected`)
 * @returns {{ down: Ref<boolean>, since: Ref<Date|null>, retrying: Ref<boolean>, retry: () => void, stop: () => void }}
 */
export function createLiveConnection(
  socket,
  { grace = LIVE_GRACE_MS, now = () => new Date() } = {},
) {
  const down = ref(false)
  const since = ref(null)
  const retrying = ref(false)
  let graceTimer = null
  let spinTimer = null

  function lost() {
    retrying.value = false
    if (since.value) return
    since.value = now()
    graceTimer = setTimeout(() => (down.value = true), grace)
  }
  function back() {
    clearTimeout(graceTimer)
    clearTimeout(spinTimer)
    since.value = null
    down.value = false
    retrying.value = false
  }
  // socket.io waits up to 30 s between attempts; the worker who asks does not
  // wait for the next one. Leaving the socket ends that wait, and connecting
  // opens a new one at once (a failure resumes the backoff by itself).
  function retry() {
    if (!socket || socket.connected || retrying.value) return
    retrying.value = true
    socket.disconnect()
    socket.connect()
    clearTimeout(spinTimer)
    spinTimer = setTimeout(() => (retrying.value = false), RETRY_SPIN_MS)
  }

  socket?.on?.('connect', back)
  socket?.on?.('disconnect', lost)
  socket?.on?.('connect_error', lost)
  function stop() {
    back()
    socket?.off?.('connect', back)
    socket?.off?.('disconnect', lost)
    socket?.off?.('connect_error', lost)
  }
  return { down, since, retrying, retry, stop }
}

let shared = null
/** The tab's one watch on the app socket; without the app's stores, never down. */
export function liveConnection() {
  if (!shared) {
    let socket
    try {
      socket = globalStore().$socket || null
    } catch {
      socket = null
    }
    shared = createLiveConnection(socket)
  }
  return shared
}
