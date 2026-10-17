<template>
  <!-- The shared sheet (S1 ui/BottomSheet): handle, scrim, back closes it;
       the actions full width at the thumb, the decision last. -->
  <BottomSheet
    :open="open"
    :title="title"
    :dismissible="!busy"
    @update:open="(value) => (value ? (open = true) : close())"
  >
    <div class="space-y-4" data-testid="decide-sheet">
      <p class="text-sm text-ink-gray-7">
        {{
          __('{0} asked for {1}.', [
            claim.employee_name,
            money(claim.claimed, claim.currency),
          ])
        }}
      </p>
      <FormControl
        v-if="mode === 'less'"
        v-model="amount"
        type="number"
        data-field="amount"
        inputmode="decimal"
        :label="__('Amount you approve ({0})', [claim.currency])"
        :min="0"
        :step="0.01"
      />
      <FormControl
        v-model="reason"
        type="textarea"
        data-field="reason"
        :label="reasonLabel"
        :placeholder="reasonHint"
      />
      <p v-if="tried && missing" role="alert" class="text-sm text-ink-red-7">
        {{ missing }}
      </p>
      <ClaimGuard v-if="refusal" :guard="refusal" @action="onAction" />
      <div
        v-if="problem"
        role="alert"
        class="rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
      </div>
      <p v-if="resumed" role="status" class="text-sm text-ink-gray-7">
        {{
          __(
            'A decision on this expense was sent and we did not hear back. Trying again checks that same decision.',
          )
        }}
      </p>
    </div>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        :label="__('Cancel', null, 'Gastos')"
        :disabled="busy"
        @click="close"
      />
      <Button
        variant="solid"
        class="min-h-11 w-full"
        :theme="mode === 'reject' ? 'red' : 'gray'"
        :loading="busy"
        data-testid="decide-confirm"
        :label="confirmLabel"
        @click="decide"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Button, FormControl } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import ClaimGuard from '@/components/gastos/ClaimGuard.vue'
import {
  claimProblem,
  claimsApi,
  money,
  pendingOperation,
  runOnce,
  sameDecision,
} from '@/composables/useGastosEmpleados'

// «Aprobar menos», «Rechazar» and «Pedir corrección» (a reason is required);
// plain «Aprobar» is one tap on the record and never opens this sheet.
const props = defineProps({
  claim: { type: Object, required: true },
  mode: { type: String, default: 'less' },
})
const emit = defineEmits(['decided', 'action'])
const open = defineModel({ type: Boolean, default: false })
const amount = ref('')
const reason = ref('')
const busy = ref(false)
const tried = ref(false)
const refusal = ref(null)
const problem = ref(null)
const resumed = ref(false)
let opener = null

const key = computed(() => `decide:${props.claim.name}`)
const title = computed(
  () =>
    ({
      less: __('Approve less'),
      reject: __('Reject the expense'),
      return: __('Ask for a correction'),
    })[props.mode],
)
const reasonLabel = computed(
  () =>
    ({
      less: __('Why you approve less'),
      reject: __('Why you reject it'),
      return: __('What needs to be corrected'),
    })[props.mode],
)
const reasonHint = computed(
  () =>
    ({
      less: __('E.g. the receipt says 250'),
      reject: __('E.g. the receipt is missing'),
      return: __('E.g. the photo cannot be read'),
    })[props.mode],
)
const confirmLabel = computed(() =>
  props.mode === 'less'
    ? __('Approve {0}', [
        Number(amount.value) > 0
          ? money(amount.value, props.claim.currency)
          : '',
      ]).trim()
    : props.mode === 'reject'
      ? __('Reject', null, 'Gastos')
      : __('Ask for a correction'),
)
const missing = computed(() => {
  if (props.mode === 'less' && !(Number(amount.value) > 0))
    return __('Write the amount you approve.')
  if (!String(reason.value || '').trim()) return __('Write the reason.')
  return ''
})

watch(open, async (value) => {
  if (!value) return
  opener = document.activeElement
  const pending = pendingOperation(key.value)
  resumed.value = Boolean(pending)
  amount.value = pending?.data?.sanctioned ?? props.claim.claimed ?? ''
  reason.value = pending?.data?.reason || ''
  tried.value = false
  refusal.value = null
  problem.value = null
})

function close() {
  if (busy.value) return
  open.value = false
  nextTick(() => opener?.focus?.())
}

function onAction(action) {
  close()
  emit('action', action)
}

async function decide() {
  tried.value = true
  if (missing.value) return
  busy.value = true
  refusal.value = null
  problem.value = null
  try {
    const data = {
      name: props.claim.name,
      decision: props.mode === 'less' ? 'approve' : props.mode,
      modified: props.claim.modified,
      reason: String(reason.value).trim(),
    }
    if (props.mode === 'less') data.sanctioned = Number(amount.value)
    // A different decision still unconfirmed is never sent under this one.
    const result = await runOnce(claimsApi, 'decide', key.value, data, {
      same: sameDecision(data),
    })
    resumed.value = false
    if (!result.ok) {
      refusal.value = result
      return
    }
    busy.value = false
    open.value = false
    emit('decided', result)
  } catch (error) {
    problem.value = claimProblem(error)
  } finally {
    busy.value = false
  }
}
</script>
