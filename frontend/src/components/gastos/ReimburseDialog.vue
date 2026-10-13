<template>
  <Dialog v-model="open" :title="__('Reimburse {0}', [employeeName || name])">
    <template #default>
      <div class="space-y-4" data-testid="reimburse-dialog">
        <p v-if="loading" role="status" class="text-sm text-ink-gray-6">
          {{ __('Loading accounts…') }}
        </p>
        <template v-else-if="options">
          <ClaimGuard
            v-if="options.refusal"
            :guard="{
              code: 'refusal',
              message: options.refusal.reason,
              actions: options.refusal.fallback
                ? [
                    {
                      key: 'ask_reimburse',
                      label: __('Ask for it to be reimbursed'),
                    },
                  ]
                : [],
            }"
            @action="handOff"
          />
          <ClaimGuard
            v-else-if="options.needs_setup"
            :guard="{
              code: 'needs_setup',
              message: __(
                'This company has no bank or cash account to pay from yet, outside the cash registers. Ask for it to be set up; the expense stays approved.',
              ),
              actions: [
                {
                  key: 'request_setup',
                  what: 'types',
                  label: __('Ask for it to be set up'),
                },
              ],
            }"
          />
          <template v-else>
            <p class="text-sm text-ink-gray-7">
              {{
                __('Owed to {0}: {1}', [
                  employeeName || name,
                  money(options.outstanding, options.currency),
                ])
              }}
            </p>
            <FormControl
              v-model="form.account"
              type="select"
              :label="__('Pay from')"
              :options="accountOptions"
            />
            <p
              v-if="options.held_by_pos?.length"
              class="rounded-lg bg-surface-gray-2 p-3 text-sm text-ink-gray-8"
              data-testid="held-accounts"
            >
              {{ options.held_reason }}
            </p>
            <FormControl
              v-model="form.amount"
              type="number"
              inputmode="decimal"
              :label="__('Amount ({0})', [options.currency])"
              :min="0"
              :step="0.01"
            />
            <FormControl
              v-model="form.reference_no"
              type="text"
              :label="
                account?.type === 'Bank'
                  ? __('Transfer or check number')
                  : __('Reference (optional)')
              "
            />
            <FormControl
              v-model="form.reference_date"
              type="date"
              :label="__('Payment date')"
            />
            <p
              v-if="tried && missing.length"
              role="alert"
              class="text-sm text-ink-red-7"
            >
              {{ __('Missing: {0}', [missingText]) }}
            </p>
            <p
              v-if="Number(form.amount) > Number(options.outstanding)"
              class="text-sm text-ink-amber-9"
            >
              {{ __('That is more than what is owed on this expense.') }}
            </p>
          </template>
        </template>
        <ClaimGuard v-if="refusal" :guard="refusal" @action="handOff" />
        <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
          {{ problem.detail }}
        </p>
        <p v-if="resumed" role="status" class="text-sm text-ink-gray-7">
          {{
            __(
              'A reimbursement of this expense was sent and we did not hear back. Check result asks about that same payment; it never pays twice.',
            )
          }}
        </p>
      </div>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button :label="__('Cancel', null, 'Gastos')" @click="open = false" />
        <Button
          v-if="options && !options.refusal && !options.needs_setup"
          variant="solid"
          :loading="busy"
          :label="
            resumed ? __('Check result') : __('Reimburse', null, 'Gastos')
          "
          @click="reimburse"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button, Dialog, FormControl } from 'frappe-ui'
import ClaimGuard from '@/components/gastos/ClaimGuard.vue'
import {
  claimProblem,
  claimsApi,
  money,
  outcomeUnknown,
  pendingOperation,
  reimburseMissing,
  runOnce,
} from '@/composables/useGastosEmpleados'

// «Reembolsar»: HRMS maps the payment from the claim on the server; this form
// picks the account (never a cash register's), the amount and the reference.
const props = defineProps({
  name: { type: String, required: true },
  employeeName: { type: String, default: '' },
})
const emit = defineEmits(['reimbursed', 'ask'])
const open = defineModel({ type: Boolean, default: false })
const options = ref(null)
const loading = ref(false)
const busy = ref(false)
const tried = ref(false)
const problem = ref(null)
const refusal = ref(null)
const resumed = ref(false)
let kept = null
const form = reactive({
  account: '',
  amount: '',
  reference_no: '',
  reference_date: '',
})

const key = computed(() => `reimburse:${props.name}`)
const account = computed(() =>
  options.value?.accounts?.find((a) => a.account === form.account),
)
const accountOptions = computed(() => [
  { label: __('Choose an account'), value: '' },
  ...(options.value?.accounts || []).map((a) => ({
    label: `${a.label} · ${a.type === 'Bank' ? __('Bank') : __('Cash', null, 'Gastos')}`,
    value: a.account,
  })),
  // The registers' cash, shown so nobody looks for it, never usable here (D2).
  ...(options.value?.held_by_pos || []).map((a) => ({
    label: __('{0} · cash register', [a.label]),
    value: a.account,
    disabled: true,
  })),
])
const missing = computed(() => reimburseMissing(form, options.value))
const LABELS = {
  account: 'account',
  amount: 'amount',
  reference_no: 'transfer or check number',
  reference_date: 'payment date',
}
const missingText = computed(() =>
  missing.value.map((k) => __(LABELS[k])).join(', '),
)

watch(open, async (value) => {
  if (!value) return
  problem.value = null
  refusal.value = null
  tried.value = false
  const pending = pendingOperation(key.value)
  resumed.value = Boolean(pending)
  loading.value = true
  try {
    options.value = await claimsApi('reimburse_options', { name: props.name })
    const preferred =
      options.value.accounts.find((a) => a.is_default) ||
      options.value.accounts[0]
    Object.assign(
      form,
      pending?.data ||
        kept || {
          account: preferred?.account || '',
          amount: options.value.outstanding,
          reference_no: '',
          reference_date: options.value.today,
        },
    )
  } catch (error) {
    problem.value = claimProblem(error)
  } finally {
    loading.value = false
  }
})

async function reimburse() {
  tried.value = true
  if (!resumed.value && missing.value.length) return
  busy.value = true
  problem.value = null
  refusal.value = null
  try {
    const result = await runOnce(claimsApi, 'reimburse', key.value, {
      name: props.name,
      account: form.account,
      amount: Number(form.amount),
      reference_no: String(form.reference_no || '').trim(),
      reference_date: form.reference_date,
    })
    resumed.value = false
    kept = null
    if (!result.ok) {
      // Paid meanwhile («Ya está pagado»): its payment and the way on.
      refusal.value = result
      return
    }
    open.value = false
    emit('reimbursed', result)
  } catch (error) {
    resumed.value = outcomeUnknown(error)
    if (!resumed.value) kept = { ...form }
    problem.value = claimProblem(error)
  } finally {
    busy.value = false
  }
}

function handOff(action) {
  open.value = false
  emit('ask', action)
}
</script>
