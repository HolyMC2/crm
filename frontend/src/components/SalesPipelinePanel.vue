<template>
  <div class="mb-8 flex flex-col gap-8">
    <!-- Customers -->
    <div>
      <div class="mb-4 flex h-8 items-center justify-between">
        <span class="text-base font-semibold text-ink-gray-8">
          {{ __('Customers') }}
        </span>
        <Button
          size="sm"
          variant="ghost"
          :label="__('Sync')"
          :loading="syncing"
          @click="syncCustomers"
        />
      </div>
      <div v-if="customers.loading" class="flex justify-center py-4">
        <LoadingIndicator class="h-5 w-5" />
      </div>
      <div
        v-else-if="!customerList.length"
        class="rounded-lg border border-outline-gray-2 px-4 py-3 text-sm text-ink-gray-5"
      >
        {{ __('No customers linked — click Sync to create from contacts') }}
      </div>
      <div v-else class="flex flex-col gap-2">
        <div
          v-for="c in customerList"
          :key="c.customer"
          class="flex items-center justify-between rounded-lg border border-outline-gray-2 bg-surface-gray-1 px-4 py-3"
        >
          <div class="flex flex-col gap-0.5">
            <a
              :href="`/app/customer/${encodeURIComponent(c.customer)}`"
              target="_blank"
              class="text-sm font-semibold text-ink-gray-9 hover:underline"
            >
              {{ c.customer }}
            </a>
            <span v-if="c.mobile_no" class="text-xs text-ink-gray-5">{{ c.mobile_no }}</span>
          </div>
          <span
            v-if="c.is_primary"
            class="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700"
          >
            {{ __('Primary') }}
          </span>
        </div>
      </div>
      <ErrorMessage v-if="syncError" class="mt-2" :message="syncError" />
    </div>

    <!-- Quotations -->
    <div>
      <div class="mb-4 flex h-8 items-center justify-between">
        <span class="text-base font-semibold text-ink-gray-8">
          {{ __('Quotations') }}
        </span>
        <Button
          size="sm"
          variant="ghost"
          :label="__('New')"
          :loading="creatingQuotation"
          @click="createQuotation"
        />
      </div>

      <div v-if="quotations.loading" class="flex justify-center py-4">
        <LoadingIndicator class="h-5 w-5" />
      </div>
      <div
        v-else-if="!quotationList.length"
        class="rounded-lg border border-outline-gray-2 px-4 py-5 text-center text-sm text-ink-gray-5"
      >
        {{ __('No quotations linked to this deal') }}
      </div>
      <div v-else class="flex flex-col gap-2">
        <div
          v-for="q in quotationList"
          :key="q.name"
          class="flex items-center justify-between rounded-lg border border-outline-gray-2 bg-surface-gray-1 px-4 py-3"
        >
          <div class="flex flex-col gap-0.5">
            <a
              :href="`/app/quotation/${encodeURIComponent(q.name)}`"
              target="_blank"
              class="text-sm font-semibold text-ink-gray-9 hover:underline"
            >
              {{ q.name }}
            </a>
            <span class="text-xs text-ink-gray-5">{{ q.transaction_date }}</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium text-ink-gray-7">
              {{ q.currency }} {{ fmt(q.grand_total) }}
            </span>
            <span
              class="rounded px-2 py-0.5 text-xs font-semibold"
              :class="quotationStatusClass(q.status)"
            >
              {{ __(q.status) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Sales Orders -->
    <div>
      <div class="mb-4 flex h-8 items-center">
        <span class="text-base font-semibold text-ink-gray-8">
          {{ __('Sales Orders') }}
        </span>
      </div>

      <div v-if="salesOrders.loading" class="flex justify-center py-4">
        <LoadingIndicator class="h-5 w-5" />
      </div>
      <div
        v-else-if="!salesOrderList.length"
        class="rounded-lg border border-outline-gray-2 px-4 py-5 text-center text-sm text-ink-gray-5"
      >
        {{ __('No sales orders yet — submit a quotation to create one') }}
      </div>
      <div v-else class="flex flex-col gap-2">
        <div
          v-for="so in salesOrderList"
          :key="so.name"
          class="flex items-center justify-between rounded-lg border border-outline-gray-2 bg-surface-gray-1 px-4 py-3"
        >
          <div class="flex flex-col gap-0.5">
            <a
              :href="`/app/sales-order/${encodeURIComponent(so.name)}`"
              target="_blank"
              class="text-sm font-semibold text-ink-gray-9 hover:underline"
            >
              {{ so.name }}
            </a>
            <span class="text-xs text-ink-gray-5">{{ so.transaction_date }}</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm font-medium text-ink-gray-7">
              {{ so.currency }} {{ fmt(so.grand_total) }}
            </span>
            <span
              class="rounded px-2 py-0.5 text-xs font-semibold"
              :class="salesOrderStatusClass(so.status)"
            >
              {{ __(so.status) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import LoadingIndicator from '@/components/Icons/LoadingIndicator.vue'
import { Button, ErrorMessage, createResource } from 'frappe-ui'
import { computed, ref } from 'vue'

const props = defineProps({
  docname: { type: String, required: true },
})

// ── Customers ─────────────────────────────────────────────────────────────────

const syncing = ref(false)
const syncError = ref(null)

const customers = createResource({
  url: 'doco.doco.api.get_deal_customer',
  params: { deal_name: props.docname },
  auto: true,
})

const customerList = computed(() => customers.data || [])

const syncResource = createResource({
  url: 'doco.doco.api.sync_deal_contacts_to_erpnext',
})

function syncCustomers() {
  syncError.value = null
  syncing.value = true
  syncResource.submit(
    { deal_name: props.docname },
    {
      onSuccess() {
        syncing.value = false
        customers.reload()
      },
      onError(err) {
        syncing.value = false
        syncError.value = err.messages?.join('\n') || err.message
      },
    },
  )
}

// ── Quotations ────────────────────────────────────────────────────────────────

const creatingQuotation = ref(false)

function createQuotation() {
  creatingQuotation.value = true
  createResource({
    url: 'doco.doco.api.create_draft_quotation',
    params: { deal_name: props.docname },
    auto: true,
    onSuccess(name) {
      creatingQuotation.value = false
      window.open(`/app/quotation/${encodeURIComponent(name)}`, '_blank')
      quotations.reload()
    },
    onError() {
      creatingQuotation.value = false
    },
  })
}

// ── Quotations list ──────────────────────────────────────────────────────────────

const quotations = createResource({
  url: 'doco.doco.api.get_deal_quotations',
  params: { deal_name: props.docname },
  auto: true,
})

const quotationList = computed(() => quotations.data || [])

function quotationStatusClass(status) {
  return {
    'bg-green-100 text-green-700': status === 'Ordered',
    'bg-blue-100 text-blue-700': status === 'Submitted',
    'bg-red-100 text-red-700': ['Lost', 'Cancelled'].includes(status),
    'bg-orange-100 text-orange-700': status === 'Expired',
    'bg-gray-100 text-gray-500': status === 'Draft',
  }
}

// ── Sales Orders ──────────────────────────────────────────────────────────────

const salesOrders = createResource({
  url: 'doco.doco.api.get_deal_sales_orders',
  params: { deal_name: props.docname },
  auto: true,
})

const salesOrderList = computed(() => salesOrders.data || [])

function salesOrderStatusClass(status) {
  return {
    'bg-green-100 text-green-700': status === 'Completed',
    'bg-blue-100 text-blue-700': status === 'To Deliver and Bill',
    'bg-orange-100 text-orange-700': ['To Bill', 'To Deliver'].includes(status),
    'bg-red-100 text-red-700': status === 'Cancelled',
    'bg-gray-100 text-gray-500': ['Draft', 'Closed'].includes(status),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(amount) {
  if (amount == null) return '—'
  return Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
</script>
