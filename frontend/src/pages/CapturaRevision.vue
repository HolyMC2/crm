<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-4xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
      <nav class="mb-3">
        <button
          type="button"
          class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          @click="goBack"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{ backLabel }}
        </button>
      </nav>

      <section
        v-if="loadError && !review"
        role="alert"
        class="mx-auto max-w-xl space-y-4 py-6"
      >
        <h1 class="text-xl font-semibold">
          {{ __('We could not open this capture') }}
        </h1>
        <p class="text-base text-ink-gray-7">{{ loadError }}</p>
        <div class="flex flex-wrap gap-2">
          <Button
            class="min-h-11 sm:min-h-8"
            :label="__('Try again')"
            @click="load"
          />
          <Button
            class="min-h-11 sm:min-h-8"
            :label="backLabel"
            @click="goBack"
          />
        </div>
      </section>

      <div
        v-else-if="!review"
        role="status"
        class="py-10 text-sm text-ink-gray-6"
      >
        {{ __('Loading capture…') }}
      </div>

      <template v-else>
        <!-- Header: what is being captured, from which paper. -->
        <header class="mb-4 flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm text-ink-gray-6">
              {{ [review.doc_label, review.name].filter(Boolean).join(' · ') }}
              <Badge class="ml-1" :theme="status.theme" :label="status.label" />
            </p>
            <h1 class="truncate text-2xl font-semibold text-ink-gray-9">
              {{
                review.supplier?.title ||
                review.payment?.invoice?.supplier_name ||
                review.supplier?.read_as ||
                review.doc_label ||
                __('Capture document')
              }}
            </h1>
            <p v-if="review.company" class="mt-1 text-sm text-ink-gray-6">
              {{ review.company }}
            </p>
          </div>
          <a
            v-if="review.file?.url"
            :href="review.file.url"
            target="_blank"
            rel="noopener"
            class="flex min-h-11 items-center gap-1 text-sm text-ink-blue-link underline sm:min-h-0"
          >
            <FeatherIcon name="external-link" class="h-4 w-4" />
            {{ __('Open original') }}
          </a>
        </header>

        <p
          v-if="duplicate"
          role="status"
          class="mb-4 rounded-lg bg-surface-gray-2 p-3 text-sm text-ink-gray-8"
        >
          {{ __('You already captured this document; this is that capture.') }}
        </p>
        <p
          v-if="problem"
          role="alert"
          class="mb-4 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          {{ problem }}
        </p>

        <!-- Already turned into a draft: open it. -->
        <section
          v-if="review.created"
          class="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-surface-green-1 p-4"
        >
          <p class="min-w-0 flex-1 text-base text-ink-green-8">
            {{
              __('Draft created: {0} {1}', [
                review.created.label,
                review.created.name,
              ])
            }}
          </p>
          <Button
            variant="solid"
            class="min-h-11 sm:min-h-8"
            :label="__('Open draft')"
            @click="openDraft(review.created)"
          />
        </section>

        <!-- The pipeline is still reading the paper. -->
        <section
          v-else-if="review.processing"
          role="status"
          class="mb-4 space-y-3 rounded-xl border border-outline-gray-2 p-4"
        >
          <template v-if="!timedOut">
            <p class="flex items-center gap-2 text-base text-ink-gray-9">
              <FeatherIcon name="loader" class="h-5 w-5 animate-spin" />
              {{ __('Reading the document…') }}
            </p>
            <p class="text-sm text-ink-gray-6">
              {{
                __(
                  'It usually takes 10 to 60 seconds. You can wait here; the capture is saved.',
                )
              }}
            </p>
          </template>
          <template v-else>
            <p class="text-base text-ink-gray-9">
              {{
                __(
                  'It is still being read after 4 minutes. The reading service may be busy; the capture is saved, look again in a moment.',
                )
              }}
            </p>
            <div class="flex flex-wrap gap-2">
              <Button
                class="min-h-11 sm:min-h-8"
                :label="__('Look again')"
                @click="lookAgain"
              />
              <Button
                class="min-h-11 sm:min-h-8"
                :label="__('Discard')"
                :loading="busy === 'discard'"
                :disabled="Boolean(busy)"
                @click="discard"
              />
            </div>
          </template>
        </section>

        <!-- The pipeline could not read it. -->
        <section
          v-else-if="review.error"
          role="alert"
          class="mb-4 space-y-3 rounded-xl bg-surface-red-1 p-4 text-ink-red-7"
        >
          <p class="text-base font-medium">
            {{ __('We could not read this document.') }}
          </p>
          <p class="text-sm">{{ review.error }}</p>
          <div class="flex flex-wrap gap-2">
            <Button
              class="min-h-11 sm:min-h-8"
              :label="__('Discard')"
              :loading="busy === 'discard'"
              :disabled="Boolean(busy)"
              @click="discard"
            />
            <Button
              class="min-h-11 sm:min-h-8"
              :label="backLabel"
              @click="goBack"
            />
          </div>
        </section>

        <template v-if="!review.processing && !review.error">
          <!-- Supplier (orders and bills). -->
          <section
            v-if="isPurchase"
            class="mb-4 space-y-2 rounded-xl border border-outline-gray-2 p-4"
            :aria-label="__('Supplier', null, 'Compras')"
          >
            <h2 class="text-base font-semibold text-ink-gray-9">
              {{ __('Supplier', null, 'Compras') }}
            </h2>
            <p v-if="review.supplier?.read_as" class="text-sm text-ink-gray-6">
              {{ __('The document says: {0}', [review.supplier.read_as]) }}
            </p>
            <ComprasPicker
              v-if="canEdit"
              :model-value="review.supplier?.name || ''"
              :display="review.supplier?.title || review.supplier?.name || ''"
              :label="__('Supplier', null, 'Compras')"
              :placeholder="__('Search supplier')"
              :empty-text="__('No supplier you can use matches.')"
              :invalid="!review.supplier?.name"
              :disabled="Boolean(busy)"
              :load="(q) => searchFor('supplier', q)"
              @pick="(o) => act('set_supplier', { supplier: o.value })"
            />
            <p v-else class="text-base text-ink-gray-9">
              {{
                review.supplier?.title ||
                review.supplier?.name ||
                __('No supplier chosen')
              }}
            </p>
          </section>

          <!-- Payment (a transfer receipt against a bill). -->
          <section
            v-if="review.payment"
            class="mb-4 space-y-3 rounded-xl border border-outline-gray-2 p-4"
            :aria-label="__('Payment', null, 'Gastos')"
          >
            <h2 class="text-base font-semibold text-ink-gray-9">
              {{ __('Payment', null, 'Gastos') }}
            </h2>
            <div
              v-if="review.payment.invoice"
              class="rounded-lg bg-surface-gray-2 p-3 text-sm text-ink-gray-8"
            >
              <p class="font-medium text-ink-gray-9">
                {{
                  [
                    review.payment.invoice.name,
                    review.payment.invoice.supplier_name ||
                      review.payment.invoice.supplier,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                }}
              </p>
              <p class="tabular-nums">
                {{
                  __('Bill total {0} · owed {1}', [
                    money(
                      review.payment.invoice.grand_total,
                      review.payment.invoice.currency,
                    ),
                    money(
                      review.payment.invoice.outstanding_amount,
                      review.payment.invoice.currency,
                    ),
                  ])
                }}
              </p>
            </div>
            <template v-if="canEdit">
              <FormControl
                v-model="payForm.bank_account"
                type="select"
                :label="__('Company account that paid')"
                :options="[
                  { label: __('Choose an account'), value: '' },
                  ...(review.payment.accounts || []).map((a) => ({
                    label: a.label,
                    value: a.name,
                  })),
                ]"
              />
              <p
                v-if="!(review.payment.accounts || []).length"
                class="text-sm text-ink-amber-9"
              >
                {{
                  __(
                    'This company has no active bank account you can use. Ask for it to be set up.',
                  )
                }}
              </p>
              <div class="grid gap-3 sm:grid-cols-3">
                <FormControl
                  v-model="payForm.amount"
                  type="number"
                  :label="__('Amount paid')"
                  :min="0"
                  :step="0.01"
                />
                <FormControl
                  v-model="payForm.posting_date"
                  type="date"
                  :label="__('Payment date')"
                />
                <FormControl
                  v-model="payForm.reference"
                  type="text"
                  :label="__('Reference (optional)')"
                />
              </div>
              <Button
                class="min-h-11 sm:min-h-8"
                :label="__('Save payment details')"
                :loading="busy === 'set_payment'"
                :disabled="Boolean(busy) || !payDirty"
                @click="savePayment"
              />
            </template>
            <dl v-else class="grid gap-1 text-sm text-ink-gray-8">
              <div>
                <dt class="inline text-ink-gray-6">{{ __('Amount paid') }}:</dt>
                <dd class="inline tabular-nums">
                  {{ money(review.payment.amount, totals.currency) }}
                </dd>
              </div>
              <div v-if="review.payment.posting_date">
                <dt class="inline text-ink-gray-6">
                  {{ __('Payment date') }}:
                </dt>
                <dd class="inline">{{ review.payment.posting_date }}</dd>
              </div>
              <div v-if="review.payment.reference">
                <dt class="inline text-ink-gray-6">
                  {{ __('Reference', null, 'Captura') }}:
                </dt>
                <dd class="inline">{{ review.payment.reference }}</dd>
              </div>
            </dl>
          </section>

          <!-- Lines: each one mapped to an item, created, or left out. -->
          <section
            v-if="review.lines?.length"
            class="mb-4 space-y-3"
            :aria-label="__('Lines', null, 'Captura')"
          >
            <h2 class="text-base font-semibold text-ink-gray-9">
              {{ __('Lines', null, 'Captura') }}
              <span class="font-normal text-ink-gray-6">
                {{
                  pending.length
                    ? __('· {0} waiting for an item', [pending.length])
                    : ''
                }}
              </span>
            </h2>
            <ul class="space-y-2">
              <li
                v-for="line in review.lines"
                :key="line.idx"
                class="space-y-2 rounded-xl border border-outline-gray-2 p-3"
                :class="line.state === 'dropped' ? 'bg-surface-gray-1' : ''"
              >
                <div class="flex flex-wrap items-start gap-2">
                  <p
                    class="min-w-0 flex-1 text-base text-ink-gray-9"
                    :class="
                      line.state === 'dropped'
                        ? 'text-ink-gray-5 line-through'
                        : ''
                    "
                  >
                    {{ line.description || __('No description') }}
                  </p>
                  <Badge
                    :theme="lineStateTheme(line.state)"
                    :label="lineStateLabel(line.state)"
                  />
                </div>
                <p class="text-sm tabular-nums text-ink-gray-6">
                  {{ qtyText(line.qty) }} ×
                  {{ money(line.rate, totals.currency) }} =
                  <strong class="text-ink-gray-9">{{
                    money(line.amount, totals.currency)
                  }}</strong>
                </p>

                <!-- Mapped: the item, and a way to change it. -->
                <div
                  v-if="line.state === 'mapped' && !changing[line.idx]"
                  class="flex flex-wrap items-center gap-2 text-sm"
                >
                  <FeatherIcon name="package" class="h-4 w-4 text-ink-gray-6" />
                  <span class="min-w-0 flex-1 text-ink-gray-9">
                    {{ line.item_name || line.item_code }}
                    <span
                      v-if="line.item_name && line.item_name !== line.item_code"
                      class="text-ink-gray-6"
                      >({{ line.item_code }})</span
                    >
                  </span>
                  <Button
                    v-if="canEdit"
                    class="min-h-11 sm:min-h-8"
                    :label="__('Change', null, 'Captura')"
                    :disabled="Boolean(busy)"
                    @click="changing[line.idx] = true"
                  />
                </div>

                <!-- Waiting (or changing): candidates, create, search. -->
                <div
                  v-else-if="line.state !== 'dropped' && canEdit"
                  class="space-y-2"
                >
                  <div
                    v-if="line.candidates?.length"
                    class="flex flex-wrap gap-2"
                  >
                    <span class="w-full text-sm text-ink-gray-6">{{
                      __('Is it one of these?')
                    }}</span>
                    <Button
                      v-for="c in line.candidates"
                      :key="c.item_code"
                      class="min-h-11 sm:min-h-8"
                      :label="c.item_name || c.item_code"
                      :disabled="Boolean(busy)"
                      @click="mapLine(line, c.item_code)"
                    />
                  </div>
                  <div
                    v-if="line.state === 'new' && review.can?.create_item"
                    class="flex flex-wrap items-end gap-2"
                  >
                    <FormControl
                      v-model="newNames[line.idx]"
                      class="min-w-0 flex-1"
                      type="text"
                      :label="__('New item name')"
                      :maxlength="140"
                    />
                    <Button
                      class="min-h-11 sm:min-h-8"
                      icon-left="plus"
                      :label="__('Create item')"
                      :loading="busy === `create_item:${line.idx}`"
                      :disabled="Boolean(busy) || !newName(line)"
                      @click="createItem(line)"
                    />
                  </div>
                  <ComprasPicker
                    model-value=""
                    :label="__('Search item')"
                    :placeholder="__('Search item, code or barcode')"
                    :empty-text="__('No item you can use matches.')"
                    clear-on-pick
                    :disabled="Boolean(busy)"
                    :load="(q) => searchFor('item', q)"
                    @pick="(o) => mapLine(line, o.value)"
                  />
                  <Button
                    v-if="changing[line.idx]"
                    class="min-h-11 sm:min-h-8"
                    variant="ghost"
                    :label="__('Keep {0}', [line.item_name || line.item_code])"
                    @click="changing[line.idx] = false"
                  />
                </div>

                <div v-if="canEdit" class="flex justify-end">
                  <Button
                    v-if="line.state === 'dropped'"
                    class="min-h-11 sm:min-h-8"
                    variant="ghost"
                    icon-left="rotate-ccw"
                    :label="__('Restore')"
                    :disabled="Boolean(busy)"
                    @click="act('drop_line', { idx: line.idx, dropped: 0 })"
                  />
                  <Button
                    v-else
                    class="min-h-11 sm:min-h-8"
                    variant="ghost"
                    icon-left="x"
                    :label="__('Leave out')"
                    :disabled="Boolean(busy)"
                    @click="act('drop_line', { idx: line.idx, dropped: 1 })"
                  />
                </div>
              </li>
            </ul>
          </section>

          <!-- Warehouse, when stock items need one. -->
          <section
            v-if="review.warehouse?.required"
            class="mb-4 space-y-2 rounded-xl border border-outline-gray-2 p-4"
          >
            <FormControl
              v-if="canEdit"
              :model-value="review.warehouse.value || ''"
              type="select"
              :label="__('Destination warehouse', null, 'Compras')"
              :disabled="Boolean(busy)"
              :options="[
                { label: __('Choose a warehouse'), value: '' },
                ...(review.warehouse.options || []).map((w) => ({
                  label: w.label,
                  value: w.name,
                })),
              ]"
              @update:model-value="
                (value) => value && act('set_warehouse', { warehouse: value })
              "
            />
            <p v-else class="text-base text-ink-gray-9">
              {{ review.warehouse.value }}
            </p>
            <p v-if="review.warehouse.reason" class="text-sm text-ink-amber-9">
              {{ review.warehouse.reason }}
            </p>
          </section>

          <!-- Totals check: lines + shipping + tax against the paper. A payment
               has no lines: its panel shows the amount against the invoice. -->
          <section
            v-if="review.doc_type !== 'Payment Entry'"
            class="mb-4 space-y-2 rounded-xl border border-outline-gray-2 p-4"
            :aria-label="__('Totals')"
          >
            <div class="flex items-center gap-2">
              <h2 class="flex-1 text-base font-semibold text-ink-gray-9">
                {{ __('Totals') }}
              </h2>
              <Badge
                :theme="totals.verdict.theme"
                :label="totals.verdict.label"
              />
            </div>
            <dl class="space-y-1 text-sm">
              <div
                v-for="row in totals.rows"
                :key="row.key"
                class="flex justify-between gap-3"
              >
                <dt class="text-ink-gray-6">{{ row.label }}</dt>
                <dd class="tabular-nums text-ink-gray-9">
                  {{ money(row.amount, totals.currency) }}
                </dd>
              </div>
              <div
                class="flex justify-between gap-3 border-t border-outline-gray-1 pt-1"
              >
                <dt class="text-ink-gray-6">{{ __('Sum') }}</dt>
                <dd class="tabular-nums font-medium text-ink-gray-9">
                  {{ money(totals.sum, totals.currency) }}
                </dd>
              </div>
              <div v-if="totals.document" class="flex justify-between gap-3">
                <dt class="text-ink-gray-6">{{ __('Document total') }}</dt>
                <dd class="tabular-nums font-medium text-ink-gray-9">
                  {{ money(totals.document, totals.currency) }}
                </dd>
              </div>
              <div
                v-if="totals.matches === false && totals.difference"
                class="flex justify-between gap-3 text-ink-red-7"
              >
                <dt>{{ __('Difference') }}</dt>
                <dd class="tabular-nums">
                  {{ money(totals.difference, totals.currency) }}
                </dd>
              </div>
              <div
                v-if="totals.draft !== null"
                class="flex justify-between gap-3"
              >
                <dt class="text-ink-gray-6">{{ __('Draft total') }}</dt>
                <dd class="tabular-nums font-medium text-ink-gray-9">
                  {{ money(totals.draft, totals.currency) }}
                </dd>
              </div>
            </dl>
          </section>

          <section
            v-if="review.checks?.length"
            class="mb-4 space-y-1 rounded-xl bg-surface-amber-1 p-4 text-sm text-ink-amber-9"
            :aria-label="__('To check')"
          >
            <h2 class="font-semibold">{{ __('To check') }}</h2>
            <ul class="list-disc space-y-1 pl-5">
              <li v-for="(check, i) in review.checks" :key="i">{{ check }}</li>
            </ul>
          </section>
          <section
            v-if="review.questions?.length"
            class="mb-4 space-y-1 rounded-xl border border-outline-gray-2 p-4 text-sm"
            :aria-label="__('Questions')"
          >
            <h2 class="font-semibold text-ink-gray-9">{{ __('Questions') }}</h2>
            <ul class="list-disc space-y-1 pl-5 text-ink-gray-8">
              <li v-for="q in review.questions" :key="q.n ?? q.text">
                {{ q.text }}
              </li>
            </ul>
          </section>

          <!-- The one next action. -->
          <footer
            v-if="!review.created && review.status !== 'Descartado'"
            class="space-y-3 border-t border-outline-gray-2 pt-4"
          >
            <ul
              v-if="review.can?.blockers?.length"
              class="space-y-1 text-sm text-ink-gray-7"
              :aria-label="__('Before creating the draft')"
            >
              <li
                v-for="(blocker, i) in review.can.blockers"
                :key="i"
                class="flex gap-2"
              >
                <FeatherIcon
                  name="alert-circle"
                  class="mt-0.5 h-4 w-4 shrink-0 text-ink-amber-9"
                />
                {{ blocker }}
              </li>
            </ul>
            <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <template v-if="confirmDiscard">
                <span class="self-center text-sm text-ink-gray-7">{{
                  __('Discard this capture?')
                }}</span>
                <Button
                  class="min-h-11 sm:min-h-8"
                  :label="__('Keep it')"
                  @click="confirmDiscard = false"
                />
                <Button
                  class="min-h-11 sm:min-h-8"
                  theme="red"
                  :label="__('Discard')"
                  :loading="busy === 'discard'"
                  :disabled="Boolean(busy)"
                  @click="discard"
                />
              </template>
              <Button
                v-else-if="canEdit"
                class="min-h-11 sm:min-h-8"
                :label="__('Discard')"
                :disabled="Boolean(busy)"
                @click="confirmDiscard = true"
              />
              <Button
                variant="solid"
                class="min-h-11 sm:min-h-8"
                :label="__('Create draft')"
                :loading="busy === 'create_draft'"
                :disabled="Boolean(busy) || !canCreate"
                @click="createDraft"
              />
            </div>
          </footer>
          <p
            v-else-if="review.status === 'Descartado'"
            class="text-sm text-ink-gray-6"
          >
            {{ __('This capture was discarded.') }}
          </p>
        </template>
      </template>
    </div>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FeatherIcon, FormControl, toast } from 'frappe-ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import { money, qty as qtyText } from '@/composables/useCompras'
import {
  POLL_LIMIT_MS,
  POLL_MS,
  capturaApi,
  capturaMessage,
  capturaReturn,
  captureStatus,
  draftTarget,
  lineStateLabel,
  lineStateTheme,
  pendingLines,
  totalsSummary,
} from '@/composables/useCaptura'

// «Capturar documento» review: what the books pipeline read from the paper,
// fixed by the worker, then one draft record (never submitted).
const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()

const review = ref(null)
const loadError = ref('')
const problem = ref('')
const busy = ref('')
const timedOut = ref(false)
const confirmDiscard = ref(false)
const changing = reactive({})
const newNames = reactive({})
const payForm = reactive({
  bank_account: '',
  amount: '',
  posting_date: '',
  reference: '',
})
let paySeen = ''
let pollStart = 0
let timer = 0
let ticket = 0

const back = computed(() => capturaReturn(route.query))
const backLabel = computed(() =>
  back.value
    ? __('Back to {0}', [back.value.label])
    : __('Compras', null, 'Compras'),
)
const duplicate = computed(() => route.query.duplicate === '1')
const status = computed(() => captureStatus(review.value))
const totals = computed(() => totalsSummary(review.value?.totals))
const pending = computed(() => pendingLines(review.value?.lines))
const isPurchase = computed(() =>
  ['Purchase Order', 'Purchase Invoice'].includes(review.value?.doc_type),
)
const canEdit = computed(() => Boolean(review.value?.can?.edit))
const canCreate = computed(() => Boolean(review.value?.can?.create_draft))
const payDirty = computed(() => {
  const p = review.value?.payment
  if (!p) return false
  return (
    (payForm.bank_account || '') !== (p.bank_account || '') ||
    Number(payForm.amount || 0) !== Number(p.amount || 0) ||
    (payForm.posting_date || '') !== (p.posting_date || '') ||
    (payForm.reference || '') !== (p.reference || '')
  )
})

// Pickers search with the requester's own read permissions (capture search).
function searchFor(kind, txt) {
  return capturaApi('search', { name: props.name, kind, txt })
}

function newName(line) {
  return String(newNames[line.idx] ?? '').trim()
}

// The payment form follows the server unless the worker is typing in it.
function syncPayForm(data) {
  const p = data?.payment
  if (!p) return
  const seen = JSON.stringify([
    p.bank_account,
    p.amount,
    p.posting_date,
    p.reference,
  ])
  if (seen === paySeen) return
  paySeen = seen
  Object.assign(payForm, {
    bank_account: p.bank_account || '',
    amount: p.amount || '',
    posting_date: p.posting_date || '',
    reference: p.reference || '',
  })
}

function apply(data) {
  if (!data) return
  review.value = data
  loadError.value = ''
  syncPayForm(data)
  for (const line of data.lines || []) {
    if (line.state !== 'mapped') delete changing[line.idx]
    else if (changing[line.idx] === undefined) changing[line.idx] = false
    if (newNames[line.idx] === undefined)
      newNames[line.idx] = String(line.description || '').slice(0, 140)
  }
  schedule()
}

function schedule() {
  window.clearTimeout(timer)
  if (!review.value?.processing) {
    pollStart = 0
    timedOut.value = false
    return
  }
  if (!pollStart) pollStart = Date.now()
  if (Date.now() - pollStart > POLL_LIMIT_MS) {
    timedOut.value = true
    return
  }
  timer = window.setTimeout(poll, POLL_MS)
}

async function poll() {
  const mine = ticket
  try {
    const data = await capturaApi('review', { name: props.name })
    if (mine === ticket) apply(data)
  } catch {
    // A missed poll is retried on the next tick until the limit.
    if (mine === ticket) schedule()
  }
}

async function load() {
  const mine = ++ticket
  window.clearTimeout(timer)
  loadError.value = ''
  pollStart = 0
  timedOut.value = false
  try {
    const data = await capturaApi('review', { name: props.name })
    if (mine === ticket) apply(data)
  } catch (error) {
    if (mine === ticket) loadError.value = capturaMessage(error)
  }
}

function lookAgain() {
  timedOut.value = false
  pollStart = Date.now()
  poll()
}

/** One review action at a time; every action answers with the whole review. */
async function act(method, args = {}, key = method) {
  if (busy.value) return null
  busy.value = key
  problem.value = ''
  const mine = ticket
  try {
    const data = await capturaApi(method, { name: props.name, ...args })
    if (mine === ticket) apply(data)
    return data
  } catch (error) {
    if (mine === ticket) problem.value = capturaMessage(error)
    return null
  } finally {
    busy.value = ''
  }
}

async function mapLine(line, itemCode) {
  if (!itemCode) return
  const data = await act('map_line', { idx: line.idx, item_code: itemCode })
  if (data) changing[line.idx] = false
}

function createItem(line) {
  const name = newName(line)
  if (!name) return
  return act(
    'create_item',
    { idx: line.idx, item_name: name },
    `create_item:${line.idx}`,
  )
}

function paymentArgs() {
  return {
    bank_account: payForm.bank_account || null,
    amount: payForm.amount === '' ? null : payForm.amount,
    posting_date: payForm.posting_date || null,
    reference: payForm.reference ?? '',
  }
}
function savePayment() {
  return act('set_payment', paymentArgs())
}

async function createDraft() {
  // Typed payment details go first, so the draft is built from them.
  if (review.value?.payment && payDirty.value) {
    const saved = await act('set_payment', paymentArgs())
    if (!saved || !saved.can?.create_draft) return
  }
  const data = await act('create_draft')
  // Not created: the review now carries what is still missing (e.g. a
  // warehouse question); it is already on screen.
  if (data?.created) openDraft(data.created)
}

function openDraft(created) {
  const target = draftTarget(created, {
    returnTo: route.query.return_to,
    returnLabel: route.query.return_label,
  })
  if (!target) {
    problem.value = __('This draft cannot be opened from here.')
    return
  }
  if (target.kind === 'router') router.push(target.to)
  else window.location.assign(target.href)
}

async function discard() {
  const data = await act('discard')
  confirmDiscard.value = false
  if (!data) return
  toast.success(__('Capture discarded'))
  if (back.value) goBack()
}

function goBack() {
  const to = back.value?.to
  if (to) {
    // Shell pages without reloading; other apps as a page load.
    if (to.startsWith('/crm/')) return router.push(to.slice(4))
    return window.location.assign(to)
  }
  const type = review.value?.doc_type
  router.push({
    name: type === 'Purchase Order' || !type ? 'Compras' : 'Gastos',
  })
}

watch(
  () => props.name,
  () => {
    review.value = null
    problem.value = ''
    confirmDiscard.value = false
    paySeen = ''
    for (const key of Object.keys(changing)) delete changing[key]
    for (const key of Object.keys(newNames)) delete newNames[key]
    load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  ticket++
  window.clearTimeout(timer)
})
</script>
