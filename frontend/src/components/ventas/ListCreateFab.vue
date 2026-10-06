<!--
  Phone create action for Ventas lists. It sits bottom-centre, 16 px above the
  shell's bottom nav, inside the page (no fixed offset guessing the old tab
  bar's height), and clear of the right-hand column doco's floating dock uses
  for «Ayuda» and the assistant launchers.
-->
<template>
  <button
    type="button"
    data-testid="list-create-fab"
    class="press absolute bottom-4 left-1/2 z-10 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-surface-gray-7 px-5 text-base font-semibold text-ink-white shadow-lg"
    :aria-label="label"
    @click="$emit('create')"
  >
    <span aria-hidden="true" class="text-xl leading-none">+</span>
    {{ label }}
  </button>
</template>
<script setup>
defineProps({ label: { type: String, required: true } })
defineEmits(['create'])
</script>
