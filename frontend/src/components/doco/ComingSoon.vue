<!--
  Placeholder surface for redesign routes whose real implementation lands in a
  later phase. Reads title/phase from the route meta so one component backs every
  not-yet-built screen. Replace the route's `component` import as each phase ships.
-->
<template>
  <div
    class="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-base"
  >
    <component :is="icon" class="h-9 w-9 text-ink-gray-4" />
    <div class="text-base-semibold text-ink-gray-8">{{ __(title) }}</div>
    <div class="text-sm text-ink-gray-5">
      {{ __('Coming in Phase {0}', [phase]) }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ConstructionIcon from '~icons/lucide/construction'

const route = useRoute()
const title = computed(() => route.meta?.title || route.name || 'Screen')
const phase = computed(() => route.meta?.phase || '2')
const icon = ConstructionIcon
</script>
