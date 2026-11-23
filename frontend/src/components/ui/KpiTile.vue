<!-- Vendored from muelle/workspace/packages/ui@0.2.0 (994848826b28). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<template>
  <!-- One KPI tile (Shell SPEC §2.2, MOBILE_REFERENCES pattern 7): a
       sentence-case label over a large value that wraps instead of clipping,
       on a tonal tile (container-low, 20 px corners, no border). Colour only
       when the number asks for action. With `to` the whole tile is the link;
       with `pressed` (true/false) it is a toggle button (a list's status),
       on the secondary container while it is on. Lay tiles out in a KpiGrid
       (2-up, 1-up when narrow). -->
  <UiTag
    :as="to ? RouterLink : toggle ? 'button' : 'div'"
    :to="to || undefined"
    :type="toggle ? 'button' : undefined"
    :aria-pressed="toggle ? String(pressed) : undefined"
    class="flex min-h-[5.5rem] min-w-0 flex-col gap-1 rounded-7 px-4 py-3 text-left"
    :class="[
      pressed
        ? 'bg-[var(--muelle-secondary-container)] text-[var(--muelle-on-secondary-container)]'
        : 'bg-surface-gray-1 text-[var(--muelle-on-surface-variant)]',
      to || toggle ? 'press' : '',
    ]"
    data-ui-kpi
  >
    <span class="break-words text-sm leading-snug">{{ label }}</span>
    <span
      class="num break-words text-4xl font-semibold leading-none"
      :class="TONE[tone] || TONE.neutral"
      >{{ value }}</span
    >
    <span v-if="hint" class="break-words text-sm leading-snug">{{
      hint
    }}</span>
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
