<template>
  <ModuleLayout
    title="Productos"
    :entries="entries"
    :active-key="view"
    @select="selectView"
  >
    <section
      v-if="guard"
      role="alert"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
    >
      <h1 class="text-xl font-semibold">
        {{ __('Productos is not available') }}
      </h1>
      <p class="text-base text-ink-gray-7">{{ guard }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="__('Retry permissions')" @click="retryBoot" />
        <Button :label="__('Copy access request')" @click="copyRequest" />
        <Button :label="__('Back', null, 'Productos')" @click="router.back()" />
      </div>
      <p v-if="copied" role="status" class="text-sm text-ink-gray-6">
        {{ copied }}
      </p>
    </section>
    <template v-else>
      <header
        class="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-6"
      >
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-xl font-semibold text-ink-gray-9">
            {{ viewLabel(view) }}
          </h1>
          <p class="text-sm text-ink-gray-6">{{ subtitle }}</p>
        </div>
        <Button
          v-if="returnTo"
          :label="__('Back to {0}', [returnLabel])"
          class="min-h-11 sm:min-h-8"
          @click="goReturn"
        />
      </header>
      <div
        v-if="
          boot?.price_setup && ['sin-precio', 'precio-revisar'].includes(view)
        "
        role="status"
        class="mx-4 mb-3 rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-7 sm:mx-6"
      >
        {{ boot.price_setup.reason }}
      </div>
      <div class="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
        <FormControl
          class="min-h-11 w-full sm:hidden"
          type="select"
          :aria-label="__('List', null, 'Productos')"
          :model-value="view"
          :options="entries.map((e) => ({ label: e.label, value: e.value }))"
          @update:model-value="selectView"
        />
        <FormControl
          v-model="search"
          class="min-w-0 flex-1 sm:max-w-xs [&_input]:min-h-11 sm:[&_input]:min-h-0"
          type="search"
          :placeholder="__('Search name, code or barcode')"
          :aria-label="__('Search name, code or barcode')"
        />
        <FormControl
          v-if="storeOptions.length > 2"
          class="min-h-11 w-full sm:min-h-0 sm:w-56"
          type="select"
          :aria-label="__('Store', null, 'Productos')"
          :model-value="store"
          :options="storeOptions"
          @update:model-value="selectStore"
        />
      </div>
      <div
        v-if="problem"
        role="alert"
        class="mx-4 mb-3 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        <Button
          class="ml-2"
          :label="__('Retry', null, 'Productos')"
          @click="load()"
        />
      </div>
      <div
        ref="scroller"
        class="min-h-0 flex-1 overflow-y-auto pb-6"
        @scroll.passive="rememberScroll"
      >
        <div
          v-if="loading && !rows.length"
          role="status"
          class="px-6 py-8 text-sm text-ink-gray-6"
        >
          {{ __('Loading products…') }}
        </div>
        <div
          v-else-if="!rows.length"
          class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
        >
          <p class="text-lg font-semibold">{{ emptyTitle }}</p>
          <p class="mt-1 text-sm">{{ emptyBody }}</p>
        </div>
        <ul v-else class="divide-y divide-outline-gray-1">
          <li v-for="row in rows" :key="`${row.name}:${row.warehouse || ''}`">
            <RouterLink
              :to="productRoute(row, listPath)"
              class="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:px-6"
            >
              <img
                v-if="row.image"
                :src="row.image"
                alt=""
                class="h-10 w-10 shrink-0 rounded object-cover"
                loading="lazy"
              />
              <FeatherIcon
                v-else
                name="package"
                class="mt-0.5 h-4 w-4 shrink-0 text-ink-gray-5"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-ink-gray-9">
                  {{ row.title }}
                </span>
                <span class="block truncate text-sm text-ink-gray-6">
                  {{ [row.name, row.item_group].filter(Boolean).join(' · ') }}
                </span>
                <span
                  v-if="stockLabel(row)"
                  class="mt-0.5 block text-sm text-ink-gray-8"
                  >{{ stockLabel(row) }}</span
                >
                <span class="mt-1 flex flex-wrap gap-1">
                  <Badge
                    v-if="row.chip === 'faltan'"
                    theme="red"
                    :label="__('Out of stock', null, 'Productos')"
                  />
                  <Badge
                    v-if="row.chip === 'bajo'"
                    theme="orange"
                    :label="__('Below minimum', null, 'Productos')"
                  />
                  <Badge
                    v-if="row.price?.review || row.price_review"
                    theme="orange"
                    :label="__('Price to review', null, 'Productos')"
                  />
                  <Badge
                    v-if="!row.price && view !== 'precio-revisar'"
                    theme="gray"
                    :label="__('No price', null, 'Productos')"
                  />
                </span>
              </span>
              <span
                v-if="row.price?.rate !== null && row.price?.rate !== undefined"
                class="shrink-0 text-right text-sm font-medium tabular-nums text-ink-gray-9"
                >{{ money(row.price.rate, row.price.currency) }}</span
              >
            </RouterLink>
          </li>
        </ul>
        <div v-if="hasMore" class="px-4 py-4 sm:px-6">
          <Button
            :label="__('Load more', null, 'Productos')"
            :loading="loading"
            class="min-h-11 w-full sm:w-auto"
            @click="load(true)"
          />
        </div>
      </div>
    </template>
  </ModuleLayout>
</template>
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FeatherIcon, FormControl } from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import {
  VIEWS,
  loadProductosBoot,
  money,
  normalizeView,
  problemOf,
  productRoute,
  productosApi,
  productosBoot,
  safeReturn,
  stockLabel,
  viewLabel,
} from '@/composables/useProductos'

const route = useRoute()
const router = useRouter()
const boot = productosBoot
const rows = ref([])
const counts = ref({})
const hasMore = ref(false)
const loading = ref(false)
const problem = ref(null)
const copied = ref('')
const scroller = ref(null)
const view = computed(() => normalizeView(route.query.vista))
const store = computed(() =>
  typeof route.query.tienda === 'string' ? route.query.tienda : '',
)
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const listPath = computed(() => route.fullPath)
const returnTo = computed(() => safeReturn(route.query.return_to))
const returnLabel = computed(() =>
  String(route.query.return_label || __('Inventario')).slice(0, 40),
)
let ticket = 0
let searchTimer = 0

const entries = computed(() =>
  VIEWS.map((v) => {
    const count = counts.value[v.value]
    return {
      ...v,
      label: count
        ? `${viewLabel(v.value)} · ${count.count}${count.more ? '+' : ''}`
        : viewLabel(v.value),
    }
  }),
)
const storeOptions = computed(() => [
  { label: __('All my stores'), value: '' },
  ...(boot.value?.stores || []),
])
const guard = computed(() =>
  boot.value && !boot.value.enabled
    ? boot.value.reason ||
      __('Ask your manager for permission to read items, then retry.')
    : '',
)
const subtitle = computed(
  () =>
    ({
      todos: __('Every active product, newest changes first.'),
      'sin-precio': __('For sale but without a price in the store list.'),
      'precio-revisar': __(
        'Prices with dates, units or packs that need a decision.',
      ),
      faltan: __('Products with a minimum and nothing on hand in a store.'),
      'bajo-minimo': __('Still on hand, but below the store minimum.'),
    })[view.value],
)
const emptyTitle = computed(() =>
  search.value ? __('No products match') : __('Nothing here'),
)
const emptyBody = computed(() =>
  search.value
    ? __('Try another name, code or barcode.')
    : view.value === 'todos'
      ? __('Products appear here once they are created.')
      : __('Nothing to do in this list right now.'),
)

async function load(more = false) {
  const mine = ++ticket
  loading.value = true
  problem.value = null
  try {
    const page = await productosApi('queue', {
      view: view.value,
      search: search.value.trim(),
      store: store.value,
      start: more ? rows.value.length : 0,
      page_length: 30,
    })
    if (mine !== ticket) return
    rows.value = more ? [...rows.value, ...page.rows] : page.rows
    hasMore.value = page.has_more
    if (!more) restoreScroll()
  } catch (error) {
    if (mine !== ticket) return
    problem.value = problemOf(error)
    // A store that is no longer readable falls back to all of the worker's stores.
    if (problem.value.kind === 'permission' && store.value)
      update({ tienda: '' })
  } finally {
    if (mine === ticket) loading.value = false
  }
}
async function loadCounts() {
  try {
    counts.value = await productosApi('counts', { store: store.value })
  } catch {
    counts.value = {}
  }
}

function update(query) {
  const next = { ...route.query, ...query }
  for (const key of Object.keys(next)) if (!next[key]) delete next[key]
  router.replace({ query: next })
}
function selectView(value) {
  update({ vista: normalizeView(value) })
}
function selectStore(value) {
  update({ tienda: value || '' })
}
function goReturn() {
  if (returnTo.value) window.location.assign(returnTo.value)
}

const scrollKey = () => `muelle:productos:scroll:${route.fullPath}`
function rememberScroll() {
  try {
    sessionStorage.setItem(scrollKey(), String(scroller.value?.scrollTop || 0))
  } catch {
    /* convenience only */
  }
}
function restoreScroll() {
  nextTick(() => {
    try {
      const top = Number(sessionStorage.getItem(scrollKey()) || 0)
      if (scroller.value && top) scroller.value.scrollTop = top
    } catch {
      /* convenience only */
    }
  })
}

async function retryBoot() {
  await loadProductosBoot({ refresh: true })
  if (boot.value?.enabled) {
    load()
    loadCounts()
  }
}
async function copyRequest() {
  const text = __(
    'I need access to Productos: read permission for Item so I can see prices and stock.',
  )
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied. Share it with your manager.')
  } catch {
    copied.value = text
  }
}

watch(search, (value) => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => update({ q: value.trim() }), 250)
})
watch(
  () => [route.query.vista, route.query.q, route.query.tienda],
  ([, , tienda], previous) => {
    if (route.name !== 'Productos' || !boot.value?.enabled) return
    load()
    if (tienda !== previous?.[2]) loadCounts()
  },
)
onMounted(async () => {
  await loadProductosBoot()
  if (boot.value?.enabled) {
    load()
    loadCounts()
  }
})
</script>
