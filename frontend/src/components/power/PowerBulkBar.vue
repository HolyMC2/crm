<template>
  <!-- The selection's actions: at the thumb on a phone, under the list on a desk. -->
  <div
    class="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t border-outline-gray-2 bg-surface-base px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg sm:px-6"
    role="region"
    :aria-label="label"
    data-power-bulkbar
  >
    <p
      class="min-w-0 text-sm font-medium"
      :class="stacked ? 'basis-full sm:flex-1 sm:basis-auto' : 'flex-1'"
      data-power-bulkbar-summary
    >
      {{
        summary ||
        (count === 1 ? __('1 selected') : __('{0} selected', [count]))
      }}
    </p>
    <slot />
    <Button
      v-if="clearable"
      variant="ghost"
      class="min-h-12 sm:min-h-8"
      :label="__('Clear selection')"
      @click="$emit('clear')"
    />
  </div>
</template>
<script setup>
import { Button } from 'frappe-ui'

defineProps({
  count: { type: Number, default: 0 },
  /** What the selection holds, in the page's words («3 bolsas · $6,633.00»); default «N selected». */
  summary: { type: String, default: '' },
  label: { type: String, default: '' },
  /** On a phone the summary takes its own line and the actions share the one under it. */
  stacked: { type: Boolean, default: false },
  /** Off when the page's bar already clears the selection (AppBar's ✕ while selecting). */
  clearable: { type: Boolean, default: true },
})
defineEmits(['clear'])
</script>
