<template>
  <!-- «Historial» of one product: what it cost each time it was bought and
       what it sold for, so the worker sees whether the price still fits.
       Mounted on first open (the page loads it async). -->
  <BottomSheet
    :open="open"
    :title="row?.item_name || 'Historial'"
    :subtitle="subtitle"
    layer="precios-historial"
    @update:open="(value) => emit('update:open', value)"
  >
    <div class="space-y-4 pb-2" data-precios-historial>
      <div class="flex flex-wrap items-center gap-2">
        <Segmented
          :model-value="days"
          label="Fechas"
          :options="RANGES"
          fit="content"
          class="max-w-full"
          @update:model-value="(value) => (days = Number(value))"
        />
      </div>
      <div
        v-if="listNames.length > 1"
        class="flex flex-wrap gap-2"
        role="group"
        aria-label="Lista de precios"
      >
        <button
          v-for="name in listNames"
          :key="name"
          type="button"
          :class="chipClass(name === shownList)"
          :aria-pressed="name === shownList"
          @click="shownList = name"
        >
          {{ name }}
        </button>
      </div>

      <p
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        {{ problem }}
        <button
          type="button"
          class="press ml-2 font-medium underline"
          @click="load"
        >
          Volver a intentar
        </button>
      </p>
      <div
        v-else-if="!history"
        class="h-52 animate-pulse rounded-6 bg-surface-gray-1 motion-reduce:animate-none"
        role="status"
      >
        <span class="sr-only">Cargando historial…</span>
      </div>

      <template v-else>
        <!-- The chart first: it answers «did the cost move?» at a glance. -->
        <PriceChart
          :history="history"
          :list="shownList"
          :currency="shownCurrency"
          :unit="unitWord"
        />

        <dl
          class="grid grid-cols-2 gap-px overflow-hidden rounded-6 bg-outline-gray-1 sm:grid-cols-4"
          data-historial-kpis
        >
          <div
            v-for="tile in tiles"
            :key="tile.label"
            class="bg-surface-base px-3 py-2"
          >
            <dt class="text-sm text-ink-gray-6">{{ tile.label }}</dt>
            <dd class="num text-lg font-semibold text-ink-gray-9">
              {{ tile.value }}
            </dd>
            <dd v-if="tile.hint" class="text-xs text-ink-gray-6">
              {{ tile.hint }}
            </dd>
          </div>
        </dl>

        <p v-if="!history.cost_visible" class="text-sm text-ink-gray-6">
          Los costos de compra solo los ve quien tiene permiso de ver costos.
        </p>

        <section v-if="purchases.length" aria-label="Compras">
          <h3 class="title-face mb-1 text-base font-semibold text-ink-gray-9">
            Compras
            <span class="num font-normal text-ink-gray-6">{{
              purchases.length
            }}</span>
          </h3>
          <ul class="divide-y divide-outline-gray-1">
            <li v-for="(purchase, index) in purchases" :key="index">
              <component
                :is="purchase.to ? RouterLink : 'div'"
                :to="purchase.to || undefined"
                class="flex min-h-12 items-center gap-3 py-2"
                :class="purchase.to ? 'press hover:bg-surface-gray-1' : ''"
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-base text-ink-gray-9">
                    {{ purchase.supplier || 'Proveedor' }}
                  </p>
                  <p class="text-sm text-ink-gray-6">
                    {{ formatDate(purchase.date) }} ·
                    {{ qtyText(purchase.qty) }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="num text-base font-medium text-ink-gray-9">
                    {{ money(purchase.value, shownCurrency) }}
                  </p>
                  <p
                    v-if="purchase.delta !== null && purchase.delta !== 0"
                    class="num text-sm"
                    :class="
                      purchase.delta > 0
                        ? 'text-ink-amber-8'
                        : 'text-ink-green-8'
                    "
                  >
                    {{ purchase.delta > 0 ? '▲' : '▼' }}
                    {{ Math.abs(purchase.delta) }} %
                  </p>
                </div>
              </component>
            </li>
          </ul>
        </section>

        <section v-if="changes.length" aria-label="Cambios de precio">
          <h3 class="title-face mb-1 text-base font-semibold text-ink-gray-9">
            Cambios de precio
          </h3>
          <ul class="divide-y divide-outline-gray-1">
            <li
              v-for="(change, index) in changes"
              :key="index"
              class="flex min-h-12 items-center gap-3 py-2"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-base text-ink-gray-9">
                  {{ change.price_list }}
                </p>
                <p class="truncate text-sm text-ink-gray-6">
                  {{ formatDate(change.at)
                  }}<template v-if="change.by"> · {{ change.by }}</template>
                </p>
              </div>
              <p class="num text-right text-base text-ink-gray-9">
                <template v-if="change.old_rate !== null">
                  <span class="text-ink-gray-6"
                    >{{
                      money(change.old_rate, change.currency || shownCurrency)
                    }}
                    →</span
                  >
                </template>
                {{
                  change.new_rate === null
                    ? 'Quitado'
                    : money(change.new_rate, change.currency || shownCurrency)
                }}
              </p>
            </li>
          </ul>
        </section>
        <p
          v-else-if="history.changes_readable === false"
          class="text-sm text-ink-gray-6"
        >
          Los cambios de precio los ve quien puede consultar el registro de
          precios.
        </p>
      </template>
    </div>
    <template #actions>
      <RouterLink
        v-if="row"
        :to="{ name: 'Producto', params: { item: row.item_code } }"
        class="press inline-flex min-h-11 items-center rounded-6 bg-surface-gray-2 px-4 text-base font-medium text-ink-gray-9"
      >
        Abrir producto
      </RouterLink>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { BottomSheet, Segmented, chipClass } from '@/components/ui'
import PriceChart from './PriceChart.vue'
import { documentRoute } from '@/documentos/registry'
import { shellBoot } from '@/composables/muelleShell'
import { formatDate } from '@/utils/display'
import {
  RANGES,
  cellOf,
  changePct,
  costFor,
  factorOf,
  historySummary,
  marginPct,
  money,
  preciosApi,
} from '@/composables/usePrecios'
import { problemOf } from '@/composables/useProductos'

const props = defineProps({
  open: { type: Boolean, default: false },
  item: { type: String, default: '' },
  list: { type: String, default: '' },
  lists: { type: Array, default: () => [] },
  currency: { type: String, default: 'MXN' },
})
const emit = defineEmits(['update:open'])

const days = ref(365)
const shownList = ref(props.list)
const history = ref(null)
const problem = ref('')
let generation = 0

const row = computed(() => history.value?.item || null)
// Without lists from the page (a product's own page), the product's own.
const listNames = computed(() =>
  props.lists.length ? props.lists : Object.keys(row.value?.prices || {}),
)
const cell = computed(() => cellOf(row.value, shownList.value))
const shownCurrency = computed(() => cell.value?.currency || props.currency)
const unitWord = computed(() =>
  String(cell.value?.uom || row.value?.stock_uom || 'pieza').toLowerCase(),
)
const subtitle = computed(() => {
  if (!row.value) return ''
  return [row.value.item_code, row.value.stock_uom].filter(Boolean).join(' · ')
})

async function load() {
  if (!props.item) return
  const own = ++generation
  problem.value = ''
  history.value = null
  try {
    const answer = await preciosApi('history', {
      item: props.item,
      days: days.value,
    })
    if (own !== generation) return
    history.value = answer
    if (!shownList.value)
      shownList.value = Object.keys(answer?.item?.prices || {})[0] || ''
  } catch (error) {
    if (own === generation) problem.value = problemOf(error).detail
  }
}

watch(
  () => [props.open, props.item],
  ([open]) => {
    if (!open) return
    shownList.value = props.list || props.lists[0] || ''
    load()
  },
  { immediate: true },
)
watch(days, () => props.open && load())

const summary = computed(() => historySummary(history.value, shownList.value))
const tiles = computed(() => {
  const price = Number(cell.value?.rate)
  const cost = costFor(row.value, cell.value)
  const out = [
    {
      label: 'Precio hoy',
      value: price > 0 ? money(price, shownCurrency.value) : 'Sin precio',
    },
    {
      label: 'Costo hoy',
      value: cost ? money(cost, shownCurrency.value) : '—',
    },
  ]
  const margin = marginPct(price, cost)
  out.push({ label: 'Margen', value: margin === null ? '—' : `${margin} %` })
  const s = summary.value
  out.push(
    s
      ? {
          label: 'El costo en estas fechas',
          value:
            s.change === null ? '—' : `${s.change > 0 ? '+' : ''}${s.change} %`,
          hint: `De ${money(s.min, shownCurrency.value)} a ${money(s.max, shownCurrency.value)}`,
        }
      : { label: 'Compras en estas fechas', value: '0' },
  )
  return out
})

const purchases = computed(() => {
  const list = history.value?.purchases || []
  const factor = factorOf(row.value, cell.value)
  const out = list.map((purchase, index) => ({
    ...purchase,
    value: Number(purchase.rate) * factor,
    delta: index ? changePct(purchase.rate, list[index - 1].rate) : null,
    to: purchase.voucher?.readable
      ? documentRoute(purchase.voucher.doctype, purchase.voucher.name, {
          boot: shellBoot.value,
        })
      : null,
  }))
  return out.reverse()
})
const changes = computed(() =>
  [...(history.value?.changes || [])]
    .filter(
      (change) =>
        listNames.value.length < 2 || change.price_list === shownList.value,
    )
    .reverse(),
)

function qtyText(qty) {
  return `${Number(qty || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${row.value?.stock_uom || ''}`.trim()
}
</script>
