<!--
  Follow-up queues (Todos, Vencidos, Para hoy, Sin fecha, Sin seguimiento) as
  one-tap chips above the Deals list. Each chip opens its seeded public view, so
  a manager who edits a queue's filters changes it for the whole team.
-->
<template>
  <nav
    v-if="queues.length"
    class="scb flex gap-1.5 overflow-x-auto px-3 pb-2 pt-1 sm:px-5"
    :aria-label="__('Colas de seguimiento')"
  >
    <button
      v-for="view in queues"
      :key="view.name"
      type="button"
      class="press flex-none whitespace-nowrap rounded-full px-3 py-1 text-[12px]"
      :class="
        route.query.view === view.name
          ? 'bg-surface-gray-3 font-semibold text-ink-gray-9'
          : 'bg-surface-gray-1 text-ink-gray-6 hover:bg-surface-gray-2'
      "
      :aria-pressed="route.query.view === view.name"
      @click="router.push(queueRoute(view))"
    >
      {{ __(view.label) }}
    </button>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { viewsStore } from '@/stores/views'
import { dealQueues, queueRoute } from '@/utils/dealQueues'

const route = useRoute()
const router = useRouter()
const { views } = viewsStore()
const queues = computed(() => dealQueues(views.data))
</script>
