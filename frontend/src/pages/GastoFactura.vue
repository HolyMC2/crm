<template>
  <!-- A supplier bill, read like a chat with the supplier (Shell look,
       record-header): the bar names them with the state and the folio under
       it, the ways to reach them, the bolt with the bill's steps and «⋯» with
       every tool (print, share, mail…). The amount and the one next step are
       the hero; then the lines, totals, payments, the bill's data and its goods
       in the warehouse (Escáner). Creado desde, Conexiones, Actividad and
       Archivos follow, in the side column on a desk. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :back="true"
      :back-label="backLabel"
      :title="title"
      :bell="phone"
      :loading="loading && loaded"
      @back="onBack"
    >
      <template v-if="loaded" #title>
        <div class="flex min-h-12 min-w-0 flex-col justify-center px-3">
          <span
            class="title-face line-clamp-2 break-words text-xl font-semibold leading-tight [text-wrap:balance]"
            data-appbar-title
            >{{ title }}</span
          >
          <span class="flex min-w-0 items-center gap-2 pt-0.5">
            <StatusChip
              :label="chip.label"
              :tone="chip.tone"
              data-testid="bill-status"
            />
            <span class="truncate text-sm leading-tight text-ink-gray-6">{{
              kindLine
            }}</span>
          </span>
        </div>
      </template>
      <template #actions>
        <RecordIsland
          v-if="loaded"
          :reach="kit.record.value?.header?.reach || {}"
          :who="doc.party || ''"
          :mail="kit.record.value?.actions?.email || null"
          :groups="boltGroups"
          :phone="phone"
          :subtitle="kit.scopeTitle.value"
          @mail="mail"
          @pick="onBolt"
          @tools="kit.openTools()"
        />
      </template>
    </AppBar>

    <div class="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-10">
      <EmptyState
        v-if="guard"
        role="alert"
        :state="guard.kind === 'permission' ? 'denied' : 'error'"
        :title="guard.title"
        :message="guard.detail"
        :action="__('Retry', null, 'Gastos')"
        @action="load"
      />
      <EmptyState
        v-else-if="loading && !loaded"
        role="status"
        state="loading"
        :title="__('Loading bill…')"
      />

      <div
        v-else-if="loaded"
        class="mx-auto grid w-full max-w-6xl gap-x-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div class="flex min-w-0 flex-col gap-5 pt-4">
          <!-- What was asked of me on this bill (Pendientes «Por aprobar»). -->
          <div class="px-4 empty:hidden">
            <ApprovalAsk
              ref="askBanner"
              doctype="Purchase Invoice"
              :name="props.name"
              @declined="decided"
            >
              <template #primary>
                <button
                  v-if="primaryAction"
                  type="button"
                  :class="['press', BTN.filled]"
                  @click="primaryAction.run"
                >
                  {{ primaryAction.label }}
                </button>
              </template>
            </ApprovalAsk>
          </div>

          <!-- The hero: how much, where it stands, when it is due, and the one
               next step (filled) with the bill's other doors (tonal). -->
          <section
            class="flex flex-col gap-2 px-4"
            :aria-label="__('Payment', null, 'Gastos')"
            data-testid="bill-hero"
          >
            <span v-if="doc.is_return" class="text-sm text-ink-gray-7">{{
              __('Credit note')
            }}</span>
            <p
              class="num text-3xl font-semibold tabular-nums leading-tight text-ink-gray-9"
            >
              {{ money(doc.total, doc.currency) }}
            </p>
            <StageSteps
              v-if="kit.stages.value"
              :stages="kit.stages.value"
              class="py-2"
            />
            <p class="flex flex-wrap gap-x-3 text-base text-ink-gray-7">
              <span v-if="doc.date">{{ formatDay(doc.date) }}</span>
              <span
                v-if="owed && doc.due_date"
                :class="doc.overdue ? 'text-ink-red-7' : ''"
                >{{ dueLabel(doc.due_date, boot?.today || localToday()) }}</span
              >
            </p>
            <p class="break-words text-base text-ink-gray-8">
              {{ stateLine }}
            </p>
            <!-- The background registration was refused: what blocked it and
                 the fix, applied and registered in one step (RegistrationFix). -->
            <RegistrationFix
              v-if="registrationFailed"
              :name="props.name"
              :doc="doc"
              :registration="registrationFailed"
              :desk="!!boot?.capabilities?.desk"
              @retry="reviewOpen = true"
              @ask="(note) => ask('review', note)"
            />
            <p
              v-for="action in actions.filter((a) => a.fallback)"
              :key="action.key"
              class="break-words text-sm text-ink-gray-7"
            >
              {{ action.reason }}
            </p>
            <p
              v-if="data.assignments?.length"
              class="break-words text-sm text-ink-gray-7"
            >
              {{
                __('Waiting on: {0}', [
                  data.assignments.map((a) => a.full_name).join(', '),
                ])
              }}
            </p>
            <div
              v-if="notice"
              role="status"
              class="rounded-6 bg-surface-green-1 p-3 text-sm text-ink-green-8"
            >
              {{ notice }}
            </div>
            <div
              v-if="problem"
              role="alert"
              class="space-y-2 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
            >
              <p>
                <strong>{{ problem.title }}.</strong> {{ problem.detail }}
              </p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-if="
                    problem.kind === 'conflict' || problem.kind === 'offline'
                  "
                  type="button"
                  :class="['press', BTN.tonal]"
                  @click="refresh"
                >
                  {{ problem.action }}
                </button>
                <button
                  type="button"
                  :class="['press', BTN.tonal]"
                  @click="ask('review', problem.detail)"
                >
                  {{ __('Ask for a review') }}
                </button>
              </div>
            </div>
            <div class="flex flex-wrap gap-2 pt-2" data-testid="bill-next">
              <template v-if="registering">
                <span
                  role="status"
                  class="inline-flex min-h-12 items-center gap-2 rounded-full bg-surface-blue-1 px-5 text-base-medium text-ink-blue-9"
                >
                  <LucideLoaderCircle class="size-5 animate-spin" />
                  {{ __('Registering…') }}
                </span>
                <button
                  type="button"
                  :class="['press', BTN.tonal]"
                  @click="goBack()"
                >
                  {{
                    back
                      ? __('Back to {0}', [back.label])
                      : __('Back to Gastos')
                  }}
                </button>
              </template>
              <button
                v-for="(step, i) in nextSteps"
                :key="step.key"
                type="button"
                :class="['press', i === 0 ? BTN.filled : BTN.tonal]"
                :disabled="busy && step.key === 'release'"
                :data-step="step.key"
                @click="step.run()"
              >
                <span :class="[step.icon, 'size-5']" aria-hidden="true" />
                {{ step.label }}
              </button>
              <button
                v-if="canCapture"
                type="button"
                :class="['press', BTN.tonal]"
                data-step="capture"
                @click="captureOpen = true"
              >
                <span class="lucide-file-plus size-5" aria-hidden="true" />
                {{ __('Capture receipt') }}
              </button>
              <button
                v-if="canEdit"
                type="button"
                :class="['press', BTN.tonal]"
                data-step="edit"
                @click="editOpen = true"
              >
                <span class="lucide-pencil size-5" aria-hidden="true" />
                {{ __('Edit', null, 'Gastos') }}
              </button>
              <button
                v-if="canPrint"
                type="button"
                :class="['press', BTN.tonal]"
                data-step="print"
                @click="kit.onTool('print')"
              >
                <span class="lucide-printer size-5" aria-hidden="true" />
                {{ __('Print', null, 'Gastos') }}
              </button>
            </div>
            <CapturarDocumentoButton
              v-model:open="captureOpen"
              :trigger="false"
              :label="__('Capture receipt')"
              :targets="['Payment Entry']"
              :invoice="props.name"
              :return-label="props.name"
            />
          </section>

          <!-- The lines as cards and the totals with their taxes (the engine's
               bundle); until it arrives, the bill's own short list. -->
          <template v-if="kit.record.value?.items?.rows?.length">
            <ItemsCards
              :items="kit.record.value.items"
              :currency="doc.currency || 'MXN'"
              :limit="5"
            />
            <DocTotals
              :totals="kit.record.value.totals"
              :taxes="kit.record.value.taxes"
              :currency="doc.currency || 'MXN'"
              :docstatus="Number(doc.docstatus)"
              owed-label="Por pagar"
            />
          </template>
          <section
            v-else-if="doc.items?.length"
            class="px-4"
            aria-labelledby="bill-items"
          >
            <h2
              id="bill-items"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Items', null, 'Gastos') }}
            </h2>
            <ul class="divide-y divide-outline-gray-1 text-base">
              <li
                v-for="(item, i) in doc.items"
                :key="i"
                class="flex min-h-11 items-center justify-between gap-3 py-2"
              >
                <span class="min-w-0 break-words"
                  >{{ formatQty(item.qty, item.uom) }} ·
                  {{ item.item_name }}</span
                >
                <span class="num shrink-0 whitespace-nowrap tabular-nums">{{
                  money(item.amount, doc.currency)
                }}</span>
              </li>
              <li
                v-if="doc.item_count > doc.items.length"
                class="py-2 text-ink-gray-6"
              >
                {{ __('{0} more lines', [doc.item_count - doc.items.length]) }}
              </li>
            </ul>
          </section>

          <!-- Payments and their bank side (matched in Contador). -->
          <section
            v-if="data.payments?.length"
            class="px-4"
            aria-labelledby="bill-payments"
          >
            <h2
              id="bill-payments"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Payments', null, 'Gastos') }}
            </h2>
            <ul class="divide-y divide-outline-gray-1">
              <li
                v-for="p in data.payments"
                :key="p.name"
                class="flex min-w-0 items-start gap-3 py-2"
              >
                <span
                  class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                  aria-hidden="true"
                >
                  <span class="lucide-banknote size-5" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span class="flex items-baseline justify-between gap-3">
                    <span class="num text-base tabular-nums text-ink-gray-9">{{
                      money(p.amount, p.currency)
                    }}</span>
                    <span class="text-sm text-ink-gray-6">{{
                      formatDay(p.posting_date)
                    }}</span>
                  </span>
                  <span
                    v-if="paymentLine(p)"
                    class="break-words text-sm text-ink-gray-6"
                    >{{ paymentLine(p) }}</span
                  >
                  <span class="flex flex-wrap items-center gap-2 pt-0.5">
                    <StatusChip
                      :label="bankLabel(p)"
                      :tone="p.reconciled ? 'success' : 'neutral'"
                    />
                    <a
                      v-if="bankAllowed"
                      class="inline-flex min-h-11 items-center text-sm text-ink-gray-8 underline decoration-outline-gray-3 underline-offset-4 sm:min-h-0"
                      :href="bankUrl(p.name, doc.name)"
                      >{{ __('See in bank') }}</a
                    >
                  </span>
                </span>
              </li>
            </ul>
            <p v-if="!bankAllowed" class="pt-1 text-sm text-ink-gray-6">
              {{
                __(
                  'Your accountant matches payments with the bank statement in Contador.',
                )
              }}
            </p>
          </section>

          <!-- The bill's own facts: its CFDI, folio, due terms, the orders it
               came from and the company that owes it. -->
          <section class="px-4" aria-labelledby="bill-details">
            <h2
              id="bill-details"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Bill details') }}
            </h2>
            <ul class="divide-y divide-outline-gray-1">
              <li class="flex min-h-14 items-center gap-3 py-2">
                <span :class="ROW_ICON" aria-hidden="true">
                  <span class="lucide-code size-5" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="text-base text-ink-gray-9">CFDI</span>
                  <span class="text-sm text-ink-gray-6">{{
                    doc.has_xml ? __('With XML') : __('Without XML')
                  }}</span>
                </span>
                <a
                  v-if="!doc.has_xml && bankAllowed"
                  class="inline-flex min-h-11 items-center text-right text-sm text-ink-gray-8 underline decoration-outline-gray-3 underline-offset-4"
                  :href="cfdiUrl"
                  >{{ __('Link the CFDI in Contador') }}</a
                >
              </li>
              <li
                v-if="doc.bill_no"
                class="flex min-h-14 items-center gap-3 py-2"
              >
                <span :class="ROW_ICON" aria-hidden="true">
                  <span class="lucide-receipt size-5" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="text-sm text-ink-gray-6">{{
                    fiscalFolio
                      ? __('Fiscal folio (UUID)')
                      : __('Supplier folio')
                  }}</span>
                  <span
                    class="text-base text-ink-gray-9"
                    :class="fiscalFolio ? 'break-all text-sm' : 'break-words'"
                    >{{ doc.bill_no }}</span
                  >
                </span>
              </li>
              <li
                v-for="(term, i) in data.schedule?.length > 1
                  ? data.schedule
                  : []"
                :key="`term${i}`"
                class="flex min-h-14 items-center gap-3 py-2"
              >
                <span :class="ROW_ICON" aria-hidden="true">
                  <span class="lucide-calendar-clock size-5" />
                </span>
                <span class="min-w-0 flex-1 text-base text-ink-gray-9">{{
                  __('Due {0}', [formatDay(term.due_date)])
                }}</span>
                <span class="num text-right text-base tabular-nums">
                  {{ money(term.amount, doc.currency) }}
                  <span
                    v-if="term.outstanding > 0"
                    class="block text-sm text-ink-gray-6"
                    >{{
                      __('{0} owed', [money(term.outstanding, doc.currency)])
                    }}</span
                  >
                </span>
              </li>
              <li v-for="o in data.orders || []" :key="o.name">
                <RouterLink
                  class="press flex min-h-14 items-center gap-3 rounded-6 py-2 [@media(hover:hover)]:hover:bg-surface-gray-1"
                  :to="{ name: 'CompraOrden', params: { name: o.name } }"
                >
                  <span :class="ROW_ICON" aria-hidden="true">
                    <span class="lucide-package size-5" />
                  </span>
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="text-sm text-ink-gray-6">{{
                      __('From purchase order')
                    }}</span>
                    <span class="break-words text-base text-ink-gray-9">{{
                      displayName(o, 'Purchase Order', {
                        fallback: __('Orden de compra'),
                      })
                    }}</span>
                  </span>
                </RouterLink>
              </li>
              <li
                v-if="doc.company"
                class="flex min-h-14 items-center gap-3 py-2"
              >
                <span :class="ROW_ICON" aria-hidden="true">
                  <span class="lucide-store size-5" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="text-sm text-ink-gray-6">{{
                    __('Company', null, 'Gastos')
                  }}</span>
                  <span class="break-words text-base text-ink-gray-9">{{
                    doc.company
                  }}</span>
                </span>
              </li>
            </ul>
          </section>
          <DatosList
            v-if="kit.record.value?.fields?.length"
            :fields="kit.record.value.fields"
            :hide="DATOS_SHOWN"
            :currency="doc.currency || 'MXN'"
            :boot="shellBoot"
          />
        </div>

        <aside class="flex min-w-0 flex-col gap-5 pt-5">
          <!-- Escáner: receive, receipts, tasks and labels for its goods. -->
          <BillAlmacen
            :rows="almacenRows"
            :bill="props.name"
            @ask="(reason) => ask('review', reason)"
          />
          <div v-if="doc.name && archivosEnabled" class="px-4">
            <ArchivosRegistroPanel
              doctype="Purchase Invoice"
              :name="doc.name"
              :return-to="`/crm${route.fullPath}`"
              :return-label="__('Gastos', null, 'Gastos')"
            />
          </div>
          <!-- Shell SPEC §6 DD2: the engine's «Creado desde», Conexiones,
               Actividad and the sheets behind «⋯». -->
          <RecordKit v-if="doc.name" :kit="kit" :title="doc.party || ''" />
        </aside>
      </div>
    </div>

    <!-- «Revisar y registrar»: the bill's own submit, in the background. -->
    <ConfirmSheet
      v-model:open="reviewOpen"
      :copy="registerCopy"
      :busy="busy"
      @confirm="submitBill"
    />
    <EditSheet
      v-if="canEdit && editOpen"
      v-model:open="editOpen"
      :record="kit.record.value"
      :edit-fields="kit.profile.value?.editFields || null"
      :subtitle="kit.scopeTitle.value"
      @saved="kit.after(__('Draft saved'))"
    />
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
  defineAsyncComponent,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import { ArchivosRegistroPanel } from '@/components/archivos'
import { AppBar, EmptyState, StatusChip } from '@/components/ui'
import ApprovalDialog from '@/components/gastos/ApprovalDialog.vue'
import RegistrationFix from '@/components/gastos/RegistrationFix.vue'
import PayDialog from '@/components/gastos/PayDialog.vue'
import ApprovalAsk from '@/components/pendientes/ApprovalAsk.vue'
import { shellBoot } from '@/composables/muelleShell'
import { appleKeys, registerPageShortcuts } from '@/composables/shellKeyboard'
import { completeTo, goTo, ownerReturn } from '@/composables/useAprobaciones'
import { offerUndo, runUndo } from '@/composables/powerUndo'
import CapturarDocumentoButton from '@/components/captura/CapturarDocumentoButton.vue'
import { allowedTargets, capturaBoot } from '@/composables/useCaptura'
import ConfirmSheet from '@/components/documentos/ConfirmSheet.vue'
import DatosList from '@/components/documentos/DatosList.vue'
import DocTotals from '@/components/documentos/DocTotals.vue'
import ItemsCards from '@/components/documentos/ItemsCards.vue'
import RecordIsland from '@/components/documentos/RecordIsland.vue'
import StageSteps from '@/components/documentos/StageSteps.vue'
import RecordKit from '@/components/documentos/compras/RecordKit.vue'
import { useRecordKit } from '@/components/documentos/compras/recordKit'
import BillAlmacen from '@/components/gastos/BillAlmacen.vue'
import {
  loadBillWarehouse,
  warehouseRows,
} from '@/components/gastos/billAlmacen'
import { isMobile } from '@/composables/breakpoint'
import { etiquetasHref } from '@/composables/useEtiquetas'
import { recordActionsFor } from '@/documentos/acciones'
import { localToday } from '@/documentos/profiles/_compras'
import { BTN } from '@/documentos/tools'
import { hoyLive } from '@/composables/useHoy'
import { registrationOf } from '@/composables/gastosRegistrations'
import {
  REGISTRATION_CHANGED,
  registerInBackground,
} from '@/composables/useBillRegistrations'
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
import LucideLoaderCircle from '~icons/lucide/loader-circle'

const EditSheet = defineAsyncComponent(
  () => import('@/components/documentos/EditSheet.vue'),
)

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const boot = gastosBoot
const phone = isMobile
// Files on this record come from Archivos when the worker has it.
const archivosEnabled = computed(() =>
  moduleEnabled(shellBoot.value, 'archivos'),
)
// Datos lists the rest of the bill: what the page already shows stays out.
const DATOS_SHOWN = [
  'supplier',
  'supplier_name',
  'bill_no',
  'bill_date',
  'company',
  'posting_date',
  'due_date',
  'grand_total',
  'rounded_total',
  'outstanding_amount',
  'status',
  'currency',
  'is_return',
]
const ROW_ICON =
  'flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7'
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
// A background registration: this tab's (tray) first, else what the server
// knows (another tab, a reload, a colleague's).
const registration = computed(() =>
  Number(doc.value.docstatus) === 0
    ? registrationOf(props.name) || data.value.registration || null
    : null,
)
const registering = computed(() => registration.value?.state === 'queued')
const registrationFailed = computed(() =>
  registration.value?.state === 'failed' ? registration.value : null,
)
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
// The bar: the supplier, then the state and «Factura de proveedor <folio>».
const title = computed(() =>
  loaded.value
    ? doc.value.party || __('Supplier not visible')
    : __('Gastos', null, 'Gastos'),
)
// A CFDI's folio fiscal is a UUID: it is no number to read in the bar.
const fiscalFolio = computed(() =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(doc.value.bill_no || '').trim(),
  ),
)
const kindLine = computed(() =>
  [
    __('Bill', null, 'Gastos'),
    doc.value.bill_no && !fiscalFolio.value
      ? doc.value.bill_no
      : doc.value.name,
  ]
    .filter(Boolean)
    .join(' '),
)
// Colour means state: amber waits on someone here, red is overdue.
const chip = computed(() => {
  const label = registering.value ? __('Registering…') : statusLabel(doc.value)
  if (registering.value) return { label, tone: 'info' }
  const docstatus = Number(doc.value.docstatus)
  if (docstatus === 0) return { label, tone: 'warning' }
  if (docstatus === 2) return { label, tone: 'neutral' }
  if (Number(doc.value.outstanding_amount || 0) <= 0)
    return { label, tone: 'success' }
  if (doc.value.overdue) return { label, tone: 'danger' }
  return { label, tone: doc.value.on_hold ? 'warning' : 'neutral' }
})
const owed = computed(
  () =>
    Number(doc.value.docstatus) === 1 &&
    Number(doc.value.outstanding_amount || 0) > 0,
)
// Under the amount: what is paid, or what a draft needs.
const stateLine = computed(() => {
  const docstatus = Number(doc.value.docstatus)
  if (docstatus === 1) return paidLabel(doc.value)
  if (registering.value)
    return __(
      'Registering in the background. You can keep working; you will be told when it is done.',
    )
  if (docstatus === 0)
    return __(
      'Draft: review supplier, amounts and taxes, then register it so it can be paid.',
    )
  return __('This bill is cancelled.')
})
function paymentLine(p) {
  return [
    p.reference_no,
    p.reference_date && p.reference_date !== p.posting_date
      ? __('bank date {0}', [formatDay(p.reference_date)])
      : '',
    modeOfPaymentLabel(p.mode_of_payment),
  ]
    .filter(Boolean)
    .join(' · ')
}
const registerCopy = computed(() => ({
  title: __('Register this bill?'),
  message: [
    __(
      '{0} for {1}. Once registered it is owed to the supplier and can be paid; changing it later means cancelling it.',
      [
        doc.value.party || doc.value.name,
        money(doc.value.total, doc.value.currency),
      ],
    ),
    __(
      'It registers in the background: you can keep working and you will be told when it is done.',
    ),
  ].join(' '),
  confirm: __('Register', null, 'Gastos'),
  back: __('Cancel', null, 'Gastos'),
}))
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
const backLabel = computed(() =>
  back.value ? __('Back to {0}', [back.value.label]) : __('Back to Gastos'),
)
function onBack(event) {
  event?.preventDefault?.()
  goBack()
}
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
  if (allowed('submit') && !registering.value)
    return {
      label: __('Review and register'),
      run: () => (reviewOpen.value = true),
    }
  return null
})

// The hero's steps, in order: the bill's own decision first (filled), then
// what else this state allows; the bolt lists the same.
const nextSteps = computed(() => {
  const out = []
  for (const action of actions.value) {
    if (action.key === 'submit' && registering.value) continue
    if (action.key === 'submit' && action.allowed) {
      if (!registrationFailed.value)
        out.push({
          key: 'submit',
          label: __('Review and register'),
          icon: 'lucide-check',
          run: () => (reviewOpen.value = true),
        })
    } else if (action.key === 'pay' && action.allowed)
      out.push({
        key: 'pay',
        label: __('Pay', null, 'Gastos'),
        icon: 'lucide-wallet',
        run: () => (payOpen.value = true),
      })
    else if (action.fallback === 'release')
      out.push({
        key: 'release',
        label: __('Release hold'),
        icon: 'lucide-check',
        run: releaseHold,
      })
    else if (action.fallback)
      out.push({
        key: `ask:${action.key}`,
        label:
          action.fallback === 'review'
            ? __('Ask for a review')
            : __('Ask for approval'),
        icon: 'lucide-send',
        run: () => ask(action.fallback, action.reason),
      })
  }
  return out
})
const captureOpen = ref(false)
const canCapture = computed(
  () =>
    owed.value &&
    allowedTargets(capturaBoot.value, ['Payment Entry']).length > 0,
)
const editOpen = ref(false)
const canEdit = computed(
  () =>
    Number(doc.value.docstatus) === 0 &&
    !registering.value &&
    !!kit.record.value?.actions?.edit?.allowed,
)
const canPrint = computed(() => !!kit.record.value?.actions?.print?.allowed)

// «En el almacén»: Escáner's side of the bill, loaded after the page.
const almacen = ref(null)
const labelsOn = computed(() => moduleEnabled(shellBoot.value, 'productos'))
const almacenRows = computed(() =>
  warehouseRows(almacen.value, {
    bill: props.name,
    back: { to: `/crm${route.fullPath}`, label: 'Gastos' },
    labels: labelsOn.value && !doc.value.is_return,
  }),
)
async function loadAlmacen() {
  try {
    almacen.value = await loadBillWarehouse(props.name)
  } catch {
    // Without it the bill still works; the section stays out.
    almacen.value = null
  }
}

// The bolt: the hero's steps, Escáner's receive and labels, «Editar», then
// what keeps the bill in sight; «⋯» keeps print, share, mail and the rest.
const boltSteps = computed(() => {
  const out = [...nextSteps.value]
  if (canCapture.value)
    out.push({
      label: __('Capture receipt'),
      icon: 'lucide-file-plus',
      run: () => (captureOpen.value = true),
    })
  for (const row of almacenRows.value.filter((r) => r.step))
    out.push({
      label: row.title,
      icon: row.icon,
      run: () => window.location.assign(row.href),
    })
  if (almacenRows.value.some((r) => r.labels))
    out.push({
      label: __('Print labels'),
      icon: 'lucide-tag',
      run: () =>
        router.push(
          etiquetasHref([], { desde: `Purchase Invoice:${props.name}` }),
        ),
    })
  if (canPrint.value)
    out.push({
      label: __('Print', null, 'Gastos'),
      icon: 'lucide-printer',
      run: () => kit.onTool('print'),
    })
  return out
})
const boltGroups = computed(() =>
  recordActionsFor({
    steps: boltSteps.value,
    canEdit: canEdit.value,
    tools: kit.tools.value,
  }),
)
function onBolt({ key }) {
  if (key === 'editar') editOpen.value = true
  else if (key.startsWith('paso:')) boltSteps.value[Number(key.slice(5))]?.run()
  else kit.onTool(key)
}
function mail() {
  const action = kit.record.value?.actions?.email
  if (action?.allowed) kit.onTool('correo')
  else toast.error(action?.reason || __('This bill cannot be sent by email.'))
}

async function load() {
  loading.value = true
  guard.value = null
  try {
    data.value = await gastosApi('invoice', { name: props.name })
    loaded.value = true
    loadAlmacen()
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

// «Registrar»: the quick checks answer here, the posting runs in the
// background (the tray says when it is done) and the worker moves on.
async function submitBill() {
  busy.value = true
  problem.value = null
  try {
    await registerInBackground({ ...doc.value, name: props.name })
    reviewOpen.value = false
    // From a queue (Pendientes, Hoy): back to it, the next item is waiting.
    if (back.value) return goBack()
  } catch (error) {
    reviewOpen.value = false
    problem.value = problemOf(error)
  } finally {
    busy.value = false
  }
}
// The outcome of this bill's registration: show the bill as it now stands.
function onRegistration(event) {
  if (event.detail?.name === props.name) load()
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
      if (registering.value)
        toast.success(__('This bill is registering in the background.'))
      else if (submit?.allowed) reviewOpen.value = true
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
  if (
    busy.value ||
    payOpen.value ||
    reviewOpen.value ||
    editOpen.value ||
    approval.open
  )
    return
  load()
}
useLiveWatch(hoyLive(socket), LIVE_DOCTYPES, quietLoad, {
  minIntervalMs: 3000,
})
watch(
  () => props.name,
  () => {
    loaded.value = false
    almacen.value = null
    notice.value = ''
    problem.value = null
    data.value = {}
    load()
  },
)
onMounted(async () => {
  window.addEventListener('keydown', onKey)
  window.addEventListener(REGISTRATION_CHANGED, onRegistration)
  await loadGastosBoot()
  await load()
  openFromList()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener(REGISTRATION_CHANGED, onRegistration)
})
</script>
