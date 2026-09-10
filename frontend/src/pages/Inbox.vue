<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <nav
      v-if="addonAvailable"
      class="flex flex-none gap-4 border-b border-outline-gray-1 px-4 py-3 text-sm"
      aria-label="Espacios de bandeja"
    >
      <button
        type="button"
        :aria-pressed="!legacy"
        :disabled="pending"
        :class="!legacy ? 'font-semibold underline' : ''"
        @click="selectWorkspace(false)"
      >
        Conversaciones
      </button>
      <button
        type="button"
        :aria-pressed="legacy"
        :disabled="pending"
        :class="legacy ? 'font-semibold underline' : ''"
        @click="selectWorkspace(true)"
      >
        Negocios y actividad
      </button>
    </nav>
    <ConversationLegacyWorkspace v-if="legacy" />
    <ConversationWorkspace v-else @pending="pending = $event" />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { addonAvailable } from '@/utils/crmCapabilities'
import ConversationWorkspace from '@/components/Inbox/ConversationWorkspace.vue'
const ConversationLegacyWorkspace = defineAsyncComponent(
  () => import('@/components/Inbox/ConversationLegacyWorkspace.vue'),
)
const route = useRoute(),
  router = useRouter()
const pending = ref(false)
const legacy = computed(
  () =>
    addonAvailable.value &&
    (route.query.workspace === 'activity' || !!route.query.deal),
)
function selectWorkspace(activity) {
  if (pending.value) return
  router.replace({
    query: {
      ...route.query,
      workspace: activity ? 'activity' : undefined,
      deal: undefined,
      conversation: activity ? undefined : route.query.conversation,
    },
  })
}
</script>
