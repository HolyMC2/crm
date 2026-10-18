<template>
  <!-- The visual dot of a list row that is itself role="radio" (M3 list
       item with a leading radio); the row carries the state for readers.
       Surface tokens only: the ink-* colours are text-only utilities. -->
  <span
    class="flex size-10 flex-none items-center justify-center"
    aria-hidden="true"
  >
    <span
      v-if="on"
      class="flex size-5 items-center justify-center rounded-full bg-surface-gray-10"
    >
      <span class="size-2 rounded-full bg-surface-base" />
    </span>
    <span v-else class="size-5 rounded-full border-2 border-outline-gray-4" />
  </span>
</template>
<script setup>
defineProps({ on: { type: Boolean, default: false } })
</script>
