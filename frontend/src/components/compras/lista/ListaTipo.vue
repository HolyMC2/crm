<template>
  <!-- The product type of a list, the owner's choice: the supplier's order
       adds up per type against the month's budget, and the list is compared
       with the previous list of its type. Empty reads it from the list. -->
  <BottomSheet
    :open="open"
    :title="__('Product type', null, 'Lista')"
    :subtitle="title"
    layer="lista-tipo"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-3 pb-2">
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'What this list sells. Its quantities add up under this type in the order to the supplier, and it is compared with the previous list of the same type.',
            null,
            'Lista',
          )
        }}
      </p>
      <input
        v-model="query"
        type="search"
        :class="INPUT"
        :placeholder="__('Search a type', null, 'Lista')"
        :aria-label="__('Search a type', null, 'Lista')"
        data-lista-tipo-buscar
      />
      <ul
        class="max-h-72 divide-y divide-outline-gray-1 overflow-y-auto rounded-6 border border-outline-gray-2"
        :aria-label="__('Product types', null, 'Lista')"
      >
        <li v-for="option in shown" :key="option.name">
          <button
            type="button"
            class="press flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-ink-gray-9 hover:bg-surface-gray-1 disabled:opacity-60"
            :aria-pressed="option.name === value"
            :disabled="busy"
            :data-lista-tipo-opcion="option.name"
            @click="emit('save', option.name)"
          >
            <span class="min-w-0 flex-1 truncate">{{ option.name }}</span>
            <span v-if="option.is_group" class="text-xs text-ink-gray-5">{{
              __('and the types under it', null, 'Lista')
            }}</span>
            <span
              v-if="option.name === value"
              class="lucide-check size-4 flex-none"
              aria-hidden="true"
            />
          </button>
        </li>
        <li v-if="!shown.length" class="px-3 py-3 text-sm text-ink-gray-6">
          {{ __('No type has those words.', null, 'Lista') }}
        </li>
      </ul>
      <button
        v-if="value"
        type="button"
        :class="['press', BTN.text, 'min-h-10 px-3 text-sm']"
        :disabled="busy"
        @click="emit('save', '')"
      >
        <span class="lucide-rotate-ccw size-4" aria-hidden="true" />
        {{ __('Read the type from the list again', null, 'Lista') }}
      </button>
      <p v-if="problem" class="text-sm text-ink-red-7" role="alert">
        {{ problem }}
      </p>
    </div>
  </BottomSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { BottomSheet } from '@/components/ui'
import { BTN } from '@/documentos/tools'
import { matchTokens } from '@/vendor/muelle-shell/contracts/search'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The list's title. */
  title: { type: String, default: '' },
  /** The list's type now. */
  value: { type: String, default: '' },
  /** [{name, is_group}] in tree order. */
  options: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  problem: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'save'])

const INPUT =
  'block w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm text-ink-gray-9 placeholder:text-ink-gray-4 focus:border-outline-gray-4 focus:ring-0'
const query = ref('')
watch(
  () => props.open,
  (open) => {
    if (open) query.value = ''
  },
)
const shown = computed(() =>
  props.options.filter((option) => matchTokens(query.value, option.name)),
)
</script>
