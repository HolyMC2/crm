<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-4xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
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
          <Button :label="__('Retry', null, CTX)" @click="start" />
          <Button
            :label="__('Copy access request')"
            @click="copy(requestText)"
          />
          <Button :label="__('Back to Cobranza')" @click="goBack" />
        </div>
        <p v-if="copied" role="status" class="text-sm text-ink-gray-6">
          {{ copied }}
        </p>
      </section>

      <div v-else-if="!data" role="status" class="py-10 text-sm">
        {{ __('Loading the customer’s balance…') }}
      </div>

      <template v-else>
        <div
          v-if="doneNotice"
          role="status"
          class="mb-4 space-y-2 rounded-lg bg-surface-green-1 p-3 text-sm text-ink-green-8"
        >
          <p>{{ doneNotice }}</p>
          <div v-if="data.outstanding <= 0" class="flex flex-wrap gap-2">
            <Button
              variant="solid"
              :label="__('Next customer')"
              :loading="findingNext"
              @click="goNext"
            />
            <Button :label="__('Back to Cobranza')" @click="goBack" />
          </div>
        </div>

        <header class="mb-4 flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <h1 class="text-xl font-semibold text-ink-gray-9">
              {{ data.customer_name }}
            </h1>
            <p class="text-sm text-ink-gray-6">
              {{ data.company }}
              <template v-if="data.phones.length">
                · {{ data.phones.map((p) => p.display).join(', ') }}</template
              >
              <template v-else> · {{ __('No mobile number') }}</template>
            </p>
            <div class="mt-1 flex flex-wrap gap-1">
              <Badge
                v-if="data.suppressed"
                theme="red"
                :label="__('Does not accept messages')"
              />
            </div>
          </div>
          <div class="text-right">
            <p class="text-2xl font-semibold tabular-nums text-ink-gray-9">
              {{ money(data.outstanding, data.currency) }}
            </p>
            <p
              v-if="data.overdue_amount > 0"
              class="text-sm tabular-nums text-ink-red-7"
            >
              {{
                __('{0} overdue', [money(data.overdue_amount, data.currency)])
              }}
            </p>
            <p v-if="data.credit.limit" class="text-xs text-ink-gray-6">
              {{
                __('Credit limit {0}', [
                  money(data.credit.limit, data.currency),
                ])
              }}
            </p>
            <p v-if="data.credit.store_credit" class="text-xs text-ink-gray-6">
              {{
                __('Store credit {0}', [
                  money(data.credit.store_credit, data.currency),
                ])
              }}
            </p>
          </div>
        </header>

        <FormControl
          v-if="data.companies.length > 1"
          class="mb-3 w-full sm:w-64"
          type="select"
          :aria-label="__('Company')"
          :model-value="data.company"
          :options="data.companies.map((c) => ({ label: c, value: c }))"
          @update:model-value="(value) => switchCompany(value)"
        />

        <div
          v-if="problem"
          role="alert"
          class="mb-3 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          <Button class="ml-2" :label="__('Retry', null, CTX)" @click="load" />
        </div>

        <p
          v-if="!invoices.length"
          class="rounded-lg bg-surface-gray-1 p-4 text-sm text-ink-gray-7"
        >
          {{ __('This customer owes nothing right now.') }}
        </p>

        <ul class="space-y-3">
          <li
            v-for="inv in invoices"
            :key="inv.name"
            class="rounded-lg border border-outline-gray-2 p-3"
          >
            <div class="flex flex-wrap items-start gap-2">
              <div class="min-w-0 flex-1">
                <p class="font-medium text-ink-gray-9">
                  <a
                    class="hover:underline"
                    :href="`/app/sales-invoice/${encodeURIComponent(inv.name)}`"
                    >{{ inv.name }}</a
                  >
                  <span class="ml-1 text-sm font-normal text-ink-gray-6">
                    · {{ inv.posting_date }}</span
                  >
                </p>
                <p class="text-sm" :class="toneClass(agingTone(inv))">
                  {{ agingLabel(inv, data.today) }}
                </p>
                <div class="mt-1 flex flex-wrap gap-1">
                  <Badge
                    v-if="promiseChip(inv.promise, data.currency)"
                    :theme="promiseChip(inv.promise, data.currency).theme"
                    :label="promiseChip(inv.promise, data.currency).label"
                  />
                  <Badge
                    v-if="inv.current_dunning"
                    theme="gray"
                    :label="__('{0} sent', [inv.due_label])"
                  />
                </div>
              </div>
              <div class="text-right">
                <p class="font-semibold tabular-nums">
                  {{ money(inv.outstanding, data.currency) }}
                </p>
                <p
                  v-if="inv.outstanding < inv.total"
                  class="text-xs text-ink-gray-6"
                >
                  {{ __('of {0}', [money(inv.total, data.currency)]) }}
                </p>
              </div>
            </div>
            <ul
              v-if="inv.schedule.length > 1"
              class="mt-2 space-y-0.5 text-xs text-ink-gray-6"
            >
              <li v-for="row in inv.schedule" :key="row.due_date">
                {{ __('Due {0}', [row.due_date]) }} ·
                {{ money(row.outstanding, data.currency) }}
              </li>
            </ul>

            <div
              v-if="actionsOf(inv).primary.blocked"
              class="mt-3 rounded-lg bg-surface-amber-1 p-2 text-sm"
            >
              <p>{{ actionsOf(inv).primary.blocked }}</p>
              <Button
                class="mt-2"
                :label="actionsOf(inv).primary.resolve.label"
                :loading="busy === `${inv.name}:resolve`"
                @click="resolve(inv, actionsOf(inv).primary.resolve)"
              />
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <Button
                v-if="!actionsOf(inv).primary.blocked"
                variant="solid"
                class="min-h-11 sm:min-h-8"
                :label="actionsOf(inv).primary.label"
                :loading="busy === `${inv.name}:${actionsOf(inv).primary.key}`"
                @click="run(inv, actionsOf(inv).primary)"
              />
              <Button
                v-for="action in actionsOf(inv).secondary"
                :key="action.key"
                class="min-h-11 sm:min-h-8"
                :label="action.label"
                :loading="busy === `${inv.name}:${action.key}`"
                @click="run(inv, action)"
              />
            </div>
          </li>
        </ul>

        <section v-if="data.timeline.length" class="mt-8">
          <h2 class="mb-2 text-base font-semibold">{{ __('History') }}</h2>
          <ol class="space-y-2 text-sm">
            <li
              v-for="event in data.timeline"
              :key="`${event.doctype}:${event.name}`"
              class="flex gap-2"
            >
              <FeatherIcon
                :name="EVENT_ICONS[event.kind]"
                class="mt-0.5 h-4 w-4 shrink-0 text-ink-gray-5"
              />
              <span class="min-w-0 flex-1">
                <span class="text-ink-gray-9">{{ eventTitle(event) }}</span>
                <span class="block text-xs text-ink-gray-6">
                  {{ event.date }}
                  <template v-if="event.detail"> · {{ event.detail }}</template>
                </span>
              </span>
            </li>
          </ol>
        </section>
      </template>
    </div>

    <Dialog v-model="promiseOpen" :options="{ title: __('Record promise') }">
      <template #body-content>
        <div class="space-y-3">
          <p class="text-sm text-ink-gray-6">
            {{ __('Invoice {0}', [target?.name]) }}
          </p>
          <FormControl
            v-model="promiseForm.date"
            type="date"
            :label="__('Promised date')"
          />
          <FormControl
            v-model="promiseForm.amount"
            type="number"
            :label="__('Promised amount')"
          />
          <FormControl
            v-model="promiseForm.note"
            type="textarea"
            :label="__('Note (optional)')"
          />
          <p v-if="dialogProblem" role="alert" class="text-sm text-ink-red-7">
            {{ dialogProblem.detail }}
          </p>
        </div>
      </template>
      <template #actions>
        <div class="flex justify-end gap-2">
          <Button :label="__('Cancel')" @click="promiseOpen = false" />
          <Button
            variant="solid"
            :label="__('Save promise')"
            :loading="saving"
            :disabled="!promiseForm.date || !(Number(promiseForm.amount) > 0)"
            @click="savePromise"
          />
        </div>
      </template>
    </Dialog>

    <Dialog v-model="callOpen" :options="{ title: __('Log call') }">
      <template #body-content>
        <div class="space-y-3">
          <p class="text-sm text-ink-gray-6">
            {{ __('Invoice {0}', [target?.name]) }}
          </p>
          <FormControl
            v-model="callForm.outcome"
            type="select"
            :label="__('How did it go?')"
            :options="CALL_OUTCOMES"
          />
          <FormControl
            v-model="callForm.note"
            type="textarea"
            :label="__('Note (optional)')"
          />
          <p v-if="dialogProblem" role="alert" class="text-sm text-ink-red-7">
            {{ dialogProblem.detail }}
          </p>
        </div>
      </template>
      <template #actions>
        <div class="flex justify-end gap-2">
          <Button :label="__('Cancel')" @click="callOpen = false" />
          <Button
            variant="solid"
            :label="__('Save call')"
            :loading="saving"
            @click="saveCall"
          />
        </div>
      </template>
    </Dialog>

    <CobranzaSendSheet
      v-model="sendOpen"
      doctype="Dunning"
      :name="sendName"
      :customer-name="data?.customer_name || ''"
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
import CobranzaSendSheet from '@/components/cobranza/CobranzaSendSheet.vue'
import {
  CTX,
  agingLabel,
  agingTone,
  cobranzaApi,
  cobranzaBoot,
  invoiceAction,
  loadCobranzaBoot,
  money,
  nextCustomer,
  outcomeUnknown,
  parsePaymentDone,
  problemOf,
  promiseChip,
  requestId,
  secondaryActions,
  withDueSoon,
} from '@/composables/useCobranza'
import { posCollectHref } from '@/utils/posHandoff'
import {
  safeReturn,
  sanitizeReturnLabel,
} from '@/vendor/muelle-shell/contracts'

const props = defineProps({ customer: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const boot = cobranzaBoot
const data = ref(null)
const guard = ref(null)
const problem = ref(null)
const dialogProblem = ref(null)
const busy = ref('')
const saving = ref(false)
const copied = ref('')
const doneNotice = ref('')
const findingNext = ref(false)
const target = ref(null)
const promiseOpen = ref(false)
const callOpen = ref(false)
const sendOpen = ref(false)
const sendName = ref('')
const promiseForm = reactive({ date: '', amount: '', note: '' })
const callForm = reactive({ outcome: 'answered', note: '' })
// One request id per pending action: a retry after a lost answer reuses it.
const pending = {}

const EVENT_ICONS = {
  payment: 'dollar-sign',
  reminder: 'send',
  promise: 'calendar',
  call: 'phone',
}
const CALL_OUTCOMES = [
  { label: __('Answered'), value: 'answered' },
  { label: __('No answer'), value: 'no_answer' },
  { label: __('Left a message'), value: 'message' },
  { label: __('Visit'), value: 'visit' },
]
const requestText = __(
  'I need access to Cobranza: read permission for Sales Invoice so I can follow what customers owe.',
)

const company = computed(() =>
  typeof route.query.company === 'string' ? route.query.company : '',
)
const returnTo = computed(() => safeReturn(route.query.return_to))
const backLabel = computed(() =>
  returnTo.value
    ? __('Back to {0}', [
        sanitizeReturnLabel(route.query.return_label) || 'Muelle',
      ])
    : __('Cobranza', null, CTX),
)
const invoices = computed(() =>
  withDueSoon(data.value?.invoices || [], data.value?.today || ''),
)

function actionsOf(inv) {
  const caps = data.value?.capabilities || {}
  const primary = invoiceAction(inv, {
    caps,
    ladderReady: data.value?.ladder_ready,
  })
  return { primary, secondary: secondaryActions(inv, primary, caps) }
}

function toneClass(tone) {
  return (
    { red: 'text-ink-red-7', orange: 'text-ink-amber-9' }[tone] ||
    'text-ink-gray-6'
  )
}

function eventTitle(event) {
  const amount = money(event.amount, data.value?.currency)
  return (
    {
      payment: __('Payment {0} · {1}', [event.name, amount]),
      reminder: event.delivery?.label
        ? __('{0} ({1}) · {2}', [event.label, event.name, event.delivery.label])
        : __('{0} ({1})', [event.label, event.name]),
      promise:
        event.status === 'Closed'
          ? __('Promise closed · invoice {0}', [event.invoice])
          : __('Promise · invoice {0}', [event.invoice]),
      call: __('Call · invoice {0}', [event.invoice]),
    }[event.kind] || event.name
  )
}

async function load() {
  problem.value = null
  try {
    data.value = await cobranzaApi('get_customer', {
      customer: props.customer,
      company: company.value,
    })
  } catch (error) {
    const found = problemOf(error)
    if (!data.value && found.kind === 'permission')
      guard.value = {
        title: __('You cannot open this customer'),
        detail: found.detail,
      }
    else problem.value = found
  }
}

async function call(key, method, args) {
  pending[key] = pending[key] || requestId()
  try {
    const result = await cobranzaApi(method, {
      request_id: pending[key],
      ...args,
    })
    delete pending[key]
    return result
  } catch (error) {
    if (!outcomeUnknown(error)) delete pending[key]
    throw error
  }
}

async function run(inv, action) {
  target.value = inv
  dialogProblem.value = null
  if (action.key === 'promise') {
    const soon = new Date(`${data.value.today}T00:00:00Z`)
    soon.setUTCDate(soon.getUTCDate() + 3)
    Object.assign(promiseForm, {
      date: soon.toISOString().slice(0, 10),
      amount: String(inv.outstanding),
      note: '',
    })
    promiseOpen.value = true
    return
  }
  if (action.key === 'call') {
    Object.assign(callForm, { outcome: 'answered', note: '' })
    callOpen.value = true
    return
  }
  if (action.key === 'collect') {
    const back = withoutDone(`/crm${route.fullPath}`)
    window.location.assign(
      posCollectHref(
        { name: inv.name, customer: data.value.customer },
        { returnTo: back, returnLabel: 'Cobranza' },
      ),
    )
    return
  }
  // «Send again» also asks the server: after a payment it prepares a fresh
  // letter with today's balance instead of resending the old amount.
  if (action.key === 'remind' || action.key === 'resend') {
    busy.value = `${inv.name}:remind`
    problem.value = null
    try {
      const result = await call(`remind:${inv.name}`, 'send_reminder_prepare', {
        invoice: inv.name,
      })
      sendName.value = result.dunning
      sendOpen.value = true
      load()
    } catch (error) {
      problem.value = problemOf(error)
    } finally {
      busy.value = ''
    }
  }
}

function withoutDone(path) {
  const url = new URL(path, 'https://muelle.invalid')
  url.searchParams.delete('done')
  return url.pathname + url.search
}

async function resolve(inv, action) {
  if (action.key === 'copy_request')
    return copy(
      __(
        'I need permission to send payment reminders in Cobranza (create and submit Dunning) for invoice {0}.',
        [inv.name],
      ),
    )
  if (action.key === 'copy_folio') return copy(inv.name)
  if (action.key === 'setup') {
    busy.value = `${inv.name}:resolve`
    try {
      await cobranzaApi('setup_ladder', { company: data.value.company })
      toast.success(__('Reminder levels ready'))
      await load()
    } catch (error) {
      problem.value = problemOf(error)
    } finally {
      busy.value = ''
    }
  }
}

async function savePromise() {
  saving.value = true
  dialogProblem.value = null
  try {
    await call(`promise:${target.value.name}`, 'add_promise', {
      invoice: target.value.name,
      date: promiseForm.date,
      amount: promiseForm.amount,
      note: promiseForm.note,
    })
    promiseOpen.value = false
    toast.success(__('Promise saved'))
    await load()
  } catch (error) {
    dialogProblem.value = problemOf(error)
  } finally {
    saving.value = false
  }
}

async function saveCall() {
  saving.value = true
  dialogProblem.value = null
  try {
    await call(`call:${target.value.name}`, 'log_call', {
      invoice: target.value.name,
      outcome: callForm.outcome,
      note: callForm.note,
    })
    callOpen.value = false
    toast.success(__('Call saved'))
    await load()
  } catch (error) {
    dialogProblem.value = problemOf(error)
  } finally {
    saving.value = false
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Copied. Share it with your manager.')
    toast.success(copied.value)
  } catch {
    copied.value = text
  }
}

function listPath() {
  const list = typeof route.query.list === 'string' ? route.query.list : ''
  return list.startsWith('/cobranza') ? list : '/cobranza'
}

function goBack() {
  if (returnTo.value) return window.location.assign(returnTo.value)
  router.push(listPath())
}

async function goNext() {
  findingNext.value = true
  try {
    const list = new URL(listPath(), 'https://muelle.invalid')
    const page = await cobranzaApi('get_queue', {
      segment: list.searchParams.get('segment') || 'vencidas',
      company: list.searchParams.get('company') || '',
      search: list.searchParams.get('q') || '',
      page_length: 5,
    })
    const next = nextCustomer(page.rows, props.customer)
    if (!next) {
      toast.success(__('No more customers in this list'))
      return router.push(listPath())
    }
    router.push({
      name: 'CobranzaCliente',
      params: { customer: next.customer },
      query: { company: next.company, list: listPath() },
    })
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    findingNext.value = false
  }
}

function handleDone() {
  const done = parsePaymentDone(route.query.done)
  if (!done) return
  doneNotice.value = __(
    'Payment recorded ({0}). The balance below is up to date.',
    [done.name],
  )
  const query = { ...route.query }
  delete query.done
  router.replace({ query })
}

async function start() {
  const retry = Boolean(guard.value)
  guard.value = null
  await loadCobranzaBoot({ refresh: retry })
  if (!boot.value?.enabled) {
    guard.value = {
      title: __('Cobranza is not available'),
      detail:
        boot.value?.reason ||
        __('Ask your manager for permission to read sales invoices.'),
    }
    return
  }
  handleDone()
  await load()
}

watch(
  () => [props.customer, company.value],
  () => {
    data.value = null
    doneNotice.value = ''
    start()
  },
)
function switchCompany(value) {
  router.replace({ query: { ...route.query, company: value } })
}
onMounted(start)
</script>
