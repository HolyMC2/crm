<template>
  <!-- A «Filtros» field that names one record (cliente, vendedor, tienda):
       the chosen one on top with «Quitar», else a search with up to 8 matches.
       Frappe's own link search, so the worker sees only what they may read. -->
  <div data-testid="documentos-filter-link">
    <ListRow
      v-if="modelValue"
      icon="lucide-check"
      :title="chosenLabel"
      subtitle="Toca para quitar este filtro"
      selected
      @click="choose('')"
    />
    <template v-else>
      <input
        :value="query"
        type="search"
        autocomplete="off"
        :aria-label="`Buscar ${label.toLowerCase()}`"
        :placeholder="`Buscar ${label.toLowerCase()}`"
        class="h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base"
        @input="changeQuery($event.target.value)"
        @focus="search"
      />
      <p v-if="loading" role="status" class="px-1 py-2 text-sm text-ink-gray-6">
        Buscando…
      </p>
      <p
        v-else-if="searched && !options.length"
        class="px-1 py-2 text-sm text-ink-gray-6"
      >
        No encontré nada con ese texto.
      </p>
      <ListRow
        v-for="option in options"
        :key="option.value"
        :title="option.title"
        @click="choose(option.value, option.title)"
      />
    </template>
  </div>
</template>
<script setup>
import { call } from 'frappe-ui'
import { computed, onBeforeUnmount, ref } from 'vue'
import { ListRow } from '@/components/ui'
import { looksLikeId } from '@/utils/display'

const props = defineProps({
  modelValue: { type: String, default: '' },
  doctype: { type: String, required: true },
  label: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const query = ref('')
const options = ref([])
const loading = ref(false)
const searched = ref(false)
const titles = ref({})
let timer = null
let generation = 0

// The name a worker reads: the title search_link gave when it was picked, else
// the value itself (customer and seller names are their own titles here).
const chosenLabel = computed(
  () => titles.value[props.modelValue] || props.modelValue,
)

function plain(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function changeQuery(value) {
  query.value = value
  clearTimeout(timer)
  timer = setTimeout(search, 200)
}

async function search() {
  const own = ++generation
  loading.value = true
  try {
    const rows = await call('frappe.desk.search.search_link', {
      doctype: props.doctype,
      txt: query.value,
      page_length: 8,
    })
    if (own !== generation) return
    options.value = (Array.isArray(rows) ? rows : []).map((row) => {
      const description = plain(row.description)
      const label = plain(row.label)
      // A title that is never an ID: the label, else the first described name.
      const first = description.split(',')[0].trim()
      const title =
        label && !looksLikeId(label)
          ? label
          : looksLikeId(row.value) && first
            ? first
            : row.value
      return { value: row.value, title }
    })
  } catch {
    if (own === generation) options.value = []
  } finally {
    if (own === generation) {
      loading.value = false
      searched.value = true
    }
  }
}

function choose(value, title = '') {
  if (value && title) titles.value = { ...titles.value, [value]: title }
  query.value = ''
  options.value = []
  searched.value = false
  emit('update:modelValue', value)
}

onBeforeUnmount(() => clearTimeout(timer))
</script>
