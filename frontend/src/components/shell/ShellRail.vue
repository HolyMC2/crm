<template>
  <nav
    class="relative flex h-full w-14 flex-none flex-col items-center gap-1 border-r border-outline-gray-1 bg-surface-base py-3"
    :aria-label="__('Apps')"
  >
    <span
      class="mb-2 flex size-9 items-center justify-center rounded-lg bg-[var(--muelle-accent)] text-sm font-bold text-[var(--muelle-accent-ink)]"
      aria-hidden="true"
      >M</span
    >
    <button
      class="flex size-10 items-center justify-center rounded-lg text-ink-gray-6 hover:bg-surface-gray-2"
      :aria-label="__('Search (Ctrl K)')"
      :title="__('Search (Ctrl K)')"
      @click="$emit('palette')"
    >
      <span class="lucide-search size-[18px]" aria-hidden="true" />
    </button>
    <RouterLink
      v-for="module in modules"
      :key="module.key"
      :to="module.to"
      :title="module.label"
      :aria-label="module.label"
      :aria-current="module.key === active ? 'page' : undefined"
      class="flex size-10 items-center justify-center rounded-lg"
      :class="
        module.key === active
          ? 'bg-surface-gray-3 text-ink-gray-9'
          : 'text-ink-gray-6 hover:bg-surface-gray-2'
      "
    >
      <span :class="[module.icon, 'size-[18px]']" aria-hidden="true" />
    </RouterLink>
    <div class="mt-auto" />
    <!-- Ventas notifications: bell + panel beside the rail, loaded with Ventas. -->
    <VentasRailBell v-if="ventas" />
    <UserMenu :ventas="ventas" />
  </nav>
</template>
<script setup>
import { defineAsyncComponent } from 'vue'
import UserMenu from './UserMenu.vue'

defineProps({
  modules: { type: Array, default: () => [] },
  active: { type: String, default: '' },
  ventas: Boolean,
})
defineEmits(['palette'])

const VentasRailBell = defineAsyncComponent(
  () => import('./VentasRailBell.vue'),
)
</script>
