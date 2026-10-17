<template>
  <!-- A status in es-MX words (utils/display statusLabel), coloured only when
       the worker must act. Put it on a row only when it changes what the
       worker does (MOBILE_REFERENCES pattern 8). -->
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
import { statusLabel, statusTone } from '@/utils/display'

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
  neutral: 'bg-surface-gray-2 text-ink-gray-7',
  info: 'bg-surface-blue-1 text-ink-blue-9',
  success: 'bg-surface-green-1 text-ink-green-8',
  warning: 'bg-surface-amber-1 text-ink-amber-9',
  danger: 'bg-surface-red-1 text-ink-red-7',
}
const text = computed(
  () => props.label || statusLabel(props.status, props.kind || undefined),
)
const resolvedTone = computed(
  () => props.tone || statusTone(props.status, props.kind || undefined),
)
</script>
