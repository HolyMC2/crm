<template>
  <CobranzaSheet
    :model-value="modelValue"
    kind="payment"
    size="xl"
    :title="__('Register payment')"
    :subtitle="ctx ? ctx.customer_name : customerName"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div v-if="loading && !ctx" role="status" class="text-sm text-ink-gray-6">
      {{ __('Loading what this customer owes…') }}
    </div>
    <div
      v-if="loadError"
      role="alert"
      class="rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
    >
      <strong>{{ loadError.title }}.</strong> {{ loadError.detail }}
      <Button class="ml-2" :label="__('Retry', null, CTX)" @click="load" />
    </div>

    <template v-if="ctx">
      <!-- Refused: the specific reason, and both ways out (ask, or the register). -->
      <div
        v-if="!ctx.can_pay"
        role="alert"
        class="space-y-2 rounded-lg bg-surface-amber-1 p-3 text-sm"
        data-payment-refused
      >
        <p>{{ ctx.problem }}</p>
        <div class="flex flex-wrap gap-2">
          <Button
            class="min-h-11 sm:min-h-8"
            :label="__('Copy access request')"
            @click="copyRequest"
          />
          <Button
            v-if="caps.collect"
            class="min-h-11 sm:min-h-8"
            :label="__('Collect at the register')"
            @click="collect"
          />
        </div>
      </div>

      <template v-else>
        <fieldset>
          <legend class="mb-1 text-sm text-ink-gray-7">
            {{ __('Invoices this payment settles') }}
          </legend>
          <ul
            class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
          >
            <li v-for="inv in ctx.invoices" :key="inv.name">
              <label
                class="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2"
              >
                <input
                  type="checkbox"
                  class="h-5 w-5 shrink-0 rounded"
                  :checked="form.invoices.includes(inv.name)"
                  @change="toggle(inv.name)"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium">{{ inv.name }}</span>
                  <span
                    class="block text-xs"
                    :class="
                      inv.overdue_days > 0
                        ? 'text-ink-red-7'
                        : 'text-ink-gray-6'
                    "
                    >{{ agingLabel(inv, ctx.today) }}</span
                  >
                </span>
                <span class="shrink-0 text-right text-sm tabular-nums">
                  <span class="block">{{
                    money(inv.outstanding, inv.currency)
                  }}</span>
                  <span
                    v-if="applied[inv.name] !== undefined"
                    class="block text-xs text-ink-green-8"
                    >{{
                      applied[inv.name] >= inv.outstanding
                        ? __('paid in full')
                        : __('{0} applied', [
                            money(applied[inv.name], inv.currency),
                          ])
                    }}</span
                  >
                </span>
              </label>
            </li>
          </ul>
        </fieldset>

        <FormControl
          v-model="form.amount"
          type="number"
          inputmode="decimal"
          :label="__('Amount received ({0})', [currency])"
          @update:model-value="amountTouched = true"
        />
        <FormControl
          v-model="form.mode"
          type="select"
          :label="__('How did they pay?')"
          :options="modeOptions"
        />
        <p v-if="modeNote" class="text-xs text-ink-gray-6">{{ modeNote }}</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <FormControl
            v-model="form.date"
            type="date"
            :label="__('Payment date')"
            :max="ctx.today"
          />
          <FormControl
            v-if="foreign"
            v-model="form.rate"
            type="number"
            inputmode="decimal"
            :label="
              __('Exchange rate (1 {0} = ? {1})', [
                currency,
                ctx.company_currency,
              ])
            "
          />
        </div>
        <div v-if="needsReference" class="grid gap-3 sm:grid-cols-2">
          <FormControl
            v-model="form.reference"
            type="text"
            :label="__('Transfer or deposit reference')"
          />
          <FormControl
            v-model="form.referenceDate"
            type="date"
            :label="__('Reference date')"
            :max="ctx.today"
          />
        </div>
        <FormControl
          v-model="form.remarks"
          type="textarea"
          :label="__('Note (optional)')"
        />

        <div
          v-if="problem"
          role="status"
          class="space-y-2 rounded-lg bg-surface-amber-1 p-3 text-sm"
          data-payment-problem
        >
          <p>{{ problem.text }}</p>
          <div v-if="problem.action" class="flex flex-wrap gap-2">
            <Button
              v-if="problem.action === 'copy_request'"
              class="min-h-11 sm:min-h-8"
              :label="__('Copy access request')"
              @click="copyRequest"
            />
            <a
              v-if="problem.action === 'setup_modes'"
              class="inline-flex min-h-11 items-center text-ink-blue-link underline sm:min-h-0"
              href="/app/mode-of-payment"
              target="_blank"
              rel="noopener"
              >{{ __('Open modes of payment') }}</a
            >
          </div>
        </div>
        <div
          v-if="saveError"
          role="alert"
          class="rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ saveError.title }}.</strong> {{ saveError.detail }}
        </div>
      </template>
    </template>

    <template #actions>
      <Button
        v-if="caps.collect && ctx?.can_pay"
        variant="ghost"
        :label="__('Collect at the register instead')"
        @click="collect"
      />
      <Button
        :label="__('Cancel')"
        @click="$emit('update:modelValue', false)"
      />
      <Button
        v-if="ctx?.can_pay"
        variant="solid"
        :label="
          Number(form.amount) > 0
            ? __('Register {0}', [money(form.amount, currency)])
            : __('Register payment')
        "
        :loading="saving"
        :disabled="Boolean(problem)"
        @click="save"
      />
    </template>
  </CobranzaSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button, FormControl, toast } from 'frappe-ui'
import CobranzaSheet from '@/components/cobranza/CobranzaSheet.vue'
import {
  ACTIONS,
  CTX,
  agingLabel,
  allocatePayment,
  cobranzaApi,
  money,
  paymentProblem,
  problemOf,
} from '@/composables/useCobranza'
import { createRequests } from '@/composables/useCobranzaActions'

// «Registrar pago»: a submitted ERPNext Payment Entry against the customer's
// invoices (bank transfer, deposit, cash received outside the register). Cash
// at the counter keeps going through the register («Cobrar en caja»); both are
// offered. The server checks every permission and amount again.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  customer: { type: String, default: '' },
  company: { type: String, default: '' },
  customerName: { type: String, default: '' },
  invoice: { type: String, default: '' },
  caps: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:modelValue', 'saved', 'collect'])
const call = createRequests()
const ctx = ref(null)
const loading = ref(false)
const loadError = ref(null)
const saveError = ref(null)
const saving = ref(false)
const amountTouched = ref(false)
const form = reactive({
  key: '',
  invoices: [],
  amount: '',
  mode: '',
  date: '',
  reference: '',
  referenceDate: '',
  rate: '',
  remarks: '',
})

const chosen = computed(() =>
  (ctx.value?.invoices || []).filter((inv) => form.invoices.includes(inv.name)),
)
const currency = computed(
  () => chosen.value[0]?.currency || ctx.value?.invoices?.[0]?.currency || '',
)
const foreign = computed(
  () =>
    Boolean(currency.value && ctx.value?.company_currency) &&
    currency.value !== ctx.value.company_currency,
)
const mode = computed(() =>
  (ctx.value?.modes || []).find((m) => m.name === form.mode),
)
const needsReference = computed(() => Boolean(mode.value?.needs_reference))
const modeOptions = computed(() =>
  (ctx.value?.modes || []).map((m) => ({
    label: m.account ? m.name : __('{0} (no account)', [m.name]),
    value: m.name,
    disabled: !m.account,
  })),
)
const modeNote = computed(() => {
  const unusable = (ctx.value?.modes || []).find(
    (m) => m.name === form.mode && !m.account,
  )
  return unusable?.problem || ''
})
const applied = computed(() =>
  Object.fromEntries(
    allocatePayment(chosen.value, form.amount).rows.map((row) => [
      row.invoice,
      row.amount,
    ]),
  ),
)
const problem = computed(() =>
  ctx.value
    ? paymentProblem(ctx.value, {
        invoices: form.invoices,
        amount: form.amount,
        mode: form.mode,
        reference: form.reference,
        date: form.date,
      })
    : null,
)

function sumOf(invoices) {
  return (
    Math.round(
      invoices.reduce((sum, inv) => sum + Number(inv.outstanding || 0), 0) *
        100,
    ) / 100
  )
}

function toggle(name) {
  form.invoices = form.invoices.includes(name)
    ? form.invoices.filter((n) => n !== name)
    : [...form.invoices, name]
  if (!amountTouched.value) form.amount = String(sumOf(chosen.value))
}

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const data = await cobranzaApi(`${ACTIONS}.payment_context`, {
      customer: props.customer,
      company: props.company,
    })
    ctx.value = data
    const key = `${props.customer}|${props.company}|${props.invoice}`
    if (form.key === key) return
    // A fresh draft: the invoice the worker came from, else everything overdue.
    const overdue = data.invoices.filter((inv) => inv.overdue_days > 0)
    const start = props.invoice
      ? data.invoices.filter((inv) => inv.name === props.invoice)
      : overdue.length
        ? overdue
        : data.invoices
    amountTouched.value = false
    Object.assign(form, {
      key,
      invoices: start.map((inv) => inv.name),
      amount: String(sumOf(start)),
      mode: data.default_mode || '',
      date: data.today,
      reference: '',
      referenceDate: data.today,
      rate: data.suggested_rate ? String(data.suggested_rate) : '',
      remarks: '',
    })
    saveError.value = null
  } catch (error) {
    loadError.value = problemOf(error)
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.customer, props.company, props.invoice],
  ([open]) => {
    if (open && props.customer && props.company) load()
  },
  { immediate: true },
)

async function save() {
  if (problem.value) return
  saving.value = true
  saveError.value = null
  try {
    const result = await call(
      `payment:${props.customer}:${props.company}`,
      `${ACTIONS}.register_payment`,
      {
        customer: props.customer,
        company: props.company,
        allocations: allocatePayment(chosen.value, form.amount).rows,
        mode_of_payment: form.mode,
        posting_date: form.date,
        reference_no: needsReference.value ? form.reference : '',
        reference_date: needsReference.value ? form.referenceDate : '',
        exchange_rate: foreign.value && form.rate ? form.rate : null,
        remarks: form.remarks,
      },
    )
    form.key = ''
    emit('update:modelValue', false)
    emit('saved', result)
  } catch (error) {
    saveError.value = problemOf(error)
  } finally {
    saving.value = false
  }
}

function collect() {
  emit('update:modelValue', false)
  emit('collect', form.invoices[0] || props.invoice || '')
}

async function copyRequest() {
  const text = __(
    'I need permission to register customer payments in Cobranza (create and submit Payment Entry) for {0}.',
    [props.company],
  )
  try {
    await navigator.clipboard.writeText(text)
    toast.success(__('Request copied. Share it with your manager.'))
  } catch {
    toast.success(text)
  }
}
</script>
