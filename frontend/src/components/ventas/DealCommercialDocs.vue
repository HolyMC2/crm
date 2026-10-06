<!--
  Deal host of the shared commercial panel: Deal 360 Resumen, the Inbox context
  panel and the legacy vertical slot (registry key DealDocumentsSection passes
  docname). Shares the summary resource with the header saldo chip.
-->
<template>
  <div
    ref="rootEl"
    class="transition-shadow duration-300"
    :class="pulsing ? 'ring-2 ring-inset ring-outline-gray-4' : ''"
  >
    <CommercialDocsPanel
      scope="deal"
      :model="model"
      :loading="salesSummary.loading"
      :error="error"
      :notice="notice"
      :scope-label="dealName"
      :return-label="__('Deal {0}', [dealName])"
      :compact="compact"
      :payment-link="paymentLink"
      :source="source"
      @start-quote="activeTab = 'items'"
    >
      <template #editor="{ row, close }">
        <QuoteEditor
          :deal="dealName"
          :quotation="row.name"
          @close="close"
          @changed="source.reload()"
        />
      </template>
    </CommercialDocsPanel>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import CommercialDocsPanel from '@/components/ventas/CommercialDocsPanel.vue'
import QuoteEditor from '@/components/doco/inbox/QuoteEditor.vue'
import { formatMoney } from '@/composables/crmFormat'
import {
  activeTab,
  features,
  salesDocsEnabled,
  salesDocsPulse,
  setComposerDraft,
} from '@/composables/inbox'
import {
  acceptQuotation,
  ensureSalesSummary,
  reloadSalesSummary,
  salesSummary,
} from '@/composables/salesDocs'
import { globalStore } from '@/stores/global'
import { normalizeCommercialDocs } from '@/utils/ventasDocs'

// registry hosts also pass doctype/config; only the record matters here
defineOptions({ inheritAttrs: false })
const props = defineProps({
  deal: { type: String, default: '' },
  // registry hosts pass the record as docname
  docname: { type: String, default: '' },
  compact: { type: Boolean, default: false },
  paymentLink: { type: Boolean, default: false },
})
const dealName = computed(() => props.deal || props.docname)

const model = computed(() =>
  salesSummary.params?.deal === dealName.value
    ? normalizeCommercialDocs(salesSummary.data)
    : null,
)
const error = computed(() =>
  salesSummary.error && salesSummary.params?.deal === dealName.value
    ? salesSummary.error.messages?.[0] ||
      __('The documents could not be loaded.')
    : '',
)
const notice = computed(() =>
  features.data && !salesDocsEnabled.value
    ? __(
        'Sales documents are turned off for this shop. Ask your manager to turn them on in the sales settings.',
      )
    : '',
)

watch([dealName, salesDocsEnabled], () => ensureSalesSummary(dealName.value), {
  immediate: true,
})

const ACTIONS = {
  accept_quotation: (row) => acceptQuotation(dealName.value, row.name),
  confirm_sales_order: (row, requestId) =>
    call('doco_marketing.api.sales_docs.confirm_sales_order', {
      deal: dealName.value,
      sales_order: row.name,
      modified: row.modified || null,
      request_id: requestId,
    }),
  make_invoice: (row, requestId) =>
    call('doco_marketing.api.sales_docs.make_invoice', {
      deal: dealName.value,
      sales_order: row.name,
      request_id: requestId,
    }),
  reopen_sales_order: (row, requestId, extra) =>
    call('doco_marketing.api.sales_docs.reopen_sales_order', {
      deal: dealName.value,
      sales_order: row.name,
      reason: extra?.reason || null,
      request_id: requestId,
    }),
  issue_invoice: (row, requestId) =>
    call('doco_marketing.api.sales_docs.issue_invoice', {
      deal: dealName.value,
      sales_invoice: row.name,
      modified: row.modified || null,
      request_id: requestId,
    }),
  // 💳 cobrar en el chat: MercadoPago link → editable composer draft, never sent here
  payment_link: async (row) => {
    const out = await call('doco_marketing.api.inbox.create_payment_link', {
      deal: dealName.value,
      invoice: row.name,
    })
    activeTab.value = 'conversation'
    setComposerDraft({
      text: __('You can pay securely at this link:\n{0}\n\n*{1}* · {2}', [
        out.url,
        row.name,
        formatMoney(out.amount, row.currency),
      ]),
      canned: 'cobro',
    })
    return out
  },
}

const source = {
  reload: () => reloadSalesSummary(dealName.value),
  act: (method, row, requestId, extra) => {
    const action = ACTIONS[method]
    if (!action) throw new Error(`Unknown action ${method}`)
    return action(row, requestId, extra)
  },
  render: (row) =>
    call('doco_marketing.api.sales_docs.render_sales_doc', {
      deal: dealName.value,
      doctype: row.doctype,
      name: row.name,
    }),
}

// money events (SI/POS/PE submit) ping thread_update with channel "erp"
const { $socket } = globalStore()
function onErp(payload) {
  if (payload?.channel === 'erp' && payload?.deal === dealName.value)
    source.reload()
}
onMounted(() => $socket?.on('doco_marketing:thread_update', onErp))
onUnmounted(() => $socket?.off('doco_marketing:thread_update', onErp))

// intent chip «pago»: bring the money documents into view with a brief ring
const rootEl = ref(null)
const pulsing = ref(false)
watch(salesDocsPulse, () => {
  rootEl.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  pulsing.value = true
  setTimeout(() => (pulsing.value = false), 1600)
})
</script>
