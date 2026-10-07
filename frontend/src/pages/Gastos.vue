<template>
  <ModuleLayout
    title="Gastos"
    :entries="entries"
    :active-key="po ? '' : segment"
    @select="selectSegment"
  >
    <section
      v-if="guard"
      role="alert"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
    >
      <h1 class="text-xl font-semibold">
        {{ __('Gastos is not available') }}
      </h1>
      <p class="text-base text-ink-gray-7">{{ guard }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="__('Retry permissions')" @click="retryBoot" />
        <Button :label="__('Copy access request')" @click="copyRequest" />
        <Button :label="__('Back', null, 'Gastos')" @click="router.back()" />
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
            {{ po ? __('Bills of order {0}', [po]) : segmentLabel(segment) }}
          </h1>
          <p class="text-sm text-ink-gray-6">{{ subtitle }}</p>
        </div>
      </header>
      <div
        v-if="po"
        class="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-gray-2 p-3 text-sm sm:mx-6"
      >
        <span class="min-w-0 flex-1">{{
          __('Showing only the bills of this purchase order.')
        }}</span>
        <RouterLink
          class="min-h-11 py-2 text-ink-blue-link underline"
          :to="{ name: 'CompraOrden', params: { name: po } }"
          >{{ __('Back to the order') }}</RouterLink
        >
        <Button :label="__('See all bills')" @click="clearOrder" />
      </div>
      <div class="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
        <FormControl
          v-if="!po"
          class="w-full sm:hidden"
          type="select"
          :aria-label="__('List', null, 'Gastos')"
          :model-value="segment"
          :options="entries.map((e) => ({ label: e.label, value: e.value }))"
          @update:model-value="selectSegment"
        />
        <div
          v-if="segment === 'por-pagar' && !po"
          role="group"
          :aria-label="__('Filter by due date')"
          class="flex flex-wrap gap-1"
        >
          <Button
            v-for="c in CHIPS"
            :key="c.value"
            class="min-h-11 sm:min-h-8"
            :variant="chip === c.value ? 'solid' : 'subtle'"
            :aria-pressed="chip === c.value"
            :label="chipLabel(c)"
            @click="update({ chip: c.value })"
          />
        </div>
        <FormControl
          v-model="search"
          class="min-w-0 flex-1 sm:max-w-xs"
          type="search"
          :placeholder="__('Search supplier, bill or invoice number')"
          :aria-label="__('Search supplier, bill or invoice number')"
        />
        <Button
          v-if="segment === 'por-registrar' && !po"
          icon-left="upload"
          class="min-h-11 sm:min-h-8"
          :label="__('Upload supplier CFDI (XML)')"
          @click="openCfdiImport"
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
          :label="__('Retry', null, 'Gastos')"
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
          {{ __('Loading bills…') }}
        </div>
        <div
          v-else-if="!rows.length"
          class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
        >
          <p class="text-lg font-semibold">{{ emptyTitle }}</p>
          <p class="mt-1 text-sm">{{ emptyBody }}</p>
          <a
            v-if="po && boot?.capabilities?.desk"
            class="mt-4 inline-block min-h-11 py-2 text-ink-blue-link underline"
            :href="`/app/purchase-order/${encodeURIComponent(po)}`"
            >{{ __('Open the full order form to bill it') }}</a
          >
        </div>
        <ul v-else class="divide-y divide-outline-gray-1">
          <li v-for="row in rows" :key="row.name">
            <RouterLink
              :to="{
                name: 'GastoFactura',
                params: { name: row.name },
                query: { list: listPath },
              }"
              class="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:px-6"
            >
              <FeatherIcon
                :name="
                  Number(row.docstatus) === 0 ? 'file-text' : 'credit-card'
                "
                class="mt-0.5 h-4 w-4 shrink-0 text-ink-gray-5"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-ink-gray-9">
                  {{ row.party || __('Supplier not visible') }}
                </span>
                <span class="block truncate text-sm text-ink-gray-6">
                  {{
                    [row.bill_no || row.name, statusLabel(row)]
                      .filter(Boolean)
                      .join(' · ')
                  }}
                </span>
                <span
                  v-if="Number(row.docstatus) === 1"
                  class="mt-0.5 block text-sm"
                  :class="row.overdue ? 'text-ink-red-7' : 'text-ink-gray-8'"
                  >{{
                    [dueLabel(row.due_date, boot?.today), paidLabel(row)]
                      .filter(Boolean)
                      .join(' · ')
                  }}</span
                >
              </span>
              <span
                class="shrink-0 text-right text-sm font-medium tabular-nums text-ink-gray-9"
                >{{
                  money(
                    Number(row.docstatus) === 1
                      ? row.outstanding_amount
                      : row.total,
                    row.currency,
                  )
                }}</span
              >
            </RouterLink>
          </li>
        </ul>
        <div v-if="hasMore" class="px-4 py-4 sm:px-6">
          <Button
            :label="__('Load more', null, 'Gastos')"
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
import { Button, FeatherIcon, FormControl } from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import {
  CHIPS,
  CTX,
  SEGMENTS,
  dueLabel,
  gastosApi,
  gastosBoot,
  loadGastosBoot,
  money,
  normalizeChip,
  normalizeSegment,
  paidLabel,
  problemOf,
  segmentLabel,
  statusLabel,
} from '@/composables/useGastos'

const route = useRoute()
const router = useRouter()
const boot = gastosBoot
const rows = ref([])
const counts = ref(null)
const hasMore = ref(false)
const loading = ref(false)
const problem = ref(null)
const copied = ref('')
const scroller = ref(null)
const segment = computed(() => normalizeSegment(route.query.segment))
const chip = computed(() => normalizeChip(segment.value, route.query.chip))
const po = computed(() =>
  typeof route.query.po === 'string' ? route.query.po : '',
)
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const listPath = computed(() => route.fullPath)
let ticket = 0
let searchTimer = 0

const capped = (n) => (counts.value?.capped && n >= 500 ? '500+' : String(n))
const entries = computed(() =>
  SEGMENTS.map((s) => ({
    ...s,
    label:
      counts.value && counts.value[s.value] !== undefined
        ? `${segmentLabel(s.value)} · ${capped(counts.value[s.value])}`
        : segmentLabel(s.value),
  })),
)
function chipLabel(c) {
  const label = __(c.label, null, CTX)
  if (c.value === 'vencidas' && counts.value?.vencidas)
    return `${label} · ${capped(counts.value.vencidas)}`
  return label
}
const guard = computed(() =>
  boot.value && !boot.value.enabled
    ? boot.value.reason ||
      __('Ask your manager for permission to read supplier bills.')
    : '',
)
const subtitle = computed(() => {
  if (po.value) return __('Draft and registered bills linked to this order.')
  if (segment.value === 'por-registrar')
    return __('Draft bills to review and register before paying them.')
  const totals = (counts.value?.totals || [])
    .map((t) => money(t.amount, t.currency))
    .join(' + ')
  return totals
    ? __('Registered bills with a balance, soonest due first. Owed: {0}', [
        totals,
      ])
    : __('Registered bills with a balance, soonest due first.')
})
const emptyTitle = computed(() =>
  search.value
    ? __('No bills match')
    : po.value
      ? __('This order has no bill yet')
      : __('Nothing here', null, CTX),
)
const emptyBody = computed(() => {
  if (search.value) return __('Try another supplier or bill number.')
  if (po.value)
    return __(
      'When the supplier bill for this order is registered it appears here.',
    )
  if (segment.value === 'por-registrar')
    return __(
      'Draft bills from a supplier CFDI or a purchase order wait here until someone registers them.',
    )
  return chip.value
    ? __('No bills in this filter. Try All.')
    : __('Every registered bill is paid.')
})

async function load(more = false) {
  const mine = ++ticket
  loading.value = true
  problem.value = null
  try {
    const page = await gastosApi('queue', {
      segment: segment.value,
      chip: chip.value,
      purchase_order: po.value,
      search: search.value.trim(),
      start: more ? rows.value.length : 0,
      page_length: 30,
    })
    if (mine !== ticket) return
    rows.value = more ? [...rows.value, ...page.rows] : page.rows
    counts.value = page.counts
    hasMore.value = page.has_more
    if (!more) restoreScroll()
  } catch (error) {
    if (mine === ticket) problem.value = problemOf(error)
  } finally {
    if (mine === ticket) loading.value = false
  }
}

function update(query) {
  const next = { ...route.query, ...query }
  for (const key of Object.keys(next)) if (!next[key]) delete next[key]
  router.replace({ query: next })
}
function selectSegment(value) {
  update({ segment: normalizeSegment(value), chip: '', po: '' })
}
function clearOrder() {
  update({ po: '' })
}

// The supplier CFDI importer lives in the Inventario workspace for now; it
// reads the queue to open from this tab's session state.
function openCfdiImport() {
  try {
    const key = `muelle-workspaces:${boot.value?.user}:inventario`
    const saved = JSON.parse(sessionStorage.getItem(key) || '{}') || {}
    sessionStorage.setItem(
      key,
      JSON.stringify({
        ...saved,
        queue: 'supplier_invoices',
        start: 0,
        search: '',
      }),
    )
  } catch {
    /* the workspace still opens; the worker picks the list */
  }
  window.location.assign('/app/muelle-inventario')
}

const scrollKey = () => `muelle:gastos:scroll:${route.fullPath}`
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
  await loadGastosBoot({ refresh: true })
  if (boot.value?.enabled) load()
}
async function copyRequest() {
  const text = __(
    'I need access to Gastos: read permission for Purchase Invoice so I can follow supplier bills and payments.',
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
  () => [route.query.segment, route.query.chip, route.query.po, route.query.q],
  () => {
    if (route.name === 'Gastos' && boot.value?.enabled) load()
  },
)
onMounted(async () => {
  await loadGastosBoot()
  if (boot.value?.enabled) load()
})
</script>
