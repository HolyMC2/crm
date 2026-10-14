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
        <p class="text-ink-gray-7">
          {{
            row.fields?.length
              ? __('Changed: {0}', [row.fields.map(fieldLabel).join(', ')])
              : __('Created the article')
          }}
        </p>
      </li>
    </ol>
    <p class="mt-4 text-xs text-ink-gray-6">
      {{ __('Each save keeps the previous text in the history.') }}
    </p>
  </ManualSheet>
</template>
<script setup>
import ManualSheet from '@/components/manual/ManualSheet.vue'
import { locale } from '@/composables/useManual'

defineProps({
  history: { type: Array, default: () => [] },
  title: { type: String, default: '' },
})
const emit = defineEmits(['close'])
const LABELS = {
  title: 'Title',
  category: 'Category',
  summary: 'What it is for',
  body: 'Article',
  status: 'Status',
  published_on: 'Published on',
  company: 'Company',
  place: 'Where it is done',
  audience: 'Who reads it',
}
function fieldLabel(field) {
  return LABELS[field] ? __(LABELS[field], null, 'Manual') : field
}
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
