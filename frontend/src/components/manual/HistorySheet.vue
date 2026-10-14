<template>
  <ManualSheet :title="__('History of «{0}»', [title])" @close="emit('close')">
    <p v-if="!history.length" class="text-sm text-ink-gray-7">
      {{ __('No changes recorded yet.') }}
    </p>
    <ol v-else class="space-y-3" data-testid="manual-history-list">
      <li
        v-for="(row, index) in history"
        :key="index"
        class="rounded-lg border border-outline-gray-2 p-3 text-sm"
      >
        <p class="font-medium text-ink-gray-9">
          {{ row.who }} · {{ when(row.when) }}
        </p>
        <p class="text-ink-gray-7">{{ historyLine(row) }}</p>
      </li>
    </ol>
    <!-- Frappe keeps every Version row; the form reads the newest 10 (review F6). -->
    <p class="mt-4 text-xs text-ink-gray-6">
      {{
        __(
          'Here you see the last 10 changes. Each save keeps the previous text in the history.',
        )
      }}
    </p>
  </ManualSheet>
</template>
<script setup>
import ManualSheet from '@/components/manual/ManualSheet.vue'
import { historyLine, locale } from '@/composables/useManual'

defineProps({
  history: { type: Array, default: () => [] },
  title: { type: String, default: '' },
})
const emit = defineEmits(['close'])
function when(value) {
  const at = Date.parse(
    String(value || '')
      .replace(' ', 'T')
      .slice(0, 19),
  )
  if (Number.isNaN(at)) return ''
  return new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at)
}
</script>
