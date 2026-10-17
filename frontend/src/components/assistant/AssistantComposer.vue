<template>
  <!-- The composer: fixed at the bottom of the sheet (#footer) and the dock. -->
  <form
    class="flex items-end gap-1 border-t border-outline-gray-1 px-2 py-2"
    @submit.prevent="submit"
  >
    <label class="sr-only" for="assistant-input">{{
      __('Ask something')
    }}</label>
    <textarea
      id="assistant-input"
      ref="input"
      v-model="assistant.draft"
      rows="1"
      class="max-h-32 min-h-11 flex-1 resize-none rounded-full border-0 bg-surface-gray-2 px-4 py-2.5 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:bg-surface-gray-2 focus:ring-2 focus:ring-outline-gray-3"
      :class="{ 'rounded-3xl': multiline }"
      :placeholder="__('Ask something…')"
      enterkeyhint="send"
      data-testid="assistant-input"
      @keydown.enter.exact.prevent="submit"
      @input="grow"
    />
    <AssistantMic @text="heard" @error="(text) => (assistant.error = text)" />
    <button
      type="submit"
      class="flex size-11 flex-none items-center justify-center rounded-full bg-surface-gray-10 text-ink-base disabled:bg-surface-gray-3 disabled:text-ink-gray-5"
      :disabled="!assistant.draft.trim()"
      :aria-label="__('Send')"
      data-testid="assistant-send"
    >
      <span class="lucide-arrow-up size-5" aria-hidden="true" />
    </button>
  </form>
</template>
<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import AssistantMic from './AssistantMic.vue'
import { assistant, send } from './useAssistant'

const input = ref(null)
const multiline = ref(false)

function submit() {
  const text = assistant.draft
  if (!text.trim()) return
  assistant.draft = ''
  grow()
  send(text)
}

function heard(text) {
  assistant.draft = [assistant.draft.trim(), text].filter(Boolean).join(' ')
  focusInput()
}

function grow() {
  const el = input.value
  if (!el) return
  el.style.height = 'auto'
  const height = Math.min(el.scrollHeight, 128)
  el.style.height = `${height}px`
  multiline.value = height > 48
}

function focusInput() {
  nextTick(() => {
    grow()
    // A phone keyboard would cover the answer: only focus on a pointer device.
    if (globalThis.matchMedia?.('(pointer: fine)').matches) input.value?.focus()
  })
}

// openAssistant, a chip that fills the draft and «Cambiar» ask for the focus.
watch(() => assistant.focus, focusInput)
onMounted(focusInput)
</script>
