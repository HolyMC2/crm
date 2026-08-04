<template>
  <FrappeUIProvider>
    <NotPermitted v-if="$route.name === 'Not Permitted'" />
    <router-view v-else-if="$route.name === 'Onboarding'" />
    <Layout v-else-if="session.isLoggedIn" class="isolate">
      <router-view :key="$route.fullPath" />
    </Layout>
    <Dialogs />
    <DoctypeModals />
    <EventNotificationPopup />
  </FrappeUIProvider>
</template>

<script setup>
import NotPermitted from '@/pages/NotPermitted.vue'
import EventNotificationPopup from '@/components/EventNotificationPopup.vue'
import DoctypeModals from '@/components/Modals/DoctypeModals.vue'
import { Dialogs } from '@/utils/dialogs'
import { sessionStore } from '@/stores/session'
import { FrappeUIProvider, setConfig, useTheme } from 'frappe-ui'
import { computed, defineAsyncComponent, onMounted, provide } from 'vue'
import { prefetchHotChunks } from '@/utils/prefetch'
import { initTelemetry } from '@/composables/telemetry'
import { isMobile } from '@/composables/breakpoint'

const session = sessionStore()
provide('session', session)

// Apply the persisted theme at boot (useTheme's ref starts at 'light' and nothing
// else re-applies a stored 'dark'/'system' choice — the mobile toggle needs this).
const { setTheme } = useTheme()
setTheme(localStorage.getItem('theme') || 'light')

const MobileLayout = defineAsyncComponent(
  () => import('./components/Layouts/MobileLayout.vue'),
)
const DesktopLayout = defineAsyncComponent(
  () => import('./components/Layouts/DesktopLayout.vue'),
)
// Reactive breakpoint (audit LOW-3): window.innerWidth alone froze the choice at
// boot — rotating a tablet across 640px never swapped layouts until a route change.
const Layout = computed(() => (isMobile.value ? MobileLayout : DesktopLayout))

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
