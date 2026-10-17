<template>
  <!-- One KPI tile (Shell SPEC §2.2, MOBILE_REFERENCES pattern 7): a
       sentence-case label over a large value that wraps instead of clipping.
       Colour only when the number asks for action. With `to` the whole tile
       is the link. Lay tiles out in a KpiGrid (2-up, 1-up when narrow). -->
  <UiTag
    :as="to ? RouterLink : 'div'"
    :to="to || undefined"
    class="flex min-h-[5.5rem] min-w-0 flex-col gap-1 rounded-xl border border-outline-gray-1 bg-surface-base px-4 py-3"
    :class="to ? 'hover:bg-surface-gray-1' : ''"
    data-ui-kpi
  >
    <span class="break-words text-sm leading-snug text-ink-gray-6">{{
      label
    }}</span>
    <span
      class="break-words text-2xl font-semibold leading-tight tabular-nums"
      :class="TONE[tone] || TONE.neutral"
      >{{ value }}</span
    >
    <span
      v-if="hint"
      class="break-words text-sm leading-snug text-ink-gray-6"
      >{{ hint }}</span
    >
  </UiTag>
</template>
<script setup>
import UiTag from './UiTag'
import { RouterLink } from 'vue-router'
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '' },
  hint: { type: String, default: '' },
  /** 'neutral' | 'danger' (owed, overdue) | 'warning' (waiting) | 'success' */
  tone: { type: String, default: 'neutral' },
  to: { type: [String, Object], default: null },
})
const TONE = {
  neutral: 'text-ink-gray-9',
  danger: 'text-ink-red-7',
  warning: 'text-ink-amber-8',
  success: 'text-ink-green-8',
}
</script>
