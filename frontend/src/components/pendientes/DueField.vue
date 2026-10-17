<template>
  <div class="space-y-2">
    <!-- The phone's own date picker, shown in the worker's locale (never «2026-10-17»). -->
    <label class="block space-y-1.5">
      <span class="block text-xs text-ink-gray-5">{{ __('Due') }}</span>
      <input
        type="date"
        :value="modelValue"
        class="block min-h-11 w-full rounded border-0 bg-surface-gray-2 px-2 text-base text-ink-gray-8 sm:min-h-8 sm:text-sm"
        @input="$emit('update:modelValue', $event.target.value)"
      />
    </label>
    <div
      class="flex flex-wrap gap-2"
      role="group"
      :aria-label="__('Quick dates')"
    >
      <Button
        v-for="preset in datePresets(today)"
        :key="preset.value"
        :label="preset.label"
        :variant="modelValue === preset.value ? 'subtle' : 'ghost'"
        :aria-pressed="modelValue === preset.value"
        class="min-h-11 sm:min-h-8"
        @click="$emit('update:modelValue', preset.value)"
      />
    </div>
  </div>
</template>
<script setup>
import { Button } from 'frappe-ui'
import { datePresets } from '@/composables/usePendientes'

defineProps({
  modelValue: { type: String, default: '' },
  today: { type: String, default: '' },
})
defineEmits(['update:modelValue'])
</script>
