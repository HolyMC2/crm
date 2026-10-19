<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-4xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
      <!-- On a phone the shell AppBar's back arrow (meta.listParent) is the
           way back; this link is for the desktop. -->
      <nav class="mb-3 hidden sm:block">
        <button
          class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          @click="goBack()"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{
            back
              ? __('Back to {0}', [back.label])
              : __('Gastos', null, 'Gastos')
          }}
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
          <Button
            :label="
              back ? __('Back to {0}', [back.label]) : __('Back to Gastos')
            "
            @click="goBack()"
          />
        </div>
      </section>

      <div v-else-if="loading && !loaded" role="status" class="py-10 text-sm">
        {{ __('Loading bill…') }}
      </div>

      <template v-else-if="loaded">
        <!-- Header: who, how much, when — and the one next action. -->
        <header
          class="relative mb-4 flex flex-col gap-3 pr-12 sm:flex-row sm:items-start sm:pr-0"
        >
          <div class="min-w-0 flex-1">
            <p
              class="flex flex-wrap items-center gap-1 text-sm text-ink-gray-6"
            >
              <span v-if="doc.bill_no" class="break-words">{{
                doc.bill_no
              }}</span>
              <Badge :theme="statusTheme" :label="statusLabel(doc)" />
            </p>
            <h1
              class="break-words text-2xl font-semibold leading-tight text-ink-gray-9"
            >
              {{ doc.party || __('Supplier not visible') }}
            </h1>
            <p class="mt-1 break-words text-sm text-ink-gray-6">
              {{
                [doc.company, doc.date && formatDay(doc.date)]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </p>
          </div>
          <div
            class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 sm:flex-col sm:items-end"
          >
            <span
              class="whitespace-nowrap text-xl font-semibold tabular-nums text-ink-gray-9"
              >{{ money(doc.total, doc.currency) }}</span
            >
            <span
              v-if="
                Number(doc.docstatus) === 1 &&
                Number(doc.outstanding_amount || 0) > 0
              "
              class="text-sm"
              :class="doc.overdue ? 'text-ink-red-7' : 'text-ink-gray-6'"
              >{{ dueLabel(doc.due_date, boot?.today) }}</span
            >
          </div>
          <RecordKitTools
            v-if="doc.name"
            class="absolute right-2 top-2 sm:static"
            :kit="kit"
          />
        </header>
        <StageSteps
          v-if="kit.stages.value"
          :stages="kit.stages.value"
          class="mb-4 py-2"
        />

        <!-- What was asked of me on this bill (Pendientes «Por aprobar»). -->
        <ApprovalAsk
          ref="askBanner"
          doctype="Purchase Invoice"
          :name="props.name"
          @declined="decided"
        >
          <template #primary>
            <Button
              v-if="primaryAction"
              variant="solid"
              class="min-h-11"
              :label="primaryAction.label"
              @click="primaryAction.run"
            />
          </template>
        </ApprovalAsk>

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

        <!-- The one next step (dinero NextStepCard): where the bill stands,
             one filled action, then the tonal receipt capture. -->
        <NextStepCard
          class="mb-4"
          :label="__('Payment', null, 'Gastos')"
          :reason="Number(doc.docstatus) === 1 ? paidLabel(doc) : ''"
          :detail="
            Number(doc.docstatus) === 1
              ? ''
              : Number(doc.docstatus) === 0
                ? __(
                    'Draft: review supplier, amounts and taxes, then register it so it can be paid.',
                  )
                : __('This bill is cancelled.')
          "
        >
          <p
            v-for="action in actions.filter((a) => a.fallback)"
            :key="action.key"
            class="mt-1 text-sm text-ink-gray-7"
          >
            {{ action.reason }}
          </p>
          <p
            v-if="data.assignments?.length"
            class="mt-1 text-sm text-ink-gray-7"
          >
            {{
              __('Waiting on: {0}', [
                data.assignments.map((a) => a.full_name).join(', '),
              ])
            }}
          </p>
          <template #actions>
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
            <CapturarDocumentoButton
              v-if="
                Number(doc.docstatus) === 1 &&
                Number(doc.outstanding_amount || 0) > 0
              "
              :label="__('Capture receipt')"
              :targets="['Payment Entry']"
              :invoice="props.name"
              :return-label="props.name"
            />
            <a
              v-if="boot?.capabilities?.desk"
              class="hidden min-h-11 items-center px-2 text-sm text-ink-blue-link underline sm:inline-flex sm:min-h-8"
              :href="`/app/purchase-invoice/${encodeURIComponent(doc.name)}`"
              >{{ __('Open the full bill form') }}</a
            >
          </template>
        </NextStepCard>

        <div class="grid min-w-0 gap-4 sm:grid-cols-2">
          <!-- Payments and their bank side (matched in Contador). -->
          <section class="min-w-0 rounded-xl border border-outline-gray-2 p-4">
            <h2 class="mb-2 text-base font-semibold">
              {{ __('Payments', null, 'Gastos') }}
            </h2>
            <p v-if="!data.payments?.length" class="text-sm text-ink-gray-6">
              {{ __('No payments yet.') }}
            </p>
            <ul v-else class="space-y-3">
              <li
                v-for="p in data.payments"
                :key="p.name"
                class="min-w-0 text-sm"
              >
                <span
                  class="block break-words font-medium tabular-nums text-ink-gray-9"
                >
                  {{ money(p.amount, p.currency) }} ·
                  {{ formatDay(p.posting_date) }}
                </span>
                <span class="block break-words text-ink-gray-6">
                  {{
                    [p.reference_no, modeOfPaymentLabel(p.mode_of_payment)]
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
          <section class="min-w-0 rounded-xl border border-outline-gray-2 p-4">
            <h2 class="mb-2 text-base font-semibold">
              {{ __('Bill details') }}
            </h2>
            <ul v-if="data.schedule?.length > 1" class="mb-3 space-y-1 text-sm">
              <li
                v-for="(term, i) in data.schedule"
                :key="i"
                class="flex justify-between gap-2"
              >
                <span>{{ __('Due {0}', [formatDay(term.due_date)]) }}</span>
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
                >{{
                  displayName(o, 'Purchase Order', {
                    fallback: __('Orden de compra'),
                  })
                }}</RouterLink
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
                <span class="min-w-0 break-words"
                  >{{ formatQty(item.qty, item.uom) }} ·
                  {{ item.item_name }}</span
                >
                <span class="shrink-0 whitespace-nowrap tabular-nums">{{
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

        <ArchivosRegistroPanel
          v-if="doc.name && archivosEnabled"
          class="mt-4"
          doctype="Purchase Invoice"
          :name="doc.name"
          :return-to="`/crm${route.fullPath}`"
          :return-label="__('Gastos', null, 'Gastos')"
        />
        <!-- Shell SPEC §6 DD2: the engine's «Creado desde», Conexiones, Actividad and «⋯» sheets. -->
        <RecordKit
          v-if="doc.name"
          class="mt-6 -mx-4 sm:-mx-6"
          :kit="kit"
          :title="doc.party || ''"
        />
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
import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, Dialog, FeatherIcon, toast } from 'frappe-ui'
import { ArchivosRegistroPanel } from '@/components/archivos'
import ApprovalDialog from '@/components/gastos/ApprovalDialog.vue'
import PayDialog from '@/components/gastos/PayDialog.vue'
import ApprovalAsk from '@/components/pendientes/ApprovalAsk.vue'
import { shellBoot } from '@/composables/muelleShell'
import { appleKeys, registerPageShortcuts } from '@/composables/shellKeyboard'
import { completeTo, goTo, ownerReturn } from '@/composables/useAprobaciones'
import { offerUndo, runUndo } from '@/composables/powerUndo'
import CapturarDocumentoButton from '@/components/captura/CapturarDocumentoButton.vue'
import NextStepCard from '@/components/dinero/NextStepCard.vue'
import StageSteps from '@/components/documentos/StageSteps.vue'
import RecordKit from '@/components/documentos/compras/RecordKit.vue'
import RecordKitTools from '@/components/documentos/compras/RecordKitTools.vue'
import { useRecordKit } from '@/components/documentos/compras/recordKit'
import { hoyLive } from '@/composables/useHoy'
import {
  LIVE_DOCTYPES,
  RECORD_KEYS,
  bankLabel,
  bankUrl,
  cancelPayment,
  dueLabel,
  gastosApi,
  gastosBoot,
  loadGastosBoot,
  money,
  outcomeUnknown,
  paidLabel,
  problemOf,
  recordShortcuts,
  requestId,
  statusLabel,
} from '@/composables/useGastos'
import { isTypingTarget, moduleEnabled } from '@/vendor/muelle-shell/contracts'
import { useLiveWatch } from '@/vendor/muelle-shell/live-sync/vue'
import { modeOfPaymentLabel } from '@/utils/modeOfPayment'
import { keyAction } from '@/utils/powerList'
import { formatDay } from '@/utils/contactos'
import { displayName, formatQty } from '@/utils/display'

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const boot = gastosBoot
// Files on this record come from Archivos when the worker has it.
const archivosEnabled = computed(() =>
  moduleEnabled(shellBoot.value, 'archivos'),
)
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
// The engine's shared record parts (Shell SPEC §6 DD2/DD5): loaded after paint.
const kit = useRecordKit('Purchase Invoice', {
  name: () => props.name,
  title: () => doc.value.party || '',
  modified: () => doc.value.modified,
  changed: () => load(),
})
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
  typeof route.query.list === 'string' &&
  (route.query.list.startsWith('/gastos') ||
    route.query.list.startsWith('/documentos/'))
    ? route.query.list
    : '',
)
// Opened from another list (Pendientes «Por aprobar», Hoy): back goes there,
// and a decision taken here goes back with `done=Purchase Invoice:<name>`.
const back = computed(() => ownerReturn(route.query))
const askBanner = ref(null)
// The bill's own decision, repeated in the phone bar of the ask banner.
const primaryAction = computed(() => {
  const allowed = (key) =>
    actions.value.some((action) => action.key === key && action.allowed)
  if (allowed('pay'))
    return {
      label: __('Pay', null, 'Gastos'),
      run: () => (payOpen.value = true),
    }
  if (allowed('submit'))
    return {
      label: __('Review and register'),
      run: () => (reviewOpen.value = true),
    }
  return null
})

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
    if (back.value) return decided()
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

// «Deshacer» of the payment just made: ERPNext cancels it (its author only).
function offerPaymentUndo(result) {
  if (!result?.can_cancel) return
  offerUndo(__('Payment {0} saved', [result.payment_entry]), () =>
    runUndo(() => cancelPayment(gastosApi, result.payment_entry), {
      done: __('Payment {0} cancelled', [result.payment_entry]),
      describe: (error) => problemOf(error).detail,
      reload: load,
    }),
  )
}

// Paid in full: say so and open the next bill of the same list.
async function paid(result) {
  offerPaymentUndo(result)
  if (Number(result.outstanding_amount) > 0) {
    notice.value = __('Payment saved. {0} still owed.', [
      money(result.outstanding_amount, result.currency),
    ])
    return load()
  }
  if (!result?.can_cancel) toast.success(__('Bill paid'))
  // From «Por aprobar»: the list shows it settled and moves on to the next request.
  if (back.value) return decided()
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
  // Opened from a documentos list: back to that list, not Gastos' queue.
  if (!listPath.value || listPath.value.startsWith('/documentos/')) return null
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

function goBack(done = false) {
  if (back.value)
    return goTo(
      router,
      done
        ? completeTo(back.value.to, 'Purchase Invoice', props.name)
        : back.value.to,
    )
  if (listPath.value) return router.push(listPath.value)
  router.push({ name: 'Gastos' })
}
// A decision on this bill (paid, registered, not approved): back to the list it
// came from with `done`; without one, the bill shows its new state.
function decided() {
  if (back.value) return goBack(true)
  askBanner.value?.reload()
  return load()
}

// «Revisar y registrar» handed over by the list (key R): opened once, then
// the URL forgets it so a reload does not ask again.
function openFromList() {
  if (route.query.accion !== 'registrar') return
  const query = { ...route.query }
  delete query.accion
  router.replace({ query })
  const submit = actions.value.find((a) => a.key === 'submit')
  if (submit?.allowed) reviewOpen.value = true
  // Not this worker's to register: the reason and «Pedir aprobación».
  else if (submit) ask(submit.fallback || 'submit', submit.reason)
}

// ── keyboard: the bill's verbs, never while typing or under a dialog ───────
registerPageShortcuts(null, () => recordShortcuts(boot.value?.capabilities))

function onKey(event) {
  if (event.defaultPrevented || !loaded.value) return
  if (document.querySelector('[aria-modal="true"], [role="dialog"]')) return
  const action = keyAction(event, RECORD_KEYS, { apple: appleKeys })
  if (!action || isTypingTarget(event.target)) return
  const allowed = (key) =>
    actions.value.find((entry) => entry.key === key) || null
  const run = {
    back: () => goBack(),
    pay: () => {
      const pay = allowed('pay')
      if (pay?.allowed) payOpen.value = true
      else if (pay?.fallback === 'release') releaseHold()
      else if (pay) ask(pay.fallback || 'pay', pay.reason)
      else toast.success(paidLabel(doc.value) || statusLabel(doc.value))
    },
    register: () => {
      const submit = allowed('submit')
      if (submit?.allowed) reviewOpen.value = true
      else if (submit) ask('submit', submit.reason)
      else toast.success(__('This bill is already registered.'))
    },
    ask: () => ask(Number(doc.value.docstatus) === 0 ? 'submit' : 'pay', ''),
  }[action]
  if (!run) return
  event.preventDefault()
  run()
}

// ── live: a payment made elsewhere (another tab, a colleague) shows here ───
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
function quietLoad() {
  // Never under the worker's hands: an open form keeps what is typed.
  if (busy.value || payOpen.value || reviewOpen.value || approval.open) return
  load()
}
useLiveWatch(hoyLive(socket), LIVE_DOCTYPES, quietLoad, {
  minIntervalMs: 3000,
})
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
  window.addEventListener('keydown', onKey)
  await loadGastosBoot()
  await load()
  openFromList()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>
