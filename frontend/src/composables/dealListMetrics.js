// Count / value / weighted for the deals the list currently matches: the same
// filters and search go to `crm.api.doc.aggregate_deal_metrics`, which applies
// the same permissions as the list. Asked again only when the filters change.
import { call } from 'frappe-ui'
import { ref, watch } from 'vue'
import { summarizeDealMetrics } from '@/utils/dealsListSummary'

export function useDealListMetrics(source, statuses) {
  const summary = ref(summarizeDealMetrics([], []))
  const stages = ref([])
  const currency = ref('')
  const loading = ref(false)
  const error = ref(false)
  let request = 0
  let lastKey = null

  async function load(force = false) {
    const params = source()
    if (!params) return
    const key = JSON.stringify(params)
    if (!force && key === lastKey) return
    lastKey = key
    const mine = ++request
    loading.value = true
    error.value = false
    try {
      const data = await call('crm.api.doc.aggregate_deal_metrics', params)
      if (mine !== request) return
      stages.value = data?.stages || []
      currency.value = data?.currency || ''
    } catch {
      if (mine !== request) return
      stages.value = []
      error.value = true
      // a retry must ask again even with the same filters
      lastKey = null
    } finally {
      if (mine === request) loading.value = false
    }
  }

  watch(
    [stages, () => statuses()],
    () => {
      summary.value = summarizeDealMetrics(stages.value, statuses())
    },
    { deep: true },
  )

  return {
    summary,
    currency,
    loading,
    error,
    load,
    reload: () => load(true),
  }
}
