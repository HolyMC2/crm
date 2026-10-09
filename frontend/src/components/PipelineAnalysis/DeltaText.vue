<!-- Period-over-period change, calm: muted colour, sign and unit carry the meaning. -->
<template>
  <span
    v-if="value != null"
    class="whitespace-nowrap text-xs tabular-nums"
    :class="tone"
    :title="__('Cambio contra el período anterior')"
  >
    {{ text }}
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { money } from '@/utils/numberFormat'

const props = defineProps({
  value: { type: Number, default: null },
  // count | pp (percentage points) | money
  kind: { type: String, default: 'count' },
  currency: { type: String, default: null },
  // up: an increase is good · down: a decrease is good · none: no judgement
  good: { type: String, default: 'up' },
})

const rounded = computed(() =>
  props.kind === 'pp'
    ? Math.round(props.value * 10) / 10
    : Math.round(props.value),
)
const text = computed(() => {
  const n = rounded.value
  if (n === 0) return __('sin cambio')
  const sign = n > 0 ? '+' : '−'
  const abs = Math.abs(n)
  if (props.kind === 'pp') return __('{0}{1} pts', [sign, abs])
  if (props.kind === 'money') return sign + money(abs, props.currency)
  return sign + abs
})
const tone = computed(() => {
  const n = rounded.value
  if (!n || props.good === 'none') return 'text-ink-gray-5'
  const better = props.good === 'up' ? n > 0 : n < 0
  return better ? 'text-ink-green-6' : 'text-ink-red-7'
})
</script>
