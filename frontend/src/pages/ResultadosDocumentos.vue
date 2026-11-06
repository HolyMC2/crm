<template>
  <ModuleLayout
    :title="__('Results')"
    :entries="entries"
    :active-key="state.tipo"
    @select="(value) => update({ tipo: value })"
  >
    <header
      class="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-6"
    >
      <div class="min-w-0 flex-1">
        <a
          :href="backHref"
          data-testid="back-to-board"
          class="hidden min-h-11 sm:inline-flex items-center gap-1 text-sm font-medium text-ink-gray-7 hover:text-ink-gray-9"
          @click="goBack"
          ><span class="lucide-arrow-left size-4" aria-hidden="true" />{{
            __('Back to {0}', [backLabel])
          }}</a
        >
        <h1 class="truncate text-xl font-semibold text-ink-gray-9">
          {{ tipoLabel(state.tipo) }}
        </h1>
        <p class="text-sm text-ink-gray-6">{{ subtitle }}</p>
      </div>
    </header>
    <!-- A phone picks the list on one chip row (S1 FilterChips). -->
    <FilterChips
      class="pb-2 sm:hidden"
      data-testid="lens-tipos"
      :model-value="state.tipo"
      :chips="entries.map((e) => ({ label: e.label, value: e.value }))"
      :deselectable="false"
      :label="__('List', null, CTX)"
      @update:model-value="(value) => value && update({ tipo: value })"
    />
    <div
      class="lens-controls flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6"
    >
      <FormControl
        v-model="search"
        class="min-w-0 flex-1 sm:max-w-xs"
        type="search"
        :placeholder="__('Search customer, product or document')"
        :aria-label="__('Search customer, product or document')"
      />
    </div>
    <p
      v-if="capped"
      class="mx-4 mb-2 text-sm text-ink-gray-6 sm:mx-6"
      role="status"
    >
      {{
        __(
          'Showing the latest 500 documents. Pick a shorter period or one shop to see the rest.',
        )
      }}
    </p>
    <div
      v-if="problem"
      role="alert"
      class="mx-4 mb-3 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
    >
      <strong>{{ problem.title }}.</strong> {{ problem.detail }}
      <div class="mt-2 flex flex-wrap gap-2">
        <Button :label="__('Retry', null, CTX)" @click="load()" />
        <Button
          v-if="problem.kind === 'permission'"
          :label="__('Copy access request')"
          @click="copyRequest"
        />
      </div>
      <p v-if="copied" role="status" class="mt-1 text-xs">{{ copied }}</p>
    </div>
    <!-- Desktop keeps each amount beside its name (max-w-3xl). -->
    <div class="min-h-0 max-w-3xl flex-1 overflow-y-auto pb-6">
      <div
        v-if="loading && !rows.length"
        role="status"
        :aria-label="__('Loading')"
        class="space-y-3 px-4 py-2 sm:px-6"
      >
        <div class="grid grid-cols-2 gap-2">
          <div class="skel h-[5.5rem] rounded-7" />
          <div class="skel h-[5.5rem] rounded-7" />
        </div>
        <div
          class="divide-y divide-outline-gray-1 rounded-7 border border-outline-gray-1"
        >
          <div v-for="n in 4" :key="n" class="flex gap-3 px-4 py-3">
            <div class="skel h-4 w-10 rounded-4" />
            <div class="flex-1 space-y-2">
              <div class="skel h-4 w-2/3 rounded-4" />
              <div class="skel h-3 w-1/2 rounded-4" />
              <div class="flex gap-1.5">
                <div class="skel h-7 w-24 rounded-full" />
                <div class="skel h-7 w-16 rounded-full" />
              </div>
            </div>
            <div class="skel h-5 w-20 rounded-4" />
          </div>
        </div>
      </div>
      <div
        v-else-if="!filtered.length && !problem"
        class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
      >
        <p class="text-lg font-semibold">{{ __('Nothing in this list') }}</p>
        <p class="mt-1 text-sm">
          {{
            search
              ? __('Try another customer, product or document number.')
              : __('Pick another period or list.')
          }}
        </p>
      </div>
      <template v-else>
        <section
          class="px-4 pb-4 sm:px-6"
          data-testid="lens-summary"
          :aria-label="__('Summary', null, CTX)"
        >
          <KpiGrid>
            <KpiTile :label="totalLabel" :value="money(total, currency)" />
            <KpiTile
              :label="countLabel"
              :value="String(filtered.length)"
              :hint="
                filtered.length > 1 && state.tipo !== 'cierres'
                  ? __('Average {0}', [money(average, currency)], CTX)
                  : ''
              "
            />
          </KpiGrid>
          <div v-if="split.length" class="mt-3" data-testid="lens-split">
            <div
              class="split-bar flex h-2 gap-0.5 overflow-hidden rounded-full"
              aria-hidden="true"
            >
              <span
                v-for="(p, i) in split"
                :key="p.mode"
                class="h-full min-w-1"
                :class="splitTone(i)"
                :style="{ flexGrow: p.share || 1 }"
              />
            </div>
            <ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <li
                v-for="(p, i) in split"
                :key="p.mode"
                class="flex items-center gap-1.5 text-ink-gray-6"
              >
                <span
                  class="size-2 shrink-0 rounded-full"
                  :class="splitTone(i)"
                  aria-hidden="true"
                />
                {{ modeOfPaymentLabel(p.mode) }}
                <span class="num font-medium text-ink-gray-8">{{
                  money(p.amount, currency)
                }}</span>
              </li>
            </ul>
          </div>
        </section>
        <section
          v-for="group in groups"
          :key="group.key"
          class="mb-4"
          :aria-label="group.label || undefined"
        >
          <h2
            v-if="group.label"
            class="sticky top-0 z-[1] flex items-baseline justify-between gap-3 bg-surface-base px-4 py-2 sm:px-6"
          >
            <span class="text-sm font-semibold text-ink-gray-8">{{
              sentence(group.label)
            }}</span>
            <span class="num text-sm text-ink-gray-6"
              >{{ group.rows.length }} ·
              {{ money(group.amount, currency) }}</span
            >
          </h2>
          <ul
            class="mx-4 divide-y divide-outline-gray-1 overflow-hidden rounded-7 border border-outline-gray-1 bg-surface-elevation-1 sm:mx-6"
            data-testid="lens-rows"
          >
            <li
              v-for="row in group.rows"
              :key="`${row.doctype}:${row.name}`"
              :data-fresh="live.fresh.value.has(rowKey(row)) ? '' : undefined"
              :class="entering ? 'row-in' : ''"
              :style="entering ? rowDelay(row) : undefined"
            >
              <a
                :href="rowHref(row)"
                class="flex min-h-14 items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link active:bg-surface-gray-2"
                :class="row.items?.length ? 'pb-2' : ''"
                data-testid="lens-row"
                @pointerdown="prefetch(row)"
                @click="open($event, row)"
              >
                <span
                  v-if="row.posting_time"
                  class="num w-10 shrink-0 pt-0.5 text-sm text-ink-gray-6"
                  >{{ row.posting_time }}</span
                >
                <span
                  v-else
                  class="flex size-9 shrink-0 items-center justify-center rounded-6 bg-surface-gray-2 text-ink-gray-7"
                  aria-hidden="true"
                >
                  <span :class="rowIcon" class="size-4" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      class="line-clamp-2 break-words font-semibold text-ink-gray-9"
                      >{{ rowTitle(row) }}</span
                    >
                    <StatusChip
                      v-if="saleState(row)"
                      :status="saleState(row).status"
                    />
                  </span>
                  <span
                    v-if="rowMeta(row, group)"
                    class="mt-0.5 block truncate text-sm text-ink-gray-6"
                  >
                    {{ rowMeta(row, group) }}
                  </span>
                </span>
                <span class="flex shrink-0 flex-col items-end gap-0.5">
                  <span
                    class="num text-lg font-semibold leading-tight"
                    :class="
                      state.tipo === 'cierres' && row.amount
                        ? 'text-ink-red-7'
                        : 'text-ink-gray-9'
                    "
                    >{{ money(row.amount, currency) }}</span
                  >
                  <span
                    v-if="Number(row.outstanding) > 0.005"
                    class="num text-sm text-ink-red-7"
                    >{{
                      __('Owes {0}', [money(row.outstanding, currency)], CTX)
                    }}</span
                  >
                  <span v-else-if="row.deal" class="text-xs text-ink-gray-6">{{
                    __('Sale in Ventas')
                  }}</span>
                </span>
              </a>
              <!-- What was sold: each product opens beside the row, never
                   inside its link. -->
              <div
                v-if="row.items?.length"
                class="flex flex-wrap items-center gap-1.5 pb-3 pr-4"
                :class="row.posting_time ? 'pl-[4.25rem]' : 'pl-16'"
                data-testid="lens-items"
              >
                <template v-for="(item, i) in row.items" :key="i">
                  <RouterLink
                    v-if="itemTo(item)"
                    :to="itemTo(item)"
                    class="press inline-flex h-8 max-w-full items-center gap-1 rounded-full border border-outline-gray-2 px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-2"
                    :title="item.item_name"
                  >
                    <span class="truncate">{{ itemText(item) }}</span>
                  </RouterLink>
                  <span
                    v-else
                    class="inline-flex h-8 max-w-full items-center rounded-full bg-surface-gray-2 px-3 text-sm text-ink-gray-7"
                    ><span class="truncate">{{ itemText(item) }}</span></span
                  >
                </template>
                <span
                  v-if="row.items_count > row.items.length"
                  class="text-sm text-ink-gray-6"
                  >{{
                    __('+{0} more', [row.items_count - row.items.length], CTX)
                  }}</span
                >
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </ModuleLayout>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, FormControl } from 'frappe-ui'
import { FilterChips, KpiGrid, KpiTile, StatusChip } from '@/components/ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import { problemOf } from '@/composables/useCobranza'
import { money } from '@/composables/useCompras'
import { useLiveList } from '@/composables/liveList'
import { shellBoot } from '@/composables/muelleShell'
import {
  CTX,
  TIPOS,
  RETURN_LABEL,
  boardHref,
  compareLabel,
  fetchDocument,
  lensFromMemory,
  lensMatch,
  lensToMemory,
  paymentSplit,
  periodLabel,
  productHref,
  readLensQuery,
  resultadosApi,
  routerPath,
  rowRoute,
  saleLine,
  saleState,
  tipoLabel,
  walkInName,
} from '@/composables/useResultados'
import { modeOfPaymentLabel } from '@/utils/modeOfPayment'
import { moduleEnabled, readReturn } from '@/vendor/muelle-shell/contracts'
import { formatDay } from '@/utils/contactos'
import { displayName, kindLabel, personName } from '@/utils/display'

// «miércoles, 14 de octubre» → «Miércoles, 14 de octubre» (CSS capitalize
// would also raise «De»).
function sentence(text) {
  const value = String(text || '')
  return value ? value[0].toUpperCase() + value.slice(1) : ''
}
function rowTitle(row) {
  return walkInName(
    displayName(row.title || '', row.doctype, {
      fallback: kindLabel(row.doctype) || __('Document'),
    }),
  )
}
// Second line: what the worker needs, never the folio. A ticket says how it
// was paid and who rang it (its time leads the row).
function rowMeta(row, group) {
  if (row.posting_time)
    return [
      !group.label && row.posting_date ? formatDay(row.posting_date) : '',
      saleLine(row, modeOfPaymentLabel, personName),
    ]
      .filter(Boolean)
      .join(' · ')
  return [
    row.return_against ? __('Return', null, CTX) : '',
    !group.label && row.posting_date ? formatDay(row.posting_date) : '',
    row.tickets ? __('{0} purchases', [row.tickets]) : '',
    row.owner ? personName(row.owner) : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

const route = useRoute()
const router = useRouter()
const rows = ref([])
const loading = ref(false)
const capped = ref(false)
const problem = ref(null)
const copied = ref('')
const period = ref(null)
const search = ref('')
let ticket = 0

const state = computed(() => readLensQuery(route.query))
const currency = computed(() => shellBoot.value?.currency || '')
const entries = computed(() =>
  TIPOS.map((t) => ({
    value: t.value,
    label: tipoLabel(t.value),
    icon: 'list',
  })),
)
// «Volver» goes where the caller asked (the board with its period), else to
// the board for the same query.
const caller = computed(() =>
  readReturn(new URLSearchParams(route.query), {
    allowedPrefixes: ['/crm/'],
    acceptLegacy: false,
  }),
)
const backHref = computed(() => caller.value?.to || boardHref(state.value))
const backLabel = computed(() => caller.value?.label || 'Resultados')
const subtitle = computed(() => {
  const p = period.value
  const range = p
    ? p.from === p.to
      ? dateText(p.from)
      : `${dateText(p.from)} – ${dateText(p.to)}`
    : periodLabel(state.value.periodo)
  return state.value.compara === 'no'
    ? range
    : `${range} · ${compareLabel(state.value.compara)}`
})
const filtered = computed(() => {
  const text = search.value.trim()
  if (!text) return rows.value
  return rows.value.filter((row) => lensMatch(row, text))
})

const ROW_ICONS = {
  ventas: 'lucide-receipt',
  canceladas: 'lucide-circle-x',
  devoluciones: 'lucide-undo-2',
  cierres: 'lucide-wallet',
  clientes: 'lucide-user-round',
}
const rowIcon = computed(() => ROW_ICONS[state.value.tipo] || 'lucide-file')
const total = computed(() =>
  filtered.value.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
)
const average = computed(() =>
  filtered.value.length ? total.value / filtered.value.length : 0,
)
const SUMMARY = {
  ventas: ['Sold', 'Tickets'],
  canceladas: ['Cancelled', 'Tickets'],
  devoluciones: ['Returned', 'Returns'],
  cierres: ['Cash difference', 'Closings'],
  clientes: ['Bought', 'Customers'],
}
const totalLabel = computed(() =>
  __((SUMMARY[state.value.tipo] || SUMMARY.ventas)[0], null, CTX),
)
const countLabel = computed(() =>
  __((SUMMARY[state.value.tipo] || SUMMARY.ventas)[1], null, CTX),
)
// How the tickets were paid, as one bar: the biggest mode in the accent.
const split = computed(() =>
  ['ventas', 'devoluciones'].includes(state.value.tipo)
    ? paymentSplit(filtered.value)
    : [],
)
const SPLIT_TONES = [
  'bg-[var(--muelle-accent)]',
  'bg-surface-gray-7',
  'bg-surface-gray-5',
  'bg-surface-gray-4',
]
const splitTone = (i) => SPLIT_TONES[Math.min(i, SPLIT_TONES.length - 1)]

// The products a ticket sold open in Productos, when the worker has it.
const canOpenProducts = computed(() =>
  moduleEnabled(shellBoot.value, 'productos'),
)
function itemTo(item) {
  if (!canOpenProducts.value || !item.item_code) return null
  return routerPath(
    productHref(item.item_code, `/crm${route.fullPath}`, RETURN_LABEL),
  )
}
function itemText(item) {
  const qty = Number(item.qty) || 0
  return qty && qty !== 1 ? `${qty} × ${item.item_name}` : item.item_name
}

// Rows rise in one after another when they arrive from the network; a list
// answered from memory (going back to it) shows at once.
const entering = ref(false)
const order = computed(
  () => new Map(filtered.value.map((row, i) => [row, Math.min(i, 12)])),
)
const rowDelay = (row) => ({
  animationDelay: `${(order.value.get(row) || 0) * 24}ms`,
})
function prefetch(row) {
  if (row.deal || row.doctype === 'Customer') return
  fetchDocument(row.doctype, row.name)
}
// Dated lists read by day, newest first, each day with its count and total.
const groups = computed(() => {
  if (state.value.tipo === 'clientes')
    return [
      { key: 'all', label: '', rows: filtered.value, amount: total.value },
    ]
  const out = []
  for (const row of filtered.value) {
    const key = row.posting_date || ''
    let group = out[out.length - 1]
    if (!group || group.key !== key) {
      group = {
        key,
        label: key
          ? new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })
          : '',
        rows: [],
        amount: 0,
      }
      out.push(group)
    }
    group.rows.push(row)
    group.amount += Number(row.amount) || 0
  }
  return out
})

function dateText(iso) {
  const [y, m, d] = String(iso || '')
    .split('-')
    .map(Number)
  if (!y) return ''
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}
function rowHref(row) {
  return rowRoute(row, `/crm${route.fullPath}`)
}
function open(event, row) {
  const local = routerPath(rowHref(row))
  if (!local || event.metaKey || event.ctrlKey || event.shiftKey) return
  event.preventDefault()
  router.push(local)
}
function goBack(event) {
  const local = routerPath(backHref.value)
  if (!local || event.metaKey || event.ctrlKey) return
  event.preventDefault()
  router.push(local)
}
function update(patch) {
  router.replace({ query: { ...route.query, ...patch } })
}

async function load() {
  const mine = ++ticket
  const { tipo, periodo, compara, empresa, tienda, desde, hasta } = state.value
  const args = {
    tipo,
    periodo,
    compara,
    empresa,
    tienda,
    ...(periodo === 'rango' ? { desde, hasta } : {}),
  }
  const key = JSON.stringify(args)
  const known = lensFromMemory(key)
  if (known) {
    rows.value = known.rows
    capped.value = known.capped
    period.value = known.period
  } else rows.value = []
  entering.value = false
  loading.value = true
  problem.value = null
  try {
    const out = await resultadosApi('documents', args)
    if (mine !== ticket) return
    const fresh = {
      rows: out.rows || [],
      capped: !!out.capped,
      period: { from: out.from, to: out.to },
    }
    lensToMemory(key, fresh)
    entering.value = !known
    rows.value = fresh.rows
    capped.value = fresh.capped
    period.value = fresh.period
  } catch (error) {
    if (mine === ticket) {
      if (!known) rows.value = []
      problem.value = problemOf(error)
    }
  } finally {
    if (mine === ticket) loading.value = false
  }
}
async function copyRequest() {
  const text = __(
    'I need access to «{0}» in Muelle Resultados. The screen says: {1}',
    [tipoLabel(state.value.tipo), problem.value?.detail || ''],
  )
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied. Share it with your manager.')
  } catch {
    copied.value = text
  }
}

// A sale rung up, cancelled or returned, or a cash closing, while the list is
// open shows without a reload; a new one is marked for a moment.
const rowKey = (row) => `${row.doctype}:${row.name}`
const live = useLiveList(
  () =>
    state.value.tipo === 'cierres' ? 'POS Closing Shift' : 'Sales Invoice',
  async () => {
    if (route.name !== 'ResultadosDocumentos') return
    const before = rows.value.map(rowKey)
    await load()
    live.mark(before, rows.value.map(rowKey))
  },
)

watch(
  () => [
    state.value.tipo,
    state.value.periodo,
    state.value.compara,
    state.value.empresa,
    state.value.tienda,
    state.value.desde,
    state.value.hasta,
  ],
  () => {
    if (route.name === 'ResultadosDocumentos') load()
  },
  { immediate: true },
)
</script>
<style scoped>
/* A ticket rises 6 px into place, one after another (rowDelay). */
@keyframes row-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
.row-in {
  animation: row-in 0.22s cubic-bezier(0.21, 1.02, 0.73, 1) backwards;
}
/* The payment bar fills from the left once. */
@keyframes split-in {
  from {
    transform: scaleX(0);
  }
}
.split-bar {
  transform-origin: left;
  animation: split-in 0.45s cubic-bezier(0.2, 0.8, 0.2, 1);
}
@media (prefers-reduced-motion: reduce) {
  .row-in,
  .split-bar {
    animation: none;
  }
}
/* A 44 px search field on a phone; the desktop keeps frappe-ui's size. */
@media (max-width: 639px) {
  .lens-controls :deep(input) {
    min-height: 44px;
    font-size: 1rem;
  }
}
</style>
