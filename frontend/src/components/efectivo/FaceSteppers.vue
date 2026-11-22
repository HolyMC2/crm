<template>
  <!-- One row per bill or coin: its face, the subtotal and a − count + stepper.
       Counting a bag (ConteoSheet) and setting the float's pieces (BolsasSheet)
       both type into these rows. -->
  <ul class="divide-y divide-outline-gray-1" :aria-label="label">
    <li
      v-for="face in faces"
      :key="face"
      class="flex min-h-12 items-center gap-3"
      :data-face="face"
    >
      <span
        class="num w-16 flex-none text-base font-semibold text-ink-gray-9"
        >{{ faceLabel(face) }}</span
      >
      <span
        class="num min-w-0 flex-1 truncate text-right text-sm text-ink-gray-5"
        >{{
          modelValue[face]
            ? money(fromMinor(face * modelValue[face]), currency)
            : ''
        }}</span
      >
      <div class="flex flex-none items-center gap-1">
        <button
          type="button"
          class="press grid size-10 place-items-center rounded-full bg-surface-gray-2 text-ink-gray-8 disabled:opacity-40"
          :aria-label="`Una pieza menos de ${faceLabel(face)}`"
          :disabled="!modelValue[face] || busy"
          @click="step(face, -1)"
        >
          <span class="lucide-minus size-5" aria-hidden="true" />
        </button>
        <input
          :value="modelValue[face] || ''"
          inputmode="numeric"
          pattern="[0-9]*"
          class="num h-10 w-14 rounded-4 border-0 bg-surface-gray-1 text-center text-base text-ink-gray-9"
          :aria-label="`Piezas de ${faceLabel(face)}`"
          placeholder="0"
          :disabled="busy"
          @input="type(face, $event.target.value)"
        />
        <button
          type="button"
          class="press grid size-10 place-items-center rounded-full bg-surface-gray-2 text-ink-gray-8"
          :aria-label="`Una pieza más de ${faceLabel(face)}`"
          :disabled="busy"
          @click="step(face, 1)"
        >
          <span class="lucide-plus size-5" aria-hidden="true" />
        </button>
      </div>
    </li>
  </ul>
</template>
<script setup>
import { faceLabel, fromMinor, money } from './efectivo'

const props = defineProps({
  /** Faces in minor units (centavos), largest first. */
  faces: { type: Array, required: true },
  /** {face: quantity}. */
  modelValue: { type: Object, required: true },
  currency: { type: String, default: 'MXN' },
  busy: { type: Boolean, default: false },
  label: { type: String, default: 'Conteo por denominación' },
})
const emit = defineEmits(['update:modelValue'])

function step(face, delta) {
  const next = Math.max(0, (Number(props.modelValue[face]) || 0) + delta)
  emit('update:modelValue', { ...props.modelValue, [face]: next })
}
function type(face, text) {
  const n = Number(String(text).replace(/\D/g, '').slice(0, 6)) || 0
  emit('update:modelValue', { ...props.modelValue, [face]: n })
}
</script>
