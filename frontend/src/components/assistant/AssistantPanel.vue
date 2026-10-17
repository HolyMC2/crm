<template>
  <section class="flex h-full min-h-0 flex-col" :aria-label="__('Ask Muelle')">
    <!-- The context chip and the ✦ are the one bold element (ASSISTANT.md). -->
    <header class="flex min-h-12 items-center gap-2 pl-4 pr-1">
      <span
        class="flex-none text-lg leading-none text-[var(--brand)]"
        aria-hidden="true"
        >✦</span
      >
      <h2 class="sr-only">{{ __('Ask Muelle') }}</h2>
      <div
        v-if="chipTitle"
        class="flex min-h-9 min-w-0 items-center gap-1 rounded-full bg-[var(--brand-soft)] pl-3 pr-1 text-sm text-ink-gray-9"
        data-testid="assistant-context"
      >
        <span class="min-w-0 truncate">{{
          __('About: {0}', [chipTitle])
        }}</span>
        <button
          type="button"
          class="flex size-8 flex-none items-center justify-center rounded-full hover:bg-surface-gray-2"
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
      <button
        type="button"
        class="ml-auto flex size-11 flex-none items-center justify-center rounded-lg text-ink-gray-7 hover:bg-surface-gray-2"
        :aria-label="__('Close')"
        :title="docked ? `${__('Close')} (${closeKey})` : __('Close')"
        data-testid="assistant-close"
        @click="$emit('close')"
      >
        <span class="lucide-x size-5" aria-hidden="true" />
      </button>
    </header>

    <div
      v-if="chips.length"
      class="flex flex-wrap gap-2 px-4 pb-2"
      data-testid="assistant-chips"
    >
      <button
        v-for="chip in chips"
        :key="chip.label"
        type="button"
        class="min-h-9 rounded-lg border border-outline-gray-2 px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50"
        :disabled="assistant.thinking"
        @click="useChip(chip)"
      >
        {{ chip.label }}
      </button>
    </div>

    <div
      ref="scroller"
      class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-2"
      aria-live="polite"
      data-testid="assistant-log"
    >
      <p
        v-if="!assistant.messages.length && assistant.loaded"
        class="pt-6 text-center text-sm text-ink-gray-6"
      >
        {{
          __(
            'Ask about your customers, sales and to-dos. Muelle prepares the change and you confirm it.',
          )
        }}
      </p>
      <template v-for="message in assistant.messages" :key="message.id">
        <div
          v-if="message.role === 'user'"
          class="ml-auto w-fit max-w-[85%] rounded-2xl bg-surface-gray-2 px-3 py-2 text-base text-ink-gray-9"
          :class="{ 'opacity-60': message.pending }"
          data-role="user"
        >
          <p class="whitespace-pre-line break-words">{{ message.text }}</p>
          <p
            v-if="message.failed"
            class="mt-1 flex items-center gap-2 text-sm text-ink-red-7"
          >
            {{ __('Not sent.') }}
            <button
              type="button"
              class="min-h-9 font-medium underline"
              @click="retry(message)"
            >
              {{ __('Retry') }}
            </button>
          </p>
        </div>
        <div v-else class="space-y-2" data-role="bot">
          <p
            v-if="view(message).prose"
            class="whitespace-pre-line break-words text-base text-ink-gray-9"
          >
            <template
              v-for="(part, i) in textParts(view(message).prose)"
              :key="i"
            >
              <RouterLink
                v-if="part.to"
                :to="part.to"
                class="text-ink-blue-link underline"
                @click="$emit('navigate')"
                >{{ __('Open') }}</RouterLink
              >
              <a
                v-else-if="part.href"
                :href="part.href"
                target="_blank"
                rel="noopener"
                class="break-all text-ink-blue-link underline"
                >{{ part.label }}</a
              >
              <template v-else>{{ part.text }}</template>
            </template>
          </p>
          <ActionCard
            v-for="card in view(message).cards"
            :key="card.id"
            :card="card"
            :state="assistant.cards[card.id]"
            :receipt="receipts[card.id]"
            @confirm="tap(card.confirm, card.id)"
            @change="change(card)"
            @navigate="$emit('navigate')"
          />
          <div v-if="view(message).choices.length" class="flex flex-wrap gap-2">
            <button
              v-for="choice in view(message).choices"
              :key="choice.data"
              type="button"
              class="min-h-11 rounded-full bg-surface-gray-2 px-4 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-3"
              @click="tap(choice.data)"
            >
              {{ choice.label }}
            </button>
          </div>
        </div>
      </template>
      <p
        v-if="assistant.thinking"
        role="status"
        class="flex items-center gap-2 text-sm text-ink-gray-6"
      >
        <span class="text-[var(--brand)]" aria-hidden="true">✦</span>
        {{
          assistant.progress ? stripEmoji(assistant.progress) : __('Looking…')
        }}
      </p>
      <p v-if="assistant.error" role="alert" class="text-sm text-ink-red-7">
        {{ assistant.error }}
      </p>
    </div>

    <form
      class="flex items-end gap-1 border-t border-outline-gray-1 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]"
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
        class="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border-0 bg-surface-gray-2 px-4 py-2.5 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-2 focus:ring-outline-gray-3"
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
  </section>
</template>
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { keyLabel } from '@/composables/shellKeyboard'
import ActionCard from './ActionCard.vue'
import AssistantMic from './AssistantMic.vue'
import {
  chipsFor,
  firstRecordLink,
  proseOf,
  splitButtons,
  stripEmoji,
  textParts,
} from './assistantText'
import { assistant, retry, send, tap } from './useAssistant'

defineProps({ docked: { type: Boolean, default: false } })
defineEmits(['close', 'navigate'])

const scroller = ref(null)
const input = ref(null)
const closeKey = keyLabel('mod+j')

const chipTitle = computed(() =>
  assistant.contextOn ? assistant.context?.title || '' : '',
)
const chips = computed(() =>
  assistant.contextOn ? chipsFor(assistant.context) : [],
)

// A reply's prose, its action cards and its plain choices, computed once per text.
const views = new WeakMap()
function view(message) {
  const cached = views.get(message)
  if (cached) return cached
  const { cards, choices } = splitButtons(message)
  const out = { cards, choices, prose: proseOf(message, cards) }
  views.set(message, out)
  return out
}

// The receipt of a confirmed card: the first record link of the reply after it.
const receipts = computed(() => {
  const out = {}
  for (const message of assistant.messages)
    if (message.receiptOf)
      out[message.receiptOf] = firstRecordLink(message.text) || {}
  return out
})

function submit() {
  const text = assistant.draft
  if (!text.trim()) return
  assistant.draft = ''
  grow()
  send(text)
}

function useChip(chip) {
  if (chip.fill) {
    assistant.draft = chip.prompt
    focusInput()
  } else send(chip.prompt)
}

// «Cambiar»: a run approval is declined (nothing is applied) and the worker
// says what to change; a parked card simply waits for the new instruction.
function change(card) {
  if (card.change) tap(card.change, card.id)
  else assistant.cards = { ...assistant.cards, [card.id]: 'changed' }
  assistant.draft = `${__('Change it:')} `
  focusInput()
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

function toBottom() {
  nextTick(() => {
    const el = scroller.value
    if (el) el.scrollTop = el.scrollHeight
  })
}
watch(() => [assistant.messages.length, assistant.thinking], toBottom)
watch(() => assistant.focus, focusInput)
onMounted(() => {
  toBottom()
  focusInput()
})
</script>
