<template>
  <Dialog v-model="open" :options="{ title: __('Pay {0}', [party || name]) }">
    <template #body-content>
      <div class="space-y-4">
        <p v-if="loading" role="status" class="text-sm text-ink-gray-6">
          {{ __('Loading accounts…') }}
        </p>
        <template v-else-if="options">
          <div
            v-if="options.refusal"
            role="alert"
            class="space-y-2 rounded-lg bg-surface-amber-1 p-3 text-sm"
          >
            <p>{{ options.refusal.reason }}</p>
            <Button
              v-if="options.refusal.fallback === 'release'"
              :label="__('Release hold')"
              @click="handOff('release')"
            />
            <Button
              v-else
              :label="__('Ask for a review')"
              @click="handOff('review')"
            />
          </div>
          <div
            v-else-if="options.needs_setup"
            role="alert"
            class="space-y-2 rounded-lg bg-surface-amber-1 p-3 text-sm"
          >
            <p>
              {{
                __(
                  'This company has no bank or cash account to pay from yet. Ask for it to be set up; this bill stays here.',
                )
              }}
            </p>
            <p v-if="options.other_currency?.length">
              {{ otherCurrencyText }}
            </p>
            <Button :label="__('Ask for setup')" @click="askSetup" />
          </div>
          <template v-else>
            <p class="text-sm text-ink-gray-7">
              {{
                __('Owed: {0}', [
                  money(options.outstanding_amount, options.currency),
                ])
              }}
            </p>
            <p
              v-if="options.fixed_by && account"
              class="rounded-lg bg-surface-gray-2 p-3 text-sm text-ink-gray-8"
            >
              {{
                __(
                  'This bill is set to be paid by {0}, so it is paid from {1}.',
                  [options.fixed_by, account.label],
                )
              }}
            </p>
            <FormControl
              v-model="form.account"
              type="select"
              :disabled="Boolean(options.fixed_by)"
              :label="__('Pay from')"
              :options="[
                { label: __('Choose an account'), value: '' },
                ...options.accounts.map((a) => ({
                  label: `${a.label} · ${a.type === 'Bank' ? __('Bank') : __('Cash', null, 'Gastos')}`,
                  value: a.account,
                })),
              ]"
            />
            <p
              v-if="options.other_currency?.length"
              class="text-xs text-ink-gray-6"
            >
              {{ otherCurrencyText }}
            </p>
            <FormControl
              v-model="form.amount"
              type="number"
              :label="__('Amount ({0})', [options.currency])"
              :min="0"
              :step="0.01"
            />
            <template v-if="needsRate(account, options)">
              <FormControl
                v-model="form.exchange_rate"
                type="number"
                :label="
                  __('Exchange rate ({0} to {1})', [
                    options.exchange_rate.from,
                    options.exchange_rate.to,
                  ])
                "
                :min="0"
                :step="0.0001"
              />
              <p
                v-if="options.exchange_rate.missing"
                role="alert"
                class="text-sm text-ink-amber-7"
              >
                {{ options.exchange_rate.missing }}
                <a
                  v-if="boot?.capabilities?.desk"
                  class="text-ink-blue-link underline"
                  :href="options.exchange_rate.desk"
                  target="_blank"
                  rel="noopener"
                  >{{ __('Open exchange rates') }}</a
                >
                {{ __('You can also type the rate your bank used.') }}
              </p>
              <p v-else class="text-xs text-ink-gray-6">
                {{
                  __(
                    'Rate on file for {0}: {1}. Change it if your bank used another.',
                    [options.exchange_rate.date, options.exchange_rate.rate],
                  )
                }}
              </p>
              <p v-if="bank" class="text-sm text-ink-gray-8">
                {{
                  __('{0} leaves the account.', [
                    money(bank.amount, bank.currency),
                  ])
                }}
              </p>
            </template>
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
            <p
              v-if="tried && missing.length"
              role="alert"
              class="text-sm text-ink-red-7"
            >
              {{ __('Missing: {0}', [missingText]) }}
            </p>
            <p
              v-if="Number(form.amount) > Number(options.outstanding_amount)"
              class="text-sm text-ink-amber-7"
            >
              {{ __('That is more than what is owed on this bill.') }}
            </p>
          </template>
        </template>
        <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
          {{ problem.detail }}
        </p>
        <p v-if="resumed" role="status" class="text-sm text-ink-gray-7">
          {{
            __(
              'A payment of this bill was sent and we did not hear back. Check result asks about that same payment; it never pays twice.',
            )
          }}
        </p>
      </div>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button :label="__('Cancel', null, 'Gastos')" @click="open = false" />
        <Button
          v-if="options && !options.needs_setup && !options.refusal"
          variant="solid"
          :loading="busy"
          :label="resumed ? __('Check result') : __('Pay', null, 'Gastos')"
          @click="pay"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button, Dialog, FormControl } from 'frappe-ui'
import {
  bankSide,
  gastosApi,
  gastosBoot as boot,
  money,
  needsRate,
  needsReference,
  outcomeUnknown,
  payBill,
  payMissing,
  pendingPayment,
  problemOf,
} from '@/composables/useGastos'

// «Pagar»: ERPNext maps the payment from the bill on the server; this form
// only picks the account, amount and the bank reference.
const props = defineProps({
  name: { type: String, required: true },
  party: { type: String, default: '' },
})
const emit = defineEmits(['paid', 'failed', 'setup', 'release', 'review'])
const open = defineModel({ type: Boolean, default: false })
const options = ref(null)
const loading = ref(false)
const busy = ref(false)
const tried = ref(false)
const problem = ref(null)
const resumed = ref(false)
let kept = null
const form = reactive({
  account: '',
  amount: '',
  reference_no: '',
  reference_date: '',
  exchange_rate: '',
})

const account = computed(() =>
  options.value?.accounts?.find((a) => a.account === form.account),
)
const bank = computed(() => bankSide(form, options.value))
const otherCurrencyText = computed(() =>
  __(
    'Accounts in another currency ({0}) cannot pay this bill here yet; use one in {1}.',
    [
      options.value.other_currency
        .map((a) => `${a.label} · ${a.currency}`)
        .join(', '),
      [
        ...new Set([options.value.currency, options.value.company_currency]),
      ].join(' / '),
    ],
  ),
)
const missing = computed(() => payMissing(form, options.value))
const LABELS = {
  account: 'account',
  amount: 'amount',
  reference_no: 'transfer or check number',
  reference_date: 'payment date',
  exchange_rate: 'exchange rate',
}
const missingText = computed(() =>
  missing.value.map((key) => __(LABELS[key])).join(', '),
)

watch(open, async (value) => {
  if (!value) return
  problem.value = null
  tried.value = false
  const pending = pendingPayment(props.name)
  resumed.value = Boolean(pending)
  loading.value = true
  try {
    options.value = await gastosApi('pay_options', { name: props.name })
    const preferred =
      options.value.accounts.find((a) => a.is_default) ||
      options.value.accounts[0]
    // A refused payment keeps what the worker typed for the next try.
    Object.assign(
      form,
      pending?.data ||
        kept || {
          account: preferred?.account || '',
          amount: options.value.outstanding_amount,
          reference_no: '',
          reference_date: options.value.today,
          exchange_rate: options.value.exchange_rate?.rate || '',
        },
    )
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    loading.value = false
  }
})

async function pay() {
  tried.value = true
  if (!resumed.value && missing.value.length) return
  busy.value = true
  problem.value = null
  try {
    const result = await payBill(gastosApi, props.name, form)
    resumed.value = false
    kept = null
    open.value = false
    emit('paid', result)
  } catch (error) {
    resumed.value = outcomeUnknown(error)
    if (resumed.value) problem.value = problemOf(error)
    else {
      // A definite refusal (closed period, over the balance, permissions):
      // the record shows ERPNext's reason with its way forward.
      kept = { ...form }
      open.value = false
      emit('failed', problemOf(error))
    }
  } finally {
    busy.value = false
  }
}
function handOff(next) {
  open.value = false
  emit(next, options.value.refusal.reason)
}
function askSetup() {
  open.value = false
  emit('setup')
}
</script>
