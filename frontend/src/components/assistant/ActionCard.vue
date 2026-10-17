<template>
  <!-- An action the assistant proposes: what will change, then «Confirmar»
       (filled) or «Cambiar» (text). Nothing changes until the worker
       confirms; after that the card is a receipt with «Abrir». -->
  <article
    class="rounded-xl border border-outline-gray-2 bg-surface-base p-3"
    :aria-label="__('Proposed action')"
    data-testid="assistant-card"
  >
    <p class="text-xs font-medium text-ink-gray-6">
      {{ heading }}
    </p>
    <p class="mt-1 whitespace-pre-line break-words text-base text-ink-gray-9">
      {{ card.summary }}
    </p>
    <div
      v-if="state === 'confirmed'"
      class="mt-3 flex min-h-11 flex-wrap items-center gap-2"
    >
      <span class="flex items-center gap-1 text-sm text-ink-green-7">
        <span class="lucide-check size-4" aria-hidden="true" />
        {{ receipt ? __('Done') : __('Confirmed, saving…') }}
      </span>
      <RouterLink
        v-if="receipt?.to"
        :to="receipt.to"
        class="ml-auto flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-ink-blue-link"
        data-testid="assistant-card-open"
        @click="$emit('navigate')"
      >
        {{ __('Open') }}
      </RouterLink>
    </div>
    <p
      v-else-if="state === 'changed'"
      class="mt-3 min-h-11 text-sm text-ink-gray-6"
    >
      {{ __('Not applied. Tell Muelle what to change.') }}
    </p>
    <div v-else class="mt-3 flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        class="min-h-11 rounded-full px-4 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50"
        :disabled="state === 'sending'"
        data-testid="assistant-card-change"
        @click="$emit('change', card)"
      >
        {{ __('Change') }}
      </button>
      <button
        type="button"
        class="min-h-11 rounded-full bg-surface-gray-10 px-5 text-sm font-medium text-ink-base hover:bg-surface-gray-9 disabled:opacity-50"
        :disabled="state === 'sending'"
        data-testid="assistant-card-confirm"
        @click="$emit('confirm', card)"
      >
        {{ state === 'sending' ? __('Confirming…') : __('Confirm') }}
      </button>
    </div>
    <p
      v-if="state === 'failed'"
      role="alert"
      class="mt-2 text-sm text-ink-red-7"
    >
      {{ __('It was not applied. Try again.') }}
    </p>
  </article>
</template>
<script setup>
import { computed } from 'vue'

const props = defineProps({
  card: { type: Object, required: true },
  /** undefined | 'sending' | 'confirmed' | 'changed' | 'failed' */
  state: { type: String, default: '' },
  /** The receipt's record link ({ to }), once the reply arrives. */
  receipt: { type: Object, default: null },
})
defineEmits(['confirm', 'change', 'navigate'])

const heading = computed(() =>
  props.state === 'confirmed' ? __('Receipt') : __('Muelle proposes'),
)
</script>
