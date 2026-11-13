// One Repair Order read per deal for the deal header's chips and Resumen's list:
// both asked for them on every deal opened, two requests for one answer.
import { reactive } from 'vue'
import { call } from 'frappe-ui'

const state = reactive({ deal: null, data: null, loading: false, error: null })
let seq = 0

function params(deal) {
  return {
    doctype: 'Repair Order',
    filters: { crm_deal: deal },
    fields: ['name', 'device_model', 'status', 'quote_amount', 'balance_due'],
    order_by: 'creation desc',
    limit_page_length: 20,
  }
}

/**
 * Reads the deal's Repair Orders once; `force` reads them again (a manual
 * refresh, a return from Taller). An answer for a deal no longer open is dropped.
 */
export async function loadDealRepairs(deal, { force = false } = {}) {
  if (!deal) return
  if (!force && state.deal === deal && (state.data || state.loading)) return
  const mine = ++seq
  if (state.deal !== deal) state.data = null
  state.deal = deal
  state.loading = true
  state.error = null
  try {
    const rows = await call('frappe.client.get_list', params(deal))
    if (mine === seq) state.data = rows || []
  } catch (error) {
    if (mine === seq) state.error = error
  } finally {
    if (mine === seq) state.loading = false
  }
}

/** The read for `deal`: its rows once in, or a loading state meanwhile. */
export function dealRepairs(deal) {
  if (state.deal !== deal) return { data: null, loading: true, error: null }
  return state
}
