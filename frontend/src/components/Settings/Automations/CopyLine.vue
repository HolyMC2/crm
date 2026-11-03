<template>
  <!-- A value to paste into n8n, with its own copy button. -->
  <div class="flex min-w-0 flex-col gap-0.5">
    <span class="text-xs text-ink-gray-6">{{ label }}</span>
    <div
      class="flex min-w-0 items-center gap-1 rounded-4 border border-outline-gray-2 bg-surface-gray-1 pl-2"
    >
      <code
        class="min-w-0 flex-1 py-1.5 text-xs text-ink-gray-8 [overflow-wrap:anywhere]"
        >{{ value }}</code
      >
      <button
        type="button"
        class="press flex size-9 flex-none items-center justify-center rounded-4 text-ink-gray-6 hover:bg-surface-gray-2"
        :aria-label="__('Copy {0}', [label])"
        :title="__('Copy')"
        @click="copy"
      >
        <span
          :class="copied ? 'lucide-check' : 'lucide-copy'"
          class="size-4"
          aria-hidden="true"
        />
      </button>
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { toast } from 'frappe-ui'

const props = defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
})
const copied = ref(false)
let timer
async function copy() {
  try {
    await navigator.clipboard.writeText(props.value)
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (copied.value = false), 1500)
  } catch {
    toast.error(
      __('The browser did not allow copying. Select the text and copy it.'),
    )
  }
}
</script>
