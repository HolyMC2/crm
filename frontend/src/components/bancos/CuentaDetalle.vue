<template>
  <!-- One account (Shell SPEC §6 DD19): the balance hero (Square «Balance»),
       then its movements by day with one signed amount each, the bank's
       (Bank Transaction) or the books' (GL). A bank movement opens
       «Conciliar» with its suggested match (Xero «Matched invoice»). -->
  <div
    class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-bancos-cuenta
  >
    <AppBar
      v-model:search="search"
      v-model:search-open="searchOpen"
      :back="pane ? false : backTo"
      back-label="Volver a Bancos"
      :context="header ? context : 'Bancos'"
      :title="header?.label || 'Cuenta'"
      :bell="!pane"
      :stack="false"
      searchable
      search-label="Buscar por importe o referencia"
      :loading="loading && !!rows.length"
    >
      <template v-if="pane" #actions>
        <RouterLink
          :to="{ name: 'Bancos', query: companyQuery }"
          class="flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          aria-label="Cerrar cuenta"
        >
          <span class="lucide-x size-6" aria-hidden="true" />
        </RouterLink>
      </template>
    </AppBar>

    <div
      v-if="loadError"
      role="alert"
      class="mx-4 my-3 space-y-3 rounded-6 bg-surface-red-1 p-4 text-sm text-ink-red-7"
    >
      <p>{{ loadError }}</p>
      <Button label="Reintentar" @click="reload()" />
    </div>

    <!-- Hero: the balance, the bank's own figure when it syncs, and what is
         left to reconcile (one tap filters to it). -->
    <section
      v-if="header"
      class="px-4 pb-2 pt-3"
      aria-label="Saldo"
      data-bancos-hero
    >
      <p class="text-sm text-ink-gray-6">
        {{
          header.kind === 'tarjeta'
            ? 'Por pagar en la tarjeta'
            : 'Saldo en libros'
        }}
      </p>
      <p
        class="break-words text-3xl font-semibold tabular-nums"
        :class="
          Number(header.balance) < 0 ? 'text-ink-red-7' : 'text-ink-gray-9'
        "
      >
        {{ money(header.balance, header.currency) }}
      </p>
      <p
        v-if="header.bank_balance"
        class="mt-1 text-sm text-ink-gray-6"
        data-bancos-bank-balance
      >
        En el banco
        <span class="tabular-nums">{{
          money(header.bank_balance.amount, header.currency)
        }}</span>
        · {{ balanceWhen(header.bank_balance.at) }}
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          v-if="header.pending"
          type="button"
          class="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-amber-2 px-4 text-sm font-medium text-ink-amber-8"
          data-bancos-pending
          @click="setFilter('pendientes')"
        >
          {{
            header.pending === 1
              ? '1 sin conciliar'
              : `${header.pending} sin conciliar`
          }}
        </button>
        <span
          v-else-if="header.reconcilable && header.pending === 0"
          class="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-green-2 px-4 text-sm font-medium text-ink-green-8"
        >
          <span class="lucide-check-check size-4" aria-hidden="true" />
          Todo conciliado
        </span>
        <RouterLink
          v-if="header.ledger"
          :to="{ name: 'CatalogoCuenta', params: { cuenta: header.ledger } }"
          class="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-outline-gray-2 px-4 text-sm text-ink-gray-8 hover:bg-surface-gray-1"
        >
          <span class="lucide-folder size-4" aria-hidden="true" />
          Cuenta contable
        </RouterLink>
      </div>
    </section>

    <div v-if="header?.reconcilable" class="px-4 pt-2">
      <Segmented
        :model-value="state.vista"
        :options="vistas"
        label="Movimientos de"
        @update:model-value="(v) => navigate({ vista: v, filtro: '' })"
      />
    </div>
    <FilterChips
      class="py-2"
      :model-value="state.filtro"
      :chips="chips"
      deselectable
      label="Filtrar movimientos"
      @update:model-value="setFilter"
    />

    <div
      v-if="loading && !rows.length"
      role="status"
      aria-label="Cargando movimientos…"
      class="space-y-3 px-4 py-2"
    >
      <div
        v-for="n in 6"
        :key="n"
        class="h-14 animate-pulse rounded-6 bg-surface-gray-2"
      />
    </div>
    <EmptyState
      v-else-if="!rows.length && !loadError"
      class="py-10"
      :state="list && !list.readable ? 'denied' : 'empty'"
      :title="empty.title"
      :message="empty.message"
      :action="empty.action"
      @action="clearAll"
    />
    <div v-else data-bancos-movimientos>
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
          <li v-for="row in group.rows" :key="row.name">
            <MovimientoRow
              :row="row"
              :vista="list?.vista || state.vista"
              :currency="header?.currency"
              @open="openRow"
            />
          </li>
        </ul>
      </section>
      <div
        v-if="list?.next !== null && list?.next !== undefined"
        class="p-4 text-center"
      >
        <Button
          label="Ver movimientos anteriores"
          :loading="loading"
          class="min-h-11"
          @click="load(list.next)"
        />
      </div>
      <div class="h-24 flex-none lg:h-10" aria-hidden="true" />
    </div>

    <ConciliarSheet
      v-model:open="sheetOpen"
      :movement="current"
      @changed="onChanged"
    />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { useDebounceFn } from '@vueuse/core'
import { AppBar, EmptyState, FilterChips, Segmented } from '@/components/ui'
import { shellBoot } from '@/composables/muelleShell'
import MovimientoRow from './MovimientoRow.vue'
import {
  balanceWhen,
  bancosApi,
  cardContext,
  errorText,
  groupByDay,
  money,
  voucherRoute,
} from './bancos'

const ConciliarSheet = defineAsyncComponent(
  () => import('./ConciliarSheet.vue'),
)

const props = defineProps({
  cuenta: { type: String, required: true },
  pane: { type: Boolean, default: false },
})
const route = useRoute()
const router = useRouter()

const state = computed(() => ({
  vista: route.query.vista === 'libros' ? 'libros' : 'banco',
  filtro: String(route.query.filtro || ''),
  q: String(route.query.q || ''),
}))
const search = ref(state.value.q)
const searchOpen = ref(!!state.value.q)
const header = ref(null)
const list = ref(null)
const rows = ref([])
const loading = ref(false)
const loadError = ref('')
const sheetOpen = ref(false)
const current = ref(null)

const companyQuery = computed(() =>
  route.query.empresa ? { empresa: route.query.empresa } : {},
)
const backTo = computed(() => ({ name: 'Bancos', query: companyQuery.value }))
const context = computed(() => (header.value ? cardContext(header.value) : ''))
const vistas = [
  { value: 'banco', label: 'Banco' },
  { value: 'libros', label: 'Libros' },
]
const chips = computed(() => {
  const base = [
    { value: 'entradas', label: 'Entradas' },
    { value: 'salidas', label: 'Salidas' },
  ]
  if (header.value?.reconcilable && state.value.vista === 'banco')
    base.push({
      value: 'pendientes',
      label: 'Sin conciliar',
      count: header.value.pending || undefined,
    })
  return base
})
const groups = computed(() => groupByDay(rows.value))
const empty = computed(() => {
  if (list.value && !list.value.readable)
    return {
      title: 'No puedes ver estos movimientos',
      message: 'Pide a tu encargado acceso a los movimientos bancarios.',
    }
  if (state.value.filtro || state.value.q)
    return {
      title: 'Ningún movimiento coincide',
      message: 'Prueba otro importe o quita el filtro.',
      action: 'Ver todos los movimientos',
    }
  return {
    title: 'Sin movimientos todavía',
    message:
      state.value.vista === 'banco'
        ? 'Los movimientos del estado de cuenta aparecen aquí cuando se importan o se sincronizan.'
        : 'Los cobros, pagos y pólizas de esta cuenta aparecen aquí.',
  }
})

function navigate(next) {
  const query = { ...route.query, ...next }
  for (const key of Object.keys(query)) if (!query[key]) delete query[key]
  router.replace({ query })
}
function setFilter(value) {
  navigate({ filtro: value === state.value.filtro ? '' : value })
}
function clearAll() {
  search.value = ''
  navigate({ filtro: '', q: '' })
}

async function loadHeader() {
  try {
    const result = await bancosApi('cuenta', { cuenta: props.cuenta })
    header.value = result.header
  } catch (error) {
    loadError.value = errorText(error)
  }
}

let sequence = 0
async function load(start = 0) {
  const mine = ++sequence
  loading.value = true
  loadError.value = ''
  try {
    const result = await bancosApi('movimientos', {
      cuenta: props.cuenta,
      vista: state.value.vista,
      filtro: state.value.filtro,
      q: state.value.q,
      start,
    })
    if (mine !== sequence) return
    list.value = result
    rows.value = start ? [...rows.value, ...result.rows] : result.rows
  } catch (error) {
    if (mine === sequence) loadError.value = errorText(error)
  } finally {
    if (mine === sequence) loading.value = false
  }
}
function reload() {
  loadHeader()
  load()
}

async function openRow(row) {
  if ((list.value?.vista || state.value.vista) === 'banco') {
    current.value = row
    sheetOpen.value = true
    return
  }
  const to = await voucherRoute(row.voucher, shellBoot.value)
  if (to) router.push(to)
}
function onChanged(result) {
  // The row reads its new state at once; the hero and the list refresh behind it.
  const row = rows.value.find((r) => r.name === result?.name)
  if (row && result) Object.assign(row, result.row || {})
  loadHeader()
  load()
}

const pushSearch = useDebounceFn((q) => navigate({ q }), 300)
watch(search, (q) => pushSearch((q || '').trim()))
watch(
  () =>
    [props.cuenta, state.value.vista, state.value.filtro, state.value.q].join(
      '|',
    ),
  () => load(),
  { immediate: true },
)
watch(() => props.cuenta, loadHeader, { immediate: true })
// A movement named in the URL (?movimiento=) opens its sheet: Avisos, the bot's receipts.
watch(
  () => route.query.movimiento,
  (name) => {
    if (!name) return
    current.value = { name: String(name) }
    sheetOpen.value = true
  },
  { immediate: true },
)
</script>
