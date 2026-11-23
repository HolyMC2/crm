<template>
  <!-- An amount of the shop's money in a filled field: the currency's sign,
       the number as typed. Saved when the field is left or on Enter. -->
  <label
    class="flex h-11 w-36 flex-none items-center gap-1 rounded-6 bg-surface-gray-3 px-3 focus-within:ring-2 focus-within:ring-outline-gray-4"
    data-conteo-monto
  >
    <span class="text-base text-ink-gray-7" aria-hidden="true">{{ sign }}</span>
    <input
      ref="input"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      :value="amountText(modelValue)"
      :placeholder="placeholder"
      :aria-label="label"
      :aria-invalid="invalid ? 'true' : undefined"
      :disabled="disabled"
      class="num min-w-0 flex-1 border-0 bg-transparent p-0 text-right text-base font-semibold text-ink-gray-9 placeholder:font-normal placeholder:text-ink-gray-6 focus:ring-0"
      @focus="$event.target.select()"
      @change="commit"
      @blur="$emit('leave', typedAmount($event.target.value))"
      @keydown.enter.prevent="$event.target.blur()"
    />
  </label>
</template>
<script setup>
import { computed, ref } from 'vue'
import { amountText, currencySign, typedAmount } from './conteos'

const props = defineProps({
  /** The stored amount; null or 0 shows the placeholder. */
  modelValue: { type: Number, default: null },
  currency: { type: String, default: '' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  invalid: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['commit', 'leave'])
const input = ref(null)
const sign = computed(() => currencySign(props.currency))

function commit(event) {
  const amount = typedAmount(event.target.value)
  // The field always shows a clean number, whatever was typed.
  event.target.value = amountText(amount)
  if ((amount || 0) !== (Number(props.modelValue) || 0)) emit('commit', amount)
}
defineExpose({ focus: () => input.value?.focus() })
</script>
