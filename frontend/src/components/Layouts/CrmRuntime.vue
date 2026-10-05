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
    <router-view :key="$route.meta.stableKey ? $route.path : $route.fullPath" />
  </Layout>
  <Settings v-if="session.isLoggedIn && showSettings" />
  <IntermediateStepModal
    v-if="session.isLoggedIn && onboarding"
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
  <EventNotificationPopup />
</template>

<script setup>
import NotPermitted from '@/pages/NotPermitted.vue'
import EventNotificationPopup from '@/components/EventNotificationPopup.vue'
import DoctypeModals from '@/components/Modals/DoctypeModals.vue'
import { Dialogs } from '@/utils/dialogs'
import { sessionStore } from '@/stores/session'
import { useCrmOnboarding } from '@/composables/onboarding'
import { setConfig, useTheme } from 'frappe-ui'
import { IntermediateStepModal } from 'frappe-ui/frappe'
import {
  defineAsyncComponent,
  nextTick,
  onMounted,
  provide,
  shallowRef,
  watch,
} from 'vue'
import { useRoute } from 'vue-router'
import { syncBrandFavicon } from '@/stores/settings'
import { prefetchHotChunks } from '@/utils/prefetch'
import { initTelemetry } from '@/composables/telemetry'
import { showSettings } from '@/composables/settings'
const Settings = defineAsyncComponent(
  () => import('@/components/Settings/Settings.vue'),
)

const session = sessionStore()
provide('session', session)

const onboarding = shallowRef(null)
watch(
  () => session.user,
  () => {
    onboarding.value = session.isLoggedIn ? useCrmOnboarding() : null
  },
  { immediate: true },
)

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
