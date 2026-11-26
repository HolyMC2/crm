<template>
  <!-- An action the assistant proposes: short at first (what it is, the
       amount, its buttons); a tap on its body opens the whole of it in place
       (every line, the records as links, why, what the tap changes) and a
       second tap closes it. Its buttons work open or closed. Nothing changes
       until the worker confirms; after that the card is a receipt with
       «Abrir». A finding of the round (doco assistant/ronda) also offers
       «Mañana» and «No me avises». -->
  <article
    class="rounded-7 border border-outline-gray-2 bg-surface-base"
    :aria-label="__('Proposed action')"
    data-testid="assistant-card"
    :data-open="open ? '' : undefined"
  >
    <button
      v-if="hasMore"
      type="button"
      class="state-layer block w-full rounded-t-7 px-3 pb-1 pt-3 text-left"
      :aria-expanded="String(open)"
      data-testid="assistant-card-body"
      @click="open = !open"
    >
      <span class="flex items-start gap-2">
        <span class="min-w-0 flex-1">
          <span class="block text-xs font-medium text-ink-gray-6">
            {{ heading }}
          </span>
          <span
            class="mt-1 block whitespace-pre-line break-words text-base leading-normal text-ink-gray-9"
            data-testid="assistant-card-summary"
          >
            {{ card.summary }}
          </span>
        </span>
        <span
          :class="[
            open ? 'lucide-chevron-up' : 'lucide-chevron-down',
            'mt-0.5 size-4 flex-none text-ink-gray-5',
          ]"
          aria-hidden="true"
        />
      </span>
    </button>
    <div v-else class="px-3 pb-1 pt-3">
      <p class="text-xs font-medium text-ink-gray-6">{{ heading }}</p>
      <p
        class="mt-1 whitespace-pre-line break-words text-base leading-normal text-ink-gray-9"
        data-testid="assistant-card-summary"
      >
        {{ card.summary }}
      </p>
    </div>
    <ExpandTransition>
      <div
        v-if="open && hasMore"
        class="px-3 pb-1 text-sm text-ink-gray-8"
        data-testid="assistant-card-detail"
      >
        <AssistantProse :text="card.detail" @navigate="$emit('navigate')" />
      </div>
    </ExpandTransition>
    <div class="px-3 pb-3">
      <div
        v-if="state === 'confirmed'"
        class="mt-2 flex min-h-11 flex-wrap items-center gap-2"
      >
        <span class="flex items-center gap-1 text-sm text-ink-green-7">
          <span class="lucide-check size-4" aria-hidden="true" />
          {{ receipt ? __('Done') : __('Confirmed, saving…') }}
        </span>
        <RouterLink
          v-if="receipt?.to"
          :to="receipt.to"
          class="ml-auto flex min-h-11 items-center rounded-6 px-3 text-sm font-medium text-ink-blue-link"
          data-testid="assistant-card-open"
          @click="$emit('navigate')"
        >
          {{ __('Open', null, 'Assistant link') }}
        </RouterLink>
      </div>
      <p
        v-else-if="state === 'changed'"
        class="mt-2 min-h-11 text-sm text-ink-gray-6"
      >
        {{
          card.later || card.mute
            ? __('Noted.')
            : __('Not applied. Tell Muelle what to change.')
        }}
      </p>
      <div v-else class="mt-2 flex flex-wrap items-center justify-end gap-2">
        <button
          v-if="card.mute"
          type="button"
          class="press mr-auto min-h-11 rounded-full px-3 text-sm font-medium text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-50"
          :disabled="state === 'sending'"
          :aria-label="__('Do not tell me about this')"
          :title="__('Do not tell me about this')"
          data-testid="assistant-card-mute"
          @click="$emit('mute', card)"
        >
          <span class="lucide-bell-off size-4" aria-hidden="true" />
        </button>
        <button
          v-if="card.discard"
          type="button"
          class="press min-h-11 rounded-full px-4 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50"
          :disabled="state === 'sending'"
          data-testid="assistant-card-discard"
          @click="$emit('discard', card)"
        >
          {{ card.discardLabel || __('Discard') }}
        </button>
        <button
          v-if="card.later"
          type="button"
          class="press min-h-11 rounded-full px-4 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50"
          :disabled="state === 'sending'"
          data-testid="assistant-card-later"
          @click="$emit('later', card)"
        >
          {{ __('Tomorrow') }}
        </button>
        <button
          v-if="card.change"
          type="button"
          class="press min-h-11 rounded-full px-4 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50"
          :disabled="state === 'sending'"
          data-testid="assistant-card-change"
          @click="$emit('change', card)"
        >
          {{ __('Change', null, 'Assistant card') }}
        </button>
        <button
          type="button"
          class="press min-h-11 rounded-full bg-surface-gray-10 px-5 text-sm font-medium text-ink-base hover:bg-surface-gray-9 disabled:opacity-50"
          :disabled="state === 'sending'"
          data-testid="assistant-card-confirm"
          @click="$emit('confirm', card)"
        >
          {{
            state === 'sending'
              ? __('Confirming…')
              : card.confirmLabel || __('Confirm')
          }}
        </button>
      </div>
      <p
        v-if="state === 'failed'"
        role="alert"
        class="mt-2 text-sm text-ink-red-7"
      >
        {{ __('It was not applied. Try again.') }}
      </p>
    </div>
  </article>
</template>
<script setup>
import { computed, ref } from 'vue'
import { ExpandTransition } from '@/components/ui'
import AssistantProse from './AssistantProse.vue'

const props = defineProps({
  card: { type: Object, required: true },
  /** undefined | 'sending' | 'confirmed' | 'changed' | 'failed' */
  state: { type: String, default: '' },
  /** The receipt's record link ({ to }), once the reply arrives. */
  receipt: { type: Object, default: null },
})
defineEmits(['confirm', 'change', 'later', 'mute', 'discard', 'navigate'])

// Closed by default: the summary carries what it is and its amount.
const open = ref(false)
const hasMore = computed(() => Boolean(String(props.card.detail || '').trim()))

// «Muelle propone · Pendiente personal»: the kind of change in the heading.
const heading = computed(() =>
  props.state === 'confirmed'
    ? __('Saved', null, 'Assistant card')
    : props.card.later || props.card.mute
      ? __('Muelle noticed')
      : __('Muelle proposes'),
)
</script>
