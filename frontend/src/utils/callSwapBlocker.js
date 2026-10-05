import { registerSwapBlocker } from '@/vendor/muelle-shell/live-sync'

// A silent update reloads the page, which tears down a WebRTC call and its
// popup (note, task). Any trace of a call — ringing, dialing, live or
// minimized — holds the swap until the call ends.
export function callInProgress(state) {
  return Boolean(
    state?.call ||
      state?.onCall ||
      state?.calling ||
      state?.popup ||
      state?.minimized,
  )
}

// The returned release is for the call UI's unmount: a Twilio call outlives
// it (leaving Ventas keeps the WebRTC call), so while a call is in progress
// the blocker stays and clears itself when the call's handlers reset the
// state. Registering the same name again (back in Ventas) replaces it.
export function registerCallSwapBlocker(name, state) {
  let released = false
  const unregister = registerSwapBlocker(
    name,
    () => !released && callInProgress(state()),
  )
  return () => {
    if (callInProgress(state())) return
    released = true
    unregister()
  }
}
