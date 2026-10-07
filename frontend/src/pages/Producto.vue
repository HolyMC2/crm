<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
      <nav class="mb-3">
        <button
          class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          @click="goBack"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{ backLabel }}
        </button>
      </nav>

      <section
        v-if="guard"
        role="alert"
        class="mx-auto max-w-xl space-y-4 py-6"
      >
        <h1 class="text-xl font-semibold">{{ guard.title }}</h1>
        <p class="text-base text-ink-gray-7">{{ guard.detail }}</p>
        <div class="flex flex-wrap gap-2">
          <Button :label="__('Retry', null, 'Productos')" @click="load" />
          <Button :label="__('Back to Productos')" @click="goBack" />
        </div>
      </section>

      <div v-else-if="loading && !data" role="status" class="py-10 text-sm">
        {{ __('Loading product…') }}
      </div>

      <template v-else-if="data">
        <header class="mb-4 flex flex-wrap items-start gap-3">
          <img
            v-if="product.image"
            :src="product.image"
            alt=""
            class="h-16 w-16 shrink-0 rounded-lg object-cover"
          />
          <div class="min-w-0 flex-1">
            <p class="text-sm text-ink-gray-6">
              {{ product.name }}
              <Badge
                v-if="product.disabled"
                class="ml-1"
                theme="gray"
                :label="__('Disabled', null, 'Productos')"
              />
            </p>
            <h1 class="truncate text-2xl font-semibold text-ink-gray-9">
              {{ product.item_name || product.name }}
            </h1>
            <p class="mt-1 text-sm text-ink-gray-6">
              {{
                [product.item_group, product.brand, product.stock_uom]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </p>
          </div>
        </header>

        <div class="mb-4 flex flex-wrap gap-2">
          <Button
            v-for="entry in orderedActions"
            :key="entry.key"
            :variant="entry.primary ? 'solid' : 'subtle'"
            :label="entry.label"
            :title="entry.reason || undefined"
            class="min-h-11 sm:min-h-8"
            @click="run(entry)"
          />
        </div>

        <div
          v-if="notice"
          role="status"
          class="mb-4 rounded-lg bg-surface-green-1 p-3 text-sm text-ink-green-8"
        >
          {{ notice.text }}
          <RouterLink v-if="notice.to" :to="notice.to" class="ml-1 underline">{{
            notice.link
          }}</RouterLink>
          <Button
            v-if="listBack"
            class="ml-2"
            :label="__('Back to the list')"
            @click="router.push(listBack)"
          />
        </div>
        <div
          v-if="problem"
          role="alert"
          class="mb-4 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          <Button
            class="ml-2"
            :label="__('Retry', null, 'Productos')"
            @click="load"
          />
        </div>

        <!-- Smart summary: each figure jumps to its section. -->
        <nav
          :aria-label="__('Product summary')"
          class="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5"
        >
          <a
            v-for="tile in tiles"
            :key="tile.id"
            :href="`#${tile.id}`"
            class="flex min-h-14 flex-col rounded-lg border border-outline-gray-2 px-3 py-2 hover:bg-surface-gray-1"
          >
            <span class="text-xs text-ink-gray-6">{{ tile.label }}</span>
            <span class="truncate text-base font-semibold tabular-nums">{{
              tile.value
            }}</span>
          </a>
        </nav>

        <section id="existencias" class="mb-8">
          <h2 class="mb-2 text-lg font-semibold">
            {{ __('Stock', null, 'Productos') }}
          </h2>
          <p v-if="!data.stock.readable" class="text-sm text-ink-gray-6">
            {{ __('You cannot see stock. Ask your manager for access.') }}
          </p>
          <p
            v-else-if="!data.stock.rows.length"
            class="text-sm text-ink-gray-6"
          >
            {{ __('No stock in your stores.') }}
          </p>
          <ul v-else class="divide-y divide-outline-gray-1">
            <li
              v-for="row in data.stock.rows"
              :key="row.warehouse"
              class="flex flex-wrap items-start gap-3 py-3"
            >
              <span class="min-w-0 flex-1">
                <span class="block font-medium">{{ row.label }}</span>
                <span class="block text-sm text-ink-gray-6">
                  {{
                    [
                      __('Reserved {0}', [qty(row.reserved_qty)]),
                      __('Projected {0}', [qty(row.projected_qty)]),
                      row.reorder_level !== null &&
                        __('Minimum {0}', [qty(row.reorder_level)]),
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  }}
                </span>
                <span
                  v-if="row.cajones.length"
                  class="block text-sm text-ink-gray-6"
                >
                  {{
                    __('Bins: {0}', [
                      row.cajones.map((c) => c.label || c.ubicacion).join(', '),
                    ])
                  }}
                </span>
                <span
                  v-for="pending in row.counts_pending"
                  :key="pending.task"
                  class="block text-sm text-ink-blue-7"
                  >{{ __('Count asked of {0}', [pending.assigned_to]) }}</span
                >
              </span>
              <Badge
                v-if="row.state === 'faltan'"
                theme="red"
                :label="__('Out of stock', null, 'Productos')"
              />
              <Badge
                v-else-if="row.state === 'bajo'"
                theme="orange"
                :label="__('Below minimum', null, 'Productos')"
              />
              <span class="text-right text-base font-semibold tabular-nums">
                {{ qty(row.actual_qty) }} {{ product.stock_uom }}
              </span>
            </li>
          </ul>
          <p v-if="data.stock.hidden" class="mt-2 text-sm text-ink-gray-6">
            {{
              __(
                '{0} more store(s) have this product but are outside your access.',
                [data.stock.hidden],
              )
            }}
          </p>
        </section>

        <section id="precios" class="mb-8">
          <h2 class="mb-2 text-lg font-semibold">
            {{ __('Prices', null, 'Productos') }}
          </h2>
          <p
            v-if="data.prices.setup"
            class="mb-2 rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-7"
          >
            {{ data.prices.setup.reason }}
          </p>
          <p v-if="!data.prices.readable" class="text-sm text-ink-gray-6">
            {{ __('You cannot see prices. Ask your manager for access.') }}
          </p>
          <p v-else-if="data.prices.reason" class="text-sm text-ink-gray-6">
            {{ plain(data.prices.reason) }}
          </p>
          <ul v-else class="divide-y divide-outline-gray-1">
            <li
              v-for="row in data.prices.rows"
              :key="row.price_list"
              class="flex flex-wrap items-start gap-3 py-3"
            >
              <span class="min-w-0 flex-1">
                <span class="block font-medium">{{ row.price_list }}</span>
                <span
                  v-if="row.blocked_reason && row.rate !== null"
                  class="block text-sm text-ink-gray-6"
                  >{{ plain(row.blocked_reason) }}</span
                >
                <span
                  v-for="next in row.scheduled || []"
                  :key="next.name"
                  class="block text-sm text-ink-gray-6"
                  >{{
                    __('From {0}: {1}', [
                      next.valid_from,
                      money(next.rate, row.currency),
                    ])
                  }}</span
                >
              </span>
              <span class="text-right text-base font-semibold tabular-nums">
                {{
                  row.rate === null || row.rate === undefined
                    ? __('No price', null, 'Productos')
                    : `${money(row.rate, row.currency)} / ${row.uom || row.stock_uom}`
                }}
              </span>
            </li>
          </ul>
        </section>

        <section id="movimientos" class="mb-8">
          <h2 class="mb-2 text-lg font-semibold">
            {{ __('Movements', null, 'Productos') }}
          </h2>
          <p v-if="!data.ledger.rows.length" class="text-sm text-ink-gray-6">
            {{
              data.ledger.readable
                ? __('No movements in your stores yet.')
                : __('You cannot see stock movements.')
            }}
          </p>
          <ul v-else class="divide-y divide-outline-gray-1">
            <li
              v-for="(row, index) in data.ledger.rows"
              :key="index"
              class="flex flex-wrap items-start gap-3 py-2 text-sm"
            >
              <span class="min-w-0 flex-1">
                <span class="block"
                  >{{ row.voucher_type }} {{ row.voucher_no }}</span
                >
                <span class="block text-ink-gray-6"
                  >{{ row.posting_date }} · {{ row.warehouse }}</span
                >
              </span>
              <span
                class="tabular-nums"
                :class="
                  row.actual_qty < 0 ? 'text-ink-red-7' : 'text-ink-green-7'
                "
                >{{ row.actual_qty > 0 ? '+' : ''
                }}{{ qty(row.actual_qty) }}</span
              >
              <span class="w-20 text-right tabular-nums text-ink-gray-6">{{
                __('= {0}', [qty(row.qty_after_transaction)])
              }}</span>
            </li>
          </ul>
        </section>

        <section id="compras" class="mb-8">
          <h2 class="mb-2 text-lg font-semibold">
            {{ __('Open purchases') }}
          </h2>
          <p v-if="!data.purchases.rows.length" class="text-sm text-ink-gray-6">
            {{
              data.purchases.readable
                ? __('No open purchases of this product.')
                : __('You cannot see purchases.')
            }}
          </p>
          <ul v-else class="divide-y divide-outline-gray-1">
            <li v-for="row in data.purchases.rows" :key="row.name">
              <RouterLink
                :to="purchaseRecord(row)"
                class="flex min-h-11 flex-wrap items-start gap-3 py-2 text-sm hover:bg-surface-gray-1"
              >
                <span class="min-w-0 flex-1">
                  <span class="block font-medium">{{
                    row.supplier_name ||
                    (row.doctype === 'Material Request'
                      ? __('Purchase request', null, 'Productos')
                      : row.name)
                  }}</span>
                  <span class="block text-ink-gray-6"
                    >{{ row.name }} ·
                    {{
                      row.schedule_date
                        ? __('Delivery {0}', [row.schedule_date])
                        : row.status
                    }}</span
                  >
                </span>
                <span
                  v-if="row.per_received !== undefined"
                  class="tabular-nums text-ink-gray-6"
                  >{{ __('{0}% received', [qty(row.per_received)]) }}</span
                >
              </RouterLink>
            </li>
          </ul>
        </section>

        <section id="ventas" class="mb-8">
          <h2 class="mb-2 text-lg font-semibold">
            {{ __('Recent sales') }}
          </h2>
          <p v-if="!data.sales.rows.length" class="text-sm text-ink-gray-6">
            {{
              data.sales.readable
                ? __('No sales of this product yet.')
                : __('You cannot see sales invoices.')
            }}
          </p>
          <ul v-else class="divide-y divide-outline-gray-1">
            <li
              v-for="row in data.sales.rows"
              :key="row.name"
              class="flex flex-wrap items-start gap-3 py-2 text-sm"
            >
              <span class="min-w-0 flex-1">
                <span class="block font-medium">{{
                  row.customer_name || row.name
                }}</span>
                <span class="block text-ink-gray-6"
                  >{{ row.name }} · {{ row.posting_date
                  }}<template v-if="row.is_return">
                    · {{ __('Return', null, 'Productos') }}</template
                  ></span
                >
              </span>
              <span class="tabular-nums">{{
                money(row.grand_total, row.currency)
              }}</span>
            </li>
          </ul>
        </section>
      </template>
    </div>

    <PriceDialog
      v-if="data"
      v-model="priceOpen"
      :item="product.name"
      :rows="data.prices.rows"
      :focus="focusList"
      @saved="priceSaved"
      @refresh="load"
      @request="(proposal) => askPrice(proposal)"
    />
    <EditDialog
      v-if="data"
      v-model="editOpen"
      :item="product"
      @saved="edited"
      @refresh="load"
      @request="ask('data')"
    />
    <RequestDialog
      v-if="data"
      v-model="request.open"
      :item="product.name"
      :kind="request.kind"
      :reason="request.reason"
      :price-list="request.priceList"
      :proposed-rate="request.proposed"
      @sent="requested"
    />
    <CountDialog
      v-if="data"
      v-model="countOpen"
      :item="product.name"
      :stores="data.stock.rows"
      :store="countStore"
      @sent="counted"
    />
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FeatherIcon, toast } from 'frappe-ui'
import PriceDialog from '@/components/productos/PriceDialog.vue'
import EditDialog from '@/components/productos/EditDialog.vue'
import RequestDialog from '@/components/productos/RequestDialog.vue'
import CountDialog from '@/components/productos/CountDialog.vue'
import {
  backTarget,
  loadProductosBoot,
  money,
  notifyPriceOpener,
  parseDone,
  plain,
  problemOf,
  productosApi,
  productosBoot,
  purchaseRoute,
  qty,
  requestedAction,
  scannerItemUrl,
} from '@/composables/useProductos'

const props = defineProps({ item: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const boot = productosBoot
const data = ref(null)
const loading = ref(false)
const problem = ref(null)
const guard = ref(null)
const notice = ref(null)
const priceOpen = ref(false)
const editOpen = ref(false)
const countOpen = ref(false)
const countStore = ref('')
const focusList = ref('')
const request = reactive({
  open: false,
  kind: 'data',
  reason: '',
  priceList: '',
  proposed: '',
})

const product = computed(() => data.value?.item || {})
const back = computed(() => backTarget(route.query))
const backLabel = computed(() =>
  back.value.href
    ? __('Back to {0}', [
        String(route.query.return_label || 'Inventario').slice(0, 40),
      ])
    : __('Productos', null, 'Productos'),
)
// Opened from «Sin precio» or «Precio por revisar»: after the price, the list.
const listBack = computed(() => {
  const list = typeof route.query.list === 'string' ? route.query.list : ''
  return notice.value?.priced &&
    /^\/productos\?(?:.*&)?vista=(sin-precio|precio-revisar)/.test(list)
    ? list
    : ''
})
const orderedActions = computed(() =>
  [...(data.value?.actions || [])].sort(
    (a, b) => Number(b.primary) - Number(a.primary),
  ),
)
const tiles = computed(() => {
  const d = data.value
  if (!d) return []
  const price = d.prices.rows.find(
    (row) => row.price_list === d.prices.default_price_list,
  )
  return [
    {
      id: 'existencias',
      label: __('On hand', null, 'Productos'),
      value: d.stock.readable
        ? `${qty(d.stock.total)} ${product.value.stock_uom || ''}`
        : '—',
    },
    {
      id: 'precios',
      label: price?.price_list || __('Price', null, 'Productos'),
      value:
        price && price.rate !== null && price.rate !== undefined
          ? money(price.rate, price.currency)
          : __('No price', null, 'Productos'),
    },
    {
      id: 'movimientos',
      label: __('Movements', null, 'Productos'),
      value: String(d.ledger.rows.length),
    },
    {
      id: 'compras',
      label: __('Open purchases'),
      value: String(d.purchases.rows.length),
    },
    {
      id: 'ventas',
      label: __('Recent sales'),
      value: String(d.sales.rows.length),
    },
  ]
})

async function load() {
  loading.value = true
  problem.value = null
  try {
    data.value = await productosApi('record', { item: props.item })
    guard.value = null
  } catch (error) {
    const p = problemOf(error)
    if (!data.value)
      guard.value = {
        title:
          p.kind === 'permission'
            ? __('You cannot open this product')
            : __('We could not open this product'),
        detail: p.detail,
      }
    else problem.value = p
  } finally {
    loading.value = false
  }
}

function action(key) {
  return (data.value?.actions || []).find((a) => a.key === key)
}
function run(entry) {
  if (!entry.enabled && entry.resolve?.kind === 'request')
    return ask(entry.resolve.request, entry.reason)
  if (!entry.enabled) {
    problem.value = {
      kind: 'permission',
      title: __('Not available'),
      detail: entry.reason || '',
    }
    return
  }
  if (entry.key === 'price') {
    focusList.value = ''
    priceOpen.value = true
  } else if (entry.key === 'edit') editOpen.value = true
  else if (entry.key === 'purchase')
    router.push(
      purchaseRoute(product.value.name, {
        warehouse: entry.warehouse,
        qty: entry.qty,
      }),
    )
  else if (entry.key === 'count') {
    countStore.value = ''
    countOpen.value = true
  } else if (entry.key === 'scanner')
    window.location.assign(scannerItemUrl(product.value.name))
}
function ask(kind, reason = '', proposal = {}) {
  const fallback = action(kind === 'data' ? 'edit' : 'price')
  Object.assign(request, {
    open: true,
    kind,
    reason: reason || fallback?.reason || '',
    priceList:
      proposal.price_list ||
      (kind === 'price' ? data.value?.prices?.default_price_list || '' : ''),
    proposed: proposal.proposed_rate || '',
  })
}
function askPrice(proposal) {
  priceOpen.value = false
  ask('price', action('price')?.reason, proposal)
}

async function priceSaved(result) {
  toast.success(__('Price saved'))
  notice.value = {
    priced: true,
    text: __('New price saved in {0}.', [result.price_lists.join(', ')]),
  }
  notifyPriceOpener(route.query, boot.value?.user, product.value.name)
  await load()
}
async function edited() {
  toast.success(__('Product saved'))
  await load()
}
function requested(result) {
  notice.value = {
    text: __('Asked of {0}.', [result.assigned.join(', ')]),
  }
}
async function counted(result) {
  notice.value = {
    text: __('Count asked of {0}. The stock changes after the review.', [
      result.assigned_to_name,
    ]),
  }
  await load()
}
function purchaseRecord(row) {
  return row.doctype === 'Material Request'
    ? { name: 'CompraSolicitud', params: { name: row.name } }
    : { name: 'CompraOrden', params: { name: row.name } }
}

function goBack() {
  if (back.value.href) return window.location.assign(back.value.href)
  router.push(back.value.to)
}

/** Arrived with `accion=` (a link from Desk, Mercado or a refusal): open it. */
function openRequested() {
  const wanted = requestedAction(route.query)
  if (!wanted || !data.value) return
  const key = { precio: 'price', editar: 'edit', conteo: 'count' }[wanted]
  const entry = action(key)
  if (entry) {
    if (key === 'price')
      focusList.value =
        typeof route.query.lista === 'string' ? route.query.lista : ''
    if (entry.enabled && key === 'price') priceOpen.value = true
    else if (!entry.enabled && entry.resolve?.request === 'price')
      ask('price', entry.reason, { price_list: focusList.value })
    else run(entry)
  }
  const query = { ...route.query }
  delete query.accion
  router.replace({ query })
}
function handleDone() {
  const done = parseDone(route.query.done)
  if (!done) return
  notice.value = {
    text:
      done.doctype === 'Purchase Order'
        ? __('Purchase {0} saved.', [done.name])
        : __('{0} saved.', [done.name]),
    to:
      done.doctype === 'Purchase Order'
        ? { name: 'CompraOrden', params: { name: done.name } }
        : { name: 'CompraSolicitud', params: { name: done.name } },
    link: __('Open in Compras'),
  }
  const query = { ...route.query }
  delete query.done
  router.replace({ query })
}

watch(
  () => props.item,
  async () => {
    data.value = null
    notice.value = null
    await load()
  },
)
onMounted(async () => {
  await loadProductosBoot()
  if (!boot.value?.enabled) {
    guard.value = {
      title: __('Productos is not available'),
      detail:
        boot.value?.reason ||
        __('Ask your manager for permission to read items, then retry.'),
    }
    return
  }
  handleDone()
  await load()
  openRequested()
})
</script>
