<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <!-- The caller's way back (Hoy, an Encuestas answer…). On a phone the open
         conversation's header carries it instead, so the screen has one back. -->
    <div
      v-if="returnTo && (!isMobile || mobileView === 'list')"
      class="flex flex-none items-center border-b border-outline-gray-1 px-3 py-1 sm:px-4"
    >
      <button
        type="button"
        class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9 sm:min-h-8"
        data-testid="inbox-return"
        @click="goToReturn(router, returnTo)"
      >
        <FeatherIcon name="arrow-left" class="h-4 w-4" />
        {{ __('Back to {0}', [returnLabel]) }}
      </button>
    </div>
    <nav
      v-if="addonAvailable"
      class="flex flex-none gap-4 border-b border-outline-gray-1 px-4 text-sm sm:py-3"
      :aria-label="__('Inbox spaces')"
    >
      <button
        type="button"
        class="min-h-11 sm:min-h-0"
        :aria-pressed="!legacy"
        :disabled="pending"
        :class="!legacy ? 'font-semibold underline' : ''"
        @click="selectWorkspace(false)"
      >
        {{ __('Conversations') }}
      </button>
      <button
        type="button"
        class="min-h-11 sm:min-h-0"
        :aria-pressed="legacy"
        :disabled="pending"
        :class="legacy ? 'font-semibold underline' : ''"
        @click="selectWorkspace(true)"
      >
        {{ __('Deals and activity') }}
      </button>
    </nav>
    <ConversationLegacyWorkspace v-if="legacy" />
    <ConversationWorkspace v-else @pending="pending = $event" />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, h, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FeatherIcon } from 'frappe-ui'
import { addonAvailable } from '@/utils/crmCapabilities'
import { isMobile } from '@/composables/breakpoint'
import { mobileView } from '@/composables/mobileView'
import { safeReturn } from '@/composables/useCompras'
import { goToReturn } from '@/utils/atencion'
import ConversationWorkspace from '@/components/Inbox/ConversationWorkspace.vue'
import PaneState from '@/components/shell/PaneState.vue'
// «Negocios y actividad» is its own chunk: say it is loading (after 200 ms)
// and offer a reload if the chunk cannot be fetched, never a blank pane.
const ConversationLegacyWorkspace = defineAsyncComponent({
  loader: () => import('@/components/Inbox/ConversationLegacyWorkspace.vue'),
  loadingComponent: { render: () => h(PaneState, { state: 'loading' }) },
  errorComponent: {
    render: () => h(PaneState, { state: 'error', reload: true }),
  },
  delay: 200,
})
const route = useRoute(),
  router = useRouter()
const pending = ref(false)
const returnTo = computed(() => safeReturn(route.query.return_to))
const returnLabel = computed(() =>
  typeof route.query.return_label === 'string' && route.query.return_label
    ? route.query.return_label.slice(0, 40)
    : __('previous screen'),
)
// Default space is "Negocios y actividad" (Marco 2026-09-15). The native
// conversation queue opens only when asked for (?workspace=conversations) or
// when a conversation deep link is present.
const legacy = computed(
  () =>
    addonAvailable.value &&
    route.query.workspace !== 'conversations' &&
    (!!route.query.deal || typeof route.query.conversation !== 'string'),
)
function selectWorkspace(activity) {
  if (pending.value) return
  router.replace({
    query: {
      ...route.query,
      workspace: activity ? undefined : 'conversations',
      deal: undefined,
      conversation: activity ? undefined : route.query.conversation,
    },
  })
}
</script>
