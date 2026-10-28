<!-- Vendored from muelle/workspace/packages/ui@0.1.0 (ce74d3b9f43a). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<template>
  <!-- One KPI tile (Shell SPEC §2.2, MOBILE_REFERENCES pattern 7): a
       sentence-case label over a large value that wraps instead of clipping.
       Colour only when the number asks for action. With `to` the whole tile
       is the link; with `pressed` (true/false) it is a toggle button (a
       list's status). Lay tiles out in a KpiGrid (2-up, 1-up when narrow). -->
  <UiTag
    :as="to ? RouterLink : toggle ? 'button' : 'div'"
    :to="to || undefined"
    :type="toggle ? 'button' : undefined"
    :aria-pressed="toggle ? String(pressed) : undefined"
    class="flex min-h-[5.5rem] min-w-0 flex-col gap-1 rounded-7 border px-4 py-3 text-left"
    :class="[
      pressed
        ? 'border-[var(--muelle-accent)] bg-[var(--muelle-accent-soft)]'
        : 'border-outline-gray-1 bg-surface-base',
      to || toggle ? 'press hover:bg-surface-gray-1' : '',
    ]"
    data-ui-kpi
  >
    <span class="break-words text-sm leading-snug text-ink-gray-6">{{
      label
    }}</span>
    <span
      class="num break-words text-4xl font-semibold leading-none"
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
import { computed } from 'vue'
import UiTag from './UiTag'
import { RouterLink } from 'vue-router'
const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '' },
  hint: { type: String, default: '' },
  /** 'neutral' | 'danger' (owed, overdue) | 'warning' (waiting) | 'success' */
  tone: { type: String, default: 'neutral' },
  to: { type: [String, Object], default: null },
  /** true/false: a toggle button (aria-pressed); null: not pressable */
  pressed: { type: Boolean, default: null },
})
const toggle = computed(() => props.pressed !== null)
const TONE = {
  neutral: 'text-ink-gray-9',
  danger: 'text-ink-red-7',
  warning: 'text-ink-amber-8',
  success: 'text-ink-green-8',
}
</script>
