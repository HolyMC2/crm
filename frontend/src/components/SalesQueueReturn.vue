<template>
  <nav
    v-if="target"
    class="shrink-0 border-b border-outline-gray-2 px-3"
    :aria-label="__('Return to work queue')"
  >
    <RouterLink
      :to="target"
      class="inline-flex min-h-11 items-center rounded px-2 text-sm underline focus-visible:ring-2"
      >←
      {{
        target.startsWith('/reports')
          ? __('Return to report')
          : __('Return to queue')
      }}</RouterLink
    >
  </nav>
</template>
<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { safeQueueReturn } from '@/utils/salesQueueContext'
const route = useRoute()
const target = computed(() => safeQueueReturn(route.query.returnTo))
</script>
