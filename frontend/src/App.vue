<template>
  <ToastProvider />
  <MuelleShell v-if="session.isLoggedIn"
    ><router-view v-if="neutral" /><CrmRuntime v-else
  /></MuelleShell>
  <Dialogs v-if="neutral" />
  <FrappeDialogs />
</template>
<script setup>
import { computed, defineAsyncComponent, provide } from 'vue'
import { useRoute } from 'vue-router'
import { ToastProvider, setConfig, useColorScheme } from 'frappe-ui'
import { sessionStore } from '@/stores/session'
import { Dialogs } from '@/utils/dialogs'
import { isNeutralModule } from '@/composables/muelleShell'
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
const MuelleShell = defineAsyncComponent(
  () => import('@/components/shell/MuelleShell.vue'),
)
const CrmRuntime = defineAsyncComponent(
  () => import('@/components/Layouts/CrmRuntime.vue'),
)
const session = sessionStore()
provide('session', session)
const route = useRoute()
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
