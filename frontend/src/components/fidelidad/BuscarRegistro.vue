<template>
  <!-- One record for a quick sheet (a customer, a product, a category):
       search as you type, the rows inline under the field (a sheet clips a
       floating list), and once chosen a chip with «Cambiar». -->
  <section :aria-label="label">
    <p class="mb-1.5 text-xs font-medium text-ink-gray-6">{{ label }}</p>
    <div
      v-if="modelValue"
      class="flex min-h-12 items-center gap-2 rounded-6 bg-surface-gray-2 px-3"
      :data-testid="`${testid}-picked`"
    >
      <span
        :class="icon"
        class="size-4 flex-none text-ink-gray-6"
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1 truncate text-base text-ink-gray-9">{{
        modelValue.title || modelValue.name
      }}</span>
      <button
        v-if="!locked"
        type="button"
        class="press rounded-full px-3 py-2 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-3"
        @click="clear"
      >
        {{ __('Change', null, 'Cliente') }}
      </button>
    </div>
    <template v-else>
      <div class="relative">
        <input
          ref="field"
          v-model="query"
          type="search"
          autocomplete="off"
          :placeholder="placeholder"
          :aria-label="label"
          class="min-h-12 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 pr-10 text-base text-ink-gray-9"
          :data-testid="testid"
        />
        <span
          v-if="searching"
          class="lucide-loader-circle absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-gray-5"
          aria-hidden="true"
        />
      </div>
      <p v-if="message" class="mt-2 text-sm text-ink-gray-6" role="status">
        {{ message }}
      </p>
      <ul
        v-if="results.length"
        class="mt-1 divide-y divide-outline-gray-1"
        :data-testid="`${testid}-results`"
      >
        <li v-for="row in results" :key="row.name">
          <ListRow
            :title="row.title || row.name"
            :icon="icon"
            @click="choose(row)"
          />
        </li>
      </ul>
    </template>
  </section>
</template>
<script setup>
import { onMounted, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { ListRow } from '@/components/ui'
import { docApi, errorText } from '@/documentos/api'

const props = defineProps({
  doctype: { type: String, required: true },
  /** `{ name, title }` */
  modelValue: { type: Object, default: null },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  icon: { type: String, default: 'lucide-search' },
  testid: { type: String, default: 'fidelidad-buscar' },
  /** Filters for crm.api.documentos.rows (only leaf groups, enabled items…). */
  filters: { type: [Object, Array], default: null },
  /** Chosen by the caller (the customer of the deal): no «Cambiar». */
  locked: { type: Boolean, default: false },
  /** Rows before the first keystroke (the latest ones), so one tap can do. */
  eager: { type: Boolean, default: true },
})
const emit = defineEmits(['update:modelValue'])
const query = ref('')
const results = ref([])
const searching = ref(false)
const message = ref('')
const field = ref(null)

let request = 0
async function search() {
  const mine = ++request
  const text = query.value.trim()
  if (!text && !props.eager) {
    results.value = []
    return
  }
  searching.value = true
  message.value = ''
  try {
    const page = await docApi('rows', {
      doctype: props.doctype,
      search: text || undefined,
      filters: props.filters || undefined,
      limit: 6,
    })
    if (mine !== request) return
    results.value = page?.rows || []
    if (!results.value.length) message.value = __('Nothing matches that.')
  } catch (error) {
    if (mine === request) message.value = errorText(error)
  } finally {
    if (mine === request) searching.value = false
  }
}
const debounced = useDebounceFn(search, 250)
watch(query, debounced)
onMounted(() => {
  if (!props.modelValue) search()
})

function choose(row) {
  emit('update:modelValue', { name: row.name, title: row.title || row.name })
  query.value = ''
}
function clear() {
  emit('update:modelValue', null)
  search()
  requestAnimationFrame(() => field.value?.focus())
}
</script>
