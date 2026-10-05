<template>
  <!-- sticky: Desk floating launchers (doco floating_dock.js) rise above fixed/sticky bottom bars. -->
  <nav
    class="sticky bottom-0 flex shrink-0 items-stretch border-t border-outline-gray-1 bg-surface-base pb-[env(safe-area-inset-bottom)]"
    :aria-label="__('Main navigation')"
  >
    <RouterLink
      v-for="module in slots"
      :key="module.key"
      :to="module.to"
      class="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium"
      :class="module.key === active ? 'text-ink-gray-9' : 'text-ink-gray-6'"
      :aria-current="module.key === active ? 'page' : undefined"
    >
      <span
        class="flex h-7 w-12 items-center justify-center rounded-full"
        :class="module.key === active ? 'bg-surface-gray-3' : ''"
        aria-hidden="true"
      >
        <span :class="[module.icon, 'size-5']" />
      </span>
      {{ module.label }}
    </RouterLink>
    <button
      class="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-gray-6"
      aria-haspopup="dialog"
      @click="$emit('more')"
    >
      <span
        class="flex h-7 w-12 items-center justify-center"
        aria-hidden="true"
      >
        <span class="lucide-menu size-5" />
      </span>
      {{ __('More') }}
    </button>
  </nav>
</template>
<script setup>
defineProps({
  slots: { type: Array, default: () => [] },
  active: { type: String, default: '' },
})
defineEmits(['more'])
</script>
