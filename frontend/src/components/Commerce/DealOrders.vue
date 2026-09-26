<template>
  <section
    class="min-w-0 flex-1 overflow-y-auto p-3 sm:p-5"
    :aria-label="__('Orders and payments')"
  >
    <h2 class="text-xl font-semibold">{{ __('Orders and payments') }}</h2>
    <p class="mt-2 text-sm text-ink-gray-6">
      {{
        __(
          'Continue the linked sales order through a reviewed register handoff or payment link. Invoicing, payment and delivery are separate outcomes.',
        )
      }}
    </p>
    <p v-if="loading" role="status" class="mt-3">
      {{ __('Loading linked orders…') }}
    </p>
    <div v-else-if="error" role="alert" class="mt-3 space-y-2">
      <p>{{ error }}</p>
      <button class="commerce-button" @click="load">
        {{ __('Retry loading orders') }}
      </button>
    </div>
    <p v-else-if="context && !context.available" class="mt-3">
      {{ commerceReason(context.reason_code) }}
    </p>
    <p v-else-if="context && !context.orders.length" class="mt-3">
      {{
        __(
          'No permitted sales orders are linked to this deal. Continue an accepted offer in its canonical ERP quotation, or review a received cart.',
        )
      }}
    </p>
    <nav
      v-if="context?.available"
      class="my-4 flex flex-wrap gap-2"
      :aria-label="__('Linked sales orders')"
    >
      <button
        v-for="order in context.orders"
        :key="order.name"
        class="commerce-button"
        :disabled="state.busy || !!state.pending"
        :aria-current="state.selected === order.name ? 'true' : undefined"
        @click="select(order.name)"
      >
        {{ order.name }} · {{ __(order.status) }} · {{ order.total }}
        {{ order.currency }}
      </button>
    </nav>
    <p v-if="context?.has_more" class="my-3 text-sm text-ink-gray-6">
      {{
        __(
          'Showing the 20 most recently updated permitted orders. Open the Sales Order list for older linked orders.',
        )
      }}
    </p>
    <a
      v-if="context?.has_more"
      :href="`/app/sales-order?crm_deal=${encodeURIComponent(deal)}`"
      class="inline-flex min-h-11 items-center underline"
      >{{ __('Open linked sales orders') }}</a
    >
    <OrderContinuation
      v-if="state.selected"
      :sales-order="state.selected"
      :deal="deal"
      :state="state"
    />
  </section>
</template>
<script setup>
import { ref, onUnmounted, watch } from 'vue'
import { call } from 'frappe-ui'
import OrderContinuation from './OrderContinuation.vue'
import { commerceError, commerceReason } from './commerceState'
const props = defineProps({
  deal: { type: String, required: true },
  state: { type: Object, required: true },
})
// The owning Deal/cart keeps this state across tab changes and uncertain actions.
const state = props.state
const context = ref(null),
  loading = ref(false),
  error = ref('')
let epoch = 0
async function load() {
  const stamp = ++epoch
  loading.value = true
  error.value = ''
  try {
    const result = await call('crm.api.commerce.get_context', {
      deal: props.deal,
    })
    if (stamp !== epoch) return
    if (typeof result?.available !== 'boolean' || !Array.isArray(result.orders))
      throw new Error(__('The order list is incomplete. Try again.'))
    context.value = result
    if (
      !state.pending &&
      !result.orders.some((order) => order.name === state.selected)
    )
      state.selected = result.orders.length === 1 ? result.orders[0].name : ''
  } catch (e) {
    if (stamp === epoch) error.value = commerceError(e)
  } finally {
    if (stamp === epoch) loading.value = false
  }
}
function select(name) {
  if (state.busy || state.pending) return
  state.selected = name
}
watch(() => props.deal, load, { immediate: true })
onUnmounted(() => {
  epoch++
})
</script>
<style scoped>
.commerce-button {
  @apply min-h-11 rounded border border-outline-gray-2 bg-surface-base px-3 py-2 text-left text-sm text-ink-gray-8 focus-visible:ring-2 disabled:opacity-50;
}
</style>
