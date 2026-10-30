<template>
  <!-- The conversation: questions, answers, action cards and choices. -->
  <div
    ref="root"
    class="space-y-4 py-2"
    :class="
      docked ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4' : ''
    "
    aria-live="polite"
    data-testid="assistant-log"
  >
    <div
      v-if="settled"
      role="status"
      class="flex items-center gap-2 rounded-7 bg-surface-gray-1 py-1 pl-3 pr-1 text-sm text-ink-gray-8"
      data-testid="assistant-settled"
    >
      <span
        class="lucide-check-check size-4 flex-none text-ink-gray-6"
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1">{{ settled }}</span>
      <button
        v-if="sessions.settled.closed || sessions.settled.archived.length"
        type="button"
        class="press min-h-11 flex-none rounded-full px-3 font-medium text-ink-gray-9 hover:bg-surface-gray-2 disabled:opacity-50"
        :disabled="sessions.busy"
        data-testid="assistant-settled-undo"
        @click="undoSettle"
      >
        {{ __('Undo') }}
      </button>
    </div>
    <p
      v-if="hidden && shown.length"
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
        class="ml-auto w-fit max-w-[85%] rounded-8 bg-surface-gray-2 px-3 py-2 text-base text-ink-gray-9"
        :class="{ 'opacity-60': message.pending }"
        data-role="user"
      >
        <div
          v-if="message.file"
          class="mb-1 flex items-center gap-2 text-sm"
          data-testid="assistant-sent-file"
        >
          <img
            v-if="message.file.previewUrl"
            :src="message.file.previewUrl"
            :alt="message.file.name"
            class="max-h-48 max-w-full rounded-6 object-cover"
          />
          <template v-else>
            <span
              class="lucide-file-text size-4 flex-none text-ink-gray-7"
              aria-hidden="true"
            />
            <span class="min-w-0 truncate">{{ message.file.name }}</span>
          </template>
        </div>
        <p v-if="message.text" class="whitespace-pre-line break-words">
          {{ message.text }}
        </p>
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
        class="flex items-center gap-2 rounded-7 bg-surface-gray-1 py-1 pl-3 pr-1 text-sm text-ink-gray-8"
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
        <AssistantProse
          v-if="prose(message)"
          :text="prose(message)"
          @navigate="$emit('navigate')"
        />
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
        <AssistantCanvasFile
          v-for="file in canvasOf(message)"
          :key="file.file"
          :file="file"
          @open="openFile"
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
import AssistantCanvasFile from './AssistantCanvasFile.vue'
import AssistantProse from './AssistantProse.vue'
import {
  canvas,
  canvasByAnswer,
  loadCanvas,
  openInCanvas,
} from './assistantCanvas'
import {
  sessions,
  settledLine,
  showView,
  undoSettle,
} from './assistantSessions'
import {
  firstRecordLink,
  proseOf,
  splitButtons,
  stripEmoji,
  visibleMessages,
  withoutLink,
} from './assistantText'
import { assistant, retry, retryAnswer, tap } from './useAssistant'

// docked: the log scrolls itself; in the sheet the sheet's body scrolls.
const props = defineProps({ docked: { type: Boolean, default: false } })
defineEmits(['navigate'])

const end = ref(null)

// What the log shows: no unreplayable answers, no progress lines, no outage
// line a later answer has made old news (visibleMessages).
const shown = computed(() => visibleMessages(assistant.messages))
const hidden = computed(() => assistant.messages.some((m) => m.stale))
const settled = computed(() => settledLine(sessions.settled))

// Lienzo files under the answer they came with: the live link, or after a
// reload the first answer logged after the file was written.
const joined = computed(() => canvasByAnswer(assistant.messages, canvas.files))
function canvasOf(message) {
  return message.canvas || joined.value[message.id] || []
}
function openFile(file) {
  openInCanvas(file)
  showView('canvas')
}
watch(
  () => assistant.loaded,
  (loaded) => loaded && !canvas.loaded && loadCanvas(),
  { immediate: true },
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

// A receipt's record link is its card's «Abrir»: the reply does not repeat
// it while that card is on screen, confirmed, with this link. Without the
// card (a reload whose history edited it away) the reply keeps its link.
const shownCards = computed(
  () =>
    new Set(
      shown.value.flatMap((m) =>
        m.role === 'bot' ? view(m).cards.map((c) => c.id) : [],
      ),
    ),
)
function prose(message) {
  const text = view(message).prose
  const id = message.receiptOf
  if (!id || assistant.cards[id] !== 'confirmed' || !shownCards.value.has(id))
    return text
  const href = receipts.value[id]?.href
  return href && firstRecordLink(message.text)?.href === href
    ? withoutLink(text, href)
    : text
}

// The receipt of a confirmed card: the first record link of the reply after it.
const receipts = computed(() => {
  const out = {}
  for (const message of assistant.messages)
    if (message.receiptOf) {
      const link = firstRecordLink(message.text)
      if (link || !out[message.receiptOf]) out[message.receiptOf] = link || {}
    }
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

// While Muelle works, the status line stays in view. When an answer lands,
// it is read from its start: the question it answers at the top (Gemini,
// ChatGPT), not the end of a long answer with its beginning scrolled away.
const root = ref(null)
function follow() {
  nextTick(() => {
    const rows = root.value?.querySelectorAll?.('[data-role]') || []
    const last = rows[rows.length - 1]
    if (assistant.thinking || !last || last.dataset.role !== 'bot')
      return end.value?.scrollIntoView?.({ block: 'end' })
    const before = rows[rows.length - 2]
    const top = before?.dataset.role === 'user' ? before : last
    // The first question: the log from its top, so the «Las respuestas
    // anteriores…» line above it is read whole, not cut by the header.
    if (top !== rows[0]) return top.scrollIntoView?.({ block: 'start' })
    if (props.docked) root.value.scrollTop = 0
    else root.value.scrollIntoView?.({ block: 'start' })
  })
}
watch(() => [assistant.messages.length, assistant.thinking], follow)
onMounted(follow)
</script>
