<template>
  <!-- The labels as they will print: the server's own HTML in a sandboxed
       frame (no scripts), on the grey of a label roll. Its height holds while
       a new preview loads, so nothing jumps. -->
  <figure
    class="relative overflow-hidden rounded-8 bg-surface-gray-2"
    :aria-busy="loading ? 'true' : 'false'"
    data-etq-preview
  >
    <iframe
      v-if="html"
      :srcdoc="framed"
      :title="title"
      sandbox="allow-same-origin"
      class="block w-full border-0 transition-opacity duration-150 ease-out motion-reduce:transition-none"
      :class="loading ? 'opacity-60' : 'opacity-100'"
      :style="{ height: `${height}px` }"
      @load="fit"
    />
    <div
      v-else
      class="flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-ink-gray-6"
      :style="{ height: `${height}px` }"
    >
      <span
        v-if="loading"
        class="lucide-loader-circle size-5 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span>{{ loading ? 'Dibujando la vista previa…' : empty }}</span>
    </div>
    <figcaption
      v-if="caption"
      class="border-t border-outline-gray-1 bg-surface-base px-3 py-2 text-xs text-ink-gray-6"
    >
      {{ caption }}
    </figcaption>
  </figure>
</template>
<script setup>
import { computed, ref } from 'vue'
import { withBase } from '@/composables/useEtiquetas'

const props = defineProps({
  html: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  title: { type: String, default: 'Vista previa de las etiquetas' },
  caption: { type: String, default: '' },
  empty: {
    type: String,
    default: 'Agrega productos y aquí ves las etiquetas como saldrán.',
  },
  minHeight: { type: Number, default: 180 },
  maxHeight: { type: Number, default: 420 },
})

const height = ref(props.minHeight)
const framed = computed(() => withBase(props.html))

// The frame grows to its labels (up to maxHeight) once they are drawn.
function fit(event) {
  try {
    const doc = event.target.contentDocument
    const full = doc?.documentElement?.scrollHeight || 0
    if (full)
      height.value = Math.min(props.maxHeight, Math.max(props.minHeight, full))
  } catch {
    height.value = props.maxHeight
  }
}
</script>
