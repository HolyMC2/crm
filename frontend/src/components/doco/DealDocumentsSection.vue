<template>
  <div class="mt-6 border-t pt-6">
    <!-- Header (draft creation moved to per-RO 'Crear borrador' picker in RepairOrdersSection) -->
    <div class="mb-3 flex items-center justify-between">
      <span class="text-base-semibold text-ink-gray-8">
        {{ __('Documents') }}
      </span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="py-3 text-sm text-ink-gray-5">
      {{ __('Loading...') }}
    </div>

    <div v-else-if="!hasAny" class="py-2 text-sm text-ink-gray-5">
      {{ __('No documents linked to this deal.') }}
    </div>

    <div v-else class="space-y-4">

      <!-- Quotations -->
      <div v-if="quotations.length">
        <div class="mb-1.5 text-xs-medium uppercase tracking-wide text-ink-gray-5">
          {{ __('Quotations') }}
        </div>
        <div class="divide-y rounded-lg border overflow-hidden">
          <a
            v-for="doc in quotations"
            :key="doc.name"
            :href="`/app/quotation/${encodeURIComponent(doc.name)}`"
            target="_blank"
            class="flex items-center justify-between px-3 py-2 text-sm hover:bg-surface-gray-1 transition-colors"
          >
            <span class="font-medium text-ink-blue-7">{{ doc.name }}</span>
            <div class="flex items-center gap-3 text-right">
              <Badge :label="__(doc.status)" :theme="quotationTheme(doc.status)" size="sm" />
              <span class="text-ink-gray-7 tabular-nums">{{ fmt(doc.grand_total, doc.currency) }}</span>
              <span class="text-xs text-ink-gray-5">{{ doc.transaction_date }}</span>
            </div>
          </a>
        </div>
      </div>

      <!-- Sales Orders -->
      <div v-if="salesOrders.length">
        <div class="mb-1.5 text-xs-medium uppercase tracking-wide text-ink-gray-5">
          {{ __('Sales Orders') }}
        </div>
        <div class="divide-y rounded-lg border overflow-hidden">
          <a
            v-for="doc in salesOrders"
            :key="doc.name"
            :href="`/app/sales-order/${encodeURIComponent(doc.name)}`"
            target="_blank"
            class="flex items-center justify-between px-3 py-2 text-sm hover:bg-surface-gray-1 transition-colors"
          >
            <span class="font-medium text-ink-blue-7">{{ doc.name }}</span>
            <div class="flex items-center gap-3 text-right">
              <Badge :label="__(doc.status)" :theme="soTheme(doc.status)" size="sm" />
              <span class="text-ink-gray-7 tabular-nums">{{ fmt(doc.grand_total, doc.currency) }}</span>
              <span class="text-xs text-ink-gray-5">{{ doc.transaction_date }}</span>
            </div>
          </a>
        </div>
      </div>

      <!-- Invoices -->
      <div v-if="invoices.length">
        <div class="mb-1.5 text-xs-medium uppercase tracking-wide text-ink-gray-5">
          {{ __('Invoices') }}
        </div>
        <div class="divide-y rounded-lg border overflow-hidden">
          <a
            v-for="doc in invoices"
            :key="doc.name"
            :href="`/app/${docSlug(doc.doctype)}/${encodeURIComponent(doc.name)}`"
            target="_blank"
            class="flex items-center justify-between px-3 py-2 text-sm hover:bg-surface-gray-1 transition-colors"
          >
            <div class="flex items-center gap-2">
              <span class="font-medium text-ink-blue-7">{{ doc.name }}</span>
              <span
                v-if="doc.doctype === 'POS Invoice'"
                class="rounded bg-surface-gray-2 px-1 py-0.5 text-xs text-ink-gray-5"
              >POS</span>
            </div>
            <div class="flex items-center gap-3 text-right">
              <Badge :label="__(doc.status)" :theme="invoiceTheme(doc.status)" size="sm" />
              <span class="text-ink-gray-7 tabular-nums">{{ fmt(doc.grand_total, doc.currency) }}</span>
              <span class="text-xs text-ink-gray-5">{{ doc.posting_date }}</span>
            </div>
          </a>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { Badge, createResource } from 'frappe-ui'
import { computed } from 'vue'

const props = defineProps({
  docname: { type: String, required: true },
})

// ── Data fetching ────────────────────────────────────────────────────────────
// ERP spec P2.4: one neutral summary call (doco crm_deal joins) replaced the
// three taller-fed reads — works without taller and matches the inbox panel.
// Behavior change (spec §6b): invoices are crm_deal-back-link only; the old
// customer-matched POS path could show unrelated same-customer purchases.

const summaryRes = createResource({
  url: 'doco_marketing.api.sales_docs.get_deal_sales_summary',
  params: { deal: props.docname },
  auto: true,
})

const loading = computed(() => summaryRes.loading)

const quotations = computed(() => summaryRes.data?.quotations || [])
const salesOrders = computed(() => summaryRes.data?.sales_orders || [])
const invoices = computed(() => summaryRes.data?.invoices || [])

const hasAny = computed(
  () => quotations.value.length || salesOrders.value.length || invoices.value.length,
)

// ── Helpers ──────────────────────────────────────────────────────────────────

function docSlug(doctype) {
  return doctype.toLowerCase().replace(/ /g, '-')
}

function fmt(amount, currency) {
  if (amount == null) return '—'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency || 'MXN',
    minimumFractionDigits: 2,
  }).format(amount)
}

function quotationTheme(status) {
  return { Open: 'blue', Ordered: 'green', Lost: 'red', Cancelled: 'red', Expired: 'orange' }[status] || 'gray'
}

function soTheme(status) {
  return {
    'To Deliver and Bill': 'blue',
    'To Bill': 'blue',
    'To Deliver': 'blue',
    Completed: 'green',
    Cancelled: 'red',
    Closed: 'gray',
  }[status] || 'gray'
}

function invoiceTheme(status) {
  return {
    Paid: 'green',
    'Partly Paid': 'orange',
    Unpaid: 'orange',
    Overdue: 'red',
    Cancelled: 'red',
    Return: 'gray',
    Consolidated: 'green',
    Submitted: 'green',
  }[status] || 'gray'
}
</script>
