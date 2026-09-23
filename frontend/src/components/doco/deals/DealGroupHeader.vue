<!--
  One collapsible group header in the deals list.

  `exact` is the honest bit: the stage groups carry the server's filtered count,
  every other dimension is counted off the rows that are loaded, so the header
  says «cargados» instead of pretending to be the total.
-->
<template>
  <button
    type="button"
    class="flex w-full items-center border-b border-outline-gray-1 bg-surface-gray-2 py-1.5 text-left hover:bg-surface-gray-3"
    :aria-expanded="!collapsed"
    @click="$emit('toggle')"
  >
    <!-- the row grid side-scrolls; the group's identity stays at the left edge -->
    <span class="sticky left-0 flex min-w-0 items-center gap-2 px-5">
      <span
        class="w-3 flex-none text-[10px] text-ink-gray-5"
        aria-hidden="true"
        >{{ collapsed ? '▸' : '▾' }}</span
      >
      <span
        v-if="color"
        class="h-2 w-2 flex-none rounded-full"
        :style="`background:${color}`"
      />
      <span class="truncate text-[12px] font-semibold text-ink-gray-8">{{
        label || emptyLabel
      }}</span>
      <span
        class="flex-none rounded-full bg-surface-gray-3 px-2 py-px text-[11px] font-semibold text-ink-gray-6"
        >{{ count }}</span
      >
      <span v-if="!exact" class="flex-none text-[11px] text-ink-gray-4">{{
        __('cargados')
      }}</span>
    </span>
  </button>
</template>

<script setup>
defineProps({
  label: { type: String, default: '' },
  emptyLabel: { type: String, default: () => __('Sin asignar') },
  count: { type: Number, default: 0 },
  // false when the count only covers the loaded page
  exact: { type: Boolean, default: true },
  collapsed: { type: Boolean, default: false },
  color: { type: String, default: '' },
})
defineEmits(['toggle'])
</script>
