<template>
  <!-- The visual box of a list row that is itself role="checkbox" (M3 list
       item with a trailing checkbox); the row carries the state for readers. -->
  <span
    class="mt-1 flex size-5 flex-none items-center justify-center rounded-[3px] border-2"
    :class="
      on
        ? 'border-transparent bg-surface-gray-10 text-ink-base'
        : 'border-outline-gray-4'
    "
    aria-hidden="true"
  >
    <svg
      v-if="on"
      viewBox="0 0 24 24"
      class="size-4"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  </span>
</template>
<script setup>
defineProps({ on: { type: Boolean, default: false } })
</script>
