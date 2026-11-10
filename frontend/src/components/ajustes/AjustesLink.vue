<template>
  <!-- A Link value: type to search the linked records, pick one. A tap
       outside or a Tab away closes the list; a customer or supplier that is
       not there yet is created in place («Crear cliente …»). -->
  <div ref="root" data-ajustes-link @focusout="focusLeft">
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
      class="h-11 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base"
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
      class="mt-1 max-h-64 overflow-y-auto rounded-6 border border-outline-gray-1"
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
    <button
      v-if="expanded && creatable"
      type="button"
      class="press mt-1 flex min-h-11 w-full items-center gap-2 rounded-6 px-3 text-left text-base font-medium text-ink-gray-8 hover:bg-surface-gray-2"
      data-ajustes-link-create
      @click="startCreate"
    >
      <span class="lucide-plus size-4 shrink-0" aria-hidden="true" />
      <span class="min-w-0 break-words">{{ createLabel }}</span>
    </button>
    <IdentityEditor
      v-if="creating"
      v-model="creating"
      :defaults="createDefaults"
      @saved="created"
    />
    <p v-if="createNote" role="status" class="mt-1 text-sm text-ink-gray-7">
      {{ createNote }}
    </p>
    <p v-if="error" role="alert" class="mt-1 text-sm text-ink-red-7">
      {{ __('No pude cargar las opciones.') }}
    </p>
    <button
      v-if="modelValue && !required"
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
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  ref,
  useId,
  watch,
} from 'vue'
import { identityPrefill } from '@/utils/contactos'
import {
  UOM_ES,
  createdLink,
  fold,
  linkLabel,
  loadLinkTitle,
  partyOfLink,
} from './ajustes'

// Contactos' «Nuevo contacto», on the first «Crear cliente» only.
const IdentityEditor = defineAsyncComponent(
  () => import('@/components/contactos/IdentityEditor.vue'),
)

const props = defineProps({
  modelValue: { type: String, default: '' },
  doctype: { type: String, required: true },
  label: { type: String, default: '' },
  id: { type: String, default: undefined },
  /** A required link offers no «Dejar vacío». */
  required: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const query = ref('')
const options = ref([])
const expanded = ref(false)
const loading = ref(false)
const error = ref(null)
const active = ref(-1)
const listId = `ajustes-link-${useId()}`
const root = ref(null)
const creating = ref(false)
const createDefaults = ref({})
const createNote = ref('')
let timer = 0
let generation = 0

// What the worker typed, when it is a search rather than the current value.
const typed = computed(() =>
  query.value.trim() && query.value !== shown.value ? query.value.trim() : '',
)
const party = computed(() => partyOfLink(props.doctype))
const creatable = computed(() => Boolean(party.value))
const createLabel = computed(() => {
  const name = typed.value
  if (party.value === 'supplier')
    return name
      ? __('Crear proveedor «{0}»', [name])
      : __('Crear proveedor nuevo')
  return name ? __('Crear cliente «{0}»', [name]) : __('Crear cliente nuevo')
})

// What the box shows for the current value: its title once doco answers.
const shown = ref('')
watch(
  () => props.modelValue,
  (value) => {
    shown.value = linkLabel(props.doctype, value) || ''
    query.value = shown.value
    if (!value) return
    loadLinkTitle(props.doctype, value).then((title) => {
      if (props.modelValue !== value || query.value !== shown.value) return
      shown.value = title
      query.value = title
    })
  },
  { immediate: true },
)

// The list closes on a tap anywhere else, and the box shows the value again.
function closeList() {
  if (!expanded.value) return
  clearTimeout(timer)
  generation++
  loading.value = false
  expanded.value = false
  query.value = shown.value
}
function outside(event) {
  if (root.value && !root.value.contains(event.target)) closeList()
}
// A Tab to another control; a tap on a row keeps focus here or has none.
function focusLeft(event) {
  const next = event.relatedTarget
  if (next && root.value && !root.value.contains(next)) closeList()
}
watch(expanded, (open) => {
  if (open) document.addEventListener('pointerdown', outside, true)
  else document.removeEventListener('pointerdown', outside, true)
})

function startCreate() {
  createDefaults.value = {
    ...identityPrefill({ first_name: typed.value, party: party.value }),
    // Its own draft, apart from a «Nuevo contacto» half-written in Contactos.
    draft_key: `link:${party.value}:${typed.value}`,
  }
  createNote.value = ''
  closeList()
  creating.value = true
}
// The new customer is the field's value; a contact used instead of a new one
// that has no such role yet says so, and the field keeps its value.
function created(result) {
  const name = createdLink(result, props.doctype)
  if (name) {
    emit('update:modelValue', name)
    return
  }
  createNote.value =
    party.value === 'supplier'
      ? __(
          'El contacto se guardó, pero no es proveedor. Búscalo aquí cuando tenga ese rol.',
        )
      : __(
          'El contacto se guardó, pero no es cliente. Búscalo aquí cuando tenga ese rol.',
        )
}

function changeQuery(value) {
  query.value = value
  createNote.value = ''
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
      txt: query.value === shown.value ? '' : query.value,
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
  shown.value = option.label || linkLabel(props.doctype, option.value)
  query.value = shown.value
  expanded.value = false
}
function keyDown(event) {
  if (event.key === 'Escape' && expanded.value) {
    event.stopPropagation()
    closeList()
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
  document.removeEventListener('pointerdown', outside, true)
})
</script>
