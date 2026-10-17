<template>
  <ModuleLayout
    title="Compras"
    :entries="entries"
    :active-key="state.segment"
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
    <!-- relative: the phone's «Nueva compra» FAB sits at its bottom end. -->
    <div v-else class="relative flex min-h-0 flex-1 flex-col">
      <div
        :ref="(el) => (list.scroller.value = el)"
        class="flex min-h-0 flex-1 flex-col overflow-y-auto"
        data-compras-scroller
        @scroll.passive="list.rememberScroll"
      >
        <PowerAppBar
          v-if="list.phone.value"
          v-model:search="list.search.value"
          v-model:search-open="list.searchOpen.value"
          :title="segmentLabel(state.segment)"
          :count="countLabel(state.segment)"
          :loading="list.loading.value && rows.length > 0"
          :entries="phoneEntries"
          :active="state.segment"
          :search-label="__('Search supplier or document')"
          :selectable="rows.length > 0 && state.segment === 'por-comprar'"
          :select-label="__('Select purchases')"
          :selecting="list.selecting.value"
          :selected-count="list.selected.value.size"
          @select="selectSegment"
          @start-select="list.selecting.value = true"
          @select-all="list.selectAll"
          @clear-selection="list.clearSelection"
        >
          <template #actions>
            <CapturarDocumentoButton
              variant="appbar"
              :targets="['Purchase Order', 'Purchase Invoice']"
              return-label="Compras"
            />
          </template>
          <template v-if="counts" #summary>
            <span
              >{{ __('To receive', null, CTX) }}
              <strong class="tabular-nums">{{
                countLabel('por-recibir')
              }}</strong></span
            >
            <span
              >{{ __('To bill', null, CTX) }}
              <strong class="tabular-nums">{{
                countLabel('por-facturar')
              }}</strong></span
            >
          </template>
        </PowerAppBar>
        <header
          v-else
          class="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-6"
        >
          <div class="min-w-0 flex-1">
            <h1 class="truncate text-xl font-semibold text-ink-gray-9">
              {{ segmentLabel(state.segment) }}
            </h1>
            <p class="text-sm text-ink-gray-6">{{ subtitle }}</p>
          </div>
          <button
            type="button"
            class="text-sm text-ink-gray-6 hover:text-ink-gray-8"
            :aria-keyshortcuts="'Alt+H'"
            @click="openShortcutSheet()"
          >
            <kbd
              class="rounded border border-outline-gray-2 px-1.5 py-0.5 text-xs"
              >?</kbd
            >
            {{ __('Keyboard shortcuts') }}
          </button>
          <CapturarDocumentoButton
            :targets="['Purchase Order', 'Purchase Invoice']"
            return-label="Compras"
          />
          <Button
            v-if="boot?.capabilities?.create"
            variant="solid"
            icon-left="plus"
            :label="__('New purchase')"
            class="min-h-11 sm:min-h-8"
            @click="newPurchase"
          />
        </header>
        <div
          v-if="!list.phone.value"
          class="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6"
        >
          <FormControl
            v-model="list.search.value"
            class="min-w-0 flex-1 sm:max-w-xs"
            type="search"
            :placeholder="__('Search supplier or document')"
            :aria-label="__('Search supplier or document')"
            :aria-keyshortcuts="'/'"
            data-power-search
          />
        </div>
        <div
          v-if="notice"
          role="status"
          class="mx-4 my-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-green-1 p-3 text-sm text-ink-green-8 sm:mx-6"
        >
          <span class="min-w-0 flex-1">{{ notice.text }}</span>
          <RouterLink
            v-if="notice.to"
            class="min-h-11 py-2 text-ink-blue-link underline sm:min-h-0 sm:py-0"
            :to="notice.to"
            >{{ notice.label }}</RouterLink
          >
        </div>
        <div
          v-if="problem"
          role="alert"
          class="mx-4 mb-3 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          <Button
            v-if="problem.row"
            class="ml-2"
            :label="__('Open purchase')"
            @click="list.openRow(problem.row)"
          />
          <Button
            class="ml-2"
            :label="__('Retry', null, 'Compras')"
            @click="retry"
          />
        </div>
        <div class="flex-1 pb-6">
          <div
            v-if="list.loading.value && !rows.length"
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
              v-if="
                state.segment === 'por-comprar' && boot?.capabilities?.create
              "
              class="mt-4"
              :label="__('New purchase')"
              @click="newPurchase"
            />
          </div>
          <ul
            v-else
            :ref="(el) => (list.listbox.value = el)"
            tabindex="0"
            class="divide-y divide-outline-gray-1 focus:outline-none"
            role="listbox"
            :aria-label="segmentLabel(state.segment)"
            :aria-multiselectable="true"
            :aria-activedescendant="
              list.focusKey.value ? list.domId(list.focusKey.value) : undefined
            "
          >
            <li
              v-for="row in rows"
              :id="list.domId(rowKey(row))"
              :key="rowKey(row)"
              role="option"
              :aria-selected="list.selected.value.has(rowKey(row))"
              :data-row-key="rowKey(row)"
              class="group relative"
              :class="[
                list.focusKey.value === rowKey(row) ? 'bg-surface-gray-2' : '',
                list.selected.value.has(rowKey(row)) ? 'bg-surface-blue-1' : '',
              ]"
            >
              <div class="flex items-start">
                <label
                  v-if="
                    state.segment === 'por-comprar' &&
                    (!list.phone.value || list.selecting.value)
                  "
                  class="flex min-h-14 shrink-0 cursor-pointer items-center pl-5"
                  :aria-label="__('Select {0}', [row.name])"
                >
                  <input
                    type="checkbox"
                    class="h-5 w-5 rounded"
                    :checked="list.selected.value.has(rowKey(row))"
                    @change="list.toggleRow(row)"
                  />
                </label>
                <a
                  :href="recordHref(row)"
                  class="flex min-h-14 min-w-0 flex-1 items-start gap-3 px-4 py-3 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:px-6"
                  :class="
                    state.segment === 'por-comprar' &&
                    (!list.phone.value || list.selecting.value)
                      ? 'pl-2 sm:pl-2'
                      : ''
                  "
                  @click="list.onRowClick($event, row)"
                >
                  <FeatherIcon
                    :name="
                      row.kind === 'solicitud' ? 'clipboard' : 'shopping-cart'
                    "
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
                    <!-- The delivery date never gets cut off: its own line on
                       a phone, and on a wide row the number truncates first. -->
                    <span
                      class="flex flex-col text-sm text-ink-gray-6 sm:flex-row"
                    >
                      <span class="min-w-0 truncate">{{
                        statusLabel(row)
                      }}</span>
                      <span
                        v-if="row.due_date"
                        class="shrink-0 whitespace-nowrap"
                        ><span class="hidden sm:inline" aria-hidden="true"
                          >&nbsp;·&nbsp;</span
                        >{{
                          __('Delivery {0}', [formatDay(row.due_date)])
                        }}</span
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
                        v-if="billPending(row)"
                        theme="blue"
                        :label="__('Bill pending')"
                      />
                    </span>
                  </span>
                  <span
                    v-if="
                      row.grand_total !== undefined && row.grand_total !== null
                    "
                    class="shrink-0 text-right text-sm font-medium tabular-nums text-ink-gray-9"
                    >{{ money(row.grand_total, row.currency) }}</span
                  >
                </a>
              </div>
              <!-- The focused row's next steps, each with its key (desktop; a phone opens the record). -->
              <div
                v-if="
                  !list.phone.value &&
                  list.focusKey.value === rowKey(row) &&
                  rowActions(row).length
                "
                class="flex flex-wrap justify-end gap-1 px-4 pb-2"
                data-row-actions
              >
                <Button
                  v-for="action in rowActions(row)"
                  :key="action.key"
                  size="sm"
                  variant="ghost"
                  :label="`${action.label} · ${action.hint}`"
                  :aria-keyshortcuts="action.hint"
                  :loading="busyRow === `${action.key}:${row.name}`"
                  @click="runVerb(action.key, row)"
                >
                  <template #prefix>
                    <FeatherIcon :name="action.icon" class="h-4 w-4" />
                  </template>
                </Button>
              </div>
            </li>
          </ul>
          <div v-if="list.hasMore.value" class="px-4 py-4 sm:px-6">
            <Button
              :label="__('Load more', null, 'Compras')"
              :loading="list.loading.value"
              class="min-h-11 w-full sm:w-auto"
              @click="list.load({ more: true })"
            />
          </div>
          <nav
            v-if="state.segment === 'historial'"
            :aria-label="__('Other purchase documents')"
            class="flex flex-col gap-1 px-4 pt-4 text-sm sm:px-6"
          >
            <a
              class="hidden min-h-11 py-2 text-ink-blue-link underline sm:block"
              href="/app/muelle-compras?queue=receipts"
              >{{ __('Receipts, invoices and quotations (Desk)') }}</a
            >
            <a
              class="hidden min-h-11 py-2 text-ink-blue-link underline sm:block"
              href="/app/muelle-compras?catalog_section=catalogs"
              >{{ __('Supplier catalogs (Desk)') }}</a
            >
          </nav>
          <!-- Room under the last row for the FAB. -->
          <div
            v-if="list.phone.value && boot?.capabilities?.create"
            class="h-20"
            aria-hidden="true"
          />
        </div>

        <PowerBulkBar
          v-if="list.selected.value.size"
          :count="list.selected.value.size"
          :label="__('Selected purchases')"
        >
          <Button
            v-if="caps.confirm"
            variant="solid"
            class="min-h-12 sm:min-h-8"
            :label="__('Confirm', null, 'Compras')"
            @click="bulkOpen = true"
          >
            <template #prefix
              ><FeatherIcon name="check" class="h-4 w-4"
            /></template>
          </Button>
          <template v-else>
            <p class="w-full text-sm text-ink-gray-7 sm:w-auto">
              {{
                __(
                  'Confirming purchases is for whoever may confirm them. Ask for it.',
                )
              }}
            </p>
            <Button
              class="min-h-12 sm:min-h-8"
              :label="__('Copy request')"
              @click="copyConfirmRequest"
            />
          </template>
        </PowerBulkBar>
      </div>
      <!-- The one create action of the list (Shell SPEC §2.2.6). -->
      <Fab
        v-if="
          list.phone.value &&
          boot?.capabilities?.create &&
          !list.selecting.value
        "
        :label="__('New purchase')"
        @click="newPurchase"
      />
    </div>

    <BulkConfirmSheet
      v-model="bulkOpen"
      :rows="list.selectedRows.value"
      @done="bulkDone"
      @open="openFromResult"
    />
    <HandoffDialog
      v-model="handoff.open"
      doctype="Purchase Order"
      :name="handoff.name"
      :action="handoff.action"
      :title="handoff.title"
      :reason="handoff.reason"
      @sent="list.load({ quiet: true })"
    />
  </ModuleLayout>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FeatherIcon, FormControl, toast } from 'frappe-ui'
import { formatDay } from '@/utils/contactos'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import { Fab } from '@/components/ui'
import BulkConfirmSheet from '@/components/compras/BulkConfirmSheet.vue'
import CapturarDocumentoButton from '@/components/captura/CapturarDocumentoButton.vue'
import HandoffDialog from '@/components/compras/HandoffDialog.vue'
import PowerAppBar from '@/components/power/PowerAppBar.vue'
import PowerBulkBar from '@/components/power/PowerBulkBar.vue'
import { openShortcutSheet } from '@/composables/shellKeyboard'
import { usePowerList } from '@/composables/usePowerList'
import { orderBillsRoute } from '@/composables/useGastos'
import {
  CTX,
  LIVE_DOCTYPES,
  QUEUE_KEYS,
  SEGMENTS,
  billRoute,
  comprasApi,
  comprasBoot,
  listHref,
  listMemoryKey,
  loadComprasBoot,
  money,
  normalizeSegment,
  outcomeUnknown,
  parseDone,
  problemOf,
  progressLabel,
  queueShortcuts,
  queueState,
  recordRoute,
  requestId,
  rowKey,
  rowStep,
  scannerReceiptUrl,
  segmentLabel,
  statusLabel,
} from '@/composables/useCompras'

const route = useRoute()
const router = useRouter()
const boot = comprasBoot
const counts = ref(null)
const copied = ref('')
const notice = ref(null)
const busyRow = ref('')
const bulkOpen = ref(false)
const handoff = reactive({
  open: false,
  name: '',
  action: '',
  title: '',
  reason: '',
})
// One request id per pending step: a retry after a lost answer reuses it.
const pending = {}
// The URL is the state: list, search and focused purchase.
const state = computed(() => queueState(route.query))
const caps = computed(() => boot.value?.capabilities || {})

const list = usePowerList({
  name: 'compras',
  routeName: 'Compras',
  filters: (query) => {
    const s = queueState(query)
    return [s.segment, s.q]
  },
  memoryKey: listMemoryKey,
  fetch: ({ start, page_length }) =>
    comprasApi('queue', {
      segment: state.value.segment,
      search: state.value.q.trim(),
      start,
      page_length,
    }),
  onPage: (page) => {
    if (page.counts) counts.value = page.counts
  },
  problemOf,
  rowKey,
  focusOf: (row) => row.name,
  open: (row, extra) => router.push(recordRouteFor(row, extra)),
  keys: QUEUE_KEYS,
  verbs: {
    confirm: (row, { selectedRows }) =>
      selectedRows.length && caps.value.confirm
        ? (bulkOpen.value = true)
        : runVerb('confirm', row),
    receive: (row) => runVerb('receive', row),
    bill: (row) => runVerb('bill', row),
  },
  shortcuts: () => queueShortcuts(caps.value),
  enabled: () => Boolean(boot.value?.enabled),
  paused: () => Boolean(guard.value),
  // Confirming several prepared purchases is the bulk action: «Por comprar» only.
  selectable: () => state.value.segment === 'por-comprar',
  live: { doctypes: LIVE_DOCTYPES, minIntervalMs: 5000 },
})
const rows = list.rows
const problem = list.problem

const countText = (n) => (counts.value?.capped && n >= 500 ? '500+' : String(n))
function countLabel(value) {
  return counts.value && counts.value[value] !== undefined
    ? countText(counts.value[value])
    : undefined
}
const entries = computed(() =>
  SEGMENTS.map((s) => ({
    ...s,
    label:
      countLabel(s.value) !== undefined
        ? `${segmentLabel(s.value)} · ${countLabel(s.value)}`
        : segmentLabel(s.value),
  })),
)
const phoneEntries = computed(() =>
  SEGMENTS.map((s) => ({
    ...s,
    title: segmentLabel(s.value),
    count: countLabel(s.value),
  })),
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
      'por-facturar': __(
        "Goods that arrived and still wait for the supplier's bill.",
      ),
      historial: __('Fully received, closed or cancelled orders.'),
    })[state.value.segment],
)
const emptyTitle = computed(() =>
  state.value.q ? __('No purchases match') : __('Nothing here'),
)
const emptyBody = computed(() =>
  state.value.q
    ? __('Try another supplier or document number.')
    : state.value.segment === 'por-recibir'
      ? __('When you confirm a purchase it waits here until it arrives.')
      : state.value.segment === 'por-comprar'
        ? __('Start a purchase or wait for a purchase request.')
        : state.value.segment === 'por-facturar'
          ? __(
              "When goods arrive, the purchase waits here for the supplier's bill.",
            )
          : __('Received and closed purchases appear here.'),
)

/** The record's route; going back lands on this row of this list. */
function recordRouteFor(row, extra = {}) {
  return {
    ...recordRoute(row),
    query: { list: listHref(list.returnQuery(row)), ...extra },
  }
}
function recordHref(row) {
  const target = recordRouteFor(row)
  const kind = target.name === 'CompraSolicitud' ? 'solicitud' : 'orden'
  return `/crm/compras/${kind}/${encodeURIComponent(row.name)}?${new URLSearchParams(target.query)}`
}

function billPending(row) {
  return (
    row.kind === 'orden' &&
    Number(row.docstatus) === 1 &&
    Number(row.per_received || 0) > 0 &&
    Number(row.per_billed || 0) < 100
  )
}

function rowActions(row) {
  if (row.kind === 'solicitud') return []
  const docstatus = Number(row.docstatus)
  return [
    docstatus === 0 && {
      key: 'confirm',
      label: __('Review and confirm'),
      icon: 'check',
      hint: 'O',
    },
    docstatus === 1 &&
      Number(row.per_received || 0) < 100 &&
      !['Closed', 'On Hold'].includes(row.status) && {
        key: 'receive',
        label: row.in_receipt
          ? __('Continue receiving')
          : __('Receive in Escáner'),
        icon: 'truck',
        hint: 'R',
      },
    billPending(row) && {
      key: 'bill',
      label: __("Register the supplier's bill"),
      icon: 'file-text',
      hint: 'F',
    },
  ].filter(Boolean)
}

// ── verbs: the focused purchase (keys, the row's buttons) ──────────────────

function explain(step, row) {
  const actions = {
    open: { label: __('Open purchase'), onClick: () => list.openRow(row) },
    confirm: {
      label: __('Review and confirm'),
      onClick: () => runVerb('confirm', row),
    },
    receive: {
      label: __('Receive in Escáner'),
      onClick: () => runVerb('receive', row),
    },
    bills: {
      label: __('See its bills'),
      onClick: () => router.push(orderBillsRoute(row.name)),
    },
  }
  if (step.kind === 'handoff')
    return Object.assign(handoff, {
      open: true,
      name: row.name,
      action: step.action,
      title:
        step.action === 'confirm'
          ? __('Ask for a confirmation')
          : step.action === 'bill'
            ? __('Ask someone to register the bill')
            : __('Ask for access'),
      reason: step.text,
    })
  if (actions[step.kind])
    return toast.error(step.text, { action: actions[step.kind] })
  return toast.success(step.text)
}

async function runVerb(action, row) {
  if (!row) return
  list.focusRow(row)
  const step = rowStep(row, action, {
    caps: caps.value,
    scanner: boot.value?.scanner,
  })
  if (step.kind !== 'go') return explain(step, row)
  if (action === 'confirm')
    // The order's own review (who, how much, when, where) before confirming.
    return list.openRow(row, { accion: 'confirmar' })
  if (action === 'receive') return receive(row)
  if (action === 'bill') return bill(row)
}

async function call(key, method, args, row) {
  pending[key] ||= requestId()
  busyRow.value = key
  problem.value = null
  try {
    const result = await comprasApi(method, {
      request_id: pending[key],
      ...args,
    })
    delete pending[key]
    return result
  } catch (error) {
    if (!outcomeUnknown(error)) delete pending[key]
    const found = problemOf(error)
    if (found.kind === 'permission' && method === 'start_bill')
      return explain(
        { kind: 'handoff', action: 'bill', text: found.detail },
        row,
      )
    problem.value = { ...found, row }
    return null
  } finally {
    busyRow.value = ''
  }
}

/** «Recibir en Escáner»: the one draft receipt, counted in Escáner; back to the order. */
async function receive(row) {
  const result = await call(
    `receive:${row.name}`,
    'start_receipt',
    { name: row.name },
    row,
  )
  if (!result?.receipt) return
  await list.focusRow(row)
  window.location.assign(
    scannerReceiptUrl(
      result.receipt,
      row.name,
      listHref(list.returnQuery(row)),
    ),
  )
}

/** «Registrar factura»: the order's draft bill in Gastos; registering it comes back here. */
async function bill(row) {
  const result = await call(
    `bill:${row.name}`,
    'start_bill',
    { name: row.name },
    row,
  )
  if (!result?.bill) return
  await list.focusRow(row)
  router.push(billRoute(result.bill, `/crm${listHref(list.returnQuery(row))}`))
}

function bulkDone(results) {
  const confirmed = results.filter((entry) => entry.status === 'done').length
  list.clearSelection()
  list.load({ quiet: true })
  if (confirmed)
    toast.success(
      confirmed === 1
        ? __('1 purchase confirmed')
        : __('{0} purchases confirmed', [confirmed]),
    )
}
function openFromResult(row) {
  bulkOpen.value = false
  list.openRow(row)
}

function retry() {
  problem.value = null
  list.load({ quiet: true })
}
function selectSegment(value) {
  list.navigate({ segment: normalizeSegment(value) })
}
function newPurchase() {
  router.push({ name: 'CompraNueva', query: { list: route.fullPath } })
}

/** Back from Gastos with `done=Purchase Invoice:<name>`: say it and offer the bill. */
function handleDone() {
  const done = parseDone(route.query.done)
  if (!done) return
  notice.value =
    done.doctype === 'Purchase Invoice'
      ? {
          text: __('Bill {0} registered. Pay it from Gastos when it is due.', [
            done.name,
          ]),
          to: {
            name: 'GastoFactura',
            params: { name: done.name },
          },
          label: __('Open bill'),
        }
      : { text: __('{0} saved.', [done.name]) }
  const query = { ...route.query }
  delete query.done
  router.replace({ query })
}

async function retryBoot() {
  await loadComprasBoot({ refresh: true })
  if (boot.value?.enabled) list.load({ restore: true })
}
async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text)
    done(__('Request copied. Share it with your manager.'))
  } catch {
    done(text)
  }
}
function copyRequest() {
  return copyText(
    __(
      'I need access to Compras: read permission for Purchase Order or Material Request so I can follow purchases.',
    ),
    (text) => (copied.value = text),
  )
}
function copyConfirmRequest() {
  return copyText(
    __('Please review and confirm these purchases: {0}.', [
      list.selectedRows.value.map((row) => row.name).join(', '),
    ]),
    (text) => toast.success(text),
  )
}

onMounted(async () => {
  await loadComprasBoot()
  if (!boot.value?.enabled) return
  handleDone()
  list.load({ restore: true })
})
</script>
