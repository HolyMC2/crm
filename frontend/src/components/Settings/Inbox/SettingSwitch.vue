<template>
  <!-- A Check field as a switch row: what it does, why, and (when it cannot be
       turned on) what to do first. Emits 1 or 0, as the document stores it. -->
  <div class="flex items-start justify-between gap-3 py-1">
    <div class="min-w-0 flex-1">
      <label
        :for="id"
        class="block text-p-base-medium text-ink-gray-8 [overflow-wrap:anywhere]"
        >{{ label }}</label
      >
      <p v-if="description" class="text-p-sm text-ink-gray-5">
        {{ description }}
      </p>
      <p v-if="blocked" class="text-p-sm text-ink-gray-7">{{ blocked }}</p>
    </div>
    <AjustesSwitch
      :id="id"
      :model-value="!!modelValue"
      :label="label"
      :disabled="disabled"
      @update:model-value="(value) => emit('update:modelValue', value ? 1 : 0)"
    />
  </div>
</template>
<script setup>
import { useId } from 'vue'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'

defineProps({
  modelValue: { type: [Boolean, Number], default: 0 },
  label: { type: String, required: true },
  description: { type: String, default: '' },
  /** Why it cannot change now and what to do first; shown under the description. */
  blocked: { type: String, default: '' },
  disabled: Boolean,
})
const emit = defineEmits(['update:modelValue'])
const id = useId()
</script>
