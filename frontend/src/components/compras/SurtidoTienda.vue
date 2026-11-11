<template>
  <!-- A supplier's list as its own shop: one search (words or a /pattern/),
       its categories and printed marks as chips, the shop's own history,
       products as a picture grid when the list has pictures and as rows when
       it is a sheet; «Agregar» puts a product in the cart, its stepper changes
       the pieces in place. -->
  <section :aria-label="__('Products of the list', null, 'Surtido')">
    <div class="flex items-center gap-2">
      <label
        class="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-gray-2 px-4 focus-within:ring-2 focus-within:ring-outline-gray-4"
      >
        <span
          :class="[
            searching ? 'lucide-loader-circle animate-spin' : 'lucide-search',
            'size-5 flex-none text-ink-gray-5',
          ]"
          aria-hidden="true"
        />
        <input
          v-model="query"
          type="text"
          enterkeyhint="search"
          class="w-full border-0 bg-transparent p-0 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-0"
          :placeholder="__('Search the list, or /a1[67]/', null, 'Surtido')"
          :aria-label="__('Search the list', null, 'Surtido')"
          data-testid="tienda-buscar"
        />
        <button
          v-if="query"
          type="button"
          class="press flex size-8 flex-none items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-3"
          :aria-label="__('Clear the search', null, 'Surtido')"
          :title="__('Clear the search', null, 'Surtido')"
          @click="query = ''"
        >
          <span class="lucide-x size-4" aria-hidden="true" />
        </button>
      </label>
      <button
        type="button"
        class="press relative flex size-12 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 hover:bg-surface-gray-3"
        :aria-expanded="filtersOpen"
        :aria-label="__('Filters', null, 'Surtido')"
        :title="__('Filters', null, 'Surtido')"
        data-testid="tienda-filtros"
        @click="filtersOpen = !filtersOpen"
      >
        <span class="lucide-sliders-horizontal size-5" aria-hidden="true" />
        <span
          v-if="activeFilters"
          class="num absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-[var(--muelle-accent)] px-1 text-center text-xs leading-5 text-[var(--muelle-accent-ink)]"
          >{{ activeFilters }}</span
        >
      </button>
    </div>

    <div class="mt-3 space-y-3">
      <ChipGroup
        v-if="categories.length > 1"
        v-model="category"
        :label="__('Categories', null, 'Surtido')"
        :options="categories"
        :max="8"
        testid="tienda-categoria"
      />
      <ExpandTransition>
        <div v-if="filtersOpen" class="space-y-3">
          <ChipGroup
            v-if="markOptions.length"
            v-model="marks"
            :label="__('Marked on the list', null, 'Surtido')"
            :options="markOptions"
            multiple
            :max="8"
            testid="tienda-marca"
          />
          <ChipGroup
            v-model="history"
            :label="__('My history', null, 'Surtido')"
            :options="historyOptions"
            testid="tienda-historia"
          />
          <ChipGroup
            v-if="groups.length"
            v-model="group"
            :label="__('Count my sales and stock of', null, 'Surtido')"
            :options="groups"
            :max="5"
            testid="tienda-grupo"
          />
        </div>
      </ExpandTransition>
    </div>

    <div
      v-if="filters.similarTo"
      class="mt-3 flex items-center gap-2 rounded-6 bg-surface-gray-2 px-3 py-2 text-sm"
      role="status"
    >
      <span
        class="lucide-sparkles size-4 flex-none text-ink-gray-6"
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1 truncate">{{
        __('Like {0}', [filters.similarTo.name], 'Surtido')
      }}</span>
      <button
        type="button"
        class="press flex size-8 flex-none items-center justify-center rounded-full hover:bg-surface-gray-3"
        :aria-label="__('Show every product', null, 'Surtido')"
        :title="__('Show every product', null, 'Surtido')"
        @click="patch({ similarTo: null })"
      >
        <span class="lucide-x size-4" aria-hidden="true" />
      </button>
    </div>

    <p
      class="num mt-4 text-sm text-ink-gray-6"
      role="status"
      data-testid="tienda-cuenta"
    >
      {{
        loading
          ? __('Opening the list…', null, 'Surtido')
          : __('{0} of {1} products', [rows.length, all.length], 'Surtido')
      }}
    </p>

    <div
      v-if="!loading && !rows.length"
      class="mt-3 rounded-6 border border-dashed border-outline-gray-3 p-4 text-sm"
    >
      <p class="font-medium text-ink-gray-9">
        {{ __('No product matches', null, 'Surtido') }}
      </p>
      <p class="mt-1 text-ink-gray-7">
        {{
          __(
            'Take off a chip or search other words. A pattern goes between slashes: /iphone 1[3-5]/.',
            null,
            'Surtido',
          )
        }}
      </p>
    </div>

    <!-- a list with pictures: a grid of cards -->
    <ul
      v-else-if="grid"
      class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      data-testid="tienda-productos"
    >
      <li
        v-for="row in visible"
        :key="row.line"
        class="flex min-w-0 flex-col overflow-hidden rounded-7 border"
        :class="
          cart[row.line] ? 'border-outline-gray-5' : 'border-outline-gray-2'
        "
        data-testid="tienda-producto"
      >
        <button
          v-if="row.photo"
          type="button"
          class="press block aspect-square w-full bg-surface-gray-1"
          :aria-label="__('Photo of {0}', [row.name], 'Surtido')"
          @click="emit('photo', row)"
        >
          <img
            :src="row.thumb || row.photo"
            alt=""
            class="size-full object-contain"
            loading="lazy"
          />
        </button>
        <span
          v-else
          class="flex aspect-square w-full items-center justify-center bg-surface-gray-1 text-ink-gray-6"
          aria-hidden="true"
        >
          <span class="lucide-package size-8" />
        </span>
        <div class="flex min-w-0 flex-1 flex-col gap-1 p-3">
          <button
            type="button"
            class="press line-clamp-2 text-left text-sm font-medium leading-snug text-ink-gray-9 hover:underline"
            data-testid="tienda-abrir"
            @click="emit('open', row)"
          >
            {{ row.name }}
          </button>
          <p v-if="ours(row)" class="truncate text-xs text-ink-gray-6">
            {{ __('Yours: {0}', [ours(row)], 'Surtido') }}
          </p>
          <ul v-if="badges(row).length" class="flex flex-wrap gap-1">
            <li
              v-for="b in badges(row)"
              :key="b.label"
              class="rounded-full px-1.5 text-xs leading-5"
              :class="
                b.on
                  ? 'bg-surface-green-2 text-ink-green-8'
                  : 'bg-surface-gray-2 text-ink-gray-7'
              "
            >
              {{ b.label }}
            </li>
          </ul>
          <p class="num mt-auto pt-1 text-base font-semibold text-ink-gray-9">
            {{ money(row.price) }}
            <span
              v-if="row.min_qty > 1"
              class="text-xs font-normal"
              :class="
                cart[row.line] && cart[row.line] < row.min_qty
                  ? 'text-ink-amber-7'
                  : 'text-ink-gray-6'
              "
              >{{ __('from {0} pcs', [row.min_qty], 'Surtido') }}</span
            >
          </p>
          <p class="text-xs text-ink-gray-6">{{ historyText(row) }}</p>
          <p v-if="productLine(row)" class="text-xs text-ink-gray-6">
            {{ productLine(row) }}
          </p>
          <div class="mt-2 flex items-center gap-1">
            <template v-if="cart[row.line]">
              <div
                class="flex flex-1 items-center justify-between rounded-full ring-1 ring-outline-gray-3"
                role="group"
                :aria-label="__('Pieces of {0}', [row.name], 'Surtido')"
              >
                <button
                  type="button"
                  class="press flex size-10 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2"
                  :aria-label="__('One less of {0}', [row.name], 'Surtido')"
                  @click="emit('pieces', row.line, cart[row.line] - 1)"
                >
                  <span
                    :class="[
                      cart[row.line] > 1 ? 'lucide-minus' : 'lucide-trash-2',
                      'size-4',
                    ]"
                    aria-hidden="true"
                  />
                </button>
                <span class="num text-base font-semibold" aria-live="polite">{{
                  cart[row.line]
                }}</span>
                <button
                  type="button"
                  class="press flex size-10 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2"
                  :aria-label="__('One more of {0}', [row.name], 'Surtido')"
                  @click="emit('pieces', row.line, cart[row.line] + 1)"
                >
                  <span class="lucide-plus size-4" aria-hidden="true" />
                </button>
              </div>
            </template>
            <button
              v-else
              type="button"
              class="press flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-surface-gray-2 text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-3"
              data-testid="tienda-agregar"
              @click="emit('pieces', row.line, 1)"
            >
              <span class="lucide-plus size-4" aria-hidden="true" />
              {{ __('Add', null, 'Surtido') }}
            </button>
          </div>
          <button
            type="button"
            class="press self-start text-xs text-ink-gray-6 underline decoration-dotted underline-offset-2 hover:text-ink-gray-8"
            @click="patch({ similarTo: row })"
          >
            {{ __('Similar', null, 'Surtido') }}
          </button>
        </div>
      </li>
    </ul>

    <!-- a sheet without pictures: rows -->
    <ul
      v-else
      class="mt-2 divide-y divide-outline-gray-1"
      data-testid="tienda-productos"
    >
      <li
        v-for="row in visible"
        :key="row.line"
        class="flex items-center gap-3 py-3"
        data-testid="tienda-producto"
      >
        <button
          v-if="row.photo"
          type="button"
          class="press size-12 flex-none overflow-hidden rounded-6 bg-surface-gray-1"
          :aria-label="__('Photo of {0}', [row.name], 'Surtido')"
          @click="emit('photo', row)"
        >
          <img
            :src="row.thumb || row.photo"
            alt=""
            class="size-full object-cover"
            loading="lazy"
          />
        </button>
        <div class="min-w-0 flex-1">
          <p class="text-base font-medium leading-snug text-ink-gray-9">
            <button
              type="button"
              class="press text-left hover:underline"
              data-testid="tienda-abrir"
              @click="emit('open', row)"
            >
              {{ row.name }}
            </button>
            <button
              v-if="row.page"
              type="button"
              class="press ml-1 text-xs font-normal text-ink-gray-6 underline decoration-dotted underline-offset-2"
              :aria-label="
                __('See page {0} of the list', [row.page], 'Surtido')
              "
              @click="emit('page', row.page)"
            >
              {{ __('p. {0}', [row.page], 'Surtido') }}
            </button>
          </p>
          <ul v-if="badges(row).length" class="mt-1 flex flex-wrap gap-1">
            <li
              v-for="b in badges(row)"
              :key="b.label"
              class="rounded-full px-1.5 text-xs leading-5"
              :class="
                b.on
                  ? 'bg-surface-green-2 text-ink-green-8'
                  : 'bg-surface-gray-2 text-ink-gray-7'
              "
            >
              {{ b.label }}
            </li>
          </ul>
          <p v-if="ours(row)" class="mt-0.5 truncate text-xs text-ink-gray-6">
            {{ __('Yours: {0}', [ours(row)], 'Surtido') }}
          </p>
          <p v-if="productLine(row)" class="mt-0.5 text-xs text-ink-gray-6">
            {{ productLine(row) }}
          </p>
          <p class="mt-1 text-xs text-ink-gray-6">
            {{ historyText(row) }}
            <button
              type="button"
              class="press ml-1 underline decoration-dotted underline-offset-2 hover:text-ink-gray-8"
              @click="patch({ similarTo: row })"
            >
              {{ __('Similar', null, 'Surtido') }}
            </button>
          </p>
        </div>
        <div class="flex flex-none flex-col items-end gap-1.5">
          <p class="num text-base font-semibold text-ink-gray-9">
            {{ money(row.price) }}
          </p>
          <p
            v-if="row.min_qty > 1"
            class="text-xs"
            :class="
              cart[row.line] && cart[row.line] < row.min_qty
                ? 'text-ink-amber-7'
                : 'text-ink-gray-6'
            "
          >
            {{ __('from {0} pcs', [row.min_qty], 'Surtido') }}
          </p>
          <div
            v-if="cart[row.line]"
            class="flex items-center rounded-full ring-1 ring-outline-gray-3"
            role="group"
            :aria-label="__('Pieces of {0}', [row.name], 'Surtido')"
          >
            <button
              type="button"
              class="press flex size-10 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2"
              :aria-label="__('One less of {0}', [row.name], 'Surtido')"
              @click="emit('pieces', row.line, cart[row.line] - 1)"
            >
              <span
                :class="[
                  cart[row.line] > 1 ? 'lucide-minus' : 'lucide-trash-2',
                  'size-4',
                ]"
                aria-hidden="true"
              />
            </button>
            <span
              class="num w-7 text-center text-base font-semibold"
              aria-live="polite"
              >{{ cart[row.line] }}</span
            >
            <button
              type="button"
              class="press flex size-10 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2"
              :aria-label="__('One more of {0}', [row.name], 'Surtido')"
              @click="emit('pieces', row.line, cart[row.line] + 1)"
            >
              <span class="lucide-plus size-4" aria-hidden="true" />
            </button>
          </div>
          <button
            v-else
            type="button"
            class="press flex min-h-10 items-center gap-1 rounded-full bg-surface-gray-2 px-4 text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-3"
            data-testid="tienda-agregar"
            @click="emit('pieces', row.line, 1)"
          >
            <span class="lucide-plus size-4" aria-hidden="true" />
            {{ __('Add', null, 'Surtido') }}
          </button>
        </div>
      </li>
    </ul>

    <div v-if="rows.length > visible.length" class="mt-4 flex justify-center">
      <button
        type="button"
        class="press min-h-11 rounded-full bg-surface-gray-2 px-5 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-3"
        @click="limit += PAGE"
      >
        {{ __('Show more ({0})', [rows.length - visible.length], 'Surtido') }}
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ChipGroup, ExpandTransition } from '@/components/ui'
import { money } from '@/composables/useCompras'
import {
  categoriesOf,
  hasMark,
  pictureShop,
  productLine,
  shownRows,
} from '@/utils/surtidoShop'

const props = defineProps({
  // every line of the list (doco.workspaces.sourcing.catalog_lines)
  all: { type: Array, default: () => [] },
  pictures: { type: Number, default: 0 },
  loading: Boolean,
  // {line: pieces}
  cart: { type: Object, default: () => ({}) },
  // the list's printed marks and the shop's item groups (facets)
  marksList: { type: Array, default: () => [] },
  groups: { type: Array, default: () => [] },
})
const emit = defineEmits(['pieces', 'photo', 'page', 'open'])
// {query, category, marks, history, similarTo, item_group}: the page keeps them
const filters = defineModel('filters', { type: Object, required: true })
const patch = (bit) => (filters.value = { ...filters.value, ...bit })

const PAGE = 60
const limit = ref(PAGE)
// the marks, the history and the group fold behind one button that counts them
const filtersOpen = ref(false)
const activeFilters = computed(
  () =>
    (filters.value.marks || []).length +
    (filters.value.history ? 1 : 0) +
    (filters.value.item_group ? 1 : 0),
)

// the box answers as the worker types, after a short pause
const query = ref(filters.value.query || '')
const searching = ref(false)
let timer = 0
watch(query, (q) => {
  searching.value = true
  clearTimeout(timer)
  timer = setTimeout(() => {
    patch({ query: q })
    searching.value = false
  }, 250)
})
const category = computed({
  get: () => filters.value.category || '',
  set: (v) => patch({ category: v || '' }),
})
const marks = computed({
  get: () => filters.value.marks || [],
  set: (v) => patch({ marks: v || [] }),
})
const history = computed({
  get: () => filters.value.history || '',
  set: (v) => patch({ history: v || '' }),
})
const group = computed({
  get: () => filters.value.item_group || '',
  set: (v) => patch({ item_group: v || '' }),
})
watch(
  () => [
    filters.value.query,
    filters.value.category,
    filters.value.marks,
    filters.value.history,
    filters.value.similarTo,
  ],
  () => (limit.value = PAGE),
)

const categories = computed(() => categoriesOf(props.all))
const markOptions = computed(() =>
  props.marksList.map((m) => ({
    value: m.label,
    label: m.label,
    count: m.count,
  })),
)
const historyOptions = computed(() => [
  { value: 'vendo', label: __('What I sell', null, 'Surtido') },
  { value: 'agotado', label: __('Ran out', null, 'Surtido') },
  { value: 'nuevo', label: __('New to me', null, 'Surtido') },
])
const groups = computed(() =>
  props.groups.map((g) => ({ value: g.name, label: g.name })),
)
const grid = computed(() => pictureShop(props.all, props.pictures))
const rows = computed(() => shownRows(props.all, filters.value))
const visible = computed(() => rows.value.slice(0, limit.value))

// what the list printed on the row, the marks asked for in green
function badges(row) {
  const asked = filters.value.marks || []
  return (row.printed || []).slice(0, 5).map((label) => ({
    label,
    on: asked.some((m) => hasMark({ printed: [label] }, m)),
  }))
}
// our product's name when the supplier calls it something else
function ours(row) {
  const name = row.item_name || ''
  return name && name.toLowerCase() !== String(row.name || '').toLowerCase()
    ? name
    : ''
}
function historyText(row) {
  const sold = Number(row.sold) || 0
  const stock = Number(row.stock) || 0
  if (sold > 0) return __('Sold {0}, {1} left', [sold, stock], 'Surtido')
  if (stock > 0) return __('You have {0}', [stock], 'Surtido')
  return __('New to you', null, 'Surtido')
}
</script>
