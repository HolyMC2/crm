<template>
  <!-- The kit's switch (components/ui/Switch.vue) for a settings row whose
       label the row draws itself: `label` is the switch's accessible name. -->
  <Switch
    :id="id"
    :model-value="modelValue"
    :aria-label="label || undefined"
    :disabled="disabled"
    :wide="wide"
    data-ajustes-switch
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
<script setup>
import Switch from '@/components/ui/Switch.vue'

defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, default: '' },
  id: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
  wide: { type: Boolean, default: true },
})
const emit = defineEmits(['update:modelValue'])
</script>
