<template>
  <!-- Two to four views of the same thing (Shell SPEC §2.2.4): one outlined
       track, equal segments, the chosen one tonal with a check. Not for
       filters (FilterChips) and not for done/cancelled (fold them into a
       «Completados (n)» section). -->
  <div
    role="tablist"
    :aria-label="label"
    class="flex min-h-11 w-full overflow-hidden rounded-full border border-outline-gray-2"
    data-ui-segmented
    @keydown="onKey"
  >
    <button
      v-for="(option, index) in options"
      :key="option.value"
      ref="buttons"
      type="button"
      role="tab"
      :aria-selected="String(option.value === modelValue)"
      :tabindex="option.value === modelValue ? 0 : -1"
      class="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-1 text-sm font-medium leading-tight"
      :class="[
        index ? 'border-l border-outline-gray-2' : '',
        option.value === modelValue
          ? 'bg-surface-gray-3 text-ink-gray-9'
          : 'text-ink-gray-7 hover:bg-surface-gray-1',
      ]"
      @click="select(option.value)"
    >
      <span
        v-if="option.value === modelValue"
        class="lucide-check size-4 flex-none"
        aria-hidden="true"
      />
      <span
        v-else-if="option.icon"
        :class="[option.icon, 'size-4 flex-none']"
        aria-hidden="true"
      />
      <span class="min-w-0 break-words text-center">{{ option.label }}</span>
      <span
        v-if="option.count !== undefined && option.count !== null"
        class="tabular-nums text-ink-gray-6"
        >{{ option.count }}</span
      >
    </button>
  </div>
</template>
<script setup>
import { ref } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  /** [{ value, label, count?, icon? }], two to four of them. */
  options: { type: Array, required: true },
  /** What the segments choose, for screen readers («Vista»). */
  label: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
const buttons = ref([])

function select(value) {
  if (value !== props.modelValue) emit('update:modelValue', value)
}
function onKey(event) {
  const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
  if (!step) return
  const index = props.options.findIndex((o) => o.value === props.modelValue)
  const next = (index + step + props.options.length) % props.options.length
  select(props.options[next].value)
  buttons.value[next]?.focus()
  event.preventDefault()
}
</script>
