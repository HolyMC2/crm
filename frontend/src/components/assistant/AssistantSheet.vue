<template>
  <!-- «Pregúntale a Muelle»: one surface for every door (shell-program/design/
       ASSISTANT.md). On a phone it is a modal bottom sheet over the screen the
       worker is on (ui/BottomSheet: back, swipe down, Esc and the scrim
       close it); on a desktop of 1280px or more it docks as a right panel
       and the page reflows beside it. Never a floating bubble. Full screen
       (the sheet's handle, the dialog's or the dock's maximize) is the same
       sheet grown to the screen. -->
  <aside
    v-if="docked && assistant.open && !assistant.full"
    ref="panel"
    class="flex h-full w-[400px] flex-none flex-col border-l border-outline-gray-1 bg-surface-base"
    data-shell-layer="assistant"
    data-testid="assistant-dock"
    :aria-label="__('Ask Muelle')"
  >
    <AssistantPanel docked @close="closeAssistant" @navigate="onNavigate" />
  </aside>
  <BottomSheet
    v-else-if="!docked || assistant.full"
    v-model:fullscreen="assistant.full"
    :open="assistant.open"
    :aria-label="__('Ask Muelle')"
    layer="assistant"
    @update:open="(open) => !open && closeAssistant()"
  >
    <template #header>
      <AssistantHeader :closable="isMobile" @close="closeAssistant" />
    </template>
    <div ref="panel" data-testid="assistant-sheet">
      <AssistantAgenda
        v-if="sessions.view === 'agenda'"
        @navigate="onNavigate"
      />
      <AssistantCanvas v-else-if="sessions.view === 'canvas'" />
      <AssistantOpenWork
        v-else-if="sessions.view === 'open'"
        @navigate="onNavigate"
      />
      <AssistantConversations
        v-else-if="sessions.view !== 'chat'"
        @navigate="onNavigate"
      />
      <AssistantLog v-else @navigate="onNavigate" />
    </div>
    <template v-if="sessions.view === 'chat'" #footer>
      <AssistantComposer />
    </template>
  </BottomSheet>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  getCurrentInstance,
  onMounted,
  ref,
  watch,
} from 'vue'
import { useRoute } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import { registerPageKeys } from '@/composables/shellKeyboard'
import { moduleKeyFor, shellModules } from '@/composables/muelleShell'
import { shellTitle } from '@/utils/shellTitle'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import { isMobile } from '@/composables/breakpoint'
import AssistantComposer from './AssistantComposer.vue'
import AssistantConversations from './AssistantConversations.vue'
import AssistantHeader from './AssistantHeader.vue'
import AssistantLog from './AssistantLog.vue'
import AssistantOpenWork from './AssistantOpenWork.vue'
import AssistantPanel from './AssistantPanel.vue'
import { sessions } from './assistantSessions'
import {
  assistant,
  assistantEnabled,
  bindSocket,
  closeAssistant,
  loadStatus,
  screenContext,
} from './useAssistant'

// the agenda and the Lienzo load on their first open
const AssistantAgenda = defineAsyncComponent(
  () => import('./AssistantAgenda.vue'),
)
const AssistantCanvas = defineAsyncComponent(
  () => import('./AssistantCanvas.vue'),
)

// The dock width the contract names (ASSISTANT.md «wider than 1280px»).
const docked = useMediaQuery('(min-width: 1280px)')
const route = useRoute()
const panel = ref(null)

const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
onMounted(() => {
  loadStatus().then(() => assistantEnabled.value && bindSocket(socket))
})

// The sheet is about the screen under it; a new screen brings back its chip.
const liveContext = computed(() => {
  const module = shellModules.value.find((m) => m.key === moduleKeyFor(route))
  return screenContext(route, shellTitle(route, module))
})
watch(
  liveContext,
  (context, previous) => {
    assistant.context = context
    if (context.route !== previous?.route) assistant.contextOn = true
  },
  { immediate: true },
)

// ⌘J / Ctrl+J is the shell's (shellKeyboard.js shellAssistant, set by
// MuelleShell). Esc closes the dock when the focus is in it.
registerPageKeys({
  root: panel,
  keys: () =>
    assistant.open && docked.value && !assistant.full
      ? { close: closeAssistant }
      : {},
})

// On a phone the record opens full screen; the conversation waits. On a
// desktop the full screen goes back to the dock, beside the record.
function onNavigate() {
  if (!docked.value) closeAssistant()
  else assistant.full = false
}
</script>
<style>
/* doco's floating «Ayuda» launcher sits bottom right, over the dock's send
   button; while the dock is open «Ayuda» stays in the rail's Más. */
body:has([data-testid='assistant-dock']) #muelle-support-workflow,
body:has([data-ui-sheet][data-shell-layer='assistant'][data-fullscreen])
  #muelle-support-workflow {
  display: none !important;
}
</style>
