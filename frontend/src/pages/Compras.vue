<template>
  <ModuleLayout
    title="Compras"
    :entries="entries"
    :active-key="segment"
    @select="selectSegment"
  >
    <section
      v-if="guard"
      role="alert"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
    >
      <h1 class="text-xl font-semibold">
        {{ __('Compras is not available') }}
      </h1>
      <p class="text-base text-ink-gray-7">{{ guard }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="__('Retry permissions')" @click="retryBoot" />
        <Button :label="__('Copy access request')" @click="copyRequest" />
        <Button :label="__('Back', null, 'Compras')" @click="router.back()" />
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
            {{ segmentLabel(segment) }}
          </h1>
          <p class="text-sm text-ink-gray-6">{{ subtitle }}</p>
        </div>
        <Button
          v-if="boot?.capabilities?.create"
          variant="solid"
          icon-left="plus"
          :label="__('New purchase')"
          class="min-h-11 sm:min-h-8"
          @click="newPurchase"
        />
      </header>
      <div class="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
        <FormControl
          class="w-full sm:hidden"
          type="select"
          :aria-label="__('List', null, 'Compras')"
          :model-value="segment"
          :options="entries.map((e) => ({ label: e.label, value: e.value }))"
          @update:model-value="selectSegment"
        />
        <FormControl
          v-model="search"
          class="min-w-0 flex-1 sm:max-w-xs"
          type="search"
          :placeholder="__('Search supplier or document')"
          :aria-label="__('Search supplier or document')"
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
          :label="__('Retry', null, 'Compras')"
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
          {{ __('Loading purchases…') }}
        </div>
        <div
          v-else-if="!rows.length"
          class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
        >
          <p class="text-lg font-semibold">{{ emptyTitle }}</p>
          <p class="mt-1 text-sm">{{ emptyBody }}</p>
          <Button
            v-if="segment === 'por-comprar' && boot?.capabilities?.create"
            class="mt-4"
            :label="__('New purchase')"
            @click="newPurchase"
          />
        </div>
        <ul v-else class="divide-y divide-outline-gray-1">
          <li v-for="row in rows" :key="`${row.doctype}:${row.name}`">
            <RouterLink
              :to="{ ...recordRoute(row), query: { list: listPath } }"
              class="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:px-6"
            >
              <FeatherIcon
                :name="row.kind === 'solicitud' ? 'clipboard' : 'shopping-cart'"
                class="mt-0.5 h-4 w-4 shrink-0 text-ink-gray-5"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-ink-gray-9">
                  {{
                    row.party ||
                    (row.kind === 'solicitud'
                      ? __('Purchase request', null, 'Compras')
                      : __('Supplier not visible'))
                  }}
                </span>
                <span class="block truncate text-sm text-ink-gray-6">
                  {{ row.name }} · {{ statusLabel(row) }}
                  <template v-if="row.due_date">
                    · {{ __('Delivery {0}', [row.due_date]) }}</template
                  >
                </span>
                <span
                  v-if="row.kind === 'orden' && Number(row.docstatus) === 1"
                  class="mt-0.5 block text-sm text-ink-gray-8"
                  >{{ progressLabel(row) }}</span
                >
                <span class="mt-1 flex flex-wrap gap-1">
                  <Badge
                    v-if="row.in_receipt"
                    theme="orange"
                    :label="__('Receipt in progress')"
                  />
                  <Badge
                    v-if="
                      segment === 'historial' &&
                      Number(row.docstatus) === 1 &&
                      Number(row.per_billed || 0) < 100
                    "
                    theme="gray"
                    :label="__('Billing pending (Finanzas)')"
                  />
                </span>
              </span>
              <span
                v-if="row.grand_total !== undefined && row.grand_total !== null"
                class="shrink-0 text-right text-sm font-medium tabular-nums text-ink-gray-9"
                >{{ money(row.grand_total, row.currency) }}</span
              >
            </RouterLink>
          </li>
        </ul>
        <div v-if="hasMore" class="px-4 py-4 sm:px-6">
          <Button
            :label="__('Load more', null, 'Compras')"
            :loading="loading"
            class="min-h-11 w-full sm:w-auto"
            @click="load(true)"
          />
        </div>
        <nav
          v-if="segment === 'historial'"
          :aria-label="__('Other purchase documents')"
          class="flex flex-col gap-1 px-4 pt-4 text-sm sm:px-6"
        >
          <a
            class="min-h-11 py-2 text-ink-blue-link underline"
            href="/app/muelle-compras?queue=receipts"
            >{{ __('Receipts, invoices and quotations (Desk)') }}</a
          >
          <a
            class="min-h-11 py-2 text-ink-blue-link underline"
            href="/app/muelle-compras?catalog_section=catalogs"
            >{{ __('Supplier catalogs (Desk)') }}</a
          >
        </nav>
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
  SEGMENTS,
  comprasApi,
  comprasBoot,
  loadComprasBoot,
  money,
  normalizeSegment,
  problemOf,
  progressLabel,
  recordRoute,
  segmentLabel,
  statusLabel,
} from '@/composables/useCompras'

const route = useRoute()
const router = useRouter()
const boot = comprasBoot
const rows = ref([])
const hasMore = ref(false)
const loading = ref(false)
const problem = ref(null)
const copied = ref('')
const scroller = ref(null)
const segment = computed(() => normalizeSegment(route.query.segment))
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const listPath = computed(() => route.fullPath)
let ticket = 0
let searchTimer = 0

const entries = computed(() =>
  SEGMENTS.map((s) => ({ ...s, label: segmentLabel(s.value) })),
)
const guard = computed(() =>
  boot.value && !boot.value.enabled
    ? boot.value.reason ||
      __('Ask your manager for access to purchase orders or purchase requests.')
    : '',
)
const subtitle = computed(
  () =>
    ({
      'por-comprar': __('Drafts to confirm and requests waiting for an order.'),
      'por-recibir': __('Confirmed orders with goods still to arrive.'),
      historial: __('Fully received, closed or cancelled orders.'),
    })[segment.value],
)
const emptyTitle = computed(() =>
  search.value ? __('No purchases match') : __('Nothing here'),
)
const emptyBody = computed(() =>
  search.value
    ? __('Try another supplier or document number.')
    : segment.value === 'por-recibir'
      ? __('When you confirm a purchase it waits here until it arrives.')
      : segment.value === 'por-comprar'
        ? __('Start a purchase or wait for a purchase request.')
        : __('Received and closed purchases appear here.'),
)

async function load(more = false) {
  const mine = ++ticket
  loading.value = true
  problem.value = null
  try {
    const page = await comprasApi('queue', {
      segment: segment.value,
      search: search.value.trim(),
      start: more ? rows.value.length : 0,
      page_length: 30,
    })
    if (mine !== ticket) return
    rows.value = more ? [...rows.value, ...page.rows] : page.rows
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
  update({ segment: normalizeSegment(value) })
}
function newPurchase() {
  router.push({ name: 'CompraNueva', query: { list: route.fullPath } })
}

const scrollKey = () => `muelle:compras:scroll:${route.fullPath}`
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
  await loadComprasBoot({ refresh: true })
  if (boot.value?.enabled) load()
}
async function copyRequest() {
  const text = __(
    'I need access to Compras: read permission for Purchase Order or Material Request so I can follow purchases.',
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
  () => [route.query.segment, route.query.q],
  () => {
    if (route.name === 'Compras' && boot.value?.enabled) load()
  },
)
onMounted(async () => {
  await loadComprasBoot()
  if (boot.value?.enabled) load()
})
</script>
