<template>
  <ModuleLayout
    title="Gastos"
    :entries="entries"
    :active-key="state.po ? '' : state.segment"
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
    <div
      v-else-if="!boot"
      role="status"
      class="px-6 py-8 text-sm text-ink-gray-6"
    >
      {{ __('Loading…', null, 'Gastos') }}
    </div>
    <template v-else-if="state.segment === 'empleados'">
      <PowerAppBar
        v-if="list.phone.value"
        :title="segmentLabel(state.segment)"
        :entries="phoneEntries"
        :active="state.segment"
        :searchable="false"
        @select="selectSegment"
      />
      <ClaimsQueue :boot="boot" @segment="selectSegment" />
    </template>
    <div
      v-else
      :ref="(el) => (list.scroller.value = el)"
      class="flex min-h-0 flex-1 flex-col overflow-y-auto"
      data-gastos-scroller
      @scroll.passive="list.rememberScroll"
    >
      <PowerAppBar
        v-if="list.phone.value"
        v-model:search="list.search.value"
        v-model:search-open="list.searchOpen.value"
        :title="
          state.po
            ? __('Bills of order {0}', [state.po])
            : segmentLabel(state.segment)
        "
        :count="state.po ? undefined : countLabel(state.segment)"
        :loading="list.loading.value && rows.length > 0"
        :entries="phoneEntries"
        :active="state.segment"
        :search-label="__('Search supplier, bill or invoice number')"
        :selectable="rows.length > 0 && canSelect"
        :select-label="__('Select bills')"
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
            :targets="['Purchase Invoice']"
            return-label="Gastos"
          />
        </template>
        <template v-if="owed.length" #summary>
          <span v-for="total in owed" :key="total.currency"
            >{{ __('Owed', null, 'Gastos') }}
            <strong class="tabular-nums">{{
              money(total.amount, total.currency)
            }}</strong></span
          >
          <span v-if="counts?.vencidas"
            >{{ __('Overdue', null, 'Gastos') }}
            <strong class="tabular-nums text-ink-red-7">{{
              countText(counts.vencidas)
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
            {{
              state.po
                ? __('Bills of order {0}', [state.po])
                : segmentLabel(state.segment)
            }}
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
          :targets="['Purchase Invoice']"
          return-label="Gastos"
        />
      </header>
      <div
        v-if="state.po"
        class="mx-4 my-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-gray-2 p-3 text-sm sm:mx-6 sm:mt-0"
      >
        <span class="min-w-0 flex-1">{{
          __('Showing only the bills of this purchase order.')
        }}</span>
        <RouterLink
          class="min-h-11 py-2 text-ink-blue-link underline"
          :to="{ name: 'CompraOrden', params: { name: state.po } }"
          >{{ __('Back to the order') }}</RouterLink
        >
        <Button :label="__('See all bills')" @click="clearOrder" />
      </div>
      <div
        class="flex flex-wrap items-center gap-2 px-4 pb-3 pt-2 sm:px-6 sm:pt-0"
      >
        <div
          v-if="state.segment === 'por-pagar' && !state.po"
          role="group"
          :aria-label="__('Filter by due date')"
          class="flex flex-wrap gap-1"
          data-gastos-chips
        >
          <Button
            v-for="c in CHIPS"
            :key="c.value"
            class="min-h-11 sm:min-h-8"
            :variant="state.chip === c.value ? 'solid' : 'subtle'"
            :aria-pressed="state.chip === c.value"
            :label="chipLabel(c)"
            @click="list.navigate({ chip: c.value })"
          />
        </div>
        <FormControl
          v-if="!list.phone.value"
          v-model="list.search.value"
          class="w-full min-w-0 sm:w-auto sm:max-w-xs sm:flex-1"
          type="search"
          :placeholder="__('Search supplier, bill or invoice number')"
          :aria-label="__('Search supplier, bill or invoice number')"
          :aria-keyshortcuts="'/'"
          data-power-search
        />
        <Button
          v-if="state.segment === 'por-registrar' && !state.po"
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
          v-if="problem.row"
          class="ml-2"
          :label="__('Open bill')"
          @click="list.openRow(problem.row)"
        />
        <Button
          class="ml-2"
          :label="__('Retry', null, 'Gastos')"
          @click="retry"
        />
      </div>
      <div class="flex-1 pb-6">
        <div
          v-if="list.loading.value && !rows.length"
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
          <Button
            v-if="state.chip"
            class="mt-3 min-h-11 sm:min-h-8"
            :label="__('Show every bill')"
            @click="list.navigate({ chip: '' })"
          />
          <a
            v-if="state.po && boot?.capabilities?.desk"
            class="mt-4 inline-block min-h-11 py-2 text-ink-blue-link underline"
            :href="`/app/purchase-order/${encodeURIComponent(state.po)}`"
            >{{ __('Open the full order form to bill it') }}</a
          >
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
            :id="list.domId(row.name)"
            :key="row.name"
            role="option"
            :aria-selected="list.selected.value.has(row.name)"
            :data-row-key="row.name"
            class="group relative"
            :class="[
              list.focusKey.value === row.name ? 'bg-surface-gray-2' : '',
              list.selected.value.has(row.name) ? 'bg-surface-blue-1' : '',
            ]"
          >
            <div class="flex items-start">
              <label
                v-if="canSelect && (!list.phone.value || list.selecting.value)"
                class="flex min-h-14 shrink-0 cursor-pointer items-center pl-5"
                :aria-label="__('Select {0}', [row.bill_no || row.name])"
              >
                <input
                  type="checkbox"
                  class="h-5 w-5 rounded"
                  :checked="list.selected.value.has(row.name)"
                  @change="list.toggleRow(row)"
                />
              </label>
              <a
                :href="recordHref(row)"
                class="flex min-h-14 min-w-0 flex-1 items-start gap-3 px-4 py-3 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:px-6"
                :class="
                  canSelect && (!list.phone.value || list.selecting.value)
                    ? 'pl-2 sm:pl-2'
                    : ''
                "
                @click="list.onRowClick($event, row)"
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
                      [
                        row.bill_no,
                        // The due line already says «Vencida hace …».
                        row.overdue && Number(row.docstatus) === 1
                          ? ''
                          : statusLabel(row),
                        multiCompany ? row.company : '',
                      ]
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
                      Number(row.docstatus) === 1
                        ? row.owed_currency || row.currency
                        : row.currency,
                    )
                  }}</span
                >
              </a>
            </div>
            <!-- The focused row's actions, each with its key (desktop; a phone opens the bill). -->
            <div
              v-if="!list.phone.value && list.focusKey.value === row.name"
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
            :label="__('Load more', null, 'Gastos')"
            :loading="list.loading.value"
            class="min-h-11 w-full sm:w-auto"
            @click="list.load({ more: true })"
          />
        </div>
      </div>

      <PowerBulkBar
        v-if="list.selected.value.size"
        :count="list.selected.value.size"
        :label="__('Selected bills')"
      >
        <Button
          v-if="caps.pay"
          variant="solid"
          class="min-h-12 sm:min-h-8"
          :label="__('Pay', null, 'Gastos')"
          @click="bulkOpen = true"
        >
          <template #prefix
            ><FeatherIcon name="dollar-sign" class="h-4 w-4"
          /></template>
        </Button>
        <template v-else>
          <p class="w-full text-sm text-ink-gray-7 sm:w-auto">
            {{
              __('Payments are made by an accounts manager. Ask one to pay it.')
            }}
          </p>
          <Button
            class="min-h-12 sm:min-h-8"
            :label="__('Copy request')"
            @click="copyPayRequest"
          />
        </template>
      </PowerBulkBar>
    </div>

    <PayDialog
      v-model="payOpen"
      :name="sheetRow?.name || ''"
      :party="sheetRow?.party || ''"
      @paid="paid"
      @failed="payFailed"
      @release="sheetRow && list.openRow(sheetRow)"
      @review="(reason) => ask(sheetRow, 'review', reason)"
      @setup="
        ask(
          sheetRow,
          'review',
          __('This company needs a bank or cash account to pay from.'),
        )
      "
    />
    <ApprovalDialog
      v-model="approval.open"
      :name="approval.name"
      :action="approval.action"
      :reason="approval.reason"
      @sent="list.load({ quiet: true })"
    />
    <BulkPaySheet
      v-model="bulkOpen"
      :rows="list.selectedRows.value"
      @done="bulkDone"
      @open="openFromResult"
      @narrow="narrow"
    />
  </ModuleLayout>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, FeatherIcon, FormControl, toast } from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import ApprovalDialog from '@/components/gastos/ApprovalDialog.vue'
import BulkPaySheet from '@/components/gastos/BulkPaySheet.vue'
import CapturarDocumentoButton from '@/components/captura/CapturarDocumentoButton.vue'
import ClaimsQueue from '@/components/gastos/ClaimsQueue.vue'
import PayDialog from '@/components/gastos/PayDialog.vue'
import PowerAppBar from '@/components/power/PowerAppBar.vue'
import PowerBulkBar from '@/components/power/PowerBulkBar.vue'
import { openShortcutSheet } from '@/composables/shellKeyboard'
import { offerUndo, runUndo } from '@/composables/powerUndo'
import { usePowerList } from '@/composables/usePowerList'
import {
  CHIPS,
  CTX,
  LIVE_DOCTYPES,
  QUEUE_KEYS,
  cancelPayment,
  dueLabel,
  gastosApi,
  gastosBoot,
  listHref,
  listMemoryKey,
  loadGastosBoot,
  money,
  normalizeSegment,
  paidLabel,
  payStep,
  problemOf,
  queueShortcuts,
  queueState,
  segmentLabel,
  statusLabel,
  visibleSegments,
} from '@/composables/useGastos'

const route = useRoute()
const router = useRouter()
const boot = gastosBoot
const counts = ref(null)
const copied = ref('')
const sheetRow = ref(null)
const payOpen = ref(false)
const bulkOpen = ref(false)
const approval = reactive({ open: false, name: '', action: '', reason: '' })
// The URL is the state: list, due-date chip, order, search and focused bill.
const state = computed(() => queueState(route.query, boot.value))
const caps = computed(() => boot.value?.capabilities || {})
const billSegment = computed(() => state.value.segment !== 'empleados')
const canSelect = computed(
  () => state.value.segment === 'por-pagar' || Boolean(state.value.po),
)

const list = usePowerList({
  name: 'gastos',
  routeName: 'Gastos',
  filters: (query) => {
    const s = queueState(query, boot.value)
    return [s.segment, s.chip, s.po, s.q]
  },
  memoryKey: listMemoryKey,
  fetch: ({ start, page_length }) =>
    gastosApi('queue', {
      segment: state.value.segment,
      chip: state.value.chip,
      purchase_order: state.value.po,
      search: state.value.q.trim(),
      start,
      page_length,
    }),
  onPage: (page) => (counts.value = page.counts || null),
  problemOf,
  open: (row, extra) => router.push(recordRoute(row, extra)),
  keys: QUEUE_KEYS,
  verbs: {
    pay: (row, { selectedRows }) =>
      selectedRows.length && caps.value.pay
        ? (bulkOpen.value = true)
        : runVerb('pay', row),
    register: (row) => runVerb('register', row),
    ask: (row) => runVerb('ask', row),
  },
  shortcuts: () => (billSegment.value ? queueShortcuts(caps.value) : []),
  enabled: () => Boolean(boot.value?.enabled),
  // «De empleados» is its own queue (ClaimsQueue): the bill keys rest there.
  paused: () => Boolean(guard.value) || !billSegment.value,
  // Paying several bills at once is the bulk action: only the bills to pay.
  selectable: () => canSelect.value,
  live: { doctypes: LIVE_DOCTYPES, minIntervalMs: 5000 },
})
const rows = list.rows
const problem = list.problem
const multiCompany = computed(
  () => new Set(rows.value.map((row) => row.company)).size > 1,
)

const countText = (n) => (counts.value?.capped && n >= 500 ? '500+' : String(n))
function countLabel(value) {
  return counts.value && counts.value[value] !== undefined
    ? countText(counts.value[value])
    : undefined
}
const entries = computed(() =>
  visibleSegments(boot.value).map((s) => ({
    ...s,
    label:
      countLabel(s.value) !== undefined
        ? `${segmentLabel(s.value)} · ${countLabel(s.value)}`
        : segmentLabel(s.value),
  })),
)
const phoneEntries = computed(() =>
  visibleSegments(boot.value).map((s) => ({
    ...s,
    title: segmentLabel(s.value),
    count: countLabel(s.value),
  })),
)
const owed = computed(() =>
  billSegment.value && !state.value.po ? counts.value?.totals || [] : [],
)
function chipLabel(c) {
  const label = __(c.label, null, CTX)
  if (c.value === 'vencidas' && counts.value?.vencidas)
    return `${label} · ${countText(counts.value.vencidas)}`
  return label
}
const guard = computed(() =>
  boot.value && !boot.value.enabled
    ? boot.value.reason ||
      __('Ask your manager for permission to read supplier bills.')
    : '',
)
const subtitle = computed(() => {
  if (state.value.po)
    return __('Draft and registered bills linked to this order.')
  if (state.value.segment === 'por-registrar')
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
  state.value.q
    ? __('No bills match')
    : state.value.po
      ? __('This order has no bill yet')
      : __('Nothing here', null, CTX),
)
const emptyBody = computed(() => {
  if (state.value.q) return __('Try another supplier or bill number.')
  if (state.value.po)
    return __(
      'When the supplier bill for this order is registered it appears here.',
    )
  if (state.value.segment === 'por-registrar')
    return __(
      'Draft bills from a supplier CFDI or a purchase order wait here until someone registers them.',
    )
  return state.value.chip
    ? __('No bills in this filter. Try All.')
    : __('Every registered bill is paid.')
})

/** The bill's route; going back lands on this row of this list. */
function recordRoute(row, extra = {}) {
  return {
    name: 'GastoFactura',
    params: { name: row.name },
    query: { list: listHref(list.returnQuery(row)), ...extra },
  }
}
function recordHref(row) {
  const { query } = recordRoute(row)
  return `/crm/gastos/factura/${encodeURIComponent(row.name)}?${new URLSearchParams(query)}`
}

function rowActions(row) {
  const draft = Number(row.docstatus) === 0
  return [
    !draft &&
      Number(row.outstanding_amount) > 0 && {
        key: 'pay',
        label: caps.value.pay
          ? __('Pay', null, CTX)
          : __('Ask someone to pay this bill'),
        icon: 'dollar-sign',
        hint: '$',
      },
    draft &&
      caps.value.submit && {
        key: 'register',
        label: __('Review and register'),
        icon: 'check-square',
        hint: 'R',
      },
    {
      key: 'ask',
      label: __('Ask for approval'),
      icon: 'user-plus',
      hint: 'A',
    },
  ].filter(Boolean)
}

// ── verbs: the focused bill (keys, the row's buttons) ──────────────────────

function runVerb(action, row) {
  if (!row) return
  list.focusRow(row)
  sheetRow.value = row
  if (action === 'pay') {
    const step = payStep(row, caps.value)
    if (step.kind === 'pay') return (payOpen.value = true)
    if (step.kind === 'ask') return ask(row, 'pay', step.text)
    if (step.kind === 'register')
      return toast.error(step.text, {
        action: {
          label: __('Review and register'),
          onClick: () => runVerb('register', row),
        },
      })
    if (step.kind === 'held')
      return toast.error(step.text, {
        action: { label: __('Open bill'), onClick: () => list.openRow(row) },
      })
    return toast.success(step.text)
  }
  if (action === 'register') {
    if (Number(row.docstatus) !== 0)
      return toast.success(__('This bill is already registered.'))
    if (!caps.value.submit)
      return ask(
        row,
        'submit',
        __(
          'Registering bills is for whoever may submit them. Ask for it to be reviewed.',
        ),
      )
    // The bill's own review: the record opens «Revisar y registrar» on it.
    return list.openRow(row, { accion: 'registrar' })
  }
  if (action === 'ask')
    return ask(row, Number(row.docstatus) === 0 ? 'submit' : 'pay', '')
}

function ask(row, action, reason) {
  if (!row) return
  Object.assign(approval, {
    open: true,
    name: row.name,
    action,
    reason: reason || '',
  })
}

/** «Pagado · Deshacer» (the undo cancels the payment; only its author). */
function paid(result) {
  const message =
    Number(result.outstanding_amount) > 0
      ? __('Payment {0} saved. {1} still owed.', [
          result.payment_entry,
          money(result.outstanding_amount, result.currency),
        ])
      : __('Bill {0} paid with {1}', [result.name, result.payment_entry])
  if (result.can_cancel)
    offerUndo(message, () => undoPayments([result.payment_entry]))
  else toast.success(message)
  list.load({ quiet: true })
}

function bulkDone(results) {
  const made = results
    .filter((entry) => entry.status === 'done' && entry.result)
    .map((entry) => entry.result)
  list.clearSelection()
  list.load({ quiet: true })
  if (!made.length) return
  const message =
    made.length === 1 ? __('1 bill paid') : __('{0} bills paid', [made.length])
  const undoable = made.filter((r) => r.can_cancel).map((r) => r.payment_entry)
  if (undoable.length === made.length)
    offerUndo(message, () => undoPayments(undoable))
  else toast.success(message)
}

async function undoPayments(payments) {
  await runUndo(
    async () => {
      for (const payment of payments) await cancelPayment(gastosApi, payment)
    },
    {
      done:
        payments.length === 1
          ? __('Payment {0} cancelled', [payments[0]])
          : __('{0} payments cancelled', [payments.length]),
      describe: (error) => problemOf(error).detail,
      reload: () => list.load({ quiet: true }),
    },
  )
}

function openFromResult(row) {
  bulkOpen.value = false
  list.openRow(row)
}
function narrow(group) {
  list.selected.value = new Set(group.map((row) => row.name))
}

function payFailed(found) {
  // A definite refusal (closed period, over the balance, permissions): the
  // reason, and the bill one tap away.
  problem.value = { ...found, row: sheetRow.value }
}

function retry() {
  problem.value = null
  list.load({ quiet: true })
}

function selectSegment(value) {
  list.clearSelection()
  list.navigate({
    segment: normalizeSegment(value, boot.value),
    chip: '',
    po: '',
    scope: '',
    employee: '',
  })
}
function clearOrder() {
  list.navigate({ po: '' })
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

async function retryBoot() {
  await loadGastosBoot({ refresh: true })
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
      'I need access to Gastos: read permission for Purchase Invoice so I can follow supplier bills and payments.',
    ),
    (text) => (copied.value = text),
  )
}
function copyPayRequest() {
  return copyText(
    __('Please pay these supplier bills: {0}.', [
      list.selectedRows.value
        .map((row) => `${row.bill_no || row.name} (${row.party || ''})`)
        .join(', '),
    ]),
    (text) => toast.success(text),
  )
}

onMounted(async () => {
  await loadGastosBoot()
  // «De empleados» loads its own queue (ClaimsQueue).
  if (boot.value?.enabled && billSegment.value) list.load({ restore: true })
})
</script>
