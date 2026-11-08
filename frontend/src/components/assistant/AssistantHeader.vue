<template>
  <!-- One row, a chat app's: the conversations on the left, the title, then
       a new conversation, full screen and close. The screen the chat is about
       and its suggestions sit with the composer (AssistantComposer); the
       agenda and «Abierto» are the first rows of the conversations
       (AssistantConversations), and a dot on their button says one waits. -->
  <div
    class="flex min-h-14 items-center gap-1"
    :class="docked ? 'pl-2 pr-1' : '-ml-2'"
  >
    <h2 class="sr-only">{{ __('Ask Muelle') }}</h2>
    <template v-if="sessions.view === 'chat'">
      <button
        type="button"
        class="press relative flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
        :aria-label="conversationsLabel"
        :title="conversationsLabel"
        aria-pressed="false"
        data-testid="assistant-conversations"
        @click="showView('list')"
      >
        <span class="lucide-panel-left size-5" aria-hidden="true" />
        <span
          v-if="waiting"
          class="absolute right-2 top-2 size-2 rounded-full bg-[var(--muelle-accent)] ring-2 ring-[var(--surface-base)]"
          aria-hidden="true"
          data-testid="assistant-waiting"
        />
      </button>
      <span
        class="min-w-0 flex-1 truncate font-semibold text-ink-gray-9"
        aria-hidden="true"
        >{{ __('Ask Muelle') }}</span
      >
    </template>
    <button
      v-else
      type="button"
      class="press flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-full pl-2.5 pr-3 text-ink-gray-9 hover:bg-surface-gray-2"
      :aria-label="__('Back to the chat')"
      data-testid="assistant-back"
      @click="back"
    >
      <span
        class="lucide-arrow-left size-5 flex-none text-ink-gray-7"
        aria-hidden="true"
      />
      <span class="min-w-0 truncate font-semibold">{{ viewTitle }}</span>
    </button>
    <div class="ml-auto flex flex-none items-center">
      <button
        type="button"
        class="press flex size-11 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-50"
        :aria-label="__('New conversation')"
        :title="__('New conversation (settles what is finished)')"
        :disabled="sessions.busy"
        data-testid="assistant-new"
        @click="newConversation"
      >
        <span class="lucide-square-pen size-5" aria-hidden="true" />
      </button>
      <!-- The dock's own way to full screen; the sheet's is its handle or
           the button beside its close. -->
      <button
        v-if="docked"
        type="button"
        class="press flex size-11 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
        :aria-label="__('Full screen')"
        :title="__('Full screen')"
        data-testid="assistant-fullscreen"
        @click="assistant.full = true"
      >
        <span class="lucide-maximize-2 size-5" aria-hidden="true" />
      </button>
      <button
        v-if="closable"
        type="button"
        class="press flex size-11 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
        :class="docked ? '' : '-mr-2'"
        :aria-label="__('Close')"
        :title="docked ? `${__('Close')} (${closeKey})` : __('Close')"
        data-testid="assistant-close"
        @click="$emit('close')"
      >
        <span class="lucide-x size-5" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
<script setup>
import { computed, watch } from 'vue'
import { keyLabel } from '@/composables/shellKeyboard'
import { assistant } from './useAssistant'
import { agenda, dueCount, loadAgenda } from './assistantAgenda'
import {
  loadOpenWork,
  newConversation,
  sessions,
  showView,
} from './assistantSessions'

defineProps({
  docked: { type: Boolean, default: false },
  /** false where the sheet shows its own close (the centred dialog). */
  closable: { type: Boolean, default: true },
})
defineEmits(['close'])

const closeKey = keyLabel('mod+j')

// «Abierto» counts what the chat left open each time the sheet opens, and
// again after each answer (it may have parked a capture or a proposal).
// The agenda too: an answer may have left an encargo on it.
function refreshWork() {
  loadOpenWork()
  loadAgenda()
}
watch(
  () => assistant.open,
  (open) => open && refreshWork(),
  { immediate: true },
)
watch(
  () => assistant.thinking,
  (thinking, was) => was && !thinking && assistant.open && refreshWork(),
)
const due = computed(() => dueCount(agenda.items))
// what waits behind the conversations button: the agenda due today, «Abierto»
const waiting = computed(() => Boolean(due.value || sessions.work.count))
const conversationsLabel = computed(() =>
  waiting.value
    ? [
        __('Conversations'),
        due.value ? __('Agenda ({0} today)', [due.value]) : '',
        sessions.work.count ? __('Open work ({0})', [sessions.work.count]) : '',
      ]
        .filter(Boolean)
        .join(', ')
    : __('Conversations'),
)
// A door that opens the sheet or fills the composer brings the chat back.
watch(
  () => assistant.focus,
  () => sessions.view !== 'chat' && showView('chat'),
)
const viewTitle = computed(() => {
  if (sessions.view === 'open') return __('Open work')
  if (sessions.view === 'agenda') return __('Agenda')
  if (sessions.view === 'canvas') return __('Lienzo')
  if (sessions.view === 'transcript')
    return sessions.transcript?.conversation?.title || __('Conversation')
  return __('Conversations')
})
// From a conversation, the agenda or «Abierto» the arrow goes back to the
// list they were opened from; from the list, to the chat.
function back() {
  showView(
    ['transcript', 'agenda', 'open'].includes(sessions.view) ? 'list' : 'chat',
  )
}
</script>
