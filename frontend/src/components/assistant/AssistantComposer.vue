<template>
  <!-- The composer: fixed at the bottom of the sheet (#footer) and the dock,
       on the same gutter as the conversation above it (20px in the sheet,
       16px in the dock). One card holds the text and its tools: a file waiting
       to go sits above the text, the clip and the mic on the left, send on the
       right. -->
  <form
    class="border-t border-outline-gray-1 pb-3 pt-2"
    :class="docked ? 'px-4' : 'px-5'"
    @submit.prevent="submit"
  >
    <div
      class="rounded-2xl border border-outline-gray-2 bg-surface-gray-1 focus-within:ring-2 focus-within:ring-outline-gray-3"
    >
      <AssistantAttachment
        v-if="assistant.attachment"
        :file="assistant.attachment"
        @remove="clearAttachment"
      />
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
        data-testid="assistant-input"
        @keydown.enter.exact.prevent="submit"
        @input="grow"
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
          <span class="lucide-paperclip size-5" aria-hidden="true" />
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
import AssistantAttachment from './AssistantAttachment.vue'
import AssistantMic from './AssistantMic.vue'
import { ASSISTANT_FILE_ACCEPT, canSendDraft } from './assistantFiles'
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
// Only the owner may send a file (api._can_attach). The clip says why and what
// to do instead, rather than opening a picker whose file the server would refuse.
const canAttach = computed(() => Boolean(assistant.status?.can_attach))

function submit() {
  if (!ready.value) return
  const text = assistant.draft
  const file = takeAttachment()
  assistant.draft = ''
  send(text, { file })
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
