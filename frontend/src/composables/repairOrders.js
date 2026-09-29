import { onScopeDispose, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import { repairError } from '@/utils/repairOrders'
import { useReloadOnReturn } from '@/composables/reloadOnReturn'

const CONTEXT = 'taller.repair.repair_orders.get_deal_repair_context'

// Read side of a Deal's Repair Orders. Intake lives in taller (/taller/intake);
// this list reloads when the operator returns from it.
export function useRepairOrders(deal) {
  const state = ref(blank(null))
  let disposed = false
  let read = 0
  function blank(name) {
    return { deal: name, context: null, loading: true, loadError: '' }
  }
  async function refresh() {
    const s = state.value
    if (!s?.deal || disposed) return
    const request = ++read
    s.loading = true
    s.loadError = ''
    try {
      const response = await call(CONTEXT, { deal_name: s.deal })
      if (disposed || request !== read) return
      if (!response || !Array.isArray(response.orders))
        throw new Error(
          'La respuesta del Taller no está disponible. Reintenta la consulta.',
        )
      s.context = response
    } catch (error) {
      if (!disposed && request === read) s.loadError = repairError(error)
    } finally {
      if (!disposed && request === read) s.loading = false
    }
  }
  watch(
    deal,
    (name) => {
      // A new Deal never shows the previous Deal's orders while it loads.
      state.value = blank(name)
      refresh()
    },
    { immediate: true },
  )
  useReloadOnReturn(refresh)
  onScopeDispose(() => {
    disposed = true
  })
  return { state, refresh }
}
