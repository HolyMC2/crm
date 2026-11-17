<template>
  <!-- Money tags (crm docs/DINERO_EN_ORDEN.md §3d): what the money was for.
       The catalog's tags as chips, the suggested ones first and chosen; a new
       one typed here joins the catalog when the entry is booked. -->
  <div data-etiquetas-picker>
    <p class="text-sm font-medium text-ink-gray-7">
      Etiquetas <span class="font-normal text-ink-gray-5">(opcional)</span>
    </p>
    <div class="mt-2 flex flex-wrap gap-2" role="group" aria-label="Etiquetas">
      <button
        v-for="label in shown"
        :key="label"
        type="button"
        class="press min-h-10 rounded-full px-3 text-sm"
        :class="
          modelValue.includes(label)
            ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
            : 'border border-outline-gray-2 text-ink-gray-8'
        "
        :aria-pressed="modelValue.includes(label)"
        :data-etiqueta="label"
        @click="toggle(label)"
      >
        {{ label }}
      </button>
      <button
        v-if="rest.length && !all"
        type="button"
        class="press min-h-10 rounded-full px-3 text-sm text-ink-gray-7"
        @click="all = true"
      >
        +{{ rest.length }} más
      </button>
    </div>
    <form class="mt-2 flex gap-2" @submit.prevent="add()">
      <input
        v-model="typed"
        maxlength="60"
        autocomplete="off"
        class="min-h-10 min-w-0 flex-1 rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-sm text-ink-gray-9"
        placeholder="Nueva etiqueta"
        aria-label="Nueva etiqueta"
        data-etiqueta-nueva
      />
      <button
        type="submit"
        class="press min-h-10 rounded-full border border-outline-gray-2 px-3 text-sm text-ink-gray-8"
        :disabled="!typed.trim()"
      >
        Agregar
      </button>
    </form>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const SHOWN = 10

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  /** The catalog: [{label, grupo}]. */
  options: { type: Array, default: () => [] },
  /** Suggested for this money: shown first. */
  suggested: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const all = ref(false)
const typed = ref('')

// chosen and suggested first, then the catalog in its order; each once
const ordered = computed(() => [
  ...new Set([
    ...props.modelValue,
    ...props.suggested,
    ...props.options.map((t) => t.label),
  ]),
])
const shown = computed(() =>
  all.value ? ordered.value : ordered.value.slice(0, SHOWN),
)
const rest = computed(() => ordered.value.slice(SHOWN))

function toggle(label) {
  emit(
    'update:modelValue',
    props.modelValue.includes(label)
      ? props.modelValue.filter((t) => t !== label)
      : [...props.modelValue, label],
  )
}

function add() {
  const label = typed.value.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  typed.value = ''
  if (!label || props.modelValue.includes(label)) return
  emit('update:modelValue', [...props.modelValue, label])
}
</script>
