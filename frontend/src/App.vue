<template>
  <FrappeUIProvider>
    <MuelleShell v-if="session.isLoggedIn"
      ><router-view v-if="neutral" /><CrmRuntime v-else
    /></MuelleShell>
    <Dialogs v-if="neutral" />
  </FrappeUIProvider>
</template>
<script setup>
import { computed, defineAsyncComponent, provide } from 'vue'
import { useRoute } from 'vue-router'
import { FrappeUIProvider, setConfig, useTheme } from 'frappe-ui'
import { sessionStore } from '@/stores/session'
import { Dialogs } from '@/utils/dialogs'
import { isNeutralModule } from '@/composables/muelleShell'
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
const { setTheme } = useTheme()
setTheme(localStorage.getItem('theme') || 'light')
setConfig('systemTimezone', window.timezone?.system || null)
setConfig('localTimezone', window.timezone?.user || null)
setConfig('translatedMessages', window.translated_messages || {})
</script>
