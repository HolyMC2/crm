<template>
  <!-- The context chip and the ✦ are the one bold element (ASSISTANT.md).
       Fixed above the conversation: the sheet's #header, the dock's top. -->
  <div>
    <div
      class="flex min-h-14 items-center gap-2"
      :class="docked ? 'pl-4 pr-1' : ''"
    >
      <span
        class="flex-none text-lg leading-none text-[var(--brand)]"
        aria-hidden="true"
        >✦</span
      >
      <h2 class="sr-only">{{ __('Ask Muelle') }}</h2>
      <button
        v-if="sessions.view !== 'chat'"
        type="button"
        class="flex min-h-11 min-w-0 items-center gap-1 rounded-full pr-3 text-ink-gray-9 hover:bg-surface-gray-2"
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
      <div
        v-else-if="chipTitle"
        class="flex min-h-11 min-w-0 items-center gap-1 rounded-full bg-[var(--brand-soft)] pl-3 pr-1 text-sm text-ink-gray-9"
        data-testid="assistant-context"
      >
        <span class="min-w-0 truncate">{{
          __('About: {0}', [chipTitle])
        }}</span>
        <button
          type="button"
          class="flex size-11 flex-none items-center justify-center rounded-full hover:bg-surface-gray-2"
          :aria-label="__('Do not use this screen')"
          :title="__('Do not use this screen')"
          @click="assistant.contextOn = false"
        >
          <span class="lucide-x size-4" aria-hidden="true" />
        </button>
      </div>
      <span v-else class="min-w-0 truncate font-semibold">{{
        __('Ask Muelle')
      }}</span>
      <div class="ml-auto flex flex-none items-center">
        <button
          type="button"
          class="relative flex size-11 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          :class="{ 'bg-surface-gray-2': sessions.view === 'open' }"
          :aria-label="openLabel"
          :title="openLabel"
          :aria-pressed="sessions.view === 'open'"
          data-testid="assistant-open-work"
          @click="toggle('open')"
        >
          <span class="lucide-inbox size-5" aria-hidden="true" />
          <span
            v-if="sessions.work.count"
            class="absolute right-1 top-1 min-w-4 rounded-full bg-[var(--brand)] px-1 text-center text-2xs font-semibold leading-4 text-white"
            aria-hidden="true"
            >{{ sessions.work.count > 9 ? '9+' : sessions.work.count }}</span
          >
        </button>
        <button
          type="button"
          class="flex size-11 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          :class="{
            'bg-surface-gray-2':
              sessions.view === 'list' || sessions.view === 'transcript',
          }"
          :aria-label="__('Conversations')"
          :title="__('Conversations')"
          :aria-pressed="sessions.view === 'list'"
          data-testid="assistant-conversations"
          @click="toggle('list')"
        >
          <span class="lucide-history size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="flex size-11 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-50"
          :aria-label="__('New conversation')"
          :title="__('New conversation')"
          :disabled="sessions.busy"
          data-testid="assistant-new"
          @click="newConversation"
        >
          <span class="lucide-square-pen size-5" aria-hidden="true" />
        </button>
      </div>
      <button
        v-if="closable"
        type="button"
        class="-mr-2 flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
        :aria-label="__('Close')"
        :title="docked ? `${__('Close')} (${closeKey})` : __('Close')"
        data-testid="assistant-close"
        @click="$emit('close')"
      >
        <span class="lucide-x size-5" aria-hidden="true" />
      </button>
    </div>

    <!-- On a phone the row runs into the sheet's gutter, so a chip that does
         not fit shows its edge: there is more to scroll (SHELL-S2c walk, 412). -->
    <div
      v-if="chips.length && sessions.view === 'chat'"
      ref="row"
      class="flex gap-2 overflow-x-auto pb-1 pt-1 [scrollbar-width:none]"
      :class="docked ? 'flex-wrap px-4' : '-mx-4 px-4'"
      data-testid="assistant-chips"
    >
      <button
        v-for="chip in chips"
        :key="chip.label"
        type="button"
        class="min-h-11 flex-none whitespace-nowrap rounded-6 border border-outline-gray-2 px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50"
        :disabled="assistant.thinking"
        @click="useChip(chip)"
      >
        {{ chip.label }}
      </button>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { keyLabel } from '@/composables/shellKeyboard'
import { chipsFor } from './assistantText'
import { assistant, send } from './useAssistant'
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
const chipTitle = computed(() =>
  assistant.contextOn ? assistant.context?.title || '' : '',
)
const chips = computed(() =>
  assistant.contextOn ? chipsFor(assistant.context) : [],
)

// «Abierto» counts what the chat left open each time the sheet opens, and
// again after each answer (it may have parked a capture or a proposal).
watch(
  () => assistant.open,
  (open) => open && loadOpenWork(),
  { immediate: true },
)
watch(
  () => assistant.thinking,
  (thinking, was) => was && !thinking && assistant.open && loadOpenWork(),
)
// A door that opens the sheet or fills the composer brings the chat back.
watch(
  () => assistant.focus,
  () => sessions.view !== 'chat' && showView('chat'),
)
const openLabel = computed(() =>
  sessions.work.count
    ? __('Open work ({0})', [sessions.work.count])
    : __('Open work'),
)
const viewTitle = computed(() => {
  if (sessions.view === 'open') return __('Open work')
  if (sessions.view === 'transcript')
    return sessions.transcript?.conversation?.title || __('Conversation')
  return __('Conversations')
})
function toggle(view) {
  showView(sessions.view === view ? 'chat' : view)
}
// From a conversation the arrow goes back to the list it was opened from.
function back() {
  showView(sessions.view === 'transcript' ? 'list' : 'chat')
}

// A chip that needs a detail fills the composer (which takes the focus);
// the others ask at once. The row goes back to its first chip.
const row = ref(null)
function useChip(chip) {
  if (chip.fill) {
    assistant.draft = chip.prompt
    assistant.focus += 1
  } else send(chip.prompt)
  row.value?.scrollTo?.({ left: 0, behavior: 'smooth' })
}
</script>
