<template>
  <div
    ref="scroller"
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-kardex
  >
    <!-- Phone: the page's own bar (route meta.ownPhoneHeader). Back goes up to
         the product or the list it came from; search finds a product. -->
    <AppBar
      v-if="phone"
      v-model:search="search"
      v-model:search-open="searchOpen"
      :back="backTarget"
      :back-label="backLabel"
      :context="context"
      :title="title"
      searchable
      :search-label="__('Search a product', null, CTX)"
    />
    <header
      v-else
      class="flex flex-col gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-6 lg:flex-row lg:items-end"
    >
      <div class="min-w-0 flex-1">
        <RouterLink
          v-if="backTarget"
          :to="backTarget"
          class="mb-1 inline-flex min-h-8 items-center gap-1 text-sm text-ink-gray-6 hover:text-ink-gray-9"
        >
          <span class="lucide-arrow-left size-4" aria-hidden="true" />
          {{ backLabel }}
        </RouterLink>
        <p class="text-sm text-ink-gray-6">{{ context }}</p>
        <h1
          class="break-words text-xl font-semibold text-ink-gray-9 [text-wrap:balance]"
        >
          {{ title }}
        </h1>
      </div>
      <FormControl
        v-model="search"
        data-list-search
        class="min-w-0 sm:max-w-xs lg:w-72 [&_input]:min-h-11 sm:[&_input]:min-h-0"
        type="search"
        :placeholder="__('Search a product', null, CTX)"
        :aria-label="__('Search a product', null, CTX)"
      />
    </header>

    <FilterChips
      class="py-2"
      :model-value="chipValues(state)"
      :chips="chips"
      multiple
      :label="__('Filter movements', null, CTX)"
      :filters-label="__('Filters', null, CTX)"
      :filters-count="filtersOn(state)"
      @update:model-value="(values) => navigate(applyChips(state, values))"
      @clear-filters="clearFilters"
      @apply-filters="applyDraft"
    >
      <template #filters>
        <div class="space-y-4" data-kardex-filters>
          <FormControl
            v-model="draft.almacen"
            type="select"
            :label="__('Store', null, CTX)"
            :options="storeOptions"
          />
          <FormControl
            v-model="draft.tipo"
            type="select"
            :label="__('Kind of movement', null, CTX)"
            :options="kindOptions"
          />
          <FormControl
            v-model="draft.persona"
            type="select"
            :label="__('Who moved it', null, CTX)"
            :options="userOptions"
          />
          <div class="grid grid-cols-2 gap-3">
            <FormControl
              v-model="draft.desde"
              type="date"
              :label="__('From', null, CTX)"
              :placeholder="__('Any day', null, CTX)"
            />
            <FormControl
              v-model="draft.hasta"
              type="date"
              :label="__('To', null, CTX)"
              :placeholder="__('Any day', null, CTX)"
            />
          </div>
        </div>
      </template>
    </FilterChips>

    <div
      v-if="loadError"
      role="alert"
      class="mx-4 my-3 space-y-3 rounded-lg bg-surface-red-1 p-4 text-sm text-ink-red-7 sm:mx-6"
    >
      <p>{{ loadError }}</p>
      <Button :label="__('Retry', null, CTX)" @click="load()" />
    </div>
    <div
      v-else-if="loading && !rows.length"
      role="status"
      class="space-y-3 px-4 py-4 sm:px-6"
      :aria-label="__('Loading movements…', null, CTX)"
    >
      <div
        v-for="n in 6"
        :key="n"
        class="h-14 animate-pulse rounded-lg bg-surface-gray-2"
      />
    </div>
    <EmptyState
      v-else-if="!rows.length"
      class="py-10"
      :state="data && !data.readable ? 'denied' : 'empty'"
      :title="empty.title"
      :message="empty.text"
      :action="empty.action"
      @action="clearAll"
    />
    <template v-else>
      <!-- Phone and tablet: the log by day, as Escáner's «Historial». -->
      <div v-if="!wide" data-kardex-log>
        <section
          v-for="group in groups"
          :key="group.day"
          :aria-label="group.label"
        >
          <h2
            class="sticky top-0 z-[1] bg-surface-base px-4 pb-1 pt-3 text-sm font-semibold text-ink-gray-7"
          >
            {{ group.label }}
          </h2>
          <ul class="divide-y divide-outline-gray-1">
            <li v-for="row in group.rows" :key="row.id">
              <MovementRow
                :row="row"
                :show-item="!state.articulo"
                :show-store="manyStores"
              />
            </li>
          </ul>
        </section>
      </div>
      <!-- Desktop: the same rows as a dense table, still by day. -->
      <div v-else class="px-6 pb-10" data-kardex-table>
        <table class="w-full text-sm">
          <thead>
            <tr
              class="border-b border-outline-gray-2 text-left text-ink-gray-6"
            >
              <th class="py-2 pr-3 font-medium">{{ __('Time', null, CTX) }}</th>
              <th v-if="!state.articulo" class="py-2 pr-3 font-medium">
                {{ __('Product', null, CTX) }}
              </th>
              <th class="py-2 pr-3 font-medium">
                {{ __('Movement', null, CTX) }}
              </th>
              <th v-if="!state.almacen" class="py-2 pr-3 font-medium">
                {{ __('Store', null, CTX) }}
              </th>
              <th class="py-2 pr-3 text-right font-medium">
                {{ __('Quantity', null, CTX) }}
              </th>
              <th class="py-2 pr-3 text-right font-medium">
                {{ __('Balance', null, CTX) }}
              </th>
              <th class="py-2 pr-3 font-medium">{{ __('Who', null, CTX) }}</th>
              <template v-if="data?.cost_visible">
                <th class="py-2 pr-3 text-right font-medium">
                  {{ __('Unit cost', null, CTX) }}
                </th>
                <th class="py-2 text-right font-medium">
                  {{ __('Value', null, CTX) }}
                </th>
              </template>
            </tr>
          </thead>
          <tbody v-for="group in groups" :key="group.day">
            <tr>
              <th
                :colspan="columns"
                scope="colgroup"
                class="bg-surface-gray-1 px-2 py-1.5 text-left text-sm font-semibold text-ink-gray-8"
              >
                {{ group.label }}
              </th>
            </tr>
            <tr
              v-for="row in group.rows"
              :key="row.id"
              class="border-b border-outline-gray-1 align-top hover:bg-surface-gray-1"
              data-kardex-row
              :data-kind="row.kind"
            >
              <td
                class="whitespace-nowrap py-2 pr-3 tabular-nums text-ink-gray-7"
              >
                {{ row.time }}
              </td>
              <td v-if="!state.articulo" class="py-2 pr-3">
                <RouterLink
                  :to="{ name: 'Producto', params: { item: row.item_code } }"
                  class="text-ink-gray-9 hover:underline"
                  >{{ row.item_name }}</RouterLink
                >
              </td>
              <td class="py-2 pr-3">
                <span class="flex items-start gap-2">
                  <span
                    :class="[
                      kindIcon(row.kind),
                      'mt-0.5 size-4 flex-none text-ink-gray-6',
                    ]"
                    aria-hidden="true"
                  />
                  <span class="min-w-0">
                    <component
                      :is="voucherLink(row.voucher) ? RouterLink : 'span'"
                      v-bind="
                        voucherLink(row.voucher)
                          ? { to: voucherLink(row.voucher) }
                          : {}
                      "
                      class="block text-ink-gray-9"
                      :class="voucherLink(row.voucher) ? 'hover:underline' : ''"
                      >{{ rowAction(row) }}</component
                    >
                    <span class="block text-xs text-ink-gray-5">{{
                      row.voucher.name
                    }}</span>
                  </span>
                </span>
              </td>
              <td v-if="!state.almacen" class="py-2 pr-3 text-ink-gray-7">
                {{ row.store }}
              </td>
              <td
                class="whitespace-nowrap py-2 pr-3 text-right font-semibold tabular-nums"
                :class="qtyTone(row.qty)"
              >
                {{ signedQty(row.qty, row.uom) }}
              </td>
              <td
                class="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-ink-gray-7"
              >
                {{ formatQty(row.balance, row.uom) }}
              </td>
              <td class="py-2 pr-3 text-ink-gray-7">
                <span class="block">{{ row.by }}</span>
                <span
                  v-if="row.captured_by"
                  class="block text-xs text-ink-gray-5"
                  >{{ __('captured by {0}', [row.captured_by], CTX) }}</span
                >
              </td>
              <template v-if="data?.cost_visible">
                <td
                  class="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-ink-gray-7"
                >
                  {{ formatMoney(row.valuation_rate) }}
                </td>
                <td
                  class="whitespace-nowrap py-2 text-right tabular-nums"
                  :class="qtyTone(row.value_change)"
                >
                  {{ formatMoney(row.value_change) }}
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="data?.next" class="p-4 text-center">
        <Button
          :label="__('See older movements', null, CTX)"
          :loading="loading"
          class="min-h-11"
          @click="load(data.next)"
        />
      </div>
      <div class="h-24 flex-none lg:h-10" aria-hidden="true" />
    </template>
  </div>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button, FormControl } from 'frappe-ui'
import { useDebounceFn, useMediaQuery } from '@vueuse/core'
import { AppBar, EmptyState, FilterChips } from '@/components/ui'
import MovementRow from '@/components/inventario/MovementRow.vue'
import {
  CTX,
  applyChips,
  chipValues,
  filtersOn,
  groupByDay,
  kardexApi,
  kardexArgs,
  kardexQuery,
  kardexState,
  kindIcon,
  qtyTone,
  rowAction,
  signedQty,
  voucherLink,
} from '@/components/inventario/kardex'
import { isMobile as phone } from '@/composables/breakpoint'
import { errorKind } from '@/utils/contactos'
import { formatMoney, formatQty } from '@/utils/display'

const route = useRoute()
const router = useRouter()
const wide = useMediaQuery('(min-width: 1024px)')
const state = computed(() => kardexState(route.query))
const search = ref(state.value.q)
const searchOpen = ref(!!state.value.q)
const data = ref(null)
const rows = ref([])
const loading = ref(false)
const loadError = ref('')
const options = ref(null)
const draft = reactive({
  almacen: '',
  tipo: '',
  persona: '',
  desde: '',
  hasta: '',
})

const chips = computed(() => [
  { value: 'hoy', label: __('Today', null, CTX) },
  { value: '7d', label: __('7 days', null, CTX) },
  { value: 'entradas', label: __('In', null, CTX) },
  { value: 'salidas', label: __('Out', null, CTX) },
  { value: 'ajustes', label: __('Adjustments', null, CTX) },
])
const any = () => ({ label: __('All', null, CTX), value: '' })
const storeOptions = computed(() => [any(), ...(options.value?.stores || [])])
const kindOptions = computed(() => [any(), ...(options.value?.kinds || [])])
const userOptions = computed(() => [
  { label: __('Everyone', null, CTX), value: '' },
  ...(options.value?.users || []),
])

const scope = computed(() => data.value?.scope || {})
const title = computed(
  () =>
    scope.value.item?.name ||
    scope.value.store?.label ||
    __('Movements', null, CTX),
)
const context = computed(() =>
  state.value.articulo || state.value.almacen
    ? __('Movements', null, CTX)
    : __('Inventory', null, CTX),
)
const backTarget = computed(() =>
  state.value.articulo
    ? { name: 'Producto', params: { item: state.value.articulo } }
    : { name: 'Inventario' },
)
const backLabel = computed(() =>
  state.value.articulo
    ? __('Back to the product', null, CTX)
    : __('Back to Inventario', null, CTX),
)
const groups = computed(() => groupByDay(rows.value))
// A worker with one store reads its name once, not on every row.
const manyStores = computed(
  () => !state.value.almacen && (options.value?.stores?.length ?? 2) > 1,
)
const columns = computed(
  () =>
    5 +
    (state.value.articulo ? 0 : 1) +
    (state.value.almacen ? 0 : 1) +
    (data.value?.cost_visible ? 2 : 0),
)
const narrowed = computed(
  () =>
    chipValues(state.value).length || filtersOn(state.value) || state.value.q,
)
const empty = computed(() => {
  if (data.value && !data.value.readable)
    return {
      title: __('You cannot see stock movements', null, CTX),
      text: __('Ask your manager for access to the stock ledger.', null, CTX),
    }
  if (narrowed.value)
    return {
      title: __('No movements match', null, CTX),
      text: __('Try another day or remove a filter.', null, CTX),
      action: __('Show every movement', null, CTX),
    }
  return {
    title: __('No movements yet', null, CTX),
    text: __(
      'Sales, purchases, transfers and adjustments appear here as they are posted.',
      null,
      CTX,
    ),
  }
})

function navigate(next) {
  router.replace({ query: kardexQuery(next) })
}
function applyDraft() {
  const next = { ...state.value, ...draft }
  if (draft.desde || draft.hasta) next.periodo = ''
  navigate(next)
}
function clearFilters() {
  navigate({
    ...state.value,
    almacen: '',
    tipo: state.value.tipo === 'ajuste' ? 'ajuste' : '',
    persona: '',
    desde: '',
    hasta: '',
  })
}
function clearAll() {
  search.value = ''
  navigate({ articulo: state.value.articulo })
}

let sequence = 0
async function load(cursor = '') {
  const mine = ++sequence
  loading.value = true
  loadError.value = ''
  try {
    const result = await kardexApi('movements', {
      ...kardexArgs(state.value),
      cursor,
      limit: 50,
    })
    if (mine !== sequence) return
    data.value = result
    rows.value = cursor ? [...rows.value, ...result.rows] : result.rows
  } catch (error) {
    if (mine !== sequence) return
    loadError.value =
      error?.messages?.join(' ') ||
      (errorKind(error) === 'permission'
        ? __('You cannot see stock movements', null, CTX)
        : __(
            'We could not load the movements. Check your connection.',
            null,
            CTX,
          ))
  } finally {
    if (mine === sequence) loading.value = false
  }
}

const pushSearch = useDebounceFn((q) => {
  navigate({ ...state.value, q })
}, 300)
watch(search, (q) => pushSearch((q || '').trim()))
watch(
  state,
  (now) => {
    Object.assign(draft, {
      almacen: now.almacen,
      tipo: now.tipo,
      persona: now.persona,
      desde: now.desde,
      hasta: now.hasta,
    })
  },
  { immediate: true },
)
watch(
  () => JSON.stringify(kardexArgs(state.value)),
  () => load(),
  { immediate: true },
)
kardexApi('options')
  .then((result) => (options.value = result))
  .catch(() => (options.value = null))
</script>
