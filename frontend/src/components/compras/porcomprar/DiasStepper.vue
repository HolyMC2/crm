<template>
  <!-- Days as one pill: minus, «14 días», plus. 44 px targets. -->
  <div
    class="inline-flex flex-none items-center rounded-full bg-surface-gray-2"
    :class="large ? 'h-11' : 'h-9'"
    role="group"
    :aria-label="label"
  >
    <button
      type="button"
      class="press flex h-full items-center justify-center rounded-full text-ink-gray-8 disabled:opacity-40"
      :class="large ? 'w-11' : 'w-9'"
      :disabled="disabled || modelValue <= min"
      :aria-label="__('One day less', null, 'PorComprar')"
      @click="emit('update:modelValue', modelValue - 1)"
    >
      <span class="lucide-minus size-4" aria-hidden="true" />
    </button>
    <span
      class="num min-w-16 px-1 text-center text-sm font-semibold tabular-nums text-ink-gray-9"
      aria-live="polite"
      >{{ daysText(modelValue) }}</span
    >
    <button
      type="button"
      class="press flex h-full items-center justify-center rounded-full text-ink-gray-8 disabled:opacity-40"
      :class="large ? 'w-11' : 'w-9'"
      :disabled="disabled || modelValue >= max"
      :aria-label="__('One day more', null, 'PorComprar')"
      @click="emit('update:modelValue', modelValue + 1)"
    >
      <span class="lucide-plus size-4" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup>
import { daysText } from './porComprar'

defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 365 },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  large: { type: Boolean, default: true },
})
const emit = defineEmits(['update:modelValue'])
</script>
