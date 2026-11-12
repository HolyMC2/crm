<template>
  <!-- An invoice's month, its state and its amount. Where Boat serves the
       detail (capability «invoice_detail») the whole line is one tap that
       opens it, with a chevron; otherwise it only reads. Its actions («Pagar»,
       the CFDI) stay beside it, never inside. -->
  <button
    v-if="tappable"
    type="button"
    class="press -mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-1 text-left active:bg-surface-gray-2 [@media(hover:hover)]:hover:bg-surface-gray-2"
    :title="__('See the detail of {0}', [inv.title], 'Cuenta')"
    data-testid="factura-abrir"
    @click="$emit('open')"
  >
    <span class="min-w-0 flex-1">
      <span class="block text-base font-medium text-ink-gray-9">{{
        inv.title
      }}</span>
      <span class="block text-sm" :class="lineClass">{{ inv.line }}</span>
    </span>
    <span class="num shrink-0 text-base" :class="amountClass">{{
      inv.amount
    }}</span>
    <span
      class="lucide-chevron-right mt-0.5 size-5 flex-none text-ink-gray-5"
      aria-hidden="true"
    />
  </button>
  <div v-else class="flex items-start gap-3">
    <div class="min-w-0 flex-1">
      <p class="text-base font-medium text-ink-gray-9">{{ inv.title }}</p>
      <p class="text-sm" :class="lineClass">{{ inv.line }}</p>
    </div>
    <span class="num shrink-0 text-base" :class="amountClass">{{
      inv.amount
    }}</span>
  </div>
</template>
<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** One row of facturacion.invoiceGroups. */
  inv: { type: Object, required: true },
  tappable: { type: Boolean, default: false },
  /** An invoice still to pay: its amount is the row's figure. */
  due: { type: Boolean, default: false },
})
defineEmits(['open'])

const lineClass = computed(() =>
  props.due && props.inv.overdue ? 'text-ink-red-7' : 'text-ink-gray-6',
)
const amountClass = computed(() => {
  if (!props.due) return 'text-ink-gray-9'
  return props.inv.overdue
    ? 'font-semibold text-ink-red-7'
    : 'font-semibold text-ink-gray-9'
})
</script>
