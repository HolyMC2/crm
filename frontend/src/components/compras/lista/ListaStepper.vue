<template>
  <!-- The quantity of one line: minus, the number, plus. 44 px targets on the
       phone, a tighter row on desktop. Typing a number sets it on blur or Enter. -->
  <div
    class="inline-flex flex-none items-center rounded-full bg-surface-gray-2"
    :class="large ? 'h-11' : 'h-8'"
    role="group"
    :aria-label="label"
  >
    <button
      type="button"
      class="press flex h-full items-center justify-center rounded-full text-ink-gray-8 disabled:opacity-40"
      :class="large ? 'w-11' : 'w-8'"
      :disabled="disabled || !qty"
      :aria-label="__('One less', null, 'Lista')"
      @click="emit('step', -1)"
    >
      <span class="lucide-minus size-4" aria-hidden="true" />
    </button>
    <input
      :value="qty || ''"
      type="number"
      inputmode="numeric"
      min="0"
      step="1"
      placeholder="0"
      class="num h-full w-9 border-0 bg-transparent p-0 text-center text-sm tabular-nums text-ink-gray-9 placeholder:text-ink-gray-4 focus:ring-0"
      :class="qty ? 'font-semibold' : ''"
      :disabled="disabled"
      :aria-label="label"
      @change="typed"
      @keydown.enter.prevent="typed"
      @focus="$event.target.select()"
    />
    <button
      type="button"
      class="press flex h-full items-center justify-center rounded-full text-ink-gray-8 disabled:opacity-40"
      :class="large ? 'w-11' : 'w-8'"
      :disabled="disabled"
      :aria-label="__('One more', null, 'Lista')"
      @click="emit('step', 1)"
    >
      <span class="lucide-plus size-4" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup>
defineProps({
  qty: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
  large: { type: Boolean, default: false },
  label: { type: String, default: '' },
})
const emit = defineEmits(['step', 'set'])

function typed(event) {
  const value = Math.max(0, Math.round(Number(event.target.value) || 0))
  event.target.value = value || ''
  emit('set', value)
}
</script>
