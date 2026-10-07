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
          <Button :label="__('Retry', null, 'Compras')" @click="load" />
          <Button :label="__('Back to Compras')" @click="goBack" />
        </div>
      </section>

      <div v-else-if="loading && !loaded" role="status" class="py-10 text-sm">
        {{ __('Loading purchase…') }}
      </div>

      <template v-else>
        <!-- Header: who, what, where, when, how much — and the one next action. -->
        <header class="mb-4 flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm text-ink-gray-6">
              {{ isNew ? __('New purchase') : doc.name }}
              <Badge
                v-if="!isNew"
                class="ml-1"
                :theme="statusTheme"
                :label="statusLabel(doc)"
              />
            </p>
            <h1 class="truncate text-2xl font-semibold text-ink-gray-9">
              {{ form.supplier_label || doc.party || __('Choose a supplier') }}
            </h1>
            <p v-if="!isNew" class="mt-1 text-sm text-ink-gray-6">
              {{
                [
                  doc.company,
                  doc.set_warehouse && __('to {0}', [doc.set_warehouse]),
                  doc.schedule_date && __('delivery {0}', [doc.schedule_date]),
                ]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </p>
          </div>
          <div class="hidden flex-col items-end gap-1 sm:flex">
            <span
              v-if="!isNew"
              class="text-xl font-semibold tabular-nums text-ink-gray-9"
              >{{ money(doc.grand_total, doc.currency) }}</span
            >
            <span v-if="!isNew" class="text-xs text-ink-gray-5">{{
              doc.currency
            }}</span>
          </div>
        </header>

        <!-- Done from Escáner: the receipt we handed off came back confirmed. -->
        <div
          v-if="doneNotice"
          role="status"
          class="mb-4 rounded-lg bg-surface-green-1 p-3 text-sm text-ink-green-8"
        >
          {{ doneNotice }}
        </div>

        <div
          v-if="draftNotice"
          role="status"
          class="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        >
          <span class="flex-1">{{ draftNotice }}</span>
          <Button
            :label="__('Recover', null, 'Compras')"
            @click="recoverDraft"
          />
          <Button
            :label="__('Discard', null, 'Compras')"
            @click="discardDraft"
          />
        </div>

        <div
          v-if="problem"
          role="alert"
          class="mb-4 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <p>
            <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <Button
              v-if="problem.kind === 'offline'"
              :label="__('Check result')"
              @click="retryLast"
            />
            <Button
              v-if="problem.kind === 'conflict'"
              :label="__('Refresh and compare')"
              @click="compare"
            />
            <Button
              v-if="problem.kind === 'permission' && !isNew"
              :label="__('Ask for help')"
              @click="
                openHandoff('review', __('Ask for a review'), problem.detail)
              "
            />
          </div>
        </div>

        <!-- Conflict: your version beside the current one; input is kept. -->
        <section
          v-if="conflict"
          class="mb-4 rounded-lg border border-outline-amber-2 p-3 text-sm"
          :aria-label="__('Compare versions')"
        >
          <p class="mb-2 font-semibold">
            {{ __('Someone else changed this purchase') }}
          </p>
          <table class="w-full text-left">
            <thead>
              <tr class="text-ink-gray-5">
                <th class="py-1">{{ __('Field', null, 'Compras') }}</th>
                <th class="py-1">{{ __('Your version') }}</th>
                <th class="py-1">{{ __('Current', null, 'Compras') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="diff in conflict.diffs" :key="diff.label">
                <td class="py-1">{{ diff.label }}</td>
                <td class="py-1">{{ diff.mine }}</td>
                <td class="py-1">{{ diff.current }}</td>
              </tr>
            </tbody>
          </table>
          <div class="mt-2 flex flex-wrap gap-2">
            <Button :label="__('Use the current one')" @click="useCurrent" />
            <Button
              variant="solid"
              :label="__('Reapply my changes')"
              @click="reapply"
            />
          </div>
        </section>

        <!-- Next action: exactly one primary; a blocked one says why and how. -->
        <section
          v-if="primary && !editing"
          class="mb-5 rounded-xl border border-outline-gray-2 p-4"
          :aria-label="__('Next step', null, 'Compras')"
        >
          <template v-if="primary.allowed">
            <p v-if="summaryLine" class="mb-3 text-base text-ink-gray-8">
              {{ summaryLine }}
            </p>
            <div class="flex flex-wrap gap-2">
              <Button
                variant="solid"
                size="md"
                class="min-h-11"
                :label="primary.label"
                :loading="busy"
                @click="runAction(primary)"
              />
              <Button
                v-if="doc.can_write"
                class="min-h-11"
                :label="__('Edit purchase')"
                @click="startEditing"
              />
            </div>
          </template>
          <template v-else>
            <p class="text-base font-medium text-ink-gray-9">
              {{ primary.reason }}
            </p>
            <p v-if="summaryLine" class="mt-1 text-sm text-ink-gray-6">
              {{ summaryLine }}
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <Button
                v-if="primary.resolve"
                variant="solid"
                class="min-h-11"
                :label="primary.resolve.label"
                @click="resolve(primary)"
              />
              <Button
                v-if="primary.resolve?.recheck"
                class="min-h-11"
                :label="__('Check again')"
                @click="recheck"
              />
            </div>
          </template>
        </section>
        <p
          v-else-if="!editing && !isNew && Number(doc.docstatus) === 1"
          class="mb-5 rounded-xl bg-surface-gray-1 p-4 text-base"
        >
          {{ summaryLine || __('Nothing left to receive on this purchase.') }}
          <RouterLink
            class="ml-1 text-ink-blue-link underline"
            :to="{ name: 'Compras', query: { segment: 'por-recibir' } }"
            >{{ __('Back to the queue') }}</RouterLink
          >
        </p>

        <!-- Editor: draft purchases only, never a submitted one. -->
        <section
          v-if="editing"
          class="mb-6 space-y-4"
          :aria-label="__('Purchase details', null, 'Compras')"
        >
          <div class="grid gap-3 sm:grid-cols-2">
            <ComprasPicker
              v-model="form.supplier"
              :display="form.supplier_label"
              :label="__('Supplier', null, 'Compras')"
              :placeholder="__('Search supplier')"
              :empty-text="__('No supplier you can use matches.')"
              :invalid="missing.includes('supplier')"
              :load="(q) => comprasApi('suppliers', { search: q })"
              @pick="(o) => (form.supplier_label = o.label)"
            />
            <FormControl
              v-model="form.company"
              type="select"
              :label="__('Company', null, 'Compras')"
              :options="companyOptions"
            />
            <ComprasPicker
              v-model="form.set_warehouse"
              :display="form.set_warehouse"
              :label="__('Destination warehouse', null, 'Compras')"
              :placeholder="__('Search warehouse')"
              :empty-text="__('No warehouse of this company you can use.')"
              :invalid="missing.includes('warehouse')"
              :disabled="!form.company"
              :load="
                (q) =>
                  comprasApi('warehouses', { company: form.company, search: q })
              "
            />
            <FormControl
              v-model="form.schedule_date"
              type="date"
              :label="__('Delivery date', null, 'Compras')"
            />
          </div>
          <p
            v-if="missing.length && (triedSave || !isNew)"
            role="status"
            class="text-sm text-ink-amber-8"
          >
            {{ __('Missing: {0}.', [missingText]) }}
            <RouterLink
              v-if="isNew && missing.includes('supplier')"
              class="ml-1 underline"
              :to="{ name: 'Contactos', query: { return_to: route.fullPath } }"
              >{{ __('Add a supplier in Contactos') }}</RouterLink
            >
            <button
              v-if="!isNew"
              class="ml-1 underline"
              @click="
                openHandoff(
                  'setup',
                  __('Ask for setup'),
                  __(
                    'Ask someone to add the missing supplier, warehouse or configuration.',
                  ),
                )
              "
            >
              {{ __('Ask for setup') }}
            </button>
          </p>

          <div>
            <h2 class="mb-2 text-base font-semibold">
              {{ __('Items ({0})', [form.items.length]) }}
            </h2>
            <ul
              class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
            >
              <li
                v-for="(row, index) in form.items"
                :key="row.key"
                class="grid gap-2 p-3 sm:grid-cols-[1fr_6rem_8rem_8rem_auto] sm:items-end"
              >
                <div class="min-w-0">
                  <p class="truncate font-medium">
                    {{ row.item_label || row.item_code }}
                  </p>
                  <p class="truncate text-xs text-ink-gray-5">
                    {{ row.item_code
                    }}<template v-if="row.material_request">
                      · {{ __('from {0}', [row.material_request]) }}</template
                    ><template
                      v-if="
                        row.warehouse && row.warehouse !== form.set_warehouse
                      "
                    >
                      · {{ __('to {0}', [row.warehouse]) }}
                      <button
                        class="underline"
                        @click="row.warehouse = form.set_warehouse"
                      >
                        {{ __('use destination') }}
                      </button></template
                    ><template v-if="row.tracked">
                      · {{ __('serial/batch: reviewed on receipt') }}</template
                    >
                  </p>
                </div>
                <FormControl
                  v-model="row.qty"
                  type="number"
                  :label="__('Quantity', null, 'Compras')"
                  min="0"
                  step="any"
                />
                <FormControl
                  v-model="row.uom"
                  type="select"
                  :label="__('Unit', null, 'Compras')"
                  :options="
                    (row.uoms || []).map((u) => ({
                      label:
                        u.factor && u.factor !== 1
                          ? `${u.uom} (×${u.factor})`
                          : u.uom,
                      value: u.uom,
                    }))
                  "
                />
                <FormControl
                  v-model="row.rate"
                  type="number"
                  :label="__('Price (optional)')"
                  min="0"
                  step="any"
                />
                <Button
                  class="min-h-11"
                  icon="trash-2"
                  :aria-label="
                    __('Remove {0}', [row.item_label || row.item_code])
                  "
                  @click="form.items.splice(index, 1)"
                />
              </li>
              <li class="p-3">
                <ComprasPicker
                  model-value=""
                  :label="__('Add item')"
                  :placeholder="__('Search item, code or barcode')"
                  :empty-text="
                    __('Only existing purchasable items appear here.')
                  "
                  clear-on-pick
                  :load="(q) => comprasApi('items', { search: q })"
                  @pick="addItem"
                />
              </li>
            </ul>
          </div>
          <div
            class="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-outline-gray-2 bg-surface-base p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:static sm:border-0 sm:p-0"
          >
            <Button
              variant="solid"
              class="min-h-11 flex-1 sm:flex-none"
              :label="isNew ? __('Save purchase') : __('Save changes')"
              :loading="busy"
              @click="save"
            />
            <Button
              v-if="!isNew"
              class="min-h-11"
              :label="__('Cancel', null, 'Compras')"
              @click="cancelEditing"
            />
          </div>
        </section>

        <!-- Rows of a saved purchase: ordered, received, in receipt, missing. -->
        <section
          v-if="!isNew && !editing"
          class="mb-6"
          :aria-label="__('Items', null, 'Compras')"
        >
          <h2 class="mb-2 text-base font-semibold">
            {{ __('Items ({0})', [data.rows_scope?.total || rows.length]) }}
          </h2>
          <ul
            class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
          >
            <li v-for="row in rows" :key="row.name" class="flex gap-3 p-3">
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">
                  {{ row.item_name || row.item_code }}
                </p>
                <p class="truncate text-xs text-ink-gray-5">
                  {{
                    [
                      row.item_code,
                      row.warehouse ||
                        (row.warehouse_restricted
                          ? __('restricted warehouse')
                          : ''),
                      row.material_request,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  }}
                </p>
                <p
                  v-if="Number(doc.docstatus) === 1"
                  class="mt-1 text-sm text-ink-gray-8"
                >
                  {{ rowProgress(row) }}
                </p>
                <p v-if="row.tracked" class="mt-1 text-xs text-ink-amber-8">
                  {{ __('Needs serial/batch review when it arrives.') }}
                </p>
              </div>
              <div class="shrink-0 text-right text-sm tabular-nums">
                <p class="font-medium">{{ qty(row.qty) }} {{ row.uom }}</p>
                <p
                  v-if="row.uom !== row.stock_uom"
                  class="text-xs text-ink-gray-5"
                >
                  = {{ qty(row.stock_qty) }} {{ row.stock_uom }}
                </p>
                <p class="text-xs text-ink-gray-5">
                  {{ money(row.amount, doc.currency) }}
                </p>
              </div>
            </li>
          </ul>
          <Button
            v-if="data.rows_scope?.has_more"
            class="mt-2 min-h-11"
            :label="__('Show more items')"
            @click="loadMoreRows"
          />
        </section>

        <!-- Linked: receipts (Escáner), requests, finance, follow-ups. -->
        <section
          v-if="!isNew"
          class="grid gap-4 sm:grid-cols-2"
          :aria-label="__('Linked records', null, 'Compras')"
        >
          <div class="rounded-xl border border-outline-gray-2 p-4">
            <h2 class="mb-2 text-base font-semibold">
              {{ __('Receipts', null, 'Compras') }}
            </h2>
            <p
              v-if="!data.receipts?.rows?.length"
              class="text-sm text-ink-gray-6"
            >
              {{ __('Nothing received yet.') }}
            </p>
            <ul v-else class="space-y-1 text-sm">
              <li v-for="receipt in data.receipts.rows" :key="receipt.name">
                <a
                  class="text-ink-blue-link underline"
                  :href="scannerReceiptUrl(receipt.name, doc.name)"
                  >{{ receipt.name }}</a
                >
                ·
                {{
                  Number(receipt.docstatus) === 1
                    ? __('confirmed', null, 'Compras')
                    : __('draft, not stock yet')
                }}
                · {{ receipt.posting_date }}
              </li>
            </ul>
          </div>
          <div class="rounded-xl border border-outline-gray-2 p-4">
            <h2 class="mb-2 text-base font-semibold">
              {{ __('Billing', null, 'Compras') }}
            </h2>
            <p class="text-sm text-ink-gray-7">
              {{
                doc.billing_pending
                  ? __(
                      'The supplier bill is pending. Bills are registered and paid in Gastos.',
                    )
                  : Number(doc.docstatus) === 1
                    ? __('Billed.', null, 'Compras')
                    : __('Billing starts after the purchase is confirmed.')
              }}
            </p>
            <RouterLink
              v-if="gastosOn && Number(doc.docstatus) === 1"
              class="mt-1 inline-block min-h-11 py-2 text-sm text-ink-blue-link underline sm:min-h-0 sm:py-0"
              :to="orderBillsRoute(doc.name)"
              >{{ __('See this order’s bills in Gastos') }}</RouterLink
            >
            <template v-if="data.requests?.length">
              <h2 class="mb-1 mt-3 text-base font-semibold">
                {{ __('From requests') }}
              </h2>
              <RouterLink
                v-for="mr in data.requests"
                :key="mr.name"
                class="mr-2 text-sm text-ink-blue-link underline"
                :to="{ name: 'CompraSolicitud', params: { name: mr.name } }"
                >{{ mr.name }}</RouterLink
              >
            </template>
          </div>
          <div
            v-if="data.followups?.rows?.length"
            class="rounded-xl border border-outline-gray-2 p-4 sm:col-span-2"
          >
            <h2 class="mb-2 text-base font-semibold">
              {{ __('Assigned', null, 'Compras') }}
            </h2>
            <ul class="space-y-1 text-sm">
              <li v-for="task in data.followups.rows" :key="task.name">
                {{ task.description }}
                <span class="text-ink-gray-5">· {{ task.date }}</span>
              </li>
            </ul>
          </div>
        </section>
      </template>
    </div>

    <!-- Review before confirming: total, currency, destination, date, rows. -->
    <Dialog v-model="reviewOpen" :options="{ title: __('Review and confirm') }">
      <template #body-content>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt class="text-ink-gray-5">{{ __('Supplier', null, 'Compras') }}</dt>
          <dd>{{ doc.party }}</dd>
          <dt class="text-ink-gray-5">{{ __('Company', null, 'Compras') }}</dt>
          <dd>{{ doc.company }}</dd>
          <dt class="text-ink-gray-5">
            {{ __('Destination', null, 'Compras') }}
          </dt>
          <dd>{{ doc.set_warehouse || __('per item') }}</dd>
          <dt class="text-ink-gray-5">
            {{ __('Delivery date', null, 'Compras') }}
          </dt>
          <dd>{{ doc.schedule_date }}</dd>
          <dt class="text-ink-gray-5">{{ __('Items', null, 'Compras') }}</dt>
          <dd>{{ data.rows_scope?.total }}</dd>
          <dt class="text-ink-gray-5">{{ __('Total', null, 'Compras') }}</dt>
          <dd class="text-base font-semibold">
            {{ money(doc.grand_total, doc.currency) }} ({{ doc.currency }})
          </dd>
        </dl>
        <p class="mt-3 text-sm text-ink-gray-6">
          {{
            __(
              'Confirming commits this purchase with the supplier. Stock moves only when goods are received.',
            )
          }}
        </p>
      </template>
      <template #actions>
        <div class="flex justify-end gap-2">
          <Button
            :label="__('Back', null, 'Compras')"
            @click="reviewOpen = false"
          />
          <Button
            variant="solid"
            :label="__('Confirm purchase')"
            :loading="busy"
            :disabled="data.rows_scope?.has_more"
            @click="confirm"
          />
        </div>
      </template>
    </Dialog>

    <HandoffDialog
      v-if="!isNew"
      v-model="handoff.open"
      doctype="Purchase Order"
      :name="doc.name || ''"
      :action="handoff.action"
      :title="handoff.title"
      :reason="handoff.reason"
      @sent="load"
    />
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Badge,
  Button,
  Dialog,
  FeatherIcon,
  FormControl,
  toast,
} from 'frappe-ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import HandoffDialog from '@/components/compras/HandoffDialog.vue'
import { shellBoot } from '@/composables/muelleShell'
import { orderBillsRoute } from '@/composables/useGastos'
import { moduleEnabled } from '@/vendor/muelle-shell/contracts'
import {
  MISSING_LABELS,
  clearDraft,
  comprasApi,
  comprasBoot,
  createOrder,
  followDestination,
  loadComprasBoot,
  loadDraft,
  loadWholeOrder,
  missingFields,
  money,
  orderPayload,
  outcomeUnknown,
  parseDone,
  pendingSave,
  problemOf,
  reapplyRows,
  qty,
  requestId,
  safeReturn,
  saveDraft,
  scannerReceiptUrl,
  statusLabel,
} from '@/composables/useCompras'

const props = defineProps({ name: { type: String, default: '' } })
const route = useRoute()
const router = useRouter()
const boot = comprasBoot
const isNew = computed(() => !props.name)
const gastosOn = computed(() => moduleEnabled(shellBoot.value, 'gastos'))
const data = ref({})
const rows = ref([])
const loading = ref(false)
const loaded = ref(false)
const busy = ref(false)
const problem = ref(null)
const guard = ref(null)
const editing = ref(false)
const triedSave = ref(false)
const reviewOpen = ref(false)
const conflict = ref(null)
const doneNotice = ref('')
const draftNotice = ref('')
const companies = ref([])
const handoff = reactive({ open: false, action: '', title: '', reason: '' })
const pending = { save: null, confirm: null, receive: null }
let lastCall = null
let rowKey = 0

const blankForm = () => ({
  name: '',
  modified: '',
  supplier:
    typeof route.query.supplier === 'string' ? route.query.supplier : '',
  supplier_label: '',
  company: boot.value?.default_company || '',
  schedule_date: '',
  set_warehouse: '',
  items: [],
})
const form = reactive(blankForm())
const doc = computed(() => data.value.document || {})
const missing = computed(() => missingFields(form))
const missingText = computed(() =>
  missing.value
    .map((key) => __(MISSING_LABELS[key], null, 'Compras'))
    .join(', '),
)
const companyOptions = computed(() => [
  { label: __('Choose a company'), value: '' },
  ...companies.value.map((c) => ({ label: c.label, value: c.value })),
])
const primary = computed(() =>
  (data.value.actions || []).find((action) => action.primary),
)
const statusTheme = computed(() =>
  Number(doc.value.docstatus) === 0
    ? 'orange'
    : Number(doc.value.docstatus) === 2
      ? 'red'
      : doc.value.billing_pending && Number(doc.value.per_received) >= 100
        ? 'green'
        : 'blue',
)
const summaryLine = computed(() => {
  const s = data.value.summary
  if (!s || Number(doc.value.docstatus) !== 1) return ''
  if (s.ordered_qty === null || s.ordered_qty === undefined)
    return __('{0}% received · {1} item(s) pending', [
      qty(s.per_received),
      s.rows_pending,
    ])
  const unit = s.uom ? ` ${s.uom}` : ''
  return s.remaining_qty > 0
    ? __('Received {0} of {1}; {2} missing', [
        qty(s.received_qty),
        qty(s.ordered_qty) + unit,
        qty(s.remaining_qty),
      ])
    : __('Received {0} of {1}; nothing missing', [
        qty(s.received_qty),
        qty(s.ordered_qty) + unit,
      ])
})
const returnTo = computed(() => safeReturn(route.query.return_to))
const backLabel = computed(() =>
  returnTo.value
    ? __('Back to {0}', [
        String(route.query.return_label || 'Compras').slice(0, 40),
      ])
    : __('Compras', null, 'Compras'),
)
const draftKey = computed(
  () => `${boot.value?.user || ''}:${props.name || 'new'}`,
)

function rowProgress(row) {
  const unit = row.uom ? ` ${row.uom}` : ''
  const parts = [
    __('Received {0} of {1}', [qty(row.received_qty), qty(row.qty) + unit]),
  ]
  if (row.in_receipt_qty)
    parts.push(__('{0} counted in a draft receipt', [qty(row.in_receipt_qty)]))
  parts.push(
    row.remaining_qty > 0
      ? __('{0} missing', [qty(row.remaining_qty)])
      : __('complete', null, 'Compras'),
  )
  return parts.join(' · ')
}

function formFrom(payload) {
  const document = payload.document || {}
  return {
    name: document.name,
    modified: document.modified,
    supplier: document.supplier || '',
    supplier_label: document.party || '',
    company: document.company || '',
    schedule_date: document.schedule_date || '',
    set_warehouse: document.set_warehouse || '',
    row_total: rows.value.length,
    items: rows.value.map((row) => ({
      key: ++rowKey,
      name: row.name,
      item_code: row.item_code,
      item_label: row.item_name,
      qty: row.qty,
      uom: row.uom,
      uoms: [
        { uom: row.uom, factor: row.conversion_factor },
        ...(row.stock_uom !== row.uom
          ? [{ uom: row.stock_uom, factor: 1 }]
          : []),
      ],
      rate: row.rate,
      warehouse: row.warehouse || '',
      material_request: row.material_request,
      tracked: row.tracked,
    })),
  }
}

async function load() {
  if (isNew.value) {
    loaded.value = true
    editing.value = true
    offerDraft()
    return
  }
  loading.value = true
  problem.value = null
  guard.value = null
  try {
    // Never confirm or edit from an incomplete review: every row page is loaded.
    const payload = await loadWholeOrder(comprasApi, props.name)
    data.value = payload
    rows.value = payload.rows
    loaded.value = true
    if (!editing.value) Object.assign(form, formFrom(payload))
    offerDraft()
  } catch (error) {
    const p = problemOf(error)
    if (!loaded.value)
      guard.value = {
        title:
          p.kind === 'permission'
            ? __('You cannot open this purchase')
            : __('Could not open this purchase'),
        detail: p.detail,
      }
    else problem.value = p
  } finally {
    loading.value = false
  }
}
function loadMoreRows() {
  load()
}

function offerDraft() {
  const stored = loadDraft(draftKey.value)
  if (!stored) return
  if (!isNew.value && stored.form.modified !== doc.value.modified) {
    draftNotice.value = __(
      'You have unsaved changes from {0} min ago, made on an older version.',
      [Math.max(1, Math.round((Date.now() - stored.at) / 60000))],
    )
  } else {
    draftNotice.value = __('You have unsaved changes from {0} min ago.', [
      Math.max(1, Math.round((Date.now() - stored.at) / 60000)),
    ])
  }
}
function recoverDraft() {
  const stored = loadDraft(draftKey.value)
  if (stored) Object.assign(form, stored.form)
  draftNotice.value = ''
  editing.value = true
}
function discardDraft() {
  clearDraft(draftKey.value)
  draftNotice.value = ''
}

watch(
  form,
  () => {
    if (editing.value && loaded.value) saveDraft(draftKey.value, form)
  },
  { deep: true },
)
// One destination: rows that followed the previous one follow the new one.
watch(
  () => form.set_warehouse,
  (next, previous) => {
    if (editing.value) followDestination(form.items, previous, next)
  },
)

function startEditing() {
  Object.assign(form, formFrom(data.value))
  editing.value = true
}
function cancelEditing() {
  clearDraft(draftKey.value)
  editing.value = false
  Object.assign(form, formFrom(data.value))
}
function addItem(option) {
  const existing = form.items.find(
    (row) => row.item_code === option.value && !row.name,
  )
  if (existing) {
    existing.qty = Number(existing.qty || 0) + 1
    return
  }
  form.items.push({
    key: ++rowKey,
    name: '',
    item_code: option.value,
    item_label: option.label,
    qty: 1,
    uom: option.uom,
    uoms: option.uoms,
    rate: '',
    warehouse: '',
    tracked: option.tracked,
  })
}

async function call(kind, method, args) {
  // One id per user action; a retry after a lost answer reuses it.
  pending[kind] ||= requestId()
  lastCall = { kind, method, args }
  busy.value = true
  problem.value = null
  try {
    const result = await comprasApi(method, {
      request_id: pending[kind],
      ...args,
    })
    pending[kind] = null
    return result
  } catch (error) {
    // Same id while the outcome is unknown; a definite answer frees it.
    if (!outcomeUnknown(error)) pending[kind] = null
    problem.value = problemOf(error)
    throw error
  } finally {
    busy.value = false
  }
}
function retryLast() {
  if (!lastCall) return load()
  if (lastCall.kind === 'save') return save()
  if (lastCall.kind === 'confirm') return confirm()
  if (lastCall.kind === 'receive') return receive()
}

async function save() {
  triedSave.value = true
  // A creation already sent is re-asked as sent, whatever the form shows now.
  const resending = isNew.value && Boolean(pendingSave(draftKey.value))
  if (
    !resending &&
    missing.value.some((key) =>
      ['supplier', 'company', 'items', 'qty'].includes(key),
    )
  ) {
    problem.value = {
      kind: 'error',
      title: __('Not saved yet'),
      detail: __('Missing: {0}.', [missingText.value]),
    }
    return
  }
  let result
  try {
    result = isNew.value
      ? await createNew()
      : await call('save', 'save_order', { data: orderPayload(form) })
  } catch {
    return
  }
  clearDraft(draftKey.value)
  editing.value = false
  conflict.value = null
  toast.success(__('Purchase saved'))
  if (result.resent)
    toast.warning(
      __(
        'The purchase was saved as first sent; changes made afterwards were not included. Review it.',
      ),
    )
  if (result.party_refreshed)
    toast.warning(
      __(
        'New supplier: its currency, taxes and address were applied. Review prices before confirming.',
      ),
    )
  if (isNew.value) {
    await router.replace({
      name: 'CompraOrden',
      params: { name: result.name },
      query: route.query,
    })
    return
  }
  await load()
}

/** A new purchase is one stored operation until the server answers, so a lost
 *  answer plus a reload asks about the same purchase instead of making two. */
async function createNew() {
  busy.value = true
  problem.value = null
  lastCall = { kind: 'save' }
  try {
    return await createOrder(comprasApi, draftKey.value, form)
  } catch (error) {
    problem.value = problemOf(error)
    throw error
  } finally {
    busy.value = false
  }
}

async function confirm() {
  try {
    const result = await call('confirm', 'confirm_order', {
      name: doc.value.name,
      modified: doc.value.modified,
    })
    reviewOpen.value = false
    toast.success(
      result.already
        ? __('This purchase was already confirmed')
        : __('Purchase confirmed. It now waits in To receive.'),
    )
    await load()
  } catch {
    reviewOpen.value = false
  }
}

async function receive() {
  try {
    const result = await call('receive', 'start_receipt', {
      name: doc.value.name,
    })
    window.location.assign(scannerReceiptUrl(result.receipt, doc.value.name))
  } catch {
    /* problem shown */
  }
}

function runAction(action) {
  if (action.key === 'confirm') {
    if (editing.value) return
    reviewOpen.value = true
  } else if (action.key === 'receive') receive()
  else if (action.key === 'edit') startEditing()
}
function resolve(action) {
  const fix = action.resolve
  if (!fix) return
  if (fix.kind === 'edit') return startEditing()
  if (fix.kind === 'handoff') openHandoff(fix.action, fix.label, action.reason)
}
function openHandoff(action, title, reason) {
  Object.assign(handoff, { open: true, action, title, reason })
}
async function recheck() {
  await loadComprasBoot({ refresh: true })
  await load()
}

async function compare() {
  const mine = { ...form, items: form.items.map((row) => ({ ...row })) }
  let current
  try {
    current = await loadWholeOrder(comprasApi, props.name)
  } catch (error) {
    problem.value = problemOf(error)
    return
  }
  const document = current.document || {}
  const diffs = [
    [
      __('Supplier', null, 'Compras'),
      mine.supplier_label || mine.supplier,
      document.party,
    ],
    [__('Company', null, 'Compras'), mine.company, document.company],
    [
      __('Destination warehouse', null, 'Compras'),
      mine.set_warehouse,
      document.set_warehouse,
    ],
    [
      __('Delivery date', null, 'Compras'),
      mine.schedule_date,
      document.schedule_date,
    ],
    [
      __('Items', null, 'Compras'),
      mine.items.length,
      current.rows_scope?.total,
    ],
    [
      __('Quantities', null, 'Compras'),
      mine.items.map((row) => `${row.item_code}×${row.qty}`).join(', '),
      current.rows.map((row) => `${row.item_code}×${row.qty}`).join(', '),
    ],
  ]
    .filter(([, a, b]) => String(a ?? '') !== String(b ?? ''))
    .map(([label, a, b]) => ({ label, mine: a, current: b }))
  conflict.value = { diffs, current, mine }
  problem.value = null
}
function useCurrent() {
  data.value = conflict.value.current
  rows.value = conflict.value.current.rows
  clearDraft(draftKey.value)
  conflict.value = null
  editing.value = false
  Object.assign(form, formFrom(data.value))
}
function reapply() {
  const current = conflict.value.current
  data.value = current
  rows.value = current.rows
  // Rows the other person removed come back as new rows of the same item,
  // except rows of a purchase request: those are listed, never recreated
  // without their link.
  const { items, dropped } = reapplyRows(form.items, current.rows)
  form.items = items
  form.modified = current.document.modified
  form.row_total = current.rows.length
  conflict.value = null
  editing.value = true
  if (dropped.length) {
    problem.value = {
      kind: 'error',
      title: __('Review before saving'),
      detail: __(
        'These request rows were removed by someone else and were not added back: {0}. Prepare them again from their request if they are still needed.',
        [
          dropped
            .map((row) => `${row.item_code} (${row.material_request})`)
            .join(', '),
        ],
      ),
    }
    return
  }
  save()
}

function goBack() {
  if (returnTo.value) return window.location.assign(returnTo.value)
  const list = typeof route.query.list === 'string' ? route.query.list : ''
  if (list.startsWith('/compras')) return router.push(list)
  router.push({ name: 'Compras' })
}

async function handleDone() {
  const done = parseDone(route.query.done)
  if (!done) return
  doneNotice.value =
    done.doctype === 'Purchase Receipt'
      ? __(
          'Receipt {0} confirmed. Stock is updated; see what is still missing below.',
          [done.name],
        )
      : __('{0} saved.', [done.name])
  const query = { ...route.query }
  delete query.done
  router.replace({ query })
}

watch(
  () => props.name,
  () => {
    loaded.value = false
    editing.value = false
    data.value = {}
    rows.value = []
    load()
  },
)
onMounted(async () => {
  await loadComprasBoot()
  if (!boot.value?.enabled) {
    guard.value = {
      title: __('Compras is not available'),
      detail:
        boot.value?.reason ||
        __(
          'Ask your manager for access to purchase orders or purchase requests.',
        ),
    }
    return
  }
  if (isNew.value) Object.assign(form, blankForm())
  if (isNew.value && pendingSave(draftKey.value)) {
    // A creation was sent before this reload and never answered: ask the
    // server about that same operation before allowing another.
    const stored = loadDraft(draftKey.value)
    if (stored) Object.assign(form, stored.form)
    loaded.value = true
    editing.value = true
    await save()
    return
  }
  comprasApi('companies')
    .then((rows) => {
      companies.value = rows
      if (!form.company && rows.length === 1) form.company = rows[0].value
    })
    .catch(() => {})
  await handleDone()
  await load()
})
</script>
