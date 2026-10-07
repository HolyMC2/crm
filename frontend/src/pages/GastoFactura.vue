<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-4xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
      <nav class="mb-3">
        <button
          class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          @click="goBack"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{ __('Gastos', null, 'Gastos') }}
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
          <Button :label="__('Retry', null, 'Gastos')" @click="load" />
          <Button :label="__('Back to Gastos')" @click="goBack" />
        </div>
      </section>

      <div v-else-if="loading && !loaded" role="status" class="py-10 text-sm">
        {{ __('Loading bill…') }}
      </div>

      <template v-else-if="loaded">
        <!-- Header: who, how much, when — and the one next action. -->
        <header class="mb-4 flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm text-ink-gray-6">
              {{ doc.bill_no ? `${doc.bill_no} · ${doc.name}` : doc.name }}
              <Badge
                class="ml-1"
                :theme="statusTheme"
                :label="statusLabel(doc)"
              />
            </p>
            <h1 class="truncate text-2xl font-semibold text-ink-gray-9">
              {{ doc.party || __('Supplier not visible') }}
            </h1>
            <p class="mt-1 text-sm text-ink-gray-6">
              {{
                [doc.company, doc.date && __('dated {0}', [doc.date])]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </p>
          </div>
          <div class="flex flex-col items-end gap-1">
            <span class="text-xl font-semibold tabular-nums text-ink-gray-9">{{
              money(doc.total, doc.currency)
            }}</span>
            <span
              v-if="Number(doc.docstatus) === 1"
              class="text-sm"
              :class="doc.overdue ? 'text-ink-red-7' : 'text-ink-gray-6'"
              >{{ dueLabel(doc.due_date, boot?.today) }}</span
            >
          </div>
        </header>

        <div
          v-if="notice"
          role="status"
          class="mb-4 rounded-lg bg-surface-green-1 p-3 text-sm text-ink-green-8"
        >
          {{ notice }}
        </div>
        <div
          v-if="problem"
          role="alert"
          class="mb-4 space-y-2 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <p>
            <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button
              v-if="problem.kind === 'conflict' || problem.kind === 'offline'"
              :label="problem.action"
              @click="refresh"
            />
            <Button
              :label="__('Ask for a review')"
              @click="ask('review', problem.detail)"
            />
          </div>
        </div>

        <!-- Progress and the next step. -->
        <section
          class="mb-4 rounded-xl border border-outline-gray-2 p-4"
          :aria-label="__('Payment', null, 'Gastos')"
        >
          <p
            v-if="Number(doc.docstatus) === 1"
            class="text-base font-medium text-ink-gray-9"
          >
            {{ paidLabel(doc) }}
          </p>
          <p v-else class="text-base text-ink-gray-8">
            {{
              Number(doc.docstatus) === 0
                ? __(
                    'Draft: review supplier, amounts and taxes, then register it so it can be paid.',
                  )
                : __('This bill is cancelled.')
            }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <template v-for="action in actions" :key="action.key">
              <Button
                v-if="action.key === 'submit' && action.allowed"
                variant="solid"
                class="min-h-11 sm:min-h-8"
                :label="__('Review and register')"
                @click="reviewOpen = true"
              />
              <Button
                v-else-if="action.key === 'pay' && action.allowed"
                variant="solid"
                class="min-h-11 sm:min-h-8"
                :label="__('Pay', null, 'Gastos')"
                @click="payOpen = true"
              />
              <template v-else-if="action.fallback">
                <p class="w-full text-sm text-ink-gray-7">
                  {{ action.reason }}
                </p>
                <Button
                  v-if="action.fallback === 'release'"
                  variant="solid"
                  class="min-h-11 sm:min-h-8"
                  :loading="busy"
                  :label="__('Release hold')"
                  @click="releaseHold"
                />
                <Button
                  v-else
                  variant="solid"
                  class="min-h-11 sm:min-h-8"
                  :label="
                    action.fallback === 'review'
                      ? __('Ask for a review')
                      : __('Ask for approval')
                  "
                  @click="ask(action.fallback, action.reason)"
                />
              </template>
            </template>
            <a
              v-if="boot?.capabilities?.desk"
              class="inline-flex min-h-11 items-center px-2 text-sm text-ink-blue-link underline sm:min-h-8"
              :href="`/app/purchase-invoice/${encodeURIComponent(doc.name)}`"
              >{{ __('Open the full bill form') }}</a
            >
          </div>
          <div
            v-if="data.assignments?.length"
            class="mt-3 text-sm text-ink-gray-7"
          >
            {{
              __('Waiting on: {0}', [
                data.assignments.map((a) => a.full_name).join(', '),
              ])
            }}
          </div>
        </section>

        <div class="grid gap-4 sm:grid-cols-2">
          <!-- Payments and their bank side (matched in Contador). -->
          <section class="rounded-xl border border-outline-gray-2 p-4">
            <h2 class="mb-2 text-base font-semibold">
              {{ __('Payments', null, 'Gastos') }}
            </h2>
            <p v-if="!data.payments?.length" class="text-sm text-ink-gray-6">
              {{ __('No payments yet.') }}
            </p>
            <ul v-else class="space-y-3">
              <li v-for="p in data.payments" :key="p.name" class="text-sm">
                <span class="block font-medium tabular-nums text-ink-gray-9">
                  {{ money(p.amount, p.currency) }} · {{ p.posting_date }}
                </span>
                <span class="block text-ink-gray-6">
                  {{
                    [p.reference_no, p.mode_of_payment, p.name]
                      .filter(Boolean)
                      .join(' · ')
                  }}
                </span>
                <span
                  class="mt-0.5 flex flex-wrap items-center gap-2 text-ink-gray-7"
                >
                  <Badge
                    :theme="p.reconciled ? 'green' : 'gray'"
                    :label="bankLabel(p)"
                  />
                  <a
                    v-if="bankAllowed"
                    class="min-h-11 py-2 text-ink-blue-link underline sm:min-h-0 sm:py-0"
                    :href="bankUrl(p.name, doc.name)"
                    >{{ __('See in bank') }}</a
                  >
                </span>
              </li>
            </ul>
            <p
              v-if="data.payments?.length && !bankAllowed"
              class="mt-2 text-xs text-ink-gray-6"
            >
              {{
                __(
                  'Your accountant matches payments with the bank statement in Contador.',
                )
              }}
            </p>
          </section>

          <!-- Due dates, CFDI and where it came from. -->
          <section class="rounded-xl border border-outline-gray-2 p-4">
            <h2 class="mb-2 text-base font-semibold">
              {{ __('Bill details') }}
            </h2>
            <ul v-if="data.schedule?.length > 1" class="mb-3 space-y-1 text-sm">
              <li
                v-for="(term, i) in data.schedule"
                :key="i"
                class="flex justify-between gap-2"
              >
                <span>{{ __('Due {0}', [term.due_date]) }}</span>
                <span class="tabular-nums">
                  {{ money(term.amount, doc.currency) }}
                  <template v-if="term.outstanding > 0">
                    ·
                    {{
                      __('{0} owed', [money(term.outstanding, doc.currency)])
                    }}</template
                  >
                </span>
              </li>
            </ul>
            <p class="flex flex-wrap items-center gap-2 text-sm">
              <Badge
                :theme="doc.has_xml ? 'green' : 'orange'"
                :label="doc.has_xml ? __('With XML') : __('Without XML')"
              />
              <a
                v-if="!doc.has_xml && bankAllowed"
                class="text-ink-blue-link underline"
                :href="cfdiUrl"
                >{{ __('Link the CFDI in Contador') }}</a
              >
            </p>
            <template v-if="data.orders?.length">
              <h3 class="mb-1 mt-3 text-sm font-semibold">
                {{ __('From purchase orders') }}
              </h3>
              <RouterLink
                v-for="o in data.orders"
                :key="o.name"
                class="mr-2 inline-block min-h-11 py-2 text-sm text-ink-blue-link underline sm:min-h-0 sm:py-0"
                :to="{ name: 'CompraOrden', params: { name: o.name } }"
                >{{ o.name }}</RouterLink
              >
            </template>
            <h3 class="mb-1 mt-3 text-sm font-semibold">
              {{ __('Items', null, 'Gastos') }}
            </h3>
            <ul class="space-y-1 text-sm text-ink-gray-8">
              <li
                v-for="(item, i) in doc.items"
                :key="i"
                class="flex justify-between gap-2"
              >
                <span class="min-w-0 truncate"
                  >{{ item.qty }} {{ item.uom }} · {{ item.item_name }}</span
                >
                <span class="tabular-nums">{{
                  money(item.amount, doc.currency)
                }}</span>
              </li>
              <li
                v-if="doc.item_count > doc.items.length"
                class="text-ink-gray-6"
              >
                {{ __('{0} more lines', [doc.item_count - doc.items.length]) }}
              </li>
            </ul>
          </section>
        </div>
      </template>
    </div>

    <!-- «Revisar y registrar»: the bill's own submit. -->
    <Dialog
      v-model="reviewOpen"
      :options="{ title: __('Register this bill?') }"
    >
      <template #body-content>
        <p class="text-base text-ink-gray-7">
          {{
            __(
              '{0} for {1}. Once registered it is owed to the supplier and can be paid; changing it later means cancelling it.',
              [doc.party || doc.name, money(doc.total, doc.currency)],
            )
          }}
        </p>
      </template>
      <template #actions>
        <div class="flex flex-wrap justify-end gap-2">
          <Button
            :label="__('Cancel', null, 'Gastos')"
            @click="reviewOpen = false"
          />
          <Button
            variant="solid"
            :loading="busy"
            :label="__('Register', null, 'Gastos')"
            @click="submitBill"
          />
        </div>
      </template>
    </Dialog>

    <PayDialog
      v-model="payOpen"
      :name="props.name"
      :party="doc.party || ''"
      @paid="paid"
      @failed="(p) => (problem = p)"
      @release="releaseHold"
      @review="(reason) => ask('review', reason)"
      @setup="
        ask(
          'review',
          __('This company needs a bank or cash account to pay from.'),
        )
      "
    />
    <ApprovalDialog
      v-model="approval.open"
      :name="props.name"
      :action="approval.action"
      :reason="approval.reason"
      @sent="load"
    />
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, Dialog, FeatherIcon, toast } from 'frappe-ui'
import ApprovalDialog from '@/components/gastos/ApprovalDialog.vue'
import PayDialog from '@/components/gastos/PayDialog.vue'
import {
  bankLabel,
  bankUrl,
  dueLabel,
  gastosApi,
  gastosBoot,
  loadGastosBoot,
  money,
  outcomeUnknown,
  paidLabel,
  problemOf,
  requestId,
  statusLabel,
} from '@/composables/useGastos'

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const boot = gastosBoot
const data = ref({})
const loading = ref(false)
const loaded = ref(false)
const busy = ref(false)
const problem = ref(null)
const guard = ref(null)
const notice = ref('')
const reviewOpen = ref(false)
const payOpen = ref(false)
const approval = reactive({ open: false, action: '', reason: '' })
let submitRequest = null
let releaseRequest = null

const doc = computed(() => data.value.document || {})
const actions = computed(() => data.value.actions || [])
const bankAllowed = computed(() =>
  actions.value.some((a) => a.key === 'bank' && a.allowed),
)
const cfdiUrl = computed(() => {
  const query = new URLSearchParams({
    return_to: `/crm/gastos/factura/${encodeURIComponent(props.name)}`,
    return_label: 'Gastos',
  })
  return `/contador/cfdis?${query}`
})
const statusTheme = computed(() => {
  if (Number(doc.value.docstatus) === 0) return 'orange'
  if (Number(doc.value.docstatus) === 2) return 'red'
  if (Number(doc.value.outstanding_amount || 0) <= 0) return 'green'
  return doc.value.overdue ? 'red' : 'blue'
})
const listPath = computed(() =>
  typeof route.query.list === 'string' && route.query.list.startsWith('/gastos')
    ? route.query.list
    : '',
)

async function load() {
  loading.value = true
  guard.value = null
  try {
    data.value = await gastosApi('invoice', { name: props.name })
    loaded.value = true
  } catch (error) {
    const p = problemOf(error)
    if (!loaded.value || p.kind === 'permission') guard.value = p
    else problem.value = p
  } finally {
    loading.value = false
  }
}
function refresh() {
  problem.value = null
  load()
}

function ask(action, reason) {
  approval.action = action
  approval.reason = reason || ''
  approval.open = true
}

async function submitBill() {
  busy.value = true
  problem.value = null
  // Same id on a retry after an unknown outcome: one submit, never two.
  submitRequest ||= requestId()
  try {
    await gastosApi('submit_bill', {
      request_id: submitRequest,
      name: props.name,
      modified: doc.value.modified,
    })
    submitRequest = null
    reviewOpen.value = false
    toast.success(__('Bill registered. It is now in To pay.'))
    await load()
  } catch (error) {
    if (!outcomeUnknown(error)) submitRequest = null
    reviewOpen.value = false
    problem.value = problemOf(error)
  } finally {
    busy.value = false
  }
}

// «Liberar retención»: the bill's own hold release; then «Pagar» is offered.
async function releaseHold() {
  busy.value = true
  problem.value = null
  releaseRequest ||= requestId()
  try {
    await gastosApi('release_hold', {
      request_id: releaseRequest,
      name: props.name,
    })
    releaseRequest = null
    notice.value = __('Hold released. You can pay this bill now.')
    await load()
  } catch (error) {
    if (!outcomeUnknown(error)) releaseRequest = null
    problem.value = problemOf(error)
  } finally {
    busy.value = false
  }
}

// Paid in full: say so and open the next bill of the same list.
async function paid(result) {
  if (Number(result.outstanding_amount) > 0) {
    notice.value = __('Payment saved. {0} still owed.', [
      money(result.outstanding_amount, result.currency),
    ])
    return load()
  }
  toast.success(__('Bill paid'))
  const next = await nextBill()
  if (next)
    return router.replace({
      name: 'GastoFactura',
      params: { name: next },
      query: listPath.value ? { list: listPath.value } : {},
    })
  goBack()
}
async function nextBill() {
  if (!listPath.value) return null
  const url = new URL(listPath.value, 'https://muelle.invalid')
  const params = Object.fromEntries(url.searchParams)
  try {
    const page = await gastosApi('queue', {
      segment: params.segment || 'por-pagar',
      chip: params.po ? '' : params.chip || '',
      purchase_order: params.po || '',
      search: params.q || '',
      start: 0,
      page_length: 5,
    })
    const row = page.rows.find(
      (r) => r.name !== props.name && Number(r.outstanding_amount) > 0,
    )
    return row?.name || null
  } catch {
    return null
  }
}

function goBack() {
  if (listPath.value) return router.push(listPath.value)
  router.push({ name: 'Gastos' })
}

watch(
  () => props.name,
  () => {
    loaded.value = false
    notice.value = ''
    problem.value = null
    data.value = {}
    load()
  },
)
onMounted(async () => {
  await loadGastosBoot()
  load()
})
</script>
