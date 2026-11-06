<template>
  <ToastProvider />
  <MuelleShell v-if="session.isLoggedIn"
    ><router-view v-if="neutral" /><CrmRuntime v-else
  /></MuelleShell>
  <Dialogs v-if="neutral" />
  <FrappeDialogs v-if="dialogHost" />
  <RegistrationTray v-if="session.isLoggedIn && hasRegistrations" />
</template>
<script setup>
import { computed, defineAsyncComponent, provide, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ToastProvider, setConfig, useColorScheme } from 'frappe-ui'
import { sessionStore } from '@/stores/session'
import { Dialogs } from '@/utils/dialogs'
import { isNeutralModule } from '@/composables/muelleShell'
import { hasRegistrations } from '@/composables/gastosRegistrations'
import { afterFirstRoute } from '@/utils/prefetch'
// What FrappeUIProvider renders, with frappe-ui's dialog host loaded after the
// entry: its `dialog.confirm`/`prompt` module statically imports FormControl
// and with it every reka-ui form control (DatePicker, Combobox, MultiSelect…),
// ~40 KB gzip the entry budget cannot carry. crm's own dialogs are `Dialogs`
// above; the imperative host serves the two Settings views that call
// `dialog.confirm`, and a dialog opened before it mounts shows on its first
// render (it reads the shared `dialogs` ref).
const FrappeDialogs = defineAsyncComponent(() =>
  import('frappe-ui-components/Dialogs.vue').then((m) => m.default),
)
// Its chunk loaded with the first screen's own (at 1.3 s on a phone); the
// host mounts after the first route, or at the first touch if that is sooner.
const dialogHost = ref(false)
const FIRST_TOUCH = ['pointerdown', 'keydown']
function mountDialogHost() {
  dialogHost.value = true
  for (const type of FIRST_TOUCH)
    window.removeEventListener(type, mountDialogHost, true)
}
for (const type of FIRST_TOUCH)
  window.addEventListener(type, mountDialogHost, {
    capture: true,
    passive: true,
  })
const MuelleShell = defineAsyncComponent(
  () => import('@/components/shell/MuelleShell.vue'),
)
const CrmRuntime = defineAsyncComponent(
  () => import('@/components/Layouts/CrmRuntime.vue'),
)
// Gastos bills registering in the background: the tray loads only when one is.
const RegistrationTray = defineAsyncComponent(
  () => import('@/components/gastos/RegistrationTray.vue'),
)
const session = sessionStore()
provide('session', session)
const route = useRoute()
afterFirstRoute(useRouter(), mountDialogHost)
// Keep the hard-refresh boot neutral until the router resolves its first match.
const neutral = computed(
  () =>
    isNeutralModule(route.meta.app) ||
    (!route.matched.length && isNeutralModule(window.muelle_module)),
)
const { setColorScheme } = useColorScheme()
setColorScheme(localStorage.getItem('theme') || 'light')
setConfig('systemTimezone', window.timezone?.system || null)
setConfig('localTimezone', window.timezone?.user || null)
setConfig('translatedMessages', window.translated_messages || {})
</script>
