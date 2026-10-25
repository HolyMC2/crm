<template>
  <!-- Read-only code with line numbers: monospace, scrolls sideways inside
       its own box (never the page). -->
  <div
    class="max-h-[60vh] overflow-auto rounded-6 border border-outline-gray-2 bg-surface-gray-1"
    data-testid="scripts-code"
  >
    <p v-if="!lines.length" class="px-4 py-3 text-base text-ink-gray-6">
      {{ empty }}
    </p>
    <pre
      v-else
      class="py-2 font-mono text-sm leading-5 text-ink-gray-9"
      :aria-label="label"
    ><code><span
        v-for="line in lines"
        :key="line.n"
        class="flex"
      ><span
          class="w-12 flex-none select-none pr-3 text-right text-ink-gray-5"
          aria-hidden="true"
        >{{ line.n }}</span><span class="whitespace-pre pr-4">{{ line.text || ' ' }}</span></span></code></pre>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { numberedLines } from './scripts'

const props = defineProps({
  code: { type: String, default: '' },
  label: { type: String, default: 'Código' },
  empty: { type: String, default: 'Sin código todavía.' },
})
const lines = computed(() => numberedLines(props.code))
</script>
