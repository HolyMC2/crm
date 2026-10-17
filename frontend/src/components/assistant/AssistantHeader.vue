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
      <div
        v-if="chipTitle"
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
      <button
        v-if="closable"
        type="button"
        class="-mr-2 ml-auto flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
        :aria-label="__('Close')"
        :title="docked ? `${__('Close')} (${closeKey})` : __('Close')"
        data-testid="assistant-close"
        @click="$emit('close')"
      >
        <span class="lucide-x size-5" aria-hidden="true" />
      </button>
    </div>

    <div
      v-if="chips.length"
      class="flex gap-2 overflow-x-auto pb-1 pt-1 [scrollbar-width:none]"
      :class="docked ? 'flex-wrap px-4' : ''"
      data-testid="assistant-chips"
    >
      <button
        v-for="chip in chips"
        :key="chip.label"
        type="button"
        class="min-h-11 flex-none whitespace-nowrap rounded-lg border border-outline-gray-2 px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50"
        :disabled="assistant.thinking"
        @click="useChip(chip)"
      >
        {{ chip.label }}
      </button>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { keyLabel } from '@/composables/shellKeyboard'
import { chipsFor } from './assistantText'
import { assistant, send } from './useAssistant'

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

// A chip that needs a detail fills the composer (which takes the focus);
// the others ask at once.
function useChip(chip) {
  if (chip.fill) {
    assistant.draft = chip.prompt
    assistant.focus += 1
  } else send(chip.prompt)
}
</script>
