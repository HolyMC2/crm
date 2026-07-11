// 💰 Documentos (ERP_INTEGRATION_SPEC P1) — one shared summary resource per deal
// so the context panel and the header saldo chip fetch once and stay in sync.
// Data: doco_marketing.api.sales_docs.get_deal_sales_summary (neutral doco
// crm_deal joins — works with or without taller). Gated by salesDocsEnabled.

import { computed } from 'vue'
import { call, createResource } from 'frappe-ui'
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

// ── quote building (ERP spec P2) ────────────────────────────────────────────
// Thin wrappers over doco_marketing.api.sales_docs.*; every mutation refreshes
// the shared summary so the panel/chip repaint without extra plumbing.
async function _quoteCall(method, params) {
  const out = await call(`doco_marketing.api.sales_docs.${method}`, params)
  reloadSalesSummary(params.deal)
  return out
}
export function addItemsToQuotation(deal, items) {
  return _quoteCall('add_items_to_quotation', { deal, items: JSON.stringify(items) })
}
export function getQuotationDetail(deal, quotation) {
  return call('doco_marketing.api.sales_docs.get_quotation_detail', { deal, quotation })
}
export function updateQuotationLine(deal, quotation, row_name, patch) {
  return _quoteCall('update_quotation_line', { deal, quotation, row_name, ...patch })
}
export function removeQuotationLine(deal, quotation, row_name) {
  return _quoteCall('remove_quotation_line', { deal, quotation, row_name })
}
export function submitQuotation(deal, quotation) {
  return _quoteCall('submit_quotation', { deal, quotation })
}
export function acceptQuotation(deal, quotation) {
  return _quoteCall('accept_quotation', { deal, quotation })
}
export function sendQuotationWhatsapp(deal, quotation, to) {
  return _quoteCall('send_quotation_whatsapp', { deal, quotation, to })
}
