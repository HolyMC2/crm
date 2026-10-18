<template>
  <NotPermitted v-if="$route.name === 'Not Permitted'" />
  <router-view v-else-if="$route.name === 'Onboarding'" />
  <Layout v-else-if="session.isLoggedIn" class="isolate">
    <div
      v-if="onboarding?.error.value"
      role="alert"
      class="flex items-center justify-between gap-3 border-b border-outline-gray-2 bg-surface-elevation-1 px-4 py-3 text-sm text-ink-gray-8"
    >
      <span>{{
        __(
          'Onboarding progress is unavailable. Retry setup to synchronize pending progress.',
        )
      }}</span>
      <Button
        :label="__('Retry')"
        :loading="onboarding.loading.value"
        @click="onboarding.retry()"
      />
    </div>
    <DesktopOnly v-if="$route.meta.desktopOnly && isNarrow" />
    <router-view
      v-else
      :key="routeKey($route)"
    />
  </Layout>
  <Settings v-if="session.isLoggedIn && showSettings" />
  <IntermediateStepModal
    v-if="session.isLoggedIn && onboarding?.showIntermediateModal.value"
    v-model="onboarding.showIntermediateModal.value"
    :currentStep="onboarding.currentStep.value"
  >
    <template #actions>
      <Button
        variant="solid"
        :label="onboarding.currentStep.value.buttonLabel"
        @click="onboarding.currentStep.value.onClick?.()"
      />
    </template>
  </IntermediateStepModal>
  <Dialogs />
  <DoctypeModals />
  <EventNotificationPopup v-if="eventAlerts.length" />
</template>

<script setup>
import DoctypeModals from '@/components/Modals/DoctypeModals.vue'

// The page key: a split page (Documentos master-detail ≥1024) keeps one
// instance while its record changes; `stableKey` pages remount on path only.
function routeKey(route) {
  const split = route.meta.splitKey?.(route)
  if (split) return split
  return route.meta.stableKey ? route.path : route.fullPath
}
import { Dialogs } from '@/utils/dialogs'
import { sessionStore } from '@/stores/session'
import { setConfig, useTheme } from 'frappe-ui'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  watch,
} from 'vue'
import { useStorage } from '@vueuse/core'
import { useRoute } from 'vue-router'
import { syncBrandFavicon } from '@/stores/settings'
import { prefetchHotChunks } from '@/utils/prefetch'
import { initTelemetry } from '@/composables/telemetry'
import { showSettings } from '@/composables/settings'
import { isNarrow } from '@/composables/breakpoint'
import { onboardingOwner } from '@/composables/onboardingOwner'
// Only for the not-permitted route; most pages never show it.
const NotPermitted = defineAsyncComponent(
  () => import('@/pages/NotPermitted.vue'),
)
// Shell D3: a desk-only set-up screen below 768px says «Ábrelo en una
// computadora» instead.
const DesktopOnly = defineAsyncComponent(() =>
  import('@/components/shell/DesktopOnly.vue').then((m) => m.default),
)
const Settings = defineAsyncComponent(
  () => import('@/components/Settings/Settings.vue'),
)
// Onboarding, its step modal and the event reminder popup stay out of the
// first load: each pulled its own files into every Ventas route (SPEC §4,
// ≤ 60 scripts; crm-pulse counts what loads before the page is quiet).
// Onboarding loads on the first tap or key (a page that completes a step
// loads it itself); the popup mounts when a reminder is stored
// (data/notifications.js keeps them in localStorage).
const IntermediateStepModal = defineAsyncComponent(() =>
  import('frappe-ui/frappe').then((m) => m.IntermediateStepModal),
)
const EventNotificationPopup = defineAsyncComponent(() =>
  import('@/components/EventNotificationPopup.vue').then((m) => m.default),
)

const session = sessionStore()
provide('session', session)

const eventAlerts = useStorage('eventNotificationAlerts', [])

// The owner a page or the first tap created, for this user only.
const onboarding = computed(() => {
  const owner = onboardingOwner.value
  return session.isLoggedIn && owner?.user === session.user ? owner : null
})
const FIRST_USE = ['pointerdown', 'keydown']
function stopListening() {
  for (const type of FIRST_USE)
    window.removeEventListener(type, onFirstUse, true)
}
function onFirstUse() {
  stopListening()
  if (!session.isLoggedIn) return
  import('@/composables/onboarding').then(({ useCrmOnboarding }) =>
    useCrmOnboarding(),
  )
}
for (const type of FIRST_USE)
  window.addEventListener(type, onFirstUse, { capture: true, passive: true })
onBeforeUnmount(stopListening)

const route = useRoute()
watch(
  () => route.fullPath,
  () => nextTick(syncBrandFavicon),
  { flush: 'post' },
)

// Apply the persisted theme at boot (useTheme's ref starts at 'light' and nothing
// else re-applies a stored 'dark'/'system' choice — the mobile toggle needs this).
const { setTheme } = useTheme()
setTheme(localStorage.getItem('theme') || 'light')

// The Muelle shell owns the rail / phone nav; Ventas adds its sidebar and
// page header (DocoNavRail, MobileTabBar and the drawer are retired).
const Layout = defineAsyncComponent(
  () => import('@/components/shell/VentasFrame.vue'),
)

setConfig('systemTimezone', window.timezone?.system || null)
setConfig('localTimezone', window.timezone?.user || null)
setConfig('translatedMessages', window.translated_messages || {})

// spec 3.2: warm the hot route chunks during idle time after the landing paint;
// spec 3.6: arm the error-telemetry listeners (un-crashable by design)
onMounted(() => {
  prefetchHotChunks()
  initTelemetry()
})
</script>
