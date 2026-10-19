<template>
  <!-- «−  100%  +»: zoom over the page fitted to the width (100%). -->
  <div
    class="inline-flex flex-none items-center rounded-full border border-outline-gray-2"
    role="group"
    aria-label="Zoom"
  >
    <button
      type="button"
      class="flex size-11 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50"
      aria-label="Alejar"
      :disabled="modelValue <= ZOOMS[0]"
      @click="emit('update:modelValue', stepZoom(modelValue, -1))"
    >
      <span class="lucide-minus size-4" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="min-h-11 min-w-12 px-1 text-sm font-medium tabular-nums text-ink-gray-8"
      aria-label="Ajustar al ancho"
      @click="emit('update:modelValue', 1)"
    >
      {{ zoomText(modelValue) }}
    </button>
    <button
      type="button"
      class="flex size-11 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50"
      aria-label="Acercar"
      :disabled="modelValue >= ZOOMS.at(-1)"
      @click="emit('update:modelValue', stepZoom(modelValue, 1))"
    >
      <span class="lucide-plus size-4" aria-hidden="true" />
    </button>
  </div>
</template>
<script setup>
import { ZOOMS, stepZoom, zoomText } from './impresion'

defineProps({ modelValue: { type: Number, default: 1 } })
const emit = defineEmits(['update:modelValue'])
</script>
