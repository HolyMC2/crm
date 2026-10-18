<template>
  <!-- The visual dot of a list row that is itself role="radio" (M3 list
       item with a leading radio); the row carries the state for readers. -->
  <span
    class="flex size-10 flex-none items-center justify-center"
    aria-hidden="true"
  >
    <span
      class="flex size-5 items-center justify-center rounded-full border-2"
      :class="on ? 'border-ink-gray-9' : 'border-outline-gray-3'"
    >
      <span v-if="on" class="size-2.5 rounded-full bg-ink-gray-9" />
    </span>
  </span>
</template>
<script setup>
defineProps({ on: { type: Boolean, default: false } })
</script>
