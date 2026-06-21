<!--
  Simple horizontal funnel for the doco list pages. `groups` is the ordered status
  list; `counts` is an aggregate map { value: { count, value? } }. Bars are scaled
  to the largest stage; the trailing column shows stage-to-stage conversion %.
-->
<template>
  <div class="scb min-h-0 flex-1 overflow-y-auto p-5">
    <div class="mx-auto max-w-[680px] space-y-2.5">
      <div v-for="(g, i) in groups" :key="g.value" class="flex items-center gap-3">
        <div class="w-[140px] flex-none truncate text-[12.5px] font-medium text-ink-gray-7">
          <span
            class="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
            :style="`background:${g.color || '#9aa2ae'}`"
          />
          {{ g.label }}
        </div>
        <div class="h-7 flex-1 overflow-hidden rounded-md bg-surface-gray-1">
          <div
            class="flex h-full items-center justify-end rounded-md px-2 text-[11px] font-semibold text-white transition-all"
            :style="`width:${pct(g.value)}%;min-width:34px;background:${g.color || '#9aa2ae'}`"
          >
            {{ countOf(g.value) }}
          </div>
        </div>
        <div class="w-[64px] flex-none text-right text-[11px] text-ink-gray-5">
          <span v-if="i > 0">{{ dropOff(i) }}</span>
        </div>
      </div>
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
function dropOff(i) {
  const prev = countOf(props.groups[i - 1].value)
  const cur = countOf(props.groups[i].value)
  if (!prev) return ''
  return `${Math.round((cur / prev) * 100)}%`
}
</script>
