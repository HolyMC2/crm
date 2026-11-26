<template>
  <!-- «/btw»: a question on the side (assistantBtw.js). The kit's sheet over the
       conversation: about 60% of a phone, so the conversation stays in view
       above it, and a dialog on a desktop. Its own short thread, its own
       composer, closed in one tap (×, swipe down, Esc, the scrim). Nothing here
       touches the conversation underneath. -->
  <BottomSheet
    :open="btw.open"
    :title="__('On the side')"
    :aria-label="__('On the side')"
    layer="assistant-btw"
    @update:open="(open) => !open && closeBtw()"
  >
    <div class="space-y-3 pb-2" data-testid="assistant-btw">
      <p
        v-if="!btw.rows.length && !btw.thinking"
        class="py-6 text-center text-base text-ink-gray-6"
      >
        {{ __('Ask without stopping what Muelle is doing.') }}
      </p>
      <div
        v-for="message in btw.rows"
        :key="message.id"
        class="flex"
        :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
        :data-btw-row="message.role"
      >
        <p
          v-if="message.role === 'user'"
          class="max-w-[85%] whitespace-pre-line rounded-6 bg-[var(--muelle-secondary-container)] px-3.5 py-2 text-base text-[var(--muelle-on-secondary-container)]"
        >
          {{ message.text }}
        </p>
        <div v-else class="min-w-0 max-w-full space-y-2">
          <AssistantProse :text="message.text" />
          <div v-if="message.buttons.length" class="flex flex-wrap gap-2">
            <template v-for="(line, l) in message.buttons" :key="l">
              <Button
                v-for="button in [].concat(line)"
                :key="button.callback_data || button.text"
                class="press"
                :loading="btw.taps[button.callback_data] === 'sending'"
                :disabled="btw.taps[button.callback_data] === 'done'"
                @click="tapBtw(button.callback_data)"
              >
                {{ button.text }}
              </Button>
            </template>
          </div>
        </div>
      </div>
      <p
        v-if="btw.thinking"
        class="flex items-center gap-2 text-sm text-ink-gray-6"
        data-testid="assistant-btw-thinking"
      >
        <span class="lucide-sparkles size-4 animate-pulse" aria-hidden="true" />
        {{ __('Looking it up…') }}
      </p>
      <p v-if="btw.error" class="text-sm text-ink-red-7" role="alert">
        {{ btw.error }}
      </p>
    </div>
    <template #footer>
      <form class="flex items-end gap-2 px-5 pb-3 pt-1" @submit.prevent="send">
        <textarea
          ref="input"
          v-model="btw.draft"
          rows="1"
          class="ui-focus max-h-32 min-h-11 flex-1 resize-none rounded-6 border-0 bg-surface-gray-4 px-4 py-2.5 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-0"
          enterkeyhint="send"
          :placeholder="__('Your question on the side')"
          :aria-label="__('Your question on the side')"
          data-testid="assistant-btw-input"
          @keydown.enter.exact.prevent="send"
        />
        <button
          type="submit"
          class="press flex size-11 flex-none items-center justify-center rounded-full bg-surface-gray-10 text-ink-base disabled:bg-surface-gray-3 disabled:text-ink-gray-5"
          :disabled="!btw.draft.trim()"
          :aria-label="__('Send')"
          :title="__('Send')"
        >
          <span class="lucide-arrow-up size-5" aria-hidden="true" />
        </button>
      </form>
    </template>
  </BottomSheet>
</template>
<script setup>
import { nextTick, ref, watch } from 'vue'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import AssistantProse from './AssistantProse.vue'
import { askBtw, btw, closeBtw, tapBtw } from './assistantBtw'

const input = ref(null)

function send() {
  if (btw.draft.trim()) askBtw(btw.draft)
}

watch(
  () => btw.focus,
  () => nextTick(() => input.value?.focus({ preventScroll: true })),
)
</script>
