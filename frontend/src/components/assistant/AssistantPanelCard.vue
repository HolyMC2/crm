<template>
  <!-- One of the workspace's side panels: a card with its title, a count and
       a fold; the fold is remembered (AssistantSidePanels). -->
  <section
    class="rounded-8 border border-outline-gray-1 bg-surface-base shadow-sm"
    :data-panel="name"
  >
    <h3>
      <button
        type="button"
        class="press flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-semibold text-ink-gray-9"
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
          v-if="count"
          class="num min-w-5 flex-none rounded-full bg-[var(--brand-soft)] px-1.5 text-center text-xs font-semibold leading-5 text-ink-gray-9"
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
      <div v-if="open" class="border-t border-outline-gray-1 px-3 pb-3">
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
  open: { type: Boolean, default: true },
})
defineEmits(['update:open'])
</script>
