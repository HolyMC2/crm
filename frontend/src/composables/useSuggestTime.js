// W6 B2 — "Sugerir hora" composable. CONTRACT (consumed by SocialComposer B3):
//   const { suggestions, fbOnly, loading, fetchSuggestions } = useSuggestTime()
//   fetchSuggestions(shop, after?) -> Promise; fills suggestions [{when, score, reason}].
// Backend: doco_marketing.api.social_planner.suggest_time (branch-scoped server-side).
// Stub committed by lead so parallel builders share one import path; B2 implements.
import { ref } from 'vue'
import { call } from 'frappe-ui'

export function useSuggestTime() {
  const suggestions = ref([])
  const fbOnly = ref(true)
  const loading = ref(false)

  async function fetchSuggestions(shop, after) {
    loading.value = true
    try {
      const r = await call('doco_marketing.api.social_planner.suggest_time', { shop, after })
      suggestions.value = r?.suggestions || []
      fbOnly.value = r?.fb_only !== false
      return suggestions.value
    } finally {
      loading.value = false
    }
  }

  return { suggestions, fbOnly, loading, fetchSuggestions }
}
