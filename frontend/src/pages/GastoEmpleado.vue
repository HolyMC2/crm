<template>
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-testid="claim-record"
  >
    <div class="mx-auto w-full max-w-4xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
      <nav class="mb-3">
        <component
          :is="back.route ? 'RouterLink' : 'a'"
          v-bind="back.route ? { to: back.route } : { href: back.href }"
          class="inline-flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{
            back.label === 'Gastos'
              ? __('Gastos', null, 'Gastos')
              : __('Back to {0}', [back.label])
          }}
        </component>
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
          <Button :label="__('Back to {0}', [back.label])" @click="goBack" />
        </div>
      </section>

      <div v-else-if="loading && !loaded" role="status" class="py-10 text-sm">
        {{ __('Loading expense…') }}
      </div>

      <template v-else-if="loaded">
        <header class="mb-4 flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm text-ink-gray-6">
              {{ doc.name }}
              <Badge
                class="ml-1"
                :theme="stateTheme(doc)"
                :label="stateLabel(doc)"
              />
            </p>
            <h1 class="truncate text-2xl font-semibold text-ink-gray-9">
              {{ doc.employee_name }}
            </h1>
            <p class="mt-1 text-sm text-ink-gray-6">
              {{
                [doc.type_label, doc.date, doc.company]
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
              v-if="doc.sanctioned && doc.sanctioned < doc.claimed"
              class="text-sm text-ink-gray-6"
              >{{
                __('Asked for {0}', [money(doc.claimed, doc.currency)])
              }}</span
            >
          </div>
        </header>

        <!-- The next step: it changes in place, the page is never rebuilt. -->
        <section
          class="mb-4 rounded-xl border border-outline-gray-2 p-4"
          :aria-label="__('Next step')"
          data-testid="claim-next"
        >
          <template v-if="done">
            <p role="status" class="text-base font-medium text-ink-green-8">
              {{ done.message }}
            </p>
            <p v-if="done.empty" class="mt-1 text-sm text-ink-gray-7">
              {{ done.empty }}
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <template v-for="action in done.actions" :key="action.key">
                <Button
                  v-if="action.key === 'reimburse'"
                  variant="solid"
                  class="min-h-11 sm:min-h-8"
                  :label="__('Reimburse now')"
                  @click="reimburseOpen = true"
                />
                <Button
                  v-else-if="action.key === 'ask_reimburse'"
                  class="min-h-11 sm:min-h-8"
                  :label="__('Ask for it to be reimbursed')"
                  @click="ask('reimburse')"
                />
              </template>
              <Button
                v-if="nextName"
                variant="solid"
                class="min-h-11 sm:min-h-8"
                :label="__('Next', null, 'Gastos')"
                @click="openNext"
              />
              <Button
                v-else
                class="min-h-11 sm:min-h-8"
                :label="__('Back to {0}', [back.label])"
                @click="goBack"
              />
            </div>
          </template>
          <template v-else>
            <p class="text-base text-ink-gray-8">{{ explanation }}</p>
            <p
              v-if="advanceLine"
              class="mt-1 text-sm text-ink-gray-7"
              data-testid="claim-advance"
            >
              {{ advanceLine }}
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <template v-for="action in actions" :key="action.key">
                <template v-if="action.key === 'edit' && action.allowed">
                  <Button
                    class="min-h-11 sm:min-h-8"
                    icon-left="lucide-pencil"
                    :label="__('Edit', null, 'Gastos')"
                    @click="sheetOpen = true"
                  />
                </template>
                <template v-else-if="action.key === 'send' && action.allowed">
                  <Button
                    variant="solid"
                    class="min-h-11 sm:min-h-8"
                    :label="
                      action.resend
                        ? __('Change who approves it')
                        : __('Send for approval')
                    "
                    @click="sheetOpen = true"
                  />
                </template>
                <template v-else-if="action.key === 'decide' && action.allowed">
                  <Button
                    variant="solid"
                    class="min-h-11 sm:min-h-8"
                    :loading="busy"
                    :label="__('Approve', null, 'Gastos')"
                    @click="approve"
                  />
                  <Button
                    class="min-h-11 sm:min-h-8"
                    :label="__('Approve less')"
                    @click="openDecide('less')"
                  />
                  <Button
                    class="min-h-11 sm:min-h-8"
                    :label="__('Reject', null, 'Gastos')"
                    @click="openDecide('reject')"
                  />
                  <Button
                    class="min-h-11 sm:min-h-8"
                    :label="__('Ask for a correction')"
                    @click="openDecide('return')"
                  />
                </template>
                <template
                  v-else-if="action.key === 'reimburse' && action.allowed"
                >
                  <Button
                    variant="solid"
                    class="min-h-11 sm:min-h-8"
                    :label="__('Reimburse', null, 'Gastos')"
                    @click="reimburseOpen = true"
                  />
                </template>
                <template v-else-if="action.key === 'desk'">
                  <a
                    class="inline-flex min-h-11 items-center px-2 text-sm text-ink-blue-link underline sm:min-h-8"
                    :href="`/app/expense-claim/${encodeURIComponent(doc.name)}`"
                    >{{ __('Open the full expense form') }}</a
                  >
                </template>
                <template v-else-if="action.fallback">
                  <p class="w-full text-sm text-ink-gray-7">
                    {{ action.reason }}
                  </p>
                  <Button
                    variant="solid"
                    class="min-h-11 sm:min-h-8"
                    :label="fallbackLabel(action)"
                    @click="ask(action.fallback, action.reason)"
                  />
                </template>
              </template>
            </div>
            <p
              v-if="data.assignments?.length"
              class="mt-3 text-sm text-ink-gray-7"
            >
              {{
                __('Waiting on: {0}', [
                  data.assignments.map((a) => a.full_name).join(', '),
                ])
              }}
            </p>
          </template>
          <ClaimGuard
            v-if="refusal"
            class="mt-3"
            :guard="refusal"
            @action="onAction"
          />
          <div
            v-if="problem"
            role="alert"
            class="mt-3 space-y-2 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
          >
            <p>
              <strong>{{ problem.title }}.</strong> {{ problem.detail }}
            </p>
            <Button
              v-if="problem.kind === 'conflict' || problem.kind === 'offline'"
              :label="problem.action"
              @click="refresh"
            />
          </div>
        </section>

        <div class="grid gap-4 sm:grid-cols-2">
          <section class="rounded-xl border border-outline-gray-2 p-4">
            <h2 class="mb-2 text-base font-semibold">
              {{ __('Receipt photos') }}
            </h2>
            <p v-if="!data.photos?.length" class="text-sm text-ink-gray-6">
              {{ __('No photo yet.') }}
            </p>
            <ul v-else class="grid grid-cols-3 gap-2">
              <li v-for="photo in data.photos" :key="photo.name">
                <button
                  v-if="photo.is_image"
                  type="button"
                  class="block w-full overflow-hidden rounded-lg border border-outline-gray-2"
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
                  class="flex aspect-square items-center justify-center rounded-lg border border-outline-gray-2 p-2 text-center text-xs text-ink-blue-link underline"
                  >{{ photo.file_name }}</a
                >
              </li>
            </ul>
          </section>

          <section class="rounded-xl border border-outline-gray-2 p-4">
            <h2 class="mb-2 text-base font-semibold">
              {{ __('What was spent') }}
            </h2>
            <ul class="space-y-2 text-sm text-ink-gray-8">
              <li
                v-for="(line, i) in data.expenses"
                :key="i"
                class="flex justify-between gap-2"
              >
                <span class="min-w-0">
                  <span class="block font-medium">{{ line.type_label }}</span>
                  <span class="block text-ink-gray-6">{{
                    [line.date, line.description].filter(Boolean).join(' · ')
                  }}</span>
                </span>
                <span class="shrink-0 text-right tabular-nums">
                  {{ money(line.amount, doc.currency) }}
                  <span
                    v-if="
                      Number(doc.docstatus) === 1 &&
                      line.sanctioned < line.amount
                    "
                    class="block text-xs text-ink-gray-6"
                    >{{
                      __('approved {0}', [money(line.sanctioned, doc.currency)])
                    }}</span
                  >
                </span>
              </li>
            </ul>
            <p v-if="doc.approver_name" class="mt-3 text-sm text-ink-gray-7">
              {{ __('Approver: {0}', [doc.approver_name]) }}
            </p>
          </section>

          <section
            v-if="data.payments?.length || doc.reimbursed"
            class="rounded-xl border border-outline-gray-2 p-4"
          >
            <h2 class="mb-2 text-base font-semibold">
              {{ __('Reimbursements', null, 'Gastos') }}
            </h2>
            <p class="text-sm text-ink-gray-8">
              {{
                __('Reimbursed {0} of {1}', [
                  money(doc.reimbursed, doc.currency),
                  money(owedTotal(doc), doc.currency),
                ])
              }}
            </p>
            <ul class="mt-2 space-y-2">
              <li v-for="p in data.payments" :key="p.name" class="text-sm">
                <span class="block font-medium tabular-nums text-ink-gray-9">
                  {{ money(p.amount, p.currency) }} · {{ p.posting_date }}
                </span>
                <span class="block text-ink-gray-6">{{
                  [p.reference_no, p.name].filter(Boolean).join(' · ')
                }}</span>
              </li>
            </ul>
          </section>

          <section class="rounded-xl border border-outline-gray-2 p-4">
            <h2 class="mb-2 text-base font-semibold">{{ __('History') }}</h2>
            <ul class="space-y-2 text-sm">
              <li v-for="(entry, i) in data.history" :key="i">
                <span class="block text-ink-gray-8">{{ entry.text }}</span>
                <span class="block text-xs text-ink-gray-6">{{
                  [entry.who, entry.when?.slice(0, 16)]
                    .filter(Boolean)
                    .join(' · ')
                }}</span>
              </li>
            </ul>
          </section>
        </div>

        <ArchivosRegistroPanel
          class="mt-4"
          doctype="Expense Claim"
          :name="doc.name"
          :return-to="`/crm/gastos/gasto/${encodeURIComponent(doc.name)}`"
          return-label="Gastos"
        />
      </template>
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
          class="max-h-full max-w-full rounded-lg object-contain"
        />
        <button
          type="button"
          class="absolute right-3 top-3 flex size-11 items-center justify-center rounded-full bg-surface-base text-ink-gray-8"
          :aria-label="__('Close', null, 'Gastos')"
          @click.stop="zoom = null"
        >
          <FeatherIcon name="x" class="h-5 w-5" />
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
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FeatherIcon, toast } from 'frappe-ui'
import ApprovalDialog from '@/components/gastos/ApprovalDialog.vue'
import ClaimGuard from '@/components/gastos/ClaimGuard.vue'
import ClaimSheet from '@/components/gastos/ClaimSheet.vue'
import DecideSheet from '@/components/gastos/DecideSheet.vue'
import ReimburseDialog from '@/components/gastos/ReimburseDialog.vue'
import { ArchivosRegistroPanel } from '@/components/archivos'
import { loadGastosBoot } from '@/composables/useGastos'
import {
  advanceText,
  claimBack,
  claimProblem,
  claimsApi,
  money,
  nextClaim,
  owedTotal,
  runOnce,
  stateLabel,
  stateTheme,
} from '@/composables/useGastosEmpleados'

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
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

const doc = computed(() => data.value.document || {})
const actions = computed(() => data.value.actions || [])
const back = computed(() => claimBack(route.query))
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

// «Aprobar» is one tap; the other decisions ask for an amount or a reason.
async function approve() {
  busy.value = true
  problem.value = null
  refusal.value = null
  try {
    const result = await runOnce(claimsApi, 'decide', `decide:${props.name}`, {
      name: props.name,
      decision: 'approve',
      modified: doc.value.modified,
      reason: '',
    })
    if (!result.ok) refusal.value = result
    else await decided(result)
  } catch (error) {
    problem.value = claimProblem(error)
  } finally {
    busy.value = false
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
