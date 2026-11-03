<template>
  <!-- The named colours of a board (schema.COLORES), «Sin color», and any
       other as a hex: the shell paints values, never CSS. -->
  <div
    role="radiogroup"
    :aria-label="label"
    class="flex flex-wrap items-center gap-2"
  >
    <button
      type="button"
      role="radio"
      :aria-checked="!model ? 'true' : 'false'"
      class="press flex size-11 items-center justify-center rounded-full border border-outline-gray-3 text-ink-gray-6"
      :class="!model && 'ring-2 ring-ink-gray-8 ring-offset-2'"
      aria-label="Sin color"
      title="Sin color"
      @click="model = ''"
    >
      <span class="lucide-ban size-4" aria-hidden="true" />
    </button>
    <button
      v-for="c in COLORES"
      :key="c.name"
      type="button"
      role="radio"
      :aria-checked="model === c.hex ? 'true' : 'false'"
      class="press size-11 rounded-full"
      :class="model === c.hex && 'ring-2 ring-ink-gray-8 ring-offset-2'"
      :style="{ background: c.hex }"
      :aria-label="c.label"
      :title="c.label"
      :data-testid="`color-${c.name}`"
      @click="model = c.hex"
    />
    <label class="flex min-h-11 items-center gap-1.5 text-sm text-ink-gray-7">
      <input
        type="color"
        class="size-9 cursor-pointer rounded-full border-0 bg-transparent p-0"
        :value="model || '#2a78d6'"
        :aria-label="`${label}: otro color`"
        @input="(event) => (model = event.target.value)"
      />
      Otro
    </label>
  </div>
</template>
<script setup>
import { COLORES } from '@/tableros/board'

defineProps({ label: { type: String, default: 'Color' } })
const model = defineModel({ type: String, default: '' })
</script>
