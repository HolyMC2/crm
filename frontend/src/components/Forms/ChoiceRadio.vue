<template>
  <!-- radio drawn with theme tokens (the native control's checked fill vanished
       in dark mode): selected = solid disc with a hole, clear in both themes -->
  <span
    class="flex size-4 shrink-0 items-center justify-center rounded-full border"
    :class="
      checked
        ? 'border-transparent bg-surface-gray-9'
        : 'border-outline-gray-4 bg-surface-base'
    "
    aria-hidden="true"
  >
    <span v-if="checked" class="size-1.5 rounded-full bg-surface-base" />
  </span>
</template>

<script setup>
defineProps({ checked: { type: Boolean, default: false } })
</script>
