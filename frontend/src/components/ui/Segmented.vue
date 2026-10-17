<template>
  <!-- Two to four views of the same thing (Shell SPEC §2.2.4): one outlined
       track, equal segments, the chosen one tonal with a check. Not for
       filters (FilterChips) and not for done/cancelled (fold them into a
       «Completados (n)» section). -->
  <div
    ref="root"
    role="radiogroup"
    :aria-label="label"
    class="flex w-full overflow-hidden rounded-full border border-outline-gray-2"
    data-ui-segmented
    @keydown="onKey"
  >
    <button
      v-for="(option, index) in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="String(option.value === modelValue)"
      :tabindex="tabStop(option.value, index) ? 0 : -1"
      :data-index="index"
      class="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-1 text-sm font-medium leading-tight"
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
const root = ref(null)

const current = () =>
  props.options.findIndex((option) => option.value === props.modelValue)
// One tab stop: the chosen segment, or the first when none is.
const tabStop = (value, index) =>
  value === props.modelValue || (current() < 0 && index === 0)

function select(value) {
  if (value !== props.modelValue) emit('update:modelValue', value)
}
function onKey(event) {
  const last = props.options.length - 1
  const from = current()
  const next = {
    ArrowRight: from < 0 ? 0 : (from + 1) % (last + 1),
    ArrowDown: from < 0 ? 0 : (from + 1) % (last + 1),
    ArrowLeft: from < 0 ? last : (from - 1 + last + 1) % (last + 1),
    ArrowUp: from < 0 ? last : (from - 1 + last + 1) % (last + 1),
    Home: 0,
    End: last,
  }[event.key]
  if (next === undefined) return
  event.preventDefault()
  select(props.options[next].value)
  root.value?.querySelector(`[data-index="${next}"]`)?.focus()
}
</script>
