import { getCurrentInstance, onActivated, onScopeDispose } from 'vue'

// Reload a view when the operator comes back to it: after the taller Intake handoff
// (Back or «Volver al trato», including a bfcache restore), a tab switch or a kept-alive
// route re-entry. Event-driven only; triggers that arrive together (focus plus
// visibilitychange) collapse into one reload.
export function useReloadOnReturn(reload, { minIntervalMs = 1000 } = {}) {
  let last = 0
  function trigger() {
    if (document.visibilityState === 'hidden') return
    const now = Date.now()
    if (now - last < minIntervalMs) return
    last = now
    reload()
  }
  const onVisibility = () => trigger()
  const onPageShow = (event) => event.persisted && trigger()
  window.addEventListener('focus', trigger)
  window.addEventListener('pageshow', onPageShow)
  document.addEventListener('visibilitychange', onVisibility)
  let activatedOnce = false
  if (getCurrentInstance())
    onActivated(() => {
      // The first activation is the mount itself, which already loads.
      if (activatedOnce) trigger()
      activatedOnce = true
    })
  onScopeDispose(() => {
    window.removeEventListener('focus', trigger)
    window.removeEventListener('pageshow', onPageShow)
    document.removeEventListener('visibilitychange', onVisibility)
  })
  return trigger
}
