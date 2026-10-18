<template>
  <!-- M3 switch: a 52×32 track, 44px touch target. -->
  <button
    :id="id"
    type="button"
    role="switch"
    :aria-checked="String(modelValue)"
    :aria-label="label"
    :disabled="disabled"
    class="flex size-11 flex-none items-center justify-center disabled:opacity-50"
    :class="wide ? 'w-14' : ''"
    data-ajustes-switch
    @click.stop.prevent="emit('update:modelValue', !modelValue)"
  >
    <span
      class="relative inline-flex h-8 w-[52px] items-center rounded-full border-2 transition-colors"
      :class="
        modelValue
          ? 'border-transparent bg-surface-gray-9'
          : 'border-outline-gray-4 bg-surface-gray-2'
      "
    >
      <span
        class="absolute rounded-full transition-all"
        :class="
          modelValue
            ? 'left-[22px] size-6 bg-surface-base'
            : 'left-1 size-4 bg-surface-gray-6'
        "
      />
    </span>
  </button>
</template>
<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, default: '' },
  id: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
  wide: { type: Boolean, default: true },
})
const emit = defineEmits(['update:modelValue'])
</script>
