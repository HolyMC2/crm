<template>
  <!-- A Link value: type to search the linked records, pick one. -->
  <div data-ajustes-link>
    <input
      :id="id"
      ref="input"
      :value="query"
      type="search"
      autocomplete="off"
      role="combobox"
      :aria-controls="listId"
      :aria-expanded="String(expanded)"
      :aria-activedescendant="
        expanded && active >= 0 ? `${listId}-${active}` : undefined
      "
      :aria-label="label"
      class="h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base"
      :placeholder="__('Escribe para buscar')"
      @input="changeQuery($event.target.value)"
      @focus="search"
      @keydown="keyDown"
    />
    <div
      v-if="expanded"
      :id="listId"
      role="listbox"
      :aria-label="label"
      class="mt-1 max-h-64 overflow-y-auto rounded-lg border border-outline-gray-1"
    >
      <p v-if="loading" role="status" class="px-3 py-2 text-sm text-ink-gray-6">
        {{ __('Buscando…') }}
      </p>
      <button
        v-for="(option, index) in options"
        :id="`${listId}-${index}`"
        :key="option.value"
        type="button"
        role="option"
        :aria-selected="String(modelValue === option.value)"
        class="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left hover:bg-surface-gray-2"
        :class="active === index ? 'bg-surface-gray-2' : ''"
        @click="choose(option)"
      >
        <span class="break-words text-base">{{
          option.label || linkLabel(doctype, option.value)
        }}</span>
        <span
          v-if="option.description"
          class="line-clamp-1 text-sm text-ink-gray-6"
          >{{ plain(option.description) }}</span
        >
      </button>
      <p
        v-if="!loading && !options.length"
        class="px-3 py-2 text-sm text-ink-gray-6"
      >
        {{ __('No encontré nada con ese texto.') }}
      </p>
    </div>
    <p v-if="error" role="alert" class="mt-1 text-sm text-ink-red-7">
      {{ __('No pude cargar las opciones.') }}
    </p>
    <button
      v-if="modelValue"
      type="button"
      class="mt-1 min-h-11 text-sm text-ink-gray-7 underline"
      @click="choose({ value: '' })"
    >
      {{ __('Dejar vacío') }}
    </button>
  </div>
</template>
<script setup>
import { call } from 'frappe-ui'
import { onBeforeUnmount, ref, useId, watch } from 'vue'
import { UOM_ES, fold, linkLabel } from './ajustes'

const props = defineProps({
  modelValue: { type: String, default: '' },
  doctype: { type: String, required: true },
  label: { type: String, default: '' },
  id: { type: String, default: undefined },
})
const emit = defineEmits(['update:modelValue'])
const query = ref('')
const options = ref([])
const expanded = ref(false)
const loading = ref(false)
const error = ref(null)
const active = ref(-1)
const listId = `ajustes-link-${useId()}`
let timer = 0
let generation = 0

watch(
  () => props.modelValue,
  (value) => (query.value = linkLabel(props.doctype, value) || ''),
  { immediate: true },
)

function changeQuery(value) {
  query.value = value
  expanded.value = true
  clearTimeout(timer)
  generation++
  timer = setTimeout(search, 200)
}
async function search() {
  const own = ++generation
  loading.value = true
  error.value = null
  expanded.value = true
  try {
    const rows = await call('frappe.desk.search.search_link', {
      doctype: props.doctype,
      txt:
        query.value === linkLabel(props.doctype, props.modelValue)
          ? ''
          : query.value,
      page_length: 20,
    })
    if (own === generation) {
      options.value = withSpanishUnits(Array.isArray(rows) ? rows : [])
      active.value = options.value.length ? 0 : -1
    }
  } catch (e) {
    if (own === generation) error.value = e
  } finally {
    if (own === generation) loading.value = false
  }
}
// «caja» finds «Box»: the units' Spanish names are searched here too.
function withSpanishUnits(rows) {
  if (props.doctype !== 'UOM' || !query.value) return rows
  const q = fold(query.value)
  const seen = new Set(rows.map((row) => row.value))
  const extra = Object.entries(UOM_ES)
    .filter(([value, label]) => fold(label).includes(q) && !seen.has(value))
    .map(([value]) => ({ value }))
  return [...extra, ...rows]
}
function choose(option) {
  emit('update:modelValue', option.value)
  query.value = linkLabel(props.doctype, option.value)
  expanded.value = false
}
function keyDown(event) {
  if (event.key === 'Escape' && expanded.value) {
    event.stopPropagation()
    expanded.value = false
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const step = event.key === 'ArrowDown' ? 1 : -1
    active.value = Math.max(
      0,
      Math.min(options.value.length - 1, active.value + step),
    )
  } else if (event.key === 'Enter' && expanded.value) {
    event.preventDefault()
    if (options.value[active.value]) choose(options.value[active.value])
  }
}
function plain(value) {
  return String(value).replace(/<[^>]*>/g, '')
}
onBeforeUnmount(() => {
  clearTimeout(timer)
  generation++
})
</script>
