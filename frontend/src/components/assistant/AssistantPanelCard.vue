<template>
  <!-- One of the workspace's side panels: a section with its title, a count
       and a fold; the fold is remembered (AssistantSidePanels). What waits
       counts on the accent badge; a tally is a plain figure. -->
  <section :data-panel="name">
    <h3>
      <button
        type="button"
        class="press flex min-h-12 w-full items-center gap-2.5 px-4 text-left text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-1"
        :aria-expanded="open"
        @click="$emit('update:open', !open)"
      >
        <span
          :class="icon"
          class="size-4 flex-none text-ink-gray-6"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1 truncate">{{ title }}</span>
        <span
          v-if="count && quiet"
          class="num flex-none text-xs text-ink-gray-5"
          >{{ count }}</span
        >
        <span
          v-else-if="count"
          class="num min-w-5 flex-none rounded-full bg-[var(--muelle-accent)] px-1.5 text-center text-xs font-semibold leading-5 text-[var(--muelle-accent-ink)]"
          >{{ count > 99 ? '99+' : count }}</span
        >
        <span
          class="lucide-chevron-down size-4 flex-none text-ink-gray-5 transition-transform"
          :class="open ? '' : '-rotate-90'"
          aria-hidden="true"
        />
      </button>
    </h3>
    <ExpandTransition>
      <div v-if="open" class="px-4 pb-4">
        <slot />
      </div>
    </ExpandTransition>
  </section>
</template>
<script setup>
import ExpandTransition from '@/components/ui/ExpandTransition.vue'

defineProps({
  name: { type: String, required: true },
  title: { type: String, required: true },
  /** a literal lucide-* class, so the icon is generated */
  icon: { type: String, required: true },
  count: { type: Number, default: 0 },
  /** a tally (files), not work waiting: plain figure, no badge */
  quiet: { type: Boolean, default: false },
  open: { type: Boolean, default: true },
})
defineEmits(['update:open'])
</script>
