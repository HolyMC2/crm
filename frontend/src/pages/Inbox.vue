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
        :aria-pressed="space === 'conversations'"
        :disabled="pending"
        :class="space === 'conversations' ? 'font-semibold underline' : ''"
        @click="selectWorkspace('conversations')"
      >
        {{ __('Conversations') }}
      </button>
      <button
        type="button"
        class="min-h-11 sm:min-h-0"
        :aria-pressed="space === 'activity'"
        :disabled="pending"
        :class="space === 'activity' ? 'font-semibold underline' : ''"
        @click="selectWorkspace('activity')"
      >
        {{ __('Deals and activity') }}
      </button>
      <button
        type="button"
        class="min-h-11 sm:min-h-0"
        data-testid="inbox-review"
        :aria-pressed="space === 'review'"
        :disabled="pending"
        :class="space === 'review' ? 'font-semibold underline' : ''"
        @click="selectWorkspace('review')"
      >
        {{ __('To approve') }}
      </button>
    </nav>
    <WhatsAppReviewQueue v-if="space === 'review'" />
    <ConversationLegacyWorkspace v-else-if="space === 'activity'" />
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
import { inboxSpace, inboxSpaceQuery } from '@/utils/inboxSpaces'
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
// «Conversaciones» loads only when it is the open space, like the other two
// (bundle budget, SPEC §4: the inbox opened on «Negocios y actividad» fetched
// it and its order/messenger/archivos helpers anyway).
const ConversationWorkspace = defineAsyncComponent({
  loader: () => import('@/components/Inbox/ConversationWorkspace.vue'),
  loadingComponent: { render: () => h(PaneState, { state: 'loading' }) },
  errorComponent: {
    render: () => h(PaneState, { state: 'error', reload: true }),
  },
  delay: 200,
})
// «Por aprobar» (CRM-S3.4, D4): WhatsApp messages waiting for a person's approval
// are a filter of the Inbox, not a separate list. The standalone page stays for
// Pendientes › Por aprobar links.
const WhatsAppReviewQueue = defineAsyncComponent({
  loader: () => import('@/pages/WhatsAppQueue.vue'),
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
const space = computed(() => inboxSpace(route.query, addonAvailable.value))
function selectWorkspace(next) {
  if (pending.value) return
  router.replace({ query: inboxSpaceQuery(route.query, next) })
}
</script>
