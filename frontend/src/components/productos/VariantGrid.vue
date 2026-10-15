<template>
  <section
    id="variantes"
    class="scroll-mt-4 rounded-xl border border-outline-gray-2 bg-surface-base"
  >
    <header
      class="flex flex-wrap items-center gap-2 border-b border-outline-gray-1 px-4 py-3"
    >
      <h2 class="flex-1 text-base font-semibold text-ink-gray-9">
        {{ __('Variants', null, 'Productos') }}
      </h2>
      <span class="text-sm tabular-nums text-ink-gray-6">{{ countLabel }}</span>
    </header>
    <p
      class="m-4 flex items-start gap-3 rounded-lg border border-outline-gray-2 bg-surface-gray-1 p-3 text-sm text-ink-gray-7"
    >
      <FeatherIcon
        name="layers"
        class="mt-0.5 h-4 w-4 shrink-0 text-ink-gray-5"
        aria-hidden="true"
      />
      {{
        __(
          'This product is a template: each variant has its own code, stock and price. A variant without its own price sells at the template price.',
          null,
          'Productos',
        )
      }}
    </p>
    <div class="flex flex-wrap items-end gap-2 px-4 pb-3">
      <label class="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs">
        <span class="text-ink-gray-6">{{
          __('Search variants', null, 'Productos')
        }}</span>
        <input
          v-model="search"
          type="search"
          class="h-11 rounded-md border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9 sm:h-8 sm:text-sm"
          :placeholder="__('Name, code or barcode', null, 'Productos')"
        />
      </label>
      <label
        v-for="facet in attributes"
        :key="facet.attribute"
        class="flex min-w-[9rem] flex-col gap-1 text-xs"
      >
        <span class="text-ink-gray-6">{{ facet.attribute }}</span>
        <select
          :value="chosen[facet.attribute] || ''"
          class="h-11 rounded-md border border-outline-gray-2 bg-surface-base px-2 text-base text-ink-gray-9 sm:h-8 sm:text-sm"
          @change="choose(facet.attribute, $event.target.value)"
        >
          <option value="">{{ __('All', null, 'Productos') }}</option>
          <option
            v-for="option in facet.values"
            :key="option.value"
            :value="option.value"
          >
            {{ option.value }} ({{ option.count }})
          </option>
        </select>
      </label>
      <Button
        v-if="filtered"
        class="min-h-11 sm:min-h-8"
        :label="__('Clear', null, 'Productos')"
        @click="clear"
      />
    </div>
    <p
      v-if="problem"
      role="alert"
      class="mx-4 mb-3 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
    >
      {{ problem }}
      <Button
        class="ml-2"
        :label="__('Retry', null, 'Productos')"
        @click="load()"
      />
    </p>
    <p
      v-else-if="!loading && !rows.length"
      class="px-4 pb-4 text-sm text-ink-gray-6"
    >
      {{
        filtered
          ? __('No variant matches these filters.', null, 'Productos')
          : __('This template has no active variants yet.', null, 'Productos')
      }}
    </p>
    <ul
      v-else
      class="grid gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3"
      :aria-busy="loading ? 'true' : 'false'"
    >
      <li v-for="(row, index) in rows" :key="row.name" class="min-w-0">
        <CatalogItem
          :row="row"
          layout="tarjetas"
          :to="productRoute(row, list)"
          :eager="index < 6"
          :detail="attributesText(row)"
        />
      </li>
    </ul>
    <div v-if="hasMore" class="flex justify-center px-4 pb-4">
      <Button
        class="min-h-11 sm:min-h-8"
        :loading="loading"
        :label="__('Show more variants', null, 'Productos')"
        @click="load({ more: true })"
      />
    </div>
  </section>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Button, FeatherIcon } from 'frappe-ui'
import CatalogItem from '@/components/productos/CatalogItem.vue'
import {
  problemOf,
  productRoute,
  productosApi,
  variantsLabel,
} from '@/composables/useProductos'

// A template's variants: filter by attribute and search, open one. The
// rows are list rows (photo, price, stock in the worker's stores), so a
// variant reads like any product of the catalogue.
const props = defineProps({
  item: { type: String, required: true },
  count: { type: Number, default: 0 },
  attributes: { type: Array, default: () => [] },
  initialSearch: { type: String, default: '' },
  list: { type: String, default: '' },
})
const PAGE = 24
const search = ref(props.initialSearch)
const chosen = ref({})
const rows = ref([])
const total = ref(null)
const hasMore = ref(false)
const loading = ref(false)
const problem = ref('')
let ticket = 0

const filtered = computed(
  () => Boolean(search.value.trim()) || Object.keys(chosen.value).length > 0,
)
const countLabel = computed(() =>
  filtered.value && total.value !== null
    ? variantsLabel({ count: props.count, matching: total.value })
    : variantsLabel({ count: props.count }),
)

function attributesText(row) {
  return (row.attributes || []).map((entry) => entry.value).join(' · ')
}
function choose(attribute, value) {
  const next = { ...chosen.value }
  if (value) next[attribute] = value
  else delete next[attribute]
  chosen.value = next
}
function clear() {
  search.value = ''
  chosen.value = {}
}

async function load({ more = false, quiet = false } = {}) {
  if (quiet && loading.value) return
  const mine = ++ticket
  loading.value = true
  if (!quiet) problem.value = ''
  try {
    const page = await productosApi('variant_list', {
      item: props.item,
      search: search.value.trim(),
      attributes: JSON.stringify(chosen.value),
      start: more ? rows.value.length : 0,
      page_length: quiet ? Math.max(rows.value.length, PAGE) : PAGE,
    })
    if (mine !== ticket) return
    rows.value = more ? [...rows.value, ...page.rows] : page.rows
    hasMore.value = page.has_more
    if (!more) total.value = typeof page.total === 'number' ? page.total : null
  } catch (error) {
    if (mine !== ticket) return
    const found = problemOf(error)
    problem.value = [found.title, found.detail].filter(Boolean).join('. ')
  } finally {
    if (mine === ticket) loading.value = false
  }
}

let timer = null
watch(search, () => {
  clearTimeout(timer)
  timer = setTimeout(() => load(), 250)
})
watch(chosen, () => load())
watch(
  () => props.item,
  () => {
    clear()
    load()
  },
)
onMounted(() => load())
defineExpose({ refresh: () => load({ quiet: true }) })
</script>
