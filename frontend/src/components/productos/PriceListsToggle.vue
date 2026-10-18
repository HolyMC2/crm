<template>
  <fieldset v-if="choices.length" class="mt-5">
    <legend class="mb-2 text-sm text-ink-gray-6">
      {{ __('Prices shown', null, CTX) }}
    </legend>
    <p class="mb-2 text-xs text-ink-gray-6">
      {{
        __('{0} always; add other lists to each product.', [main || '—'], CTX)
      }}
    </p>
    <label
      v-for="list in choices"
      :key="list"
      class="flex min-h-11 items-center gap-2 rounded-md px-1 text-sm text-ink-gray-8 hover:bg-surface-gray-2 sm:min-h-8"
    >
      <input
        type="checkbox"
        :checked="modelValue.includes(list)"
        @change="toggle(list, $event.target.checked)"
      />
      <span class="truncate" :title="list">{{ list }}</span>
    </label>
  </fieldset>
</template>
<script setup>
import { computed } from 'vue'
import { CTX } from '@/composables/useProductos'

// «Precios que se muestran»: which other price lists each product shows
// under the store's own list.
const props = defineProps({
  lists: { type: Array, default: () => [] },
  main: { type: String, default: '' },
  modelValue: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])
const choices = computed(() =>
  props.lists.filter((list) => list !== props.main),
)
function toggle(list, on) {
  const next = props.modelValue.filter((name) => name !== list)
  if (on) next.push(list)
  // Keep the lists in the order offered.
  emit(
    'update:modelValue',
    choices.value.filter((name) => next.includes(name)),
  )
}
</script>
