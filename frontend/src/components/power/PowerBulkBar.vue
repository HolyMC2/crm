<template>
  <!-- The selection's actions: at the thumb on a phone, under the list on a desk. -->
  <div
    class="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t border-outline-gray-2 bg-surface-base px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-lg sm:px-6"
    role="region"
    :aria-label="label"
    data-power-bulkbar
  >
    <p class="min-w-0 flex-1 text-sm font-medium">
      {{ count === 1 ? __('1 selected') : __('{0} selected', [count]) }}
    </p>
    <slot />
    <Button
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
  label: { type: String, default: '' },
})
defineEmits(['clear'])
</script>
