<template>
  <div>
    <FormControl
      type="select"
      :label="__('Where it is done')"
      :model-value="modelValue"
      :options="options"
      data-testid="manual-place-picker"
      @update:model-value="(value) => emit('update:modelValue', value || '')"
    />
    <p class="mt-1 text-xs text-ink-gray-6">
      {{
        current
          ? __('The article shows the button «{0}».', [current.action])
          : __('Optional: the Muelle screen where this step is done.')
      }}
    </p>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { FormControl } from 'frappe-ui'

const props = defineProps({
  modelValue: { type: String, default: '' },
  places: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])
const options = computed(() => [
  { label: __('Nowhere in particular'), value: '' },
  ...props.places.map((place) => ({
    label: `${place.label} — ${place.action}`,
    value: place.key,
  })),
])
const current = computed(() =>
  props.places.find((place) => place.key === props.modelValue),
)
</script>
