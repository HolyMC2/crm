<template>
  <!-- «Con el documento…»: the real record the preview renders, searchable by
       party or number (crm.api.documentos.rows, Frappe permissions). -->
  <div ref="root" class="relative">
    <!-- The party fills the field; the number is small meta on the label. -->
    <label class="block truncate text-sm text-ink-gray-6" :for="id">
      Vista previa con<template
        v-if="modelValue && modelValue.title !== modelValue.name"
      >
        · {{ modelValue.name }}</template
      >
    </label>
    <input
      :id="id"
      v-model="query"
      type="search"
      autocomplete="off"
      :placeholder="modelValue ? modelValue.title : 'Busca un documento'"
      class="mt-1 min-h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
      data-testid="impresion-registro"
      @focus="open = true"
      @keydown.esc="open = false"
    />

    <ul
      v-if="open && (results.length || searching || message)"
      class="absolute inset-x-0 z-10 mt-1 overflow-hidden rounded-lg border border-outline-gray-2 bg-surface-base shadow-xl"
    >
      <li
        v-if="searching && !results.length"
        class="px-4 py-3 text-sm text-ink-gray-6"
      >
        Buscando…
      </li>
      <li v-else-if="message" class="px-4 py-3 text-sm text-ink-gray-6">
        {{ message }}
      </li>
      <li v-for="row in results" :key="row.name">
        <ListRow
          :title="row.title || row.name"
          :subtitle="row.name"
          :selected="row.name === modelValue?.name"
          @click="choose(row)"
        />
      </li>
    </ul>
  </div>
</template>
<script setup>
import { ref, watch } from 'vue'
import { onClickOutside, useDebounceFn } from '@vueuse/core'
import { ListRow } from '@/components/ui'
import { docApi, errorText } from '@/documentos/api'

const props = defineProps({
  doctype: { type: String, required: true },
  /** `{ name, title }` */
  modelValue: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])
const id = `impresion-registro-${Math.random().toString(36).slice(2, 8)}`
const query = ref('')
const open = ref(false)
const results = ref([])
const searching = ref(false)
const message = ref('')
const root = ref(null)
onClickOutside(root, () => (open.value = false))

let request = 0
const search = useDebounceFn(async () => {
  const mine = ++request
  searching.value = true
  message.value = ''
  try {
    const page = await docApi('rows', {
      doctype: props.doctype,
      search: query.value.trim() || undefined,
      limit: 6,
    })
    if (mine !== request) return
    results.value = page?.rows || []
    if (!results.value.length) message.value = 'Ningún documento con eso.'
  } catch (e) {
    if (mine === request) message.value = errorText(e)
  } finally {
    if (mine === request) searching.value = false
  }
}, 300)

watch([query, open], ([, isOpen]) => {
  if (isOpen) search()
})

function choose(row) {
  emit('update:modelValue', { name: row.name, title: row.title || row.name })
  query.value = ''
  open.value = false
}
</script>
