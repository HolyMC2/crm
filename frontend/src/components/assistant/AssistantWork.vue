<template>
  <!-- How Muelle works on a turn. `live`: the thinking line, made-up words
       and the time so far; over an answer: «Trabajó 9 s en 4 pasos». A tap
       unfolds the real steps: what each did, the tool it ran, how long. -->
  <div
    class="text-sm"
    :data-testid="live ? 'assistant-thinking' : 'assistant-work'"
  >
    <span v-if="live" role="status" class="sr-only">{{
      __('Muelle is working')
    }}</span>
    <button
      type="button"
      class="press -ml-1 flex min-h-11 max-w-full items-center gap-2 rounded-6 px-1 text-left hover:bg-surface-gray-1"
      :class="
        live ? 'text-ink-gray-8' : '-my-2 text-ink-gray-5 hover:text-ink-gray-8'
      "
      :aria-expanded="String(open)"
      :aria-controls="panelId"
      :aria-label="
        live
          ? open
            ? __('Hide the steps')
            : __('See how Muelle is working')
          : undefined
      "
      data-testid="assistant-work-toggle"
      @click="toggle"
    >
      <template v-if="live">
        <span
          class="inline-flex w-4 flex-none justify-center text-[var(--brand)]"
          :class="{ 'motion-safe:animate-pulse': still }"
          aria-hidden="true"
          >{{ glyph }}</span
        >
        <span
          class="min-w-0 truncate font-medium"
          aria-hidden="true"
          data-testid="assistant-phrase"
          >{{ phrase }}…</span
        >
        <span class="num flex-none text-ink-gray-5" aria-hidden="true">{{
          tally
        }}</span>
      </template>
      <span v-else class="min-w-0 truncate">{{ summary }}</span>
      <span
        class="lucide-chevron-down size-4 flex-none text-ink-gray-5 transition-transform motion-reduce:transition-none"
        :class="{ 'rotate-180': open }"
        aria-hidden="true"
      />
    </button>
    <p v-if="live && progress" class="ml-6 text-ink-gray-6">{{ progress }}</p>
    <ExpandTransition>
      <div
        v-if="open"
        :id="panelId"
        class="ml-2 mt-1 border-l border-outline-gray-2 pl-3"
      >
        <ol class="space-y-0.5" data-testid="assistant-steps">
          <li
            v-for="(step, index) in model.steps"
            :key="index"
            class="flex min-h-7 items-center gap-2"
            :data-state="
              step.end == null ? 'running' : step.failed ? 'failed' : 'done'
            "
          >
            <span
              class="inline-flex size-4 flex-none items-center justify-center"
              aria-hidden="true"
            >
              <span
                v-if="step.end == null"
                class="text-[var(--brand)] motion-safe:animate-pulse"
                >✦</span
              >
              <span
                v-else-if="step.failed"
                class="lucide-x size-3.5 text-ink-red-7"
              />
              <span v-else class="lucide-check size-3.5 text-ink-gray-5" />
            </span>
            <span class="min-w-0 flex-1 text-ink-gray-8">
              {{ labelOf(step) }}
              <code
                v-if="step.tool"
                class="ml-1 whitespace-nowrap rounded-4 bg-surface-gray-2 px-1 font-mono text-xs text-ink-gray-6"
                >{{ step.tool }}</code
              >
            </span>
            <span class="num flex-none text-ink-gray-5">{{
              stepTime(step)
            }}</span>
          </li>
          <li v-if="!model.steps.length" class="min-h-7 text-ink-gray-6">
            {{ __('The first step shows here as soon as it starts.') }}
          </li>
        </ol>
        <p
          v-if="usageLine"
          class="mt-1 text-ink-gray-5"
          data-testid="assistant-usage"
        >
          {{ usageLine }}
        </p>
      </div>
    </ExpandTransition>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import ExpandTransition from '@/components/ui/ExpandTransition.vue'
import {
  durationText,
  liveTurn,
  numberText,
  shuffledPhrases,
  stepsOf,
  work,
} from './assistantActivity'

const props = defineProps({
  /** The thinking line of the turn that runs now. */
  live: { type: Boolean, default: false },
  /** An answer's turn (not live). */
  turnId: { type: String, default: '' },
  /** The answer's receipt from history (doco chat_usage.summary). */
  usage: { type: Object, default: null },
  /** doco's own progress line («Recibido (CAP-…)…»), shown under the words. */
  progress: { type: String, default: '' },
})

// Claude Code's spinner, on Muelle's ✦: a star that turns while it works.
const FRAMES = ['✦', '✧', '✶', '✷', '✸', '✹', '✺', '✹', '✸', '✷', '✶', '✧']
const FRAME_MS = 140
const PHRASE_MS = 3200

const panelId = `assistant-work-${useId()}`

const turn = computed(() =>
  props.live ? liveTurn() : work.turns[props.turnId] || null,
)
const model = computed(() => stepsOf(turn.value))
const receipt = computed(
  () => props.usage || work.usage[turn.value?.id || props.turnId] || null,
)

// --- open or folded: kept per turn, so the steps opened while it ran stay
// open over its answer
const opened = ref(false)
const key = computed(() => turn.value?.id || (props.live ? '' : props.turnId))
const open = computed(() =>
  key.value && key.value in work.open
    ? work.open[key.value]
    : props.live && opened.value,
)
function toggle() {
  const next = !open.value
  opened.value = next
  if (key.value) work.open = { ...work.open, [key.value]: next }
}
watch(key, (id) => {
  if (props.live && id && opened.value && !(id in work.open))
    work.open = { ...work.open, [id]: true }
})

// --- the live line's clock, star and words ----------------------------------
const now = ref(Date.now())
const mountedAt = Date.now()
const frame = ref(0)
const phrases = shuffledPhrases()
const phraseAt = ref(0)
const still =
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
const timers = []
onMounted(() => {
  if (!props.live) return
  timers.push(setInterval(() => (now.value = Date.now()), 1000))
  timers.push(setInterval(() => (phraseAt.value += 1), PHRASE_MS))
  if (!still) timers.push(setInterval(() => (frame.value += 1), FRAME_MS))
})
onBeforeUnmount(() => timers.forEach(clearInterval))

const glyph = computed(() =>
  still ? '✦' : FRAMES[frame.value % FRAMES.length],
)
const phrase = computed(() => phrases[phraseAt.value % phrases.length])

/** ms since the turn started: the server's clock when it has spoken, else ours. */
const elapsed = computed(() => {
  const events = turn.value?.events || []
  const last = events[events.length - 1]
  return last
    ? last.elapsed + Math.max(0, now.value - last.received)
    : now.value - mountedAt
})

function stepsWord(count) {
  return count === 1 ? __('1 step') : __('{0} steps', [count])
}

const tally = computed(() => {
  const time = wholeTime(elapsed.value)
  const count = model.value.steps.length
  return count ? `${time}, ${stepsWord(count)}` : time
})

function wholeTime(ms) {
  // the live clock ticks in whole seconds, as a stopwatch does
  return ms < 60000 ? `${Math.floor(ms / 1000)} s` : durationText(ms)
}

// --- an answer's line ----------------------------------------------------------
const summary = computed(() => {
  const steps = model.value.steps.length
  const total =
    model.value.total ??
    turn.value?.events?.at(-1)?.elapsed ??
    (Number.isFinite(Number(receipt.value?.latency_ms))
      ? Number(receipt.value.latency_ms)
      : 0)
  const time = durationText(total)
  if (model.value.failed) return __('Stopped after {0}', [time])
  if (!steps) return __('Worked for {0}', [time])
  return steps === 1
    ? __('Worked for {0} in 1 step', [time])
    : __('Worked for {0} in {1} steps', [time, steps])
})

const usageLine = computed(() => {
  const usage = receipt.value
  const calls = Number(usage?.calls) || 0
  if (!calls) return ''
  const tokens = `${usage.complete === false ? '≥ ' : ''}${numberText(usage.total_tokens)}`
  return calls === 1
    ? __('1 model call, {0} tokens', [tokens])
    : __('{0} model calls, {1} tokens', [calls, tokens])
})

function labelOf(step) {
  if (step.kind === 'prepare') return __('Reading your question')
  if (step.kind === 'tool') return step.detail || __('Using a tool')
  return step.answer
    ? __('Writing the answer')
    : __('Thinking about the next step')
}

function stepTime(step) {
  if (step.end != null) return durationText(step.end - step.start)
  return props.live ? wholeTime(Math.max(0, elapsed.value - step.start)) : ''
}
</script>
