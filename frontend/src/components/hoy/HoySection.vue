<template>
  <section
    :aria-labelledby="headingId"
    class="rounded-xl border border-outline-gray-2 bg-surface-base"
    :aria-busy="skeleton || undefined"
  >
    <header class="flex min-h-12 items-center gap-2 px-4 pt-3 sm:px-5">
      <span
        :class="icon"
        class="size-4 shrink-0 text-ink-gray-6"
        aria-hidden="true"
      />
      <h2
        :id="headingId"
        class="min-w-0 flex-1 truncate text-base font-semibold text-ink-gray-9"
      >
        {{ title }}
        <span
          v-if="count"
          class="ml-1 rounded-full bg-surface-gray-2 px-2 py-0.5 text-xs font-medium text-ink-gray-7"
          >{{ count }}</span
        >
      </h2>
      <RouterLink
        v-if="more && more.to"
        :to="more.to"
        class="flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-medium text-ink-gray-7 hover:bg-surface-gray-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:min-h-8"
        >{{ more.label }}
        <span class="lucide-chevron-right ml-0.5 size-4" aria-hidden="true"
      /></RouterLink>
    </header>
    <div v-if="skeleton" class="space-y-2 px-4 pb-4 pt-2 sm:px-5">
      <div
        v-for="n in skeletonRows"
        :key="n"
        class="h-11 animate-pulse rounded-lg bg-surface-gray-2"
      />
    </div>
    <p
      v-else-if="collapsed"
      class="px-4 pb-3 pt-1 text-sm text-ink-gray-6 sm:px-5"
      :role="failed ? 'status' : undefined"
    >
      {{ collapsed }}
      <button
        v-if="failed"
        type="button"
        class="ml-1 min-h-11 rounded font-medium text-ink-gray-8 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:min-h-0"
        @click="$emit('retry')"
      >
        {{ __('Retry') }}
      </button>
    </p>
    <div v-else class="pb-2">
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
