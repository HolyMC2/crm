<template>
  <!-- The bags one step acts on: seal and, when the step shows it, amount. -->
  <ul
    class="max-h-48 divide-y divide-outline-gray-1 overflow-y-auto rounded-6 bg-surface-gray-1 text-sm"
    :aria-label="label"
    data-efectivo-items
  >
    <li
      v-for="item in items"
      :key="item.key"
      class="flex min-h-10 items-center justify-between gap-3 px-3 py-2"
    >
      <span class="truncate font-medium text-ink-gray-9">{{ item.title }}</span>
      <span
        v-if="item.meta"
        class="num flex-none whitespace-nowrap text-ink-gray-7"
        >{{ item.meta }}</span
      >
    </li>
  </ul>
</template>
<script setup>
defineProps({
  /** [{ key, title, meta? }] */
  items: { type: Array, default: () => [] },
  label: { type: String, default: 'Bolsas' },
})
</script>
