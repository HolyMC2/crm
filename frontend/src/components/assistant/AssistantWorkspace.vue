<template>
  <!-- The dock grown to the screen on a desktop (Marco 2026-11-05, like
       Claude and T3 Code): conversations on the left, the conversation in a
       readable column, the side panels on the right. Both sides fold and the
       choice is remembered. Minimize goes back to the dock beside the page;
       Esc and close put it away. A phone keeps the full-screen sheet. -->
  <div
    ref="root"
    class="fixed inset-0 z-40 flex bg-surface-base text-ink-gray-9"
    role="dialog"
    aria-modal="true"
    :aria-label="__('Ask Muelle')"
    data-shell-layer="assistant"
    data-testid="assistant-workspace"
  >
    <div
      v-if="layout.sidebar"
      class="w-72 flex-none border-r border-outline-gray-1 bg-surface-gray-1"
    >
      <AssistantSidebar />
    </div>

    <section class="flex min-w-0 flex-1 flex-col">
      <header
        class="flex min-h-14 flex-none items-center gap-1 border-b border-outline-gray-1 px-2"
      >
        <button
          type="button"
          class="flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          :aria-label="
            layout.sidebar ? __('Hide conversations') : __('Show conversations')
          "
          :title="
            layout.sidebar ? __('Hide conversations') : __('Show conversations')
          "
          :aria-pressed="layout.sidebar"
          data-testid="assistant-toggle-sidebar"
          @click="layout.sidebar = !layout.sidebar"
        >
          <span class="lucide-panel-left size-5" aria-hidden="true" />
        </button>
        <span
          class="flex-none px-1 text-lg leading-none text-[var(--brand)]"
          aria-hidden="true"
          >✦</span
        >
        <button
          v-if="sessions.view !== 'chat'"
          type="button"
          class="flex min-h-11 min-w-0 items-center gap-1 rounded-full pr-3 text-ink-gray-9 hover:bg-surface-gray-2"
          :aria-label="__('Back to the chat')"
          data-testid="assistant-back"
          @click="showView('chat')"
        >
          <span
            class="lucide-arrow-left size-5 flex-none text-ink-gray-7"
            aria-hidden="true"
          />
          <span class="min-w-0 truncate font-semibold">{{ viewTitle }}</span>
        </button>
        <h2
          v-else
          class="min-w-0 truncate px-1 font-semibold"
          data-testid="assistant-title"
        >
          {{ chatTitle }}
        </h2>
        <span class="flex-1" />
        <button
          type="button"
          class="flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          :aria-label="
            layout.panels ? __('Hide side panels') : __('Show side panels')
          "
          :title="
            layout.panels ? __('Hide side panels') : __('Show side panels')
          "
          :aria-pressed="layout.panels"
          data-testid="assistant-toggle-panels"
          @click="layout.panels = !layout.panels"
        >
          <span class="lucide-panel-right size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          :aria-label="__('Exit full screen')"
          :title="__('Exit full screen')"
          data-testid="assistant-minimize"
          @click="assistant.full = false"
        >
          <span class="lucide-minimize-2 size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          :aria-label="__('Close')"
          :title="`${__('Close')} (Esc)`"
          data-testid="assistant-close"
          @click="closeAssistant"
        >
          <span class="lucide-x size-5" aria-hidden="true" />
        </button>
      </header>

      <AssistantCanvas
        v-if="sessions.view === 'canvas'"
        docked
        class="!px-[max(1rem,calc((100%-48rem)/2))]"
      />
      <AssistantConversations
        v-else-if="sessions.view === 'transcript'"
        docked
        class="!px-[max(1rem,calc((100%-48rem)/2))]"
        @navigate="onNavigate"
      />
      <AssistantLog
        v-else
        docked
        class="!px-[max(1rem,calc((100%-48rem)/2))]"
        @navigate="onNavigate"
      />
      <AssistantComposer
        v-if="sessions.view === 'chat'"
        docked
        class="!px-[max(1rem,calc((100%-48rem)/2))]"
      />
    </section>

    <aside
      v-if="layout.panels"
      class="w-80 flex-none overflow-y-auto overscroll-contain border-l border-outline-gray-1 bg-surface-gray-1"
      :aria-label="__('Side panels')"
    >
      <AssistantSidePanels @navigate="onNavigate" />
    </aside>
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { useShellLayer } from '@/composables/shellKeyboard'
import AssistantComposer from './AssistantComposer.vue'
import AssistantConversations from './AssistantConversations.vue'
import AssistantLog from './AssistantLog.vue'
import AssistantSidebar from './AssistantSidebar.vue'
import AssistantSidePanels from './AssistantSidePanels.vue'
import { complete } from './assistantAutocomplete'
import { sessions, showView } from './assistantSessions'
import { assistant, closeAssistant } from './useAssistant'

const AssistantCanvas = defineAsyncComponent(
  () => import('./AssistantCanvas.vue'),
)

const root = ref(null)
/** Which sides are showing, on this device. */
const layout = useStorage('muelle-assistant-workspace', {
  sidebar: true,
  panels: true,
})

// The dock's own views have a home here: the list is the left column, «Abierto»
// and the agenda are side panels. A «/» command or a door that asks for one
// shows its column instead of leaving the chat.
const SIDE_VIEWS = { list: 'sidebar', open: 'panels', agenda: 'panels' }
watch(
  () => sessions.view,
  (view) => {
    if (!SIDE_VIEWS[view]) return
    layout.value[SIDE_VIEWS[view]] = true
    sessions.view = 'chat'
  },
  { immediate: true },
)

const chatTitle = computed(
  () =>
    (assistant.messages.length && sessions.current?.title) || __('Ask Muelle'),
)
const viewTitle = computed(() =>
  sessions.view === 'canvas'
    ? __('Lienzo')
    : sessions.transcript?.conversation?.title || __('Conversation'),
)

// Tab stays in the workspace; Esc puts it away unless a list or menu inside
// (the «/» list, the model menu, a rename) takes it first.
useShellLayer(root, {
  onKeydown(event) {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    if (complete.open) return
    if (event.target?.closest?.('[data-conversation] form')) return
    event.preventDefault()
    closeAssistant()
  },
})

// A record opened from an answer shows beside the dock.
function onNavigate() {
  assistant.full = false
}
</script>
