<template>
  <!-- one shared pill toggle for the Forms screens: the selected option keeps a
       border and weight in both themes, not just a shade change -->
  <div
    class="flex items-center gap-0.5 self-start rounded-full bg-surface-gray-2 p-0.5"
    role="radiogroup"
    :aria-label="label"
  >
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="radio"
      class="flex items-center gap-1 rounded-full border px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-4"
      :class="
        modelValue === o.value
          ? 'border-outline-gray-4 bg-surface-base font-medium text-ink-gray-9 shadow-sm'
          : 'border-transparent text-ink-gray-6 hover:text-ink-gray-8'
      "
      :aria-checked="modelValue === o.value"
      @click="$emit('update:modelValue', o.value)"
    >
      <component :is="o.icon" v-if="o.icon" class="size-3.5" />
      {{ o.label }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: [String, Number, Boolean], default: '' },
  options: { type: Array, required: true },
  label: { type: String, default: '' },
})
defineEmits(['update:modelValue'])
</script>
