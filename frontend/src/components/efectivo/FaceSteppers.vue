<template>
  <!-- One cell per bill or coin: its face, the subtotal and a − count +
       stepper. Rows (`grid` off) for counting a bag (ConteoSheet), where the
       subtotals line up; a grid of tonal cells for setting the float's pieces
       (CajaFuerteSheet), every face on one screen. -->
  <ul
    :class="
      grid
        ? 'grid grid-cols-2 gap-0.5 overflow-hidden rounded-6 sm:grid-cols-3'
        : 'divide-y divide-outline-gray-1'
    "
    :aria-label="label"
    :data-face-grid="grid ? '' : undefined"
  >
    <li
      v-for="face in faces"
      :key="face"
      :class="
        grid
          ? 'flex flex-col gap-1 bg-[var(--muelle-surface-container-high)] px-3 py-2'
          : 'flex min-h-12 items-center gap-3'
      "
      :data-face="face"
    >
      <span
        :class="grid ? 'flex items-baseline justify-between gap-2' : 'contents'"
      >
        <span
          class="num flex-none text-base font-semibold text-ink-gray-9"
          :class="grid ? '' : 'w-16'"
          >{{ faceLabel(face, currency) }}</span
        >
        <span
          class="num min-w-0 truncate text-right text-sm text-ink-gray-6"
          :class="grid ? '' : 'flex-1'"
          >{{
            modelValue[face]
              ? money(fromMinor(face * modelValue[face]), currency)
              : ''
          }}</span
        >
      </span>
      <div
        class="flex flex-none items-center gap-1"
        :class="grid ? 'justify-between' : ''"
      >
        <button
          type="button"
          class="press grid size-10 flex-none place-items-center rounded-full bg-surface-gray-2 text-ink-gray-8 disabled:opacity-40"
          :aria-label="`Una pieza menos de ${faceLabel(face, currency)}`"
          :disabled="!modelValue[face] || busy"
          @click="step(face, -1)"
        >
          <span class="lucide-minus size-5" aria-hidden="true" />
        </button>
        <input
          :value="modelValue[face] || ''"
          inputmode="numeric"
          pattern="[0-9]*"
          class="num h-10 w-14 min-w-0 rounded-4 border-0 text-center text-base text-ink-gray-9 focus:ring-2 focus:ring-[var(--muelle-accent)]"
          :class="grid ? 'bg-transparent font-semibold' : 'bg-surface-gray-1'"
          :aria-label="`Piezas de ${faceLabel(face, currency)}`"
          placeholder="0"
          :disabled="busy"
          @input="type(face, $event.target.value)"
        />
        <button
          type="button"
          class="press grid size-10 flex-none place-items-center rounded-full bg-surface-gray-2 text-ink-gray-8"
          :aria-label="`Una pieza más de ${faceLabel(face, currency)}`"
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
  /** The safe's or the drawer's currency, from its read. */
  currency: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  label: { type: String, default: 'Conteo por denominación' },
  /** Tonal cells in a grid instead of rows. */
  grid: { type: Boolean, default: false },
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
