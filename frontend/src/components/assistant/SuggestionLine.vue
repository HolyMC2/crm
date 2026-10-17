<template>
  <!-- Door 2 of «Pregúntale a Muelle»: one «Sugerencia» in the content, only
       when there is a concrete reason quoted from data, with one verb. Tapping
       it opens the sheet with the question already asked. At most one per
       screen, dismissable, never animated (ASSISTANT.md). -->
  <div
    v-if="visible"
    class="flex min-h-12 items-center gap-1 rounded-xl border border-outline-gray-2 bg-surface-base pl-3"
    data-testid="assistant-suggestion"
  >
    <button
      type="button"
      class="flex min-h-12 min-w-0 flex-1 items-center gap-2 py-2 text-left"
      @click="ask"
    >
      <span class="flex-none text-[var(--brand)]" aria-hidden="true">✦</span>
      <span class="min-w-0 flex-1 text-sm text-ink-gray-9">
        <span class="sr-only">{{ __('Suggestion') }}: </span>
        {{ reason }}
        <span class="font-semibold text-ink-gray-9"> · {{ verb }}</span>
      </span>
    </button>
    <button
      type="button"
      class="flex size-11 flex-none items-center justify-center rounded-lg text-ink-gray-6 hover:bg-surface-gray-2"
      :aria-label="__('Dismiss suggestion')"
      :title="__('Dismiss suggestion')"
      data-testid="assistant-suggestion-dismiss"
      @click="dismiss"
    >
      <span class="lucide-x size-4" aria-hidden="true" />
    </button>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { assistantEnabled, loadStatus, openAssistant } from './useAssistant'

const props = defineProps({
  /** Stable id of this suggestion (record + reason), so a dismissal sticks. */
  id: { type: String, required: true },
  /** The reason, quoted from data: «Le debe $775 desde marzo». */
  reason: { type: String, required: true },
  /** One verb: «Cobrar». */
  verb: { type: String, required: true },
  /** The question the sheet asks when tapped. */
  prompt: { type: String, required: true },
})

const KEY = 'muelle:assistant-dismissed'
function dismissed() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}
const gone = ref(dismissed().includes(props.id))
loadStatus()
const visible = computed(
  () => assistantEnabled.value && !gone.value && props.reason && props.verb,
)

function ask() {
  openAssistant({ text: props.prompt, send: true })
}
function dismiss() {
  gone.value = true
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify([...dismissed(), props.id].slice(-50)),
    )
  } catch {
    // private mode: dismissed for this view only
  }
}
</script>
