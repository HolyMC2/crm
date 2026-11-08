<template>
  <!-- The composer: fixed at the bottom of the sheet (#footer) and the dock,
       on the same gutter as the conversation above it (20px in the sheet,
       16px in the dock). The screen's suggestions sit right above it, in reach
       of the thumb, while nothing is typed. One card holds the text and its
       tools: the screen the question is about as a chip, a file waiting to go,
       the text, then «+» and the mic on the left, the model and send on the
       right. -->
  <form
    class="pb-3 pt-1"
    :class="docked ? 'px-4' : 'px-5'"
    @submit.prevent="submit"
  >
    <div
      v-if="showChips"
      ref="row"
      class="mb-2 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]"
      :class="docked ? '-mx-4 px-4' : '-mx-5 px-5'"
      data-testid="assistant-chips"
    >
      <button
        v-for="chip in chips"
        :key="chip.label"
        type="button"
        class="press min-h-11 flex-none whitespace-nowrap rounded-full border border-outline-gray-2 bg-surface-base px-4 text-sm text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50 sm:min-h-9"
        :disabled="assistant.thinking"
        @click="useChip(chip)"
      >
        {{ chip.label }}
      </button>
    </div>
    <div
      class="rounded-8 border border-outline-gray-2 bg-surface-base shadow-sm focus-within:border-outline-gray-3"
    >
      <div
        v-if="chipTitle"
        class="flex min-w-0 px-2 pt-2"
        data-testid="assistant-context"
      >
        <span
          class="flex min-h-8 min-w-0 items-center gap-1.5 rounded-6 bg-surface-gray-2 pl-2.5 text-sm text-ink-gray-8"
        >
          <span
            class="lucide-monitor size-3.5 flex-none text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="min-w-0 truncate">{{
            __('About: {0}', [chipTitle])
          }}</span>
          <button
            type="button"
            class="-my-1.5 flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-6 hover:text-ink-gray-9 sm:my-0 sm:size-8"
            :aria-label="__('Do not use this screen')"
            :title="__('Do not use this screen')"
            @click="assistant.contextOn = false"
          >
            <span class="lucide-x size-3.5" aria-hidden="true" />
          </button>
        </span>
      </div>
      <AssistantAttachment
        v-if="assistant.attachment"
        :file="assistant.attachment"
        @remove="clearAttachment"
      />
      <!-- «/» commands and «@» coworkers: above the text, so a phone
           keyboard never covers them; a tap picks (mousedown keeps focus). -->
      <ul
        v-if="complete.open"
        id="assistant-complete"
        role="listbox"
        class="max-h-56 overflow-y-auto border-b border-outline-gray-1 py-1"
        :aria-label="
          complete.kind === 'persona' ? __('Coworkers') : __('Commands')
        "
        data-testid="assistant-complete"
      >
        <li
          v-for="(item, index) in complete.items"
          :id="`assistant-complete-${index}`"
          :key="item.cmd || item.name"
          role="option"
          :aria-selected="index === complete.active"
          class="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-1 text-sm"
          :class="
            index === complete.active
              ? 'bg-surface-gray-3 text-ink-gray-9'
              : 'text-ink-gray-8 hover:bg-surface-gray-2'
          "
          :data-complete="item.cmd || item.name"
          @mousedown.prevent="pick(index)"
        >
          <template v-if="item.cmd">
            <span class="flex-none font-medium">{{ item.cmd }}</span>
            <span class="min-w-0 truncate text-ink-gray-6">{{
              item.label
            }}</span>
          </template>
          <template v-else>
            <span class="min-w-0 truncate font-medium">{{ item.label }}</span>
            <span v-if="item.self" class="flex-none text-ink-gray-6">{{
              __('(you)')
            }}</span>
          </template>
        </li>
      </ul>
      <label class="sr-only" for="assistant-input">{{
        __('Ask something')
      }}</label>
      <textarea
        id="assistant-input"
        ref="input"
        v-model="assistant.draft"
        rows="1"
        class="max-h-32 min-h-11 w-full resize-none border-0 bg-transparent px-4 pb-1 pt-3 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-0"
        :placeholder="__('Ask something…')"
        enterkeyhint="send"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="assistant-complete"
        :aria-expanded="complete.open"
        :aria-activedescendant="
          complete.open ? `assistant-complete-${complete.active}` : undefined
        "
        data-testid="assistant-input"
        @keydown="onKey"
        @input="onInput"
        @click="onCaret"
        @blur="closeComplete"
      />
      <div class="flex items-center gap-1 px-2 pb-2">
        <button
          type="button"
          class="flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          :aria-label="__('Attach a file')"
          :title="__('Attach a file')"
          data-testid="assistant-attach"
          @click="attach"
        >
          <span class="lucide-plus size-5" aria-hidden="true" />
        </button>
        <input
          ref="picker"
          type="file"
          class="sr-only"
          tabindex="-1"
          aria-hidden="true"
          :accept="ASSISTANT_FILE_ACCEPT"
          data-testid="assistant-file"
          @change="picked"
        />
        <AssistantMic
          @text="heard"
          @error="(text) => (assistant.error = text)"
        />
        <span class="flex-1" />
        <AssistantModelPicker />
        <button
          type="submit"
          class="flex size-11 flex-none items-center justify-center rounded-full bg-surface-gray-10 text-ink-base disabled:bg-surface-gray-3 disabled:text-ink-gray-5"
          :disabled="!ready"
          :aria-label="__('Send')"
          data-testid="assistant-send"
        >
          <span class="lucide-arrow-up size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  </form>
</template>
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { chipsFor } from './assistantText'
import AssistantAttachment from './AssistantAttachment.vue'
import AssistantMic from './AssistantMic.vue'
import AssistantModelPicker from './AssistantModelPicker.vue'
import { ASSISTANT_FILE_ACCEPT, canSendDraft } from './assistantFiles'
import {
  closeComplete,
  complete,
  moveActive,
  pickItem,
  resolveCommand,
  updateComplete,
} from './assistantAutocomplete'
import { runCommand, sessions } from './assistantSessions'
import {
  assistant,
  attachFile,
  clearAttachment,
  send,
  takeAttachment,
} from './useAssistant'

defineProps({ docked: { type: Boolean, default: false } })

const input = ref(null)
const picker = ref(null)
const ready = computed(() =>
  canSendDraft(assistant.draft, assistant.attachment),
)
// The screen the question is about, and what to ask about it.
const chipTitle = computed(() =>
  assistant.contextOn ? assistant.context?.title || '' : '',
)
const chips = computed(() =>
  assistant.contextOn ? chipsFor(assistant.context) : [],
)
const showChips = computed(
  () =>
    chips.value.length > 0 &&
    sessions.view === 'chat' &&
    !assistant.draft.trim() &&
    !assistant.attachment,
)
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

// Only the owner may send a file (api._can_attach). The clip says why and what
// to do instead, rather than opening a picker whose file the server would refuse.
const canAttach = computed(() => Boolean(assistant.status?.can_attach))

async function submit() {
  if (!ready.value) return
  closeComplete()
  const text = assistant.draft
  const file = takeAttachment()
  assistant.draft = ''
  // «/recuerdame mañana…» goes out as «Recuérdame mañana…»; «/nueva» runs here
  const command = file ? null : await resolveCommand(text)
  if (command?.action) return runCommand(command.action)
  toChat()
  send(command?.text || text, { file })
}

// asked from the Lienzo: the answer shows in the chat
function toChat() {
  if (sessions.view === 'canvas') sessions.view = 'chat'
}

function onKey(event) {
  if (complete.open) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      return moveActive(event.key === 'ArrowDown' ? 1 : -1)
    }
    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
      event.preventDefault()
      return pick(complete.active)
    }
    if (event.key === 'Escape') {
      // the list closes; the sheet stays open
      event.preventDefault()
      event.stopPropagation()
      return closeComplete()
    }
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}

function onInput() {
  grow()
  onCaret()
}

function onCaret() {
  const el = input.value
  if (el) updateComplete(el.value, el.selectionStart ?? el.value.length)
}

function pick(index) {
  const out = pickItem(assistant.draft, index)
  if (!out) return
  if (out.action) {
    assistant.draft = ''
    return runCommand(out.action)
  }
  if (out.send) {
    assistant.draft = out.text
    toChat()
    return send(out.send)
  }
  assistant.draft = out.text
  nextTick(() => {
    const el = input.value
    if (!el) return
    el.focus()
    el.setSelectionRange?.(out.caret, out.caret)
  })
}

function attach() {
  if (!canAttach.value) {
    assistant.error = __(
      'Only the owner can send files to Muelle. Type what the file says, or ask the owner to send it.',
    )
    return
  }
  picker.value?.click()
}

function picked(event) {
  const [file] = event.target.files || []
  event.target.value = '' // the same photo twice in a row still fires
  if (file) attachFile(file)
}

function heard(text) {
  assistant.draft = [assistant.draft.trim(), text].filter(Boolean).join(' ')
  focusInput()
}

function grow() {
  const el = input.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 128)}px`
}

function focusInput() {
  nextTick(() => {
    grow()
    // A phone keyboard would cover the answer: only focus on a pointer device.
    if (globalThis.matchMedia?.('(pointer: fine)').matches) input.value?.focus()
  })
}

// The height follows the draft after Vue writes it (a sent long question
// left a three-line empty box behind: SHELL-S2c walk at 305px).
watch(
  () => assistant.draft,
  () => nextTick(grow),
)
// openAssistant, a chip that fills the draft and «Cambiar» ask for the focus.
watch(() => assistant.focus, focusInput)
onMounted(focusInput)
</script>
