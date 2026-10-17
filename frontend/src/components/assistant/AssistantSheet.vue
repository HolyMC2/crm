<template>
  <!-- «Pregúntale a Muelle»: one surface for every door (shell-program/design/
       ASSISTANT.md). On a phone it is a modal bottom sheet over the screen the
       worker is on; on a desktop of 1280px or more it docks as a right panel
       and the page reflows beside it. Never a floating bubble. -->
  <aside
    v-if="docked && assistant.open"
    ref="panel"
    class="flex h-full w-[400px] flex-none flex-col border-l border-outline-gray-1 bg-surface-base"
    data-shell-layer="assistant"
    data-testid="assistant-dock"
    :aria-label="__('Ask Muelle')"
  >
    <AssistantPanel docked @close="closeAssistant" @navigate="onNavigate" />
  </aside>
  <BottomSheet
    v-else-if="!docked && assistant.open"
    :open="assistant.open"
    @update:open="(open) => !open && closeAssistant()"
  >
    <div
      ref="panel"
      class="flex h-full flex-col"
      data-shell-layer="assistant"
      data-testid="assistant-sheet"
    >
      <AssistantPanel @close="closeAssistant" @navigate="onNavigate" />
    </div>
  </BottomSheet>
</template>
<script setup>
import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { useRoute } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import { BottomSheet } from 'frappe-ui'
import { appleKeys, registerPageKeys } from '@/composables/shellKeyboard'
import { normalizeCombo } from '@/vendor/muelle-shell/contracts'
import { moduleKeyFor, shellModules } from '@/composables/muelleShell'
import { shellTitle } from '@/utils/shellTitle'
import AssistantPanel from './AssistantPanel.vue'
import {
  assistant,
  assistantEnabled,
  bindSocket,
  closeAssistant,
  loadStatus,
  screenContext,
  toggleAssistant,
} from './useAssistant'

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

// ⌘J / Ctrl+J opens or closes it from anywhere, also while typing and over a
// sheet (muelle shell-contracts f053be0 names the key; until crm re-vendors
// that contract the sheet listens itself, and declares the key so the Alt+H
// sheet lists it). Esc closes the dock when the focus is in it.
function onKey(event) {
  if (event.defaultPrevented || event.isComposing || !assistantEnabled.value)
    return
  if (normalizeCombo(event, appleKeys) !== 'mod+j') return
  event.preventDefault()
  event.stopPropagation()
  toggleAssistant()
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
registerPageKeys({
  root: panel,
  keys: () => (assistant.open && docked.value ? { close: closeAssistant } : {}),
  extra: () =>
    assistantEnabled.value
      ? [
          {
            id: 'assistant',
            keys: ['mod+j'],
            description: 'Ask the assistant',
            context: 'global',
          },
        ]
      : [],
})

// On a phone the record opens full screen; the conversation waits.
function onNavigate() {
  if (!docked.value) closeAssistant()
}
</script>
