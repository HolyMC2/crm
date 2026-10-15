<template>
  <!-- «Pagar» several bills: each one paid in full by its own payment (the
       same «Pagar» as one bill, re-checked by the server), from one account,
       with one result per bill. -->
  <PowerSheet
    :model-value="modelValue"
    kind="bulk-pay"
    :title="title"
    @update:model-value="close"
  >
    <PowerResults
      v-if="results.length"
      :results="resultRows"
      :done-label="__('Paid', null, 'Gastos')"
      @open="(entry) => $emit('open', entry.row)"
      @retry="run"
    />
    <template v-else>
      <div
        v-if="plan.mixed"
        role="alert"
        class="space-y-2 rounded-lg bg-surface-amber-1 p-3 text-sm"
        data-bulk-mixed
      >
        <p>
          {{
            __(
              'These bills are of different companies or currencies. Pay them one group at a time:',
            )
          }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            v-for="group in plan.groups"
            :key="group.key"
            class="min-h-11 sm:min-h-8"
            :label="
              __('Keep {0} · {1} ({2})', [
                group.company,
                group.currency,
                group.rows.length,
              ])
            "
            @click="$emit('narrow', group.rows)"
          />
        </div>
      </div>
      <template v-else-if="plan.payable.length">
        <p class="text-base text-ink-gray-8">
          {{
            plan.payable.length === 1
              ? __('1 bill · {0} in total', [money(plan.total, plan.currency)])
              : __('{0} bills · {1} in total', [
                  plan.payable.length,
                  money(plan.total, plan.currency),
                ])
          }}
        </p>
        <ul
          class="max-h-48 divide-y divide-outline-gray-1 overflow-y-auto text-sm"
        >
          <li
            v-for="row in plan.payable"
            :key="row.name"
            class="flex justify-between gap-2 py-1.5"
          >
            <span class="min-w-0 truncate"
              >{{ row.party || row.name }} · {{ row.bill_no || row.name }}</span
            >
            <span class="shrink-0 tabular-nums">{{
              money(row.outstanding_amount, row.owed_currency || row.currency)
            }}</span>
          </li>
        </ul>
        <p v-if="loading" role="status" class="text-sm text-ink-gray-6">
          {{ __('Loading accounts…') }}
        </p>
        <div
          v-else-if="!accounts.length"
          role="alert"
          class="space-y-2 rounded-lg bg-surface-amber-1 p-3 text-sm"
        >
          <p>{{ noAccount }}</p>
        </div>
        <template v-else>
          <FormControl
            v-model="form.account"
            type="select"
            :label="__('Pay from')"
            :options="[
              { label: __('Choose an account'), value: '' },
              ...accounts.map((a) => ({
                label: `${a.label} · ${a.type === 'Bank' ? __('Bank') : __('Cash', null, 'Gastos')}`,
                value: a.account,
              })),
            ]"
          />
          <FormControl
            v-model="form.reference_no"
            type="text"
            :label="
              needsReference(account)
                ? __('Transfer or check number')
                : __('Reference (optional)')
            "
          />
          <FormControl
            v-model="form.reference_date"
            type="date"
            :label="__('Payment date')"
          />
        </template>
      </template>
      <p
        v-if="plan.skipped.length"
        class="text-sm text-ink-gray-6"
        data-bulk-skipped
      >
        {{
          __('Left out: {0}', [
            plan.skipped
              .map((s) => `${s.row.bill_no || s.row.name} (${s.reason})`)
              .join('; '),
          ])
        }}
      </p>
      <p
        v-if="tried && missing.length"
        role="alert"
        class="text-sm text-ink-red-7"
      >
        {{ __('Missing: {0}', [missingText]) }}
      </p>
      <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
        {{ problem }}
      </p>
    </template>
    <template #actions>
      <Button
        class="min-h-11 sm:min-h-8"
        :label="
          results.length
            ? __('Close', null, 'Gastos')
            : __('Cancel', null, 'Gastos')
        "
        @click="close(false)"
      />
      <Button
        v-if="!results.length && canRun"
        variant="solid"
        class="min-h-11 sm:min-h-8"
        :loading="running"
        :label="
          plan.payable.length === 1
            ? __('Pay 1 bill')
            : __('Pay {0} bills', [plan.payable.length])
        "
        @click="run"
      />
    </template>
  </PowerSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button, FormControl } from 'frappe-ui'
import PowerResults from '@/components/power/PowerResults.vue'
import PowerSheet from '@/components/power/PowerSheet.vue'
import {
  bulkAccounts,
  bulkPayMissing,
  bulkPayPlan,
  gastosApi,
  money,
  needsReference,
  outcomeUnknown,
  payBill,
  problemOf,
} from '@/composables/useGastos'
import { runBulk } from '@/utils/powerList'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  rows: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'done', 'open', 'narrow'])
const options = ref(null)
const loading = ref(false)
const running = ref(false)
const tried = ref(false)
const problem = ref('')
const results = ref([])
const form = reactive({ account: '', reference_no: '', reference_date: '' })

const plan = computed(() => bulkPayPlan(props.rows))
const accounts = computed(() =>
  bulkAccounts(options.value, plan.value.currency),
)
const account = computed(() =>
  accounts.value.find((a) => a.account === form.account),
)
const missing = computed(() => bulkPayMissing(form, accounts.value))
const LABELS = {
  account: 'account',
  reference_no: 'transfer or check number',
  reference_date: 'payment date',
}
const missingText = computed(() =>
  missing.value.map((key) => __(LABELS[key])).join(', '),
)
const canRun = computed(
  () =>
    !plan.value.mixed &&
    plan.value.payable.length > 0 &&
    accounts.value.length > 0 &&
    !loading.value,
)
const title = computed(() =>
  results.value.length ? __('Payments', null, 'Gastos') : __('Pay bills'),
)
const noAccount = computed(
  () =>
    options.value?.refusal?.reason ||
    __(
      'No bank or cash account in {0} can pay these bills here. Pay them one by one from each bill (to type an exchange rate), or ask for an account to be set up.',
      [plan.value.currency],
    ),
)
const resultRows = computed(() =>
  results.value.map((entry) => ({
    key: entry.item.name,
    row: entry.item,
    status: entry.status,
    label: `${entry.item.party || entry.item.name} · ${entry.item.bill_no || entry.item.name}`,
    detail: entry.detail,
    actionLabel: __('Open bill'),
  })),
)

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    results.value = []
    problem.value = ''
    tried.value = false
    options.value = null
    const first = plan.value.payable[0]
    if (!first || plan.value.mixed) return
    loading.value = true
    try {
      options.value = await gastosApi('pay_options', { name: first.name })
      const usable = accounts.value
      const preferred = usable.find((a) => a.is_default) || usable[0]
      Object.assign(form, {
        account: preferred?.account || '',
        reference_no: '',
        reference_date: options.value.today,
      })
    } catch (error) {
      problem.value = problemOf(error).detail
    } finally {
      loading.value = false
    }
  },
)

async function run() {
  tried.value = true
  if (missing.value.length) return
  running.value = true
  problem.value = ''
  // A retry (an answer lost on the way) pays only what has no result yet.
  const done = new Set(
    results.value
      .filter((entry) => entry.status === 'done' || entry.status === 'already')
      .map((entry) => entry.item.name),
  )
  const kept = results.value.filter((entry) => done.has(entry.item.name))
  const fresh = await runBulk(
    plan.value.payable.filter((row) => !done.has(row.name)),
    async (row) => {
      const result = await payBill(gastosApi, row.name, {
        account: form.account,
        amount: row.outstanding_amount,
        reference_no: form.reference_no,
        reference_date: form.reference_date,
        exchange_rate: 0,
      })
      return {
        status: result.already ? 'already' : 'done',
        result,
        detail: __('Paid with {0}', [result.payment_entry]),
      }
    },
    {
      describe: (error) => problemOf(error).detail,
      unknown: outcomeUnknown,
      onProgress: (partial) => (results.value = [...kept, ...partial]),
    },
  )
  results.value = [...kept, ...fresh]
  running.value = false
  // Only this run's payments: an earlier run already offered its own «Deshacer».
  emit('done', fresh)
}

function close(value) {
  if (value) return
  emit('update:modelValue', false)
}
</script>
