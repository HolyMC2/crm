import { getCurrentInstance, onBeforeUnmount, onMounted } from 'vue'
import { appleKeys, registerPageShortcuts } from '@/composables/shellKeyboard'
import { hoyLive } from '@/composables/useHoy'
import { isTypingTarget } from '@/vendor/muelle-shell/contracts'
import { useLiveWatch } from '@/vendor/muelle-shell/live-sync/vue'
import { keyAction } from '@/utils/powerList'

// A power app's record, the small part: Esc goes back to the same row of the
// list it came from (never while typing or under a dialog), the Alt+H sheet
// says so, and a change to its doctypes made elsewhere reloads it while the
// worker is not in the middle of something (`idle`).
export function useRecordPower({
  back,
  reload,
  idle = () => true,
  doctypes = [],
  minIntervalMs = 3000,
}) {
  registerPageShortcuts(null, () => [
    { id: 'record.back', keys: ['escape'], description: 'Back to the list' },
  ])
  function onKey(event) {
    if (event.defaultPrevented) return
    if (document.querySelector('[aria-modal="true"], [role="dialog"]')) return
    const action = keyAction(event, { escape: 'back' }, { apple: appleKeys })
    if (!action || isTypingTarget(event.target)) return
    event.preventDefault()
    back()
  }
  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
  if (doctypes.length) {
    const socket =
      getCurrentInstance()?.appContext.config.globalProperties.$socket
    useLiveWatch(
      hoyLive(socket),
      doctypes,
      () => {
        if (idle()) reload()
      },
      { minIntervalMs },
    )
  }
}
