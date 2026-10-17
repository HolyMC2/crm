<template>
  <!-- The conversation: questions, answers, action cards and choices. -->
  <div
    class="space-y-4 py-2"
    :class="
      docked ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4' : ''
    "
    aria-live="polite"
    data-testid="assistant-log"
  >
    <p
      v-if="hidden"
      class="text-center text-sm text-ink-gray-5"
      data-testid="assistant-hidden"
    >
      {{
        __(
          'Earlier answers are not shown again. Ask again to see them with your access today.',
        )
      }}
    </p>
    <p
      v-if="!shown.length && assistant.loaded"
      class="pt-6 text-center text-sm text-ink-gray-6"
    >
      {{
        __(
          'Ask about your customers, sales and to-dos. Muelle prepares the change and you confirm it.',
        )
      }}
    </p>
    <template v-for="message in shown" :key="message.id">
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
      <div
        v-else-if="message.down"
        role="alert"
        class="flex items-center gap-2 rounded-xl bg-surface-gray-1 py-1 pl-3 pr-1 text-sm text-ink-gray-8"
        data-role="bot"
        data-down
      >
        <span
          class="lucide-cloud-off size-4 flex-none text-ink-gray-6"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1">{{
          __('Muelle cannot answer right now. Try again in a few minutes.')
        }}</span>
        <button
          type="button"
          class="min-h-11 flex-none rounded-full px-3 font-medium text-ink-gray-9 hover:bg-surface-gray-2 disabled:opacity-50"
          :disabled="assistant.thinking"
          @click="retryAnswer(message)"
        >
          {{ __('Retry') }}
        </button>
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
      {{ assistant.progress ? stripEmoji(assistant.progress) : __('Looking…') }}
    </p>
    <p v-if="assistant.error" role="alert" class="text-sm text-ink-red-7">
      {{ assistant.error }}
    </p>
    <span ref="end" aria-hidden="true" />
  </div>
</template>
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import ActionCard from './ActionCard.vue'
import {
  firstRecordLink,
  proseOf,
  splitButtons,
  stripEmoji,
  textParts,
} from './assistantText'
import { assistant, retry, retryAnswer, tap } from './useAssistant'

// docked: the log scrolls itself; in the sheet the sheet's body scrolls.
defineProps({ docked: { type: Boolean, default: false } })
defineEmits(['navigate'])

const end = ref(null)

// An answer doco cannot replay (and the question it answered) is left out;
// one quiet line at the top says so. A live failure still shows in place.
const shown = computed(() =>
  assistant.messages.filter(
    (message, i, all) =>
      !message.stale && !(message.role === 'user' && all[i + 1]?.stale),
  ),
)
const hidden = computed(() => assistant.messages.some((m) => m.stale))

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

// «Cambiar»: a run approval is declined (nothing is applied) and the worker
// says what to change; a parked card simply waits for the new instruction.
function change(card) {
  if (card.change) tap(card.change, card.id)
  else assistant.cards = { ...assistant.cards, [card.id]: 'changed' }
  assistant.draft = `${__('Change it:')} `
  assistant.focus += 1
}

// The newest message in view, whichever element scrolls (dock or sheet).
function toBottom() {
  nextTick(() => end.value?.scrollIntoView?.({ block: 'end' }))
}
watch(() => [assistant.messages.length, assistant.thinking], toBottom)
onMounted(toBottom)
</script>
