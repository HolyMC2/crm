<template>
  <!-- The on/off switch of a Disparadores card (same look as RecipeCard's):
       a 44px target, role="switch", the label says what tapping does. -->
  <button
    type="button"
    role="switch"
    :aria-checked="on ? 'true' : 'false'"
    :aria-label="`${on ? 'Apagar' : 'Encender'}: ${label}`"
    :disabled="disabled"
    class="flex min-h-11 min-w-11 flex-none items-center justify-center disabled:opacity-50"
    @click="$emit('toggle', !on)"
  >
    <span
      class="relative h-6 w-11 rounded-full transition-colors"
      :class="on ? 'bg-surface-gray-7' : 'bg-surface-gray-4'"
      aria-hidden="true"
    >
      <span
        class="absolute top-0.5 size-5 rounded-full bg-surface-base transition-all"
        :class="on ? 'left-[22px]' : 'left-0.5'"
      />
    </span>
  </button>
</template>
<script setup>
defineProps({
  on: { type: Boolean, default: false },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})
defineEmits(['toggle'])
</script>
