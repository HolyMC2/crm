<template>
  <!-- A number with a step each way: − and + go to the next round stop, and
       the number itself takes any value typed. Taps close together are one
       change. -->
  <div class="flex flex-none items-center gap-1" data-conteo-paso>
    <button
      type="button"
      :class="ROUND"
      :aria-label="__('Less', null, CTX)"
      :disabled="disabled || shown <= bounds.min"
      data-paso-menos
      @click="step(-1)"
    >
      <span class="lucide-minus size-5" aria-hidden="true" />
    </button>
    <label class="flex min-w-[4.5rem] items-baseline justify-center gap-1">
      <input
        type="text"
        inputmode="numeric"
        autocomplete="off"
        :value="shown === 0 && zeroLabel ? '' : shown"
        :placeholder="zeroLabel"
        :aria-label="label"
        :disabled="disabled"
        class="num w-full min-w-0 rounded-4 border-0 bg-transparent p-0 text-center text-xl font-semibold text-ink-gray-9 placeholder:text-base placeholder:font-medium placeholder:text-ink-gray-7 focus:bg-surface-gray-3 focus:ring-0"
        :class="unit ? 'max-w-10' : ''"
        data-paso-valor
        @focus="$event.target.select()"
        @change="typed"
        @keydown.enter.prevent="$event.target.blur()"
      />
      <span v-if="unit" class="text-sm text-ink-gray-7">{{ unit }}</span>
    </label>
    <button
      type="button"
      :class="ROUND"
      :aria-label="__('More', null, CTX)"
      :disabled="disabled || shown >= bounds.max"
      data-paso-mas
      @click="step(1)"
    >
      <span class="lucide-plus size-5" aria-hidden="true" />
    </button>
  </div>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { CTX, stepTo, typedNumber } from './conteos'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  /** `{ min, max, step }`. */
  bounds: { type: Object, required: true },
  /** What the number is, for a screen reader («Minutos de Karla»). */
  label: { type: String, default: '' },
  /** The unit after the number («min»). */
  unit: { type: String, default: '' },
  /** What 0 reads as, where 0 is a choice («Parejo»). */
  zeroLabel: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['commit'])

// Taps on − and + closer than this are sent as one change.
const SETTLE_MS = 350
const ROUND =
  'press flex size-11 flex-none items-center justify-center rounded-full bg-surface-gray-3 text-ink-gray-8 disabled:text-ink-gray-5'

const shown = ref(props.modelValue)
let timer = null

watch(
  () => props.modelValue,
  (value) => {
    if (!timer) shown.value = value
  },
)

function commit() {
  clearTimeout(timer)
  timer = null
  if (shown.value !== props.modelValue) emit('commit', shown.value)
}
function step(direction) {
  shown.value = stepTo(shown.value, direction, props.bounds)
  clearTimeout(timer)
  timer = setTimeout(commit, SETTLE_MS)
}
function typed(event) {
  const value = typedNumber(event.target.value, props.bounds)
  if (value === null) {
    // Nothing typed: the field shows what it had.
    event.target.value = shown.value === 0 && props.zeroLabel ? '' : shown.value
    return
  }
  shown.value = value
  event.target.value = value === 0 && props.zeroLabel ? '' : value
  commit()
}
// A change still settling when the row closes is sent, not lost.
onBeforeUnmount(() => timer && commit())
</script>
