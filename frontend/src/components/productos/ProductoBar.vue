<template>
  <!-- Phone: Etiqueta · Conteo · Precios at the thumb (Mercado's item card,
       design/refs/wave-d/item-card). The route's meta.ownBottomBar gives it the
       nav's place; the AppBar's back arrow leads out. -->
  <div
    class="sticky bottom-0 z-20 mt-auto border-t border-outline-gray-2 bg-surface-base px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-lg"
    data-producto-bar
  >
    <div class="flex gap-2">
      <button
        v-for="entry in actions"
        :key="entry.key"
        type="button"
        class="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
        :class="[
          entry.primary
            ? 'border-transparent bg-surface-gray-10 text-ink-base'
            : 'border-outline-gray-3 bg-surface-base text-ink-gray-8 active:bg-surface-gray-2',
          entry.enabled === false && !entry.resolve ? 'opacity-60' : '',
        ]"
        :title="entry.title || entry.reason || undefined"
        :data-action="entry.key"
        @click="emit('run', entry)"
      >
        <!-- Below 360px the three words need the whole button. -->
        <Icon :icon="entry.icon" class="h-4 w-4 shrink-0 max-[359px]:hidden" />
        <span class="truncate">{{ entry.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import Icon from '@/components/Icon.vue'

defineProps({ actions: { type: Array, required: true } })
const emit = defineEmits(['run'])
</script>
