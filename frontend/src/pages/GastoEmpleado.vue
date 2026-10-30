<template>
  <!-- An employee's expense, read like a chat with them (Shell look,
       record-header): the bar names them with the state and the expense under
       it, the bolt with its steps and «⋯» with every tool (print, share,
       mail…). The amount and the one next step are the hero, and they change
       in place: the page is never rebuilt. Then what was spent, what was
       reimbursed, the receipt photos and the history; Archivos and the
       engine's Actividad sit beside them on a desk. -->
  <div
    class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden"
    data-testid="claim-record"
  >
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
              :label="stateLabel(doc)"
              :tone="chipTone"
              data-testid="claim-status"
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
          :who="doc.employee_name || ''"
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
        :title="__('Loading expense…')"
      />

      <div
        v-else-if="loaded"
        class="mx-auto grid w-full max-w-6xl gap-x-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div class="flex min-w-0 flex-col gap-5 pt-4">
          <!-- The hero: how much, where it stands, and the next step. It
               changes in place: a decision never moves the page under the
               thumb. -->
          <section
            class="flex flex-col gap-2 px-4"
            :aria-label="__('Next step')"
            data-testid="claim-next"
          >
            <p
              class="num text-3xl font-semibold tabular-nums leading-tight text-ink-gray-9"
            >
              {{ money(doc.total, doc.currency) }}
            </p>
            <p
              v-if="doc.sanctioned && doc.sanctioned < doc.claimed"
              class="text-base text-ink-gray-7"
            >
              {{ __('Asked for {0}', [money(doc.claimed, doc.currency)]) }}
            </p>
            <p class="flex flex-wrap gap-x-3 text-base text-ink-gray-7">
              <span v-if="doc.type_label">{{ doc.type_label }}</span>
              <span v-if="doc.date">{{ formatDay(doc.date) }}</span>
            </p>

            <template v-if="done">
              <p role="status" class="text-base-medium text-ink-green-8">
                {{ done.message }}
              </p>
              <p v-if="done.empty" class="text-base text-ink-gray-7">
                {{ done.empty }}
              </p>
              <div class="flex flex-wrap gap-2 pt-2">
                <template v-for="action in done.actions" :key="action.key">
                  <button
                    v-if="action.key === 'reimburse'"
                    type="button"
                    :class="['press', BTN.filled]"
                    @click="reimburseOpen = true"
                  >
                    <span class="lucide-hand-coins size-5" aria-hidden="true" />
                    {{ __('Reimburse now') }}
                  </button>
                  <button
                    v-else-if="action.key === 'ask_reimburse'"
                    type="button"
                    :class="['press', BTN.tonal]"
                    data-testid="claim-ask-reimburse"
                    @click="ask('reimburse')"
                  >
                    <span class="lucide-send size-5" aria-hidden="true" />
                    {{ __('Ask for it to be reimbursed') }}
                  </button>
                </template>
                <button
                  v-if="nextName"
                  type="button"
                  :class="['press', BTN.filled]"
                  data-testid="claim-next-button"
                  @click="openNext"
                >
                  {{ __('Next', null, 'Gastos') }}
                </button>
                <button
                  v-else
                  type="button"
                  :class="['press', BTN.tonal]"
                  @click="goBack"
                >
                  {{ __('Back to {0}', [back.label]) }}
                </button>
              </div>
            </template>
            <template v-else>
              <p class="break-words text-base text-ink-gray-8">
                {{ explanation }}
              </p>
              <p
                v-if="advanceLine"
                class="break-words text-sm text-ink-gray-7"
                data-testid="claim-advance"
              >
                {{ advanceLine }}
              </p>
              <!-- A decision sent without an answer: it is checked, never
                   replaced by another. -->
              <div
                v-if="pendingDecide && canDecide"
                class="space-y-2 rounded-6 bg-surface-gray-2 p-3 text-base text-ink-gray-8"
                role="status"
                data-testid="claim-pending-decision"
              >
                <p>
                  {{
                    __(
                      'Your decision «{0}» was sent and we did not hear back. Check its result before deciding anything else; it is never done twice.',
                      [decisionLabel(pendingDecide.data)],
                    )
                  }}
                </p>
                <button
                  type="button"
                  :class="['press', BTN.filled]"
                  :disabled="busy"
                  @click="checkPending"
                >
                  <span
                    :class="[
                      busy
                        ? 'lucide-loader-circle animate-spin'
                        : 'lucide-refresh-cw',
                      'size-5',
                    ]"
                    aria-hidden="true"
                  />
                  {{ __('Check result') }}
                </button>
              </div>
              <p
                v-for="action in fallbacks"
                :key="`why-${action.key}`"
                class="break-words text-base text-ink-gray-7"
              >
                {{ action.reason }}
              </p>
              <div
                v-if="steps.length || deskOpen"
                class="flex flex-wrap gap-2 pt-2"
              >
                <button
                  v-for="(step, i) in steps"
                  :key="step.key"
                  type="button"
                  :class="['press', i === 0 && step.filled ? BTN.filled : BTN.tonal]"
                  :disabled="busy && step.busy"
                  :data-step="step.key"
                  :data-testid="step.testid"
                  @click="step.run()"
                >
                  <span
                    :class="[
                      busy && step.busy
                        ? 'lucide-loader-circle animate-spin'
                        : step.icon,
                      'size-5',
                    ]"
                    aria-hidden="true"
                  />
                  {{ step.label }}
                </button>
                <a
                  v-if="deskOpen"
                  class="inline-flex min-h-11 items-center px-2 text-base text-ink-blue-link underline"
                  :href="`/app/expense-claim/${encodeURIComponent(doc.name)}`"
                  >{{ __('Open the full expense form') }}</a
                >
              </div>
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
            </template>
            <ClaimGuard v-if="refusal" :guard="refusal" @action="onAction" />
            <div
              v-if="problem"
              role="alert"
              class="space-y-2 rounded-6 bg-surface-red-1 p-3 text-base text-ink-red-7"
            >
              <p>
                <strong>{{ problem.title }}.</strong> {{ problem.detail }}
              </p>
              <button
                v-if="problem.kind === 'conflict' || problem.kind === 'offline'"
                type="button"
                :class="['press', BTN.tonal]"
                @click="refresh"
              >
                {{ problem.action }}
              </button>
            </div>
          </section>

          <!-- What was spent, line by line, with what was approved. -->
          <section class="px-4" aria-labelledby="claim-spent">
            <h2
              id="claim-spent"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('What was spent') }}
            </h2>
            <ul class="divide-y divide-outline-gray-1">
              <li
                v-for="(line, i) in data.expenses"
                :key="i"
                class="flex min-h-14 min-w-0 items-center gap-3 py-2"
              >
                <span
                  class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                  aria-hidden="true"
                >
                  <span class="lucide-receipt size-5" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="break-words text-base text-ink-gray-9">{{
                    line.type_label
                  }}</span>
                  <span
                    v-if="line.date || line.description"
                    class="break-words text-sm text-ink-gray-6"
                    >{{
                      [line.date && formatDay(line.date), line.description]
                        .filter(Boolean)
                        .join(' · ')
                    }}</span
                  >
                </span>
                <span class="num shrink-0 text-right tabular-nums">
                  <span class="block text-base text-ink-gray-9">{{
                    money(line.amount, doc.currency)
                  }}</span>
                  <span
                    v-if="
                      Number(doc.docstatus) === 1 &&
                      line.sanctioned < line.amount
                    "
                    class="block text-sm text-ink-gray-6"
                    >{{
                      __('approved {0}', [money(line.sanctioned, doc.currency)])
                    }}</span
                  >
                </span>
              </li>
            </ul>
          </section>

          <!-- Reimbursements and their bank side. -->
          <section
            v-if="data.payments?.length || doc.reimbursed"
            class="px-4"
            aria-labelledby="claim-paid"
          >
            <h2
              id="claim-paid"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Reimbursements', null, 'Gastos') }}
            </h2>
            <p class="text-base text-ink-gray-8">
              {{
                __('Reimbursed {0} of {1}', [
                  money(doc.reimbursed, doc.currency),
                  money(owedTotal(doc), doc.currency),
                ])
              }}
            </p>
            <ul class="divide-y divide-outline-gray-1">
              <li
                v-for="p in data.payments"
                :key="p.name"
                class="flex min-h-14 min-w-0 items-center gap-3 py-2"
              >
                <span
                  class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                  aria-hidden="true"
                >
                  <span class="lucide-banknote size-5" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="num text-base tabular-nums text-ink-gray-9">
                    {{ money(p.amount, p.currency) }}
                  </span>
                  <span class="break-words text-sm text-ink-gray-6">{{
                    paymentLine(p)
                  }}</span>
                </span>
              </li>
            </ul>
          </section>

          <!-- The expense's own data as rows. -->
          <section class="px-4" aria-labelledby="claim-datos">
            <h2
              id="claim-datos"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Expense details') }}
            </h2>
            <ul class="divide-y divide-outline-gray-1">
              <li
                v-for="fact in facts"
                :key="fact.key"
                class="flex min-h-14 min-w-0 items-center gap-3 py-2"
              >
                <span
                  class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                  aria-hidden="true"
                >
                  <span :class="[fact.icon, 'size-5']" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="text-sm text-ink-gray-6">{{ fact.label }}</span>
                  <span class="break-words text-base text-ink-gray-9">{{
                    fact.value
                  }}</span>
                </span>
              </li>
            </ul>
          </section>
        </div>

        <aside class="flex min-w-0 flex-col gap-5 pt-5 lg:pt-4">
          <!-- The receipt photos: tap to zoom; adding one is a step. -->
          <section class="px-4" aria-labelledby="claim-fotos">
            <h2
              id="claim-fotos"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Receipt photos') }}
            </h2>
            <p
              v-if="!data.photos?.length"
              class="flex min-h-11 items-center gap-2 text-base text-ink-gray-6"
            >
              <span class="lucide-camera size-5" aria-hidden="true" />
              {{ __('No photo yet.') }}
            </p>
            <ul v-else class="grid grid-cols-3 gap-2">
              <li v-for="photo in data.photos" :key="photo.name">
                <button
                  v-if="photo.is_image"
                  type="button"
                  class="press block w-full overflow-hidden rounded-6 border border-outline-gray-2"
                  :aria-label="__('Zoom {0}', [photo.file_name])"
                  @click="zoom = photo"
                >
                  <img
                    :src="photo.file_url"
                    :alt="photo.file_name"
                    class="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                </button>
                <a
                  v-else
                  :href="photo.file_url"
                  target="_blank"
                  rel="noopener"
                  class="flex aspect-square items-center justify-center rounded-6 border border-outline-gray-2 p-2 text-center text-sm text-ink-blue-link underline"
                  >{{ photo.file_name }}</a
                >
              </li>
            </ul>
          </section>

          <section
            v-if="data.history?.length"
            class="px-4"
            aria-labelledby="claim-historia"
          >
            <h2
              id="claim-historia"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('History') }}
            </h2>
            <ul class="divide-y divide-outline-gray-1">
              <li
                v-for="(entry, i) in data.history"
                :key="i"
                class="flex min-h-14 min-w-0 items-center gap-3 py-2"
              >
                <span
                  class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                  aria-hidden="true"
                >
                  <span class="lucide-history size-5" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="break-words text-base text-ink-gray-9">{{
                    entry.text
                  }}</span>
                  <span class="text-sm text-ink-gray-6">{{
                    [entry.who, entry.when && formatDay(entry.when)]
                      .filter(Boolean)
                      .join(' · ')
                  }}</span>
                </span>
              </li>
            </ul>
          </section>

          <ArchivosRegistroPanel
            class="px-4"
            doctype="Expense Claim"
            :name="doc.name"
            :return-to="`/crm/gastos/gasto/${encodeURIComponent(doc.name)}`"
            return-label="Gastos"
          />
          <!-- Shell SPEC §6 DD2: the engine's «Creado desde», Conexiones,
               Actividad and the sheets behind «⋯». -->
          <RecordKit :kit="kit" :title="doc.employee_name || doc.name" />
        </aside>
      </div>
    </div>

    <!-- Tap to zoom: the photo as large as the screen allows. -->
    <Teleport to="body">
      <div
        v-if="zoom"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        role="dialog"
        aria-modal="true"
        :aria-label="zoom.file_name"
        @click="zoom = null"
        @keydown.esc="zoom = null"
        @wheel.prevent
        @touchmove.prevent
      >
        <img
          :src="zoom.file_url"
          :alt="zoom.file_name"
          class="max-h-full max-w-full rounded-6 object-contain"
        />
        <button
          type="button"
          class="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-surface-base text-ink-gray-8"
          :aria-label="__('Close', null, 'Gastos')"
          @click.stop="zoom = null"
        >
          <span class="lucide-x size-5" aria-hidden="true" />
        </button>
      </div>
    </Teleport>

    <ClaimSheet
      v-if="loaded"
      v-model="sheetOpen"
      :name="props.name"
      :claim="data"
      @saved="afterChange"
      @sent="afterSend"
    />
    <DecideSheet
      v-if="loaded"
      v-model="decideOpen"
      :claim="doc"
      :mode="decideMode"
      @decided="decided"
      @action="onAction"
    />
    <ReimburseDialog
      v-model="reimburseOpen"
      :name="props.name"
      :employee-name="doc.employee_name || ''"
      @reimbursed="reimbursed"
      @ask="() => ask('reimburse')"
    />
    <ApprovalDialog
      v-model="approval.open"
      doctype="Expense Claim"
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
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import { AppBar, EmptyState, StatusChip } from '@/components/ui'
import RecordIsland from '@/components/documentos/RecordIsland.vue'
import RecordKit from '@/components/documentos/compras/RecordKit.vue'
import { useRecordKit } from '@/components/documentos/compras/recordKit'
import { isMobile } from '@/composables/breakpoint'
import { recordActionsFor } from '@/documentos/acciones'
import { BTN } from '@/documentos/tools'
import { formatDay } from '@/utils/contactos'
import ApprovalDialog from '@/components/gastos/ApprovalDialog.vue'
import ClaimGuard from '@/components/gastos/ClaimGuard.vue'
import ClaimSheet from '@/components/gastos/ClaimSheet.vue'
import DecideSheet from '@/components/gastos/DecideSheet.vue'
import ReimburseDialog from '@/components/gastos/ReimburseDialog.vue'
import { ArchivosRegistroPanel } from '@/components/archivos'
import { loadGastosBoot } from '@/composables/useGastos'
import { useRecordPower } from '@/composables/useRecordPower'
import {
  advanceText,
  claimBack,
  claimProblem,
  claimsApi,
  forgetOperation,
  money,
  nextClaim,
  owedTotal,
  pendingOperation,
  runOnce,
  sameDecision,
  stateChipTone,
  stateLabel,
} from '@/composables/useGastosEmpleados'

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const phone = isMobile
const data = ref({})
const loading = ref(false)
const loaded = ref(false)
const busy = ref(false)
const guard = ref(null)
const problem = ref(null)
const refusal = ref(null)
const done = ref(null)
const nextName = ref('')
const zoom = ref(null)
const sheetOpen = ref(false)
const decideOpen = ref(false)
const decideMode = ref('less')
const reimburseOpen = ref(false)
const approval = reactive({ open: false, action: '', reason: '' })
const decideKey = computed(() => `decide:${props.name}`)
const pendingDecide = ref(null)

const doc = computed(() => data.value.document || {})
const actions = computed(() => data.value.actions || [])
const back = computed(() => claimBack(route.query))
// The engine's shared record parts (Shell SPEC §6 DD2): «⋯», Actividad.
const kit = useRecordKit('Expense Claim', {
  name: () => props.name,
  title: () => doc.value.employee_name || '',
  modified: () => doc.value.modified,
  changed: () => load(),
})

// ── the bar: who spent it, where it stands, which expense ─────────────────
const title = computed(() =>
  loaded.value
    ? doc.value.employee_name || doc.value.name
    : __('Gastos', null, 'Gastos'),
)
const kindLine = computed(() => __('Expense {0}', [doc.value.name]))
const chipTone = computed(() => stateChipTone(doc.value))
const backLabel = computed(() =>
  back.value.label === 'Gastos'
    ? __('Gastos', null, 'Gastos')
    : __('Back to {0}', [back.value.label]),
)
function onBack(event) {
  event?.preventDefault?.()
  goBack()
}

// ── the hero's steps: one filled (send, approve, reimburse), the rest tonal ─
const canDecide = computed(() =>
  actions.value.some((a) => a.key === 'decide' && a.allowed),
)
const fallbacks = computed(() =>
  actions.value.filter((a) => !a.allowed && a.fallback),
)
const deskOpen = computed(() => actions.value.some((a) => a.key === 'desk'))
const canPrint = computed(() => !!kit.record.value?.actions?.print?.allowed)
const steps = computed(() => {
  const out = []
  for (const action of actions.value) {
    if (action.key === 'send' && action.allowed)
      out.push({
        key: 'send',
        label: action.resend
          ? __('Change who approves it')
          : __('Send for approval'),
        icon: 'lucide-send',
        filled: true,
        testid: 'claim-send-step',
        run: () => (sheetOpen.value = true),
      })
    else if (action.key === 'decide' && action.allowed && !pendingDecide.value)
      out.push(
        {
          key: 'approve',
          label: __('Approve', null, 'Gastos'),
          icon: 'lucide-check',
          filled: true,
          busy: true,
          testid: 'claim-approve',
          run: approve,
        },
        {
          key: 'less',
          label: __('Approve less'),
          icon: 'lucide-minus',
          testid: 'claim-approve-less',
          run: () => openDecide('less'),
        },
        {
          key: 'reject',
          label: __('Reject', null, 'Gastos'),
          icon: 'lucide-circle-x',
          run: () => openDecide('reject'),
        },
        {
          key: 'return',
          label: __('Ask for a correction'),
          icon: 'lucide-undo-2',
          run: () => openDecide('return'),
        },
      )
    else if (action.key === 'reimburse' && action.allowed)
      out.push({
        key: 'reimburse',
        label: __('Reimburse', null, 'Gastos'),
        icon: 'lucide-hand-coins',
        filled: true,
        testid: 'claim-reimburse',
        run: () => (reimburseOpen.value = true),
      })
    else if (action.key === 'edit' && action.allowed)
      out.push({
        key: 'edit',
        label: __('Edit', null, 'Gastos'),
        icon: 'lucide-pencil',
        run: () => (sheetOpen.value = true),
      })
    else if (!action.allowed && action.fallback)
      out.push({
        key: `ask-${action.key}`,
        label: fallbackLabel(action),
        icon: 'lucide-send',
        filled: true,
        run: () => ask(action.fallback, action.reason),
      })
  }
  if (canPrint.value)
    out.push({
      key: 'print',
      label: __('Print', null, 'Gastos'),
      icon: 'lucide-printer',
      run: () => kit.onTool('print'),
    })
  // The one filled step leads; the others follow in the server's order.
  const lead = out.findIndex((step) => step.filled)
  return lead > 0 ? [out[lead], ...out.filter((_, i) => i !== lead)] : out
})

// ── the bolt: the hero's steps; «⋯» keeps print, share, mail and the rest ─
const boltSteps = computed(() =>
  steps.value.filter((step) => step.key !== 'edit'),
)
const boltGroups = computed(() =>
  recordActionsFor({
    steps: boltSteps.value,
    canEdit: actions.value.some((a) => a.key === 'edit' && a.allowed),
    tools: kit.tools.value,
  }),
)
function onBolt({ key }) {
  if (key === 'editar') sheetOpen.value = true
  else if (key.startsWith('paso:')) boltSteps.value[Number(key.slice(5))]?.run()
  else kit.onTool(key)
}
function mail() {
  const action = kit.record.value?.actions?.email
  if (action?.allowed) kit.onTool('correo')
  else
    toast.error(action?.reason || __('This expense cannot be sent by email.'))
}

// ── the expense's own data as rows ──────────────────────────────────────
const facts = computed(() => {
  const d = doc.value
  return [
    d.approver_name && {
      key: 'aprueba',
      icon: 'lucide-user-round',
      label: __('Approver', null, 'Gastos'),
      value: d.approver_name,
    },
    d.company && {
      key: 'empresa',
      icon: 'lucide-store',
      label: __('Company', null, 'Gastos'),
      value: d.company,
    },
  ].filter(Boolean)
})
function paymentLine(p) {
  return [
    p.posting_date && formatDay(p.posting_date),
    p.reference_no,
    p.reference_date && p.reference_date !== p.posting_date
      ? __('bank date {0}', [formatDay(p.reference_date)])
      : '',
    p.mode_of_payment,
  ]
    .filter(Boolean)
    .join(' · ')
}
const listPath = computed(() =>
  typeof route.query.list === 'string' && route.query.list.startsWith('/gastos')
    ? route.query.list
    : '',
)
const advanceLine = computed(() =>
  advanceText(data.value.advance, doc.value.mine),
)
const explanation = computed(() => {
  const d = doc.value
  return (
    {
      draft: __('Draft: add the receipt photo and send it for approval.'),
      to_fix: __('It came back for a correction: fix it and send it again.'),
      to_approve: d.mine
        ? __('Waiting for {0} to decide.', [d.approver_name || '—'])
        : __(
            '{0} asks for {1}: approve it, approve less, reject it or ask for a correction.',
            [d.employee_name, money(d.claimed, d.currency)],
          ),
      to_reimburse: __('Approved. {0} is still owed.', [
        money(d.outstanding, d.currency),
      ]),
      partly_reimbursed: __('Part was reimbursed. {0} is still owed.', [
        money(d.outstanding, d.currency),
      ]),
      paid: __('Paid in full.'),
      by_advance: __('Settled with the advance: nothing is owed.'),
      rejected: __('Rejected: nothing is booked or paid.'),
      cancelled: __('This expense is cancelled.'),
    }[d.state] || ''
  )
})

function fallbackLabel(action) {
  return (
    {
      decide: doc.value.mine
        ? __('Ask someone else')
        : __('Ask for it to be approved'),
      reimburse: __('Ask for it to be reimbursed'),
      review: __('Ask the accountant to correct it'),
    }[action.fallback] || __('Ask for approval')
  )
}

async function load() {
  loading.value = true
  guard.value = null
  try {
    // In place: the same nodes stay, only what changed is redrawn.
    data.value = await claimsApi('claim', { name: props.name })
    loaded.value = true
    syncPending()
  } catch (error) {
    const p = claimProblem(error)
    if (!loaded.value || p.kind === 'permission') guard.value = p
    else problem.value = p
  } finally {
    loading.value = false
  }
}
function refresh() {
  problem.value = null
  refusal.value = null
  load()
}

function ask(action, reason = '') {
  approval.action = action
  approval.reason = reason
  approval.open = true
}
function openDecide(mode) {
  decideMode.value = mode
  decideOpen.value = true
}
function onAction(action) {
  if (action.key === 'ask_other') ask('decide', refusal.value?.message || '')
  else if (action.key === 'ask_reimburse') ask('reimburse')
  else if (action.key === 'ask_review')
    ask('review', refusal.value?.message || '')
  else if (action.key === 'reimburse') reimburseOpen.value = true
  else if (action.key === 'next') openNextOrBack()
  else if (action.key === 'take_photo') sheetOpen.value = true
}

// A decision sent without an answer stays the one shown until it is checked;
// once the record can no longer be decided here, it is over.
function syncPending() {
  const pending = pendingOperation(decideKey.value)
  if (pending && !actions.value.some((a) => a.key === 'decide' && a.allowed)) {
    forgetOperation(decideKey.value)
    pendingDecide.value = null
    return
  }
  pendingDecide.value = pending
}
watch(decideOpen, (value) => {
  if (!value) syncPending()
})

function decisionLabel(data) {
  if (data?.decision === 'approve')
    return data.sanctioned != null
      ? __('Approve less')
      : __('Approve', null, 'Gastos')
  if (data?.decision === 'reject') return __('Reject', null, 'Gastos')
  if (data?.decision === 'return') return __('Ask for a correction')
  return data?.decision || ''
}

// «Aprobar» is one tap; the other decisions ask for an amount or a reason.
function approve() {
  const data = {
    name: props.name,
    decision: 'approve',
    modified: doc.value.modified,
    reason: '',
  }
  return submitDecision(data, sameDecision(data))
}
// «Comprobar resultado»: the pending decision itself, with its request id.
function checkPending() {
  return submitDecision(pendingDecide.value?.data)
}
async function submitDecision(data, same) {
  busy.value = true
  problem.value = null
  refusal.value = null
  try {
    const result = await runOnce(claimsApi, 'decide', decideKey.value, data, {
      same,
    })
    if (!result.ok) {
      refusal.value = result
      // Decided meanwhile: the record shows where it stands now, under the reason.
      if (result.code === 'already_decided') await load()
    } else await decided(result)
  } catch (error) {
    if (!error?.pendingOther) problem.value = claimProblem(error)
  } finally {
    busy.value = false
    syncPending()
  }
}

async function finish(result, emptyText) {
  toast.success(result.message)
  nextName.value =
    (await nextClaim(claimsApi, listPath.value, props.name)) || ''
  done.value = {
    message: result.message,
    actions: result.actions || [],
    empty: nextName.value ? '' : emptyText,
  }
  await load()
}
function decided(result) {
  return finish(result, __('Nothing to approve'))
}
function reimbursed(result) {
  if (Number(result.outstanding) > 0) {
    toast.success(result.message)
    return load()
  }
  return finish({ ...result, actions: [] }, __('Nothing to reimburse'))
}
function afterChange() {
  toast.success(__('Expense saved.'))
  load()
}
function afterSend(result) {
  toast.success(result.message)
  load()
}

function openNext() {
  router.replace({
    name: 'GastoEmpleado',
    params: { name: nextName.value },
    query: route.query,
  })
}
function openNextOrBack() {
  if (nextName.value) openNext()
  else goBack()
}
function goBack() {
  if (back.value.route) return router.push(back.value.route)
  window.location.assign(back.value.href)
}

// Esc back to the same row of the list; a decision or reimbursement made
// elsewhere shows here, never under an open form.
useRecordPower({
  back: () => goBack(),
  reload: load,
  idle: () =>
    !busy.value &&
    !sheetOpen.value &&
    !decideOpen.value &&
    !reimburseOpen.value &&
    !problem.value,
  doctypes: ['Expense Claim', 'Payment Entry'],
})

watch(
  () => props.name,
  () => {
    loaded.value = false
    done.value = null
    nextName.value = ''
    refusal.value = null
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
