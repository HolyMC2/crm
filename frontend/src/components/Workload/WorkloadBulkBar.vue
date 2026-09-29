<template>
  <div
    class="sticky bottom-0 z-10 -mx-4 border-t border-outline-gray-2 bg-surface-base px-4 py-3 shadow-sm"
    role="region"
    :aria-label="__('Reasignar selección')"
  >
    <div class="flex flex-wrap items-center gap-2">
      <p class="text-sm font-medium tabular-nums text-ink-gray-8">
        {{ count }} {{ __('seleccionados') }}
      </p>
      <label class="flex min-w-0 flex-1 basis-56 items-center gap-2 text-sm">
        <span class="shrink-0 text-ink-gray-6">{{ __('Reasignar a…') }}</span>
        <select
          class="min-h-9 w-full min-w-0 rounded-md border border-outline-gray-2 bg-surface-base px-2 text-sm text-ink-gray-8"
          :value="modelValue"
          :disabled="moving"
          @change="$emit('update:modelValue', $event.target.value)"
        >
          <option value="">{{ __('Elige una persona habilitada') }}</option>
          <option
            v-for="candidate in candidates"
            :key="candidate.user"
            :value="candidate.user"
          >
            {{ optionLabel(candidate) }}
          </option>
        </select>
      </label>
      <div class="flex gap-2">
        <button
          type="button"
          class="min-h-9 rounded-md bg-surface-gray-3 px-3 text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-4 disabled:opacity-50"
          :disabled="moving || !count || !modelValue"
          @click="$emit('move')"
        >
          {{ moving ? __('Reasignando…') : __('Reasignar selección') }}
        </button>
        <button
          type="button"
          class="min-h-9 rounded-md border border-outline-gray-2 px-3 text-sm text-ink-gray-8 disabled:opacity-50"
          :disabled="moving"
          @click="$emit('clear')"
        >
          {{ __('Limpiar') }}
        </button>
      </div>
    </div>
    <p class="mt-1 text-xs text-ink-gray-5">
      {{
        __(
          'Ordenado por menor carga visible. Se comprueban los permisos de la persona en cada registro; capacidad y turno no bloquean.',
        )
      }}
    </p>
  </div>
</template>

<script setup>
defineProps({
  count: { type: Number, default: 0 },
  candidates: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' },
  moving: { type: Boolean, default: false },
})
defineEmits(['update:modelValue', 'move', 'clear'])

function optionLabel(candidate) {
  const parts = [candidate.full_name || candidate.user]
  if (candidate.load != null) parts.push(__('{0} abiertos', [candidate.load]))
  if (candidate.overdue) parts.push(__('{0} vencidas', [candidate.overdue]))
  if (candidate.at_capacity) parts.push(__('Capacidad orientativa alcanzada'))
  if (candidate.shift === 'on_shift') parts.push(__('En turno'))
  else if (candidate.shift === 'off_shift') parts.push(__('Fuera de turno'))
  return parts.join(' · ')
}
</script>
