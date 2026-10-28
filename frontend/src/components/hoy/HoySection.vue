<template>
  <!-- An open section, not a card: a rule above, the count as a figure, the
       title, «Ver todos ›». On a phone it runs edge to edge (the page's 16px
       gutter is undone) so rows get the full width. An empty or unavailable
       section folds into its own heading line instead of a box. -->
  <section
    :aria-labelledby="headingId"
    class="-mx-4 border-t border-outline-gray-2 sm:mx-0"
    :aria-busy="skeleton || undefined"
  >
    <header
      class="flex min-h-12 items-center gap-x-3 px-4 pt-2.5 sm:px-5"
      :class="collapsed && !skeleton ? 'pb-2.5' : 'pb-0.5'"
    >
      <span
        v-if="count"
        class="num min-w-[1.25ch] flex-none text-4xl font-semibold leading-none text-ink-gray-9"
        aria-hidden="true"
        >{{ count }}</span
      >
      <span
        v-else
        :class="icon"
        class="size-5 shrink-0 text-ink-gray-6"
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1">
        <h2
          :id="headingId"
          class="title-face text-lg font-semibold leading-tight text-ink-gray-9 [text-wrap:balance]"
        >
          {{ title }}<span v-if="count" class="sr-only">, {{ count }}</span>
        </h2>
        <p
          v-if="collapsed && !skeleton"
          class="text-sm text-ink-gray-6"
          :role="failed ? 'status' : undefined"
        >
          {{ collapsed }}
          <button
            v-if="failed"
            type="button"
            class="ml-1 min-h-11 rounded-4 font-medium text-ink-gray-8 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:min-h-0"
            @click="$emit('retry')"
          >
            {{ __('Retry') }}
          </button>
        </p>
      </div>
      <RouterLink
        v-if="more && more.to"
        :to="more.to"
        class="-mr-2 flex min-h-11 shrink-0 items-center rounded-6 px-2 text-sm font-medium text-ink-gray-7 hover:bg-surface-gray-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:min-h-8"
        >{{ more.label }}
        <span class="lucide-chevron-right ml-0.5 size-4" aria-hidden="true"
      /></RouterLink>
    </header>
    <div v-if="skeleton" class="space-y-2 px-4 pb-4 pt-2 sm:px-5">
      <div
        v-for="n in skeletonRows"
        :key="n"
        class="h-11 animate-pulse rounded-6 bg-surface-gray-2"
      />
    </div>
    <div v-else-if="!collapsed" class="pb-3">
      <slot />
    </div>
  </section>
</template>
<script setup>
import { computed } from 'vue'

// One Hoy section: heading, count and «Ver todos»; a skeleton while loading;
// an empty or unavailable section collapses to one line, never disappears.
const props = defineProps({
  id: { type: String, required: true },
  title: { type: String, required: true },
  icon: { type: String, default: 'lucide-circle' },
  count: { type: String, default: '' },
  more: { type: Object, default: null },
  skeleton: { type: Boolean, default: false },
  skeletonRows: { type: Number, default: 3 },
  collapsed: { type: String, default: '' },
  failed: { type: Boolean, default: false },
})
defineEmits(['retry'])
const headingId = computed(() => `hoy-${props.id}`)
</script>
