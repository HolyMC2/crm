<template>
  <!-- The dock grown to the screen on a desktop (Marco 2026-11-05, like
       Claude and T3 Code; 2026-11-08 «claude/codex look»): conversations on
       the left with the agenda, «Abierto» and the Lienzo on top, the
       conversation in a readable column, and the side panels on the right
       when asked for (closed at first). A new conversation puts the composer
       under its greeting, mid screen. Both sides fold and the choice is
       remembered. Minimize goes back to the dock beside the page; Esc and
       close put it away. A phone keeps the full-screen sheet. -->
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
      class="flex w-64 flex-none flex-col border-r border-outline-gray-1 bg-surface-gray-1"
    >
      <div class="flex h-14 flex-none items-center gap-2 pl-4 pr-2">
        <span
          class="text-lg leading-none text-[var(--brand)]"
          aria-hidden="true"
          >✦</span
        >
        <span class="title-face min-w-0 flex-1 truncate font-semibold">{{
          __('Ask Muelle')
        }}</span>
        <button
          type="button"
          class="press flex size-9 flex-none items-center justify-center rounded-6 text-ink-gray-6 hover:bg-surface-gray-3 hover:text-ink-gray-9"
          :aria-label="__('Hide conversations')"
          :title="__('Hide conversations')"
          aria-pressed="true"
          data-testid="assistant-toggle-sidebar"
          @click="layout.sidebar = false"
        >
          <span class="lucide-panel-left size-5" aria-hidden="true" />
        </button>
      </div>
      <AssistantSidebar />
    </div>

    <section class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-14 flex-none items-center gap-1 px-2">
        <template v-if="!layout.sidebar">
          <button
            type="button"
            class="press flex size-9 flex-none items-center justify-center rounded-6 text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-9"
            :aria-label="__('Show conversations')"
            :title="__('Show conversations')"
            aria-pressed="false"
            data-testid="assistant-toggle-sidebar"
            @click="layout.sidebar = true"
          >
            <span class="lucide-panel-left size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="press flex size-9 flex-none items-center justify-center rounded-6 text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-9 disabled:opacity-50"
            :aria-label="__('New conversation')"
            :title="__('New conversation')"
            :disabled="sessions.busy"
            data-testid="assistant-new"
            @click="newConversation"
          >
            <span class="lucide-square-pen size-5" aria-hidden="true" />
          </button>
        </template>
        <button
          v-if="sessions.view !== 'chat'"
          type="button"
          class="press flex min-h-9 min-w-0 items-center gap-1.5 rounded-6 pl-2 pr-3 hover:bg-surface-gray-2"
          :aria-label="__('Back to the chat')"
          data-testid="assistant-back"
          @click="showView('chat')"
        >
          <span
            class="lucide-arrow-left size-4 flex-none text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="min-w-0 truncate font-medium">{{ viewTitle }}</span>
        </button>
        <h2
          v-else
          class="min-w-0 truncate px-2 font-medium text-ink-gray-8"
          data-testid="assistant-title"
        >
          {{ chatTitle }}
        </h2>
        <span class="flex-1" />
        <button
          type="button"
          class="press relative flex size-9 flex-none items-center justify-center rounded-6 text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-9"
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
          <span
            v-if="!layout.panels && sessions.work.count"
            class="absolute right-1.5 top-1.5 size-2 rounded-full bg-[var(--muelle-accent)] ring-2 ring-[var(--surface-base)]"
            aria-hidden="true"
            data-testid="assistant-panels-waiting"
          />
        </button>
        <button
          type="button"
          class="press flex size-9 flex-none items-center justify-center rounded-6 text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-9"
          :aria-label="__('Exit full screen')"
          :title="__('Exit full screen')"
          data-testid="assistant-minimize"
          @click="assistant.full = false"
        >
          <span class="lucide-minimize-2 size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="press flex size-9 flex-none items-center justify-center rounded-6 text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-9"
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
      <template v-else>
        <div v-if="empty" class="flex-1" aria-hidden="true" />
        <AssistantLog
          docked
          class="!px-[max(1rem,calc((100%-48rem)/2))]"
          :class="empty ? '!flex-none' : ''"
          @navigate="onNavigate"
        />
      </template>
      <AssistantComposer
        v-if="sessions.view === 'chat' || sessions.view === 'canvas'"
        docked
        class="!px-[max(1rem,calc((100%-48rem)/2))]"
      />
      <div v-if="empty" class="flex-[1.3]" aria-hidden="true" />
    </section>

    <aside
      v-if="layout.panels"
      class="w-80 flex-none overflow-y-auto overscroll-contain border-l border-outline-gray-1 bg-surface-base"
      :aria-label="__('Side panels')"
    >
      <AssistantSidePanels :focus="focusPanel" @navigate="onNavigate" />
    </aside>
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import { useShellLayer } from '@/composables/shellKeyboard'
import AssistantComposer from './AssistantComposer.vue'
import AssistantConversations from './AssistantConversations.vue'
import AssistantLog from './AssistantLog.vue'
import AssistantSidebar from './AssistantSidebar.vue'
import AssistantSidePanels from './AssistantSidePanels.vue'
import { loadAgenda } from './assistantAgenda'
import { complete } from './assistantAutocomplete'
import { loadCanvas } from './assistantCanvas'
import {
  loadOpenWork,
  newConversation,
  sessions,
  showView,
} from './assistantSessions'
import { visibleMessages } from './assistantText'
import { assistant, closeAssistant } from './useAssistant'

const AssistantCanvas = defineAsyncComponent(
  () => import('./AssistantCanvas.vue'),
)

const root = ref(null)
/** Which sides are showing, on this device. The panels wait to be asked for
 *  (2026-11-08: a chat app's full screen is the conversation). */
const layout = useStorage('muelle-assistant-layout', {
  sidebar: true,
  panels: false,
})

// The dock's own views have a home here: the list is the left column, «Abierto»
// and the agenda are side panels. A «/» command, a door or a row of the left
// column that asks for one shows its column, unfolded at it, instead of
// leaving the chat.
const SIDE_VIEWS = { list: 'sidebar', open: 'panels', agenda: 'panels' }
const focusPanel = ref(null)
watch(
  () => sessions.view,
  (view) => {
    if (!SIDE_VIEWS[view]) return
    layout.value[SIDE_VIEWS[view]] = true
    if (SIDE_VIEWS[view] === 'panels') focusPanel.value = { name: view }
    sessions.view = 'chat'
  },
  { immediate: true },
)

// The left column's counts and the panels' dot are live while the panels
// are closed: what is open, the agenda and the Lienzo load here, and again
// after each answer (it may have parked a capture, left an encargo or
// written a file).
function refresh() {
  loadOpenWork()
  loadAgenda()
  loadCanvas()
}
onMounted(refresh)
watch(
  () => assistant.thinking,
  (thinking, was) => was && !thinking && refresh(),
)

// A new conversation: the greeting and the composer together, mid screen.
const empty = computed(
  () =>
    sessions.view === 'chat' &&
    assistant.loaded &&
    !assistant.thinking &&
    !assistant.error &&
    !visibleMessages(assistant.messages).length,
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
// (the «/» list, the model menu, a rename, a row's «⋯») takes it first.
useShellLayer(root, {
  onKeydown(event) {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    if (complete.open) return
    if (event.target?.closest?.('[data-conversation] form')) return
    if (event.target?.closest?.('[data-conversation-actions]')) return
    event.preventDefault()
    closeAssistant()
  },
})

// A record opened from an answer shows beside the dock.
function onNavigate() {
  assistant.full = false
}
</script>
