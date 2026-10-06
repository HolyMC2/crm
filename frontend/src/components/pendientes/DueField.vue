<template>
  <div class="space-y-2">
    <FormControl
      :model-value="modelValue"
      type="date"
      :label="__('Due')"
      @update:model-value="$emit('update:modelValue', $event)"
    />
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
import { Button, FormControl } from 'frappe-ui'
import { datePresets } from '@/composables/usePendientes'

defineProps({
  modelValue: { type: String, default: '' },
  today: { type: String, default: '' },
})
defineEmits(['update:modelValue'])
</script>
