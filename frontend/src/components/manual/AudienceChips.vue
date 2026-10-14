<template>
  <fieldset>
    <legend class="mb-1.5 text-xs text-ink-gray-5">
      {{ __('Who reads it') }}
    </legend>
    <div class="flex flex-wrap gap-2" data-testid="manual-audience">
      <button
        type="button"
        class="min-h-11 rounded-full border px-4 text-sm sm:min-h-8"
        :class="chip(!modelValue.length)"
        :aria-pressed="!modelValue.length"
        @click="emit('update:modelValue', [])"
      >
        {{ __('Everyone', null, CTX) }}
      </button>
      <button
        v-for="option in AUDIENCE"
        :key="option.value"
        type="button"
        class="min-h-11 rounded-full border px-4 text-sm sm:min-h-8"
        :class="chip(modelValue.includes(option.value))"
        :aria-pressed="modelValue.includes(option.value)"
        :data-puesto="option.value"
        @click="toggle(option.value)"
      >
        {{ __(option.label, null, CTX) }}
      </button>
    </div>
    <p class="mt-1 text-xs text-ink-gray-6">
      {{
        modelValue.length
          ? __(
              'Only these puestos see it. Owners and managers always see every article.',
            )
          : __('The whole team sees it.')
      }}
    </p>
  </fieldset>
</template>
<script setup>
import { AUDIENCE, CTX } from '@/composables/useManual'

const props = defineProps({ modelValue: { type: Array, default: () => [] } })
const emit = defineEmits(['update:modelValue'])
function chip(on) {
  return on
    ? 'border-outline-gray-4 bg-surface-gray-3 font-semibold text-ink-gray-9'
    : 'border-outline-gray-2 text-ink-gray-7'
}
function toggle(value) {
  const next = props.modelValue.includes(value)
    ? props.modelValue.filter((puesto) => puesto !== value)
    : [...props.modelValue, value]
  emit('update:modelValue', next)
}
</script>
