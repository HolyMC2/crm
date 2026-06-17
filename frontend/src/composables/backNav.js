import { computed } from 'vue'
import { useRouter } from 'vue-router'

// Back navigation for the redesigned shell (handoff §4.3 / §6.1).
// `router.previousRoute` is stamped in router.beforeEach. Views render a
// "← {backLabel}" affordance and call goBack(). Falls back to /inbox when there
// is no history (deep link / fresh tab).
export function useBackNav() {
  const router = useRouter()
  const prev = computed(() => router.previousRoute)
  const backLabel = computed(
    () => prev.value?.meta?.navLabel || prev.value?.name || 'Back',
  )
  function goBack() {
    if (window.history.length > 1) router.back()
    else router.push('/inbox')
  }
  return { backLabel, goBack }
}
