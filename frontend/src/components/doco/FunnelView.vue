<!--
  Simple horizontal funnel for the doco list pages. `groups` is the ordered status
  list; `counts` is an aggregate map { value: { count, value? } }. Bars are scaled
  to the largest stage; the trailing column shows share of current records.
-->
<template>
  <div class="scb min-h-0 flex-1 overflow-y-auto p-5">
    <div class="mx-auto max-w-[680px] space-y-2.5">
      <div v-for="g in groups" :key="g.value" class="flex items-center gap-3">
        <div
          class="w-[140px] flex-none truncate text-[12.5px] font-medium text-ink-gray-7"
        >
          <span
            class="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
            :style="`background:${g.color || 'var(--surface-gray-4)'}`"
          />
          {{ g.label }}
        </div>
        <div class="h-7 flex-1 overflow-hidden rounded-md bg-surface-gray-1">
          <div
            class="flex h-full items-center justify-end rounded-md px-2 text-[11px] font-semibold text-white transition-all"
            :style="`width:${pct(g.value)}%;min-width:34px;background:${g.color || 'var(--surface-gray-4)'}`"
          >
            {{ countOf(g.value) }}
          </div>
        </div>
        <div class="w-[64px] flex-none text-right text-[11px] text-ink-gray-5">
          <span>{{ shareOf(g.value) }}%</span>
        </div>
      </div>
      <p v-if="total" class="pt-3 text-[11px] text-ink-gray-5">
        {{
          __(
            'Current stage distribution; percentages are shares of the total, not conversion rates.',
          )
        }}
      </p>
      <div v-if="!total" class="py-10 text-center text-xs text-ink-gray-4">
        {{ __('Sin datos') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  groups: { type: Array, default: () => [] },
  counts: { type: Object, default: () => ({}) },
})

function countOf(v) {
  return props.counts[v]?.count ?? 0
}
const maxCount = computed(() =>
  Math.max(1, ...props.groups.map((g) => countOf(g.value))),
)
const total = computed(() =>
  props.groups.reduce((s, g) => s + countOf(g.value), 0),
)
function pct(v) {
  return Math.round((countOf(v) / maxCount.value) * 100)
}
function shareOf(value) {
  return total.value ? Math.round((countOf(value) / total.value) * 100) : 0
}
</script>
