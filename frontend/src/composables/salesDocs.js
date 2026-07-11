// 💰 Documentos (ERP_INTEGRATION_SPEC P1) — one shared summary resource per deal
// so the context panel and the header saldo chip fetch once and stay in sync.
// Data: doco_marketing.api.sales_docs.get_deal_sales_summary (neutral doco
// crm_deal joins — works with or without taller). Gated by salesDocsEnabled.

import { computed } from 'vue'
import { createResource } from 'frappe-ui'
import { salesDocsEnabled } from '@/composables/inbox'

export const salesSummary = createResource({
  url: 'doco_marketing.api.sales_docs.get_deal_sales_summary',
})

let loadedFor = null
export function ensureSalesSummary(deal) {
  if (!salesDocsEnabled.value || !deal) return
  if (loadedFor === deal) return
  loadedFor = deal
  salesSummary.data = null
  salesSummary.submit({ deal })
}
// erp realtime ping / manual refresh. With a deal argument it re-targets first.
export function reloadSalesSummary(deal) {
  if (!salesDocsEnabled.value) return
  if (deal && deal !== loadedFor) return ensureSalesSummary(deal)
  if (loadedFor) salesSummary.submit({ deal: loadedFor })
}

export const salesRollup = computed(() => salesSummary.data?.rollup || null)
export const salesOutstanding = computed(() => Number(salesRollup.value?.outstanding || 0))
