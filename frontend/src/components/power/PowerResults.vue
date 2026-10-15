<template>
  <!-- One line per row of a bulk action: what happened, and for a row that
       did not go through, why and the way to resolve it. -->
  <div class="space-y-2" data-power-results>
    <p class="text-sm font-medium text-ink-gray-8" role="status">
      {{ summary }}
    </p>
    <ul class="max-h-80 divide-y divide-outline-gray-1 overflow-y-auto">
      <li
        v-for="entry in results"
        :key="entry.key"
        class="flex items-start gap-2 py-2 text-sm"
        :data-result="entry.status"
      >
        <FeatherIcon
          :name="ICONS[entry.status] || 'circle'"
          class="mt-0.5 h-4 w-4 shrink-0"
          :class="TONES[entry.status] || 'text-ink-gray-6'"
        />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium text-ink-gray-9">{{
            entry.label
          }}</span>
          <span class="block text-ink-gray-7">{{ entry.detail }}</span>
        </span>
        <Button
          v-if="entry.status === 'blocked' || entry.status === 'unknown'"
          size="sm"
          class="min-h-11 shrink-0 sm:min-h-7"
          :label="
            entry.status === 'unknown'
              ? __('Check result')
              : entry.actionLabel || __('Open')
          "
          @click="$emit(entry.status === 'unknown' ? 'retry' : 'open', entry)"
        />
      </li>
    </ul>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { Button, FeatherIcon } from 'frappe-ui'
import { bulkCounts } from '@/utils/powerList'

const props = defineProps({
  results: { type: Array, default: () => [] },
  doneLabel: { type: String, default: '' },
})
defineEmits(['open', 'retry'])
const ICONS = {
  done: 'check-circle',
  already: 'check',
  blocked: 'alert-circle',
  unknown: 'help-circle',
}
const TONES = {
  done: 'text-ink-green-7',
  already: 'text-ink-gray-6',
  blocked: 'text-ink-red-7',
  unknown: 'text-ink-amber-9',
}
const summary = computed(() => {
  const counts = bulkCounts(props.results)
  const parts = []
  if (counts.done)
    parts.push(`${props.doneLabel || __('Done')}: ${counts.done}`)
  if (counts.already) parts.push(__('{0} already done', [counts.already]))
  if (counts.blocked) parts.push(__('{0} to resolve', [counts.blocked]))
  if (counts.unknown) parts.push(__('{0} without an answer', [counts.unknown]))
  return parts.join(' · ')
})
</script>
