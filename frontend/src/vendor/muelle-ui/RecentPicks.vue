<!-- Vendored from muelle/workspace/packages/ui@0.1.0 (1ceb2df0a0ad). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<!-- «Recientes» as bubbles, four to a row (WhatsApp's recent searches): one
     tap back into a record. Neutral initials, two-line names. -->
<template>
  <section
    v-if="picks.length"
    :aria-label="t('Recientes')"
    data-testid="recent-picks"
  >
    <div class="mb-1 flex items-center justify-between">
      <p class="text-xs font-medium text-ink-gray-6">{{ t('Recientes') }}</p>
      <button
        type="button"
        class="-mr-2 min-h-11 px-2 text-xs font-medium text-ink-gray-6 hover:text-ink-gray-9"
        @click="$emit('clear')"
      >
        {{ t('Borrar todo') }}
      </button>
    </div>
    <div class="grid grid-cols-4 gap-x-1 gap-y-2">
      <button
        v-for="pick in picks"
        :key="(pick.doctype || '') + pick.name"
        type="button"
        class="press flex min-w-0 flex-col items-center gap-1 rounded-8 px-0.5 py-1 hover:bg-surface-gray-2"
        @click="$emit('pick', pick)"
      >
        <span
          class="flex size-12 items-center justify-center rounded-full bg-surface-gray-3 text-sm font-semibold text-ink-gray-7"
          aria-hidden="true"
          >{{ initialsOf(pick.label) }}</span
        >
        <span
          class="line-clamp-2 w-full break-words text-center text-[11px] leading-tight text-ink-gray-8"
          >{{ pick.label }}</span
        >
      </button>
    </div>
  </section>
</template>

<script setup>
import { t } from './host'
defineProps({
  // from useRecentPicks().picks
  picks: { type: Array, default: () => [] },
})
defineEmits(['pick', 'clear'])

// Two letters from the first two words; a phone number shows its last two digits.
function initialsOf(label) {
  const text = String(label || '').trim()
  if (/^[+\d\s()-]+$/u.test(text)) return text.replace(/\D/gu, '').slice(-2)
  const words = text.split(/\s+/u).filter(Boolean)
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}
</script>
