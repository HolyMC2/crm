<!-- Vendored from muelle/workspace/packages/ui@0.3.0 (52d6d25388e7). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<template>
  <!-- A status in es-MX words (utils/display statusLabel), coloured only when
       the worker must act: the four hues are the status token pairs of
       @muelle/tokens (tested at AA in both themes), neutral is a tonal pill
       that still shows on a container. Put it on a row only when it changes
       what the worker does (MOBILE_REFERENCES pattern 8). -->
  <span
    class="inline-flex h-6 max-w-full items-center rounded-full px-2 text-xs font-medium"
    :class="TONES[resolvedTone] || TONES.neutral"
    :data-tone="resolvedTone"
    data-ui-status
  >
    <span class="truncate">{{ text }}</span>
  </span>
</template>
<script setup>
import { computed } from 'vue'
import { statusLabel, statusTone } from './host'

const props = defineProps({
  /** The stored status («Completed», «Overdue», «No Answer»…). */
  status: { type: String, default: '' },
  /** What it describes, when the word depends on it: 'call', 'campaign', 'task'. */
  kind: { type: String, default: '' },
  /** Overrides: an already-worded label or a tone. */
  label: { type: String, default: '' },
  tone: { type: String, default: '' },
})
const TONES = {
  neutral: 'bg-surface-gray-3 text-[var(--muelle-on-surface-variant)]',
  info: 'bg-[var(--muelle-status-blue-bg)] text-[var(--muelle-status-blue-ink)]',
  success:
    'bg-[var(--muelle-status-green-bg)] text-[var(--muelle-status-green-ink)]',
  warning:
    'bg-[var(--muelle-status-orange-bg)] text-[var(--muelle-status-orange-ink)]',
  danger: 'bg-[var(--muelle-status-red-bg)] text-[var(--muelle-status-red-ink)]',
}
const text = computed(
  () => props.label || statusLabel(props.status, props.kind || undefined),
)
const resolvedTone = computed(
  () => props.tone || statusTone(props.status, props.kind || undefined),
)
</script>
