<!-- The full-height strip that folds or shows a desktop inbox pane. -->
<template>
  <button
    type="button"
    class="flex w-7 flex-none items-center justify-center border-outline-gray-1 text-ink-gray-4 hover:bg-surface-gray-2 hover:text-ink-gray-9"
    :class="side === 'left' ? 'border-r' : 'border-l'"
    :aria-label="label"
    :title="label"
    :aria-expanded="open"
  >
    {{ (side === 'left') === open ? '⟨' : '⟩' }}
  </button>
</template>
<script setup>
defineProps({
  /** Which edge of the thread the pane sits on. */
  side: { type: String, default: 'left' },
  open: { type: Boolean, default: false },
  label: { type: String, required: true },
})
</script>
