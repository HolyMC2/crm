<template>
  <!-- «Cambiar de plan» (capability «plan_change»): Boat's quote read back
       (today's amount and its invoice, the new price in its cycle, when the
       plan and the cycle change, what changes in Boat's words), the cycle to
       pay in, and one button that applies or schedules it. -->
  <BottomSheet
    :open="open"
    :title="title"
    :dismissible="!busy"
    @update:open="(value) => !value && $emit('close')"
  >
    <div class="space-y-4 pb-2" data-testid="plan-cambio">
      <!-- Cancelling a scheduled change keeps today's plan and cycle. -->
      <Segmented
        v-if="!target?.undo"
        :model-value="cycle"
        :options="cycles"
        :label="__('Billing cycle', null, 'Cuenta')"
        @update:model-value="chooseCycle"
      />
      <div role="status" aria-live="polite" class="space-y-1">
        <p v-if="quoting" class="text-base text-ink-gray-6">
          {{ __('Working out the amount…', null, 'Cuenta') }}
        </p>
        <template v-else-if="view && view.changed">
          <template v-if="view.amount">
            <p
              class="num title-face text-3xl font-semibold text-ink-gray-9"
              data-testid="plan-cambio-monto"
            >
              {{ view.amount }}
            </p>
            <p class="text-sm text-ink-gray-6">{{ view.per }}</p>
          </template>
          <p
            v-else-if="view.nothingToday"
            class="text-base font-medium text-ink-gray-9"
          >
            {{ __('Nothing is charged today.', null, 'Cuenta') }}
          </p>
          <p
            v-if="view.price"
            class="text-base text-ink-gray-8"
            data-testid="plan-cambio-precio"
          >
            {{ view.price }}
          </p>
          <p
            v-for="line in view.when"
            :key="line"
            class="pt-1 text-base text-ink-gray-8"
            data-testid="plan-cambio-cuando"
          >
            {{ line }}
          </p>
          <p
            v-for="line in view.notes"
            :key="line"
            class="pt-1 text-sm text-ink-gray-7"
          >
            {{ line }}
          </p>
          <p
            v-if="view.message"
            class="pt-1 text-base text-ink-gray-8"
            data-testid="plan-cambio-mensaje"
          >
            {{ view.message }}
          </p>
        </template>
        <p v-else-if="view" class="text-base text-ink-gray-8">
          {{ view.message }}
        </p>
      </div>
      <div
        v-if="!quoting && refusal"
        role="alert"
        class="space-y-2"
        data-testid="plan-cambio-negado"
      >
        <p class="text-base text-ink-gray-8">{{ refusal.text }}</p>
        <Button
          v-if="refusal.next"
          class="min-h-11"
          :label="refusal.next.label"
          @click="next(refusal.next.act)"
        />
      </div>
      <div v-if="!quoting && failure" role="alert" class="space-y-2">
        <p class="text-sm text-ink-red-7">{{ failure }}</p>
        <Button
          v-if="!quote"
          class="min-h-11"
          :label="__('Try again', null, 'Cuenta')"
          @click="ask"
        />
      </div>
      <p
        v-if="held"
        id="plan-cambio-motivo"
        class="text-sm text-ink-gray-7"
        role="status"
      >
        {{ door.paymentActionReason.value }}
      </p>
    </div>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        :label="__('Cancel', null, 'Cuenta')"
        @click="$emit('close')"
      />
      <Button
        v-if="view && view.verb"
        variant="solid"
        class="min-h-11 w-full"
        :label="view.verb"
        :loading="busy"
        :disabled="!canConfirm"
        aria-describedby="plan-cambio-motivo"
        data-testid="plan-cambio-confirmar"
        @click="confirm"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet, Segmented } from '@/components/ui'
import { seam } from './api'
import { clientKey, failureText, refusalView } from './autoservicio'
import { CYCLES, cycleOptions, planQuoteView } from './cambioPlan'

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
  open: { type: Boolean, default: false },
  /**
   * { plan: the target's key, display: its name, cycle: Mensual | Anual,
   * undo: today's plan and cycle, to cancel the change Boat scheduled }.
   */
  target: { type: Object, default: null },
})
const emit = defineEmits(['close', 'done', 'act', 'request'])

const cycle = ref('Mensual')
const quote = ref(null)
const quoting = ref(false)
const busy = ref(false)
const refusal = ref(null)
const failure = ref('')
const cycles = cycleOptions()
let key = ''
let turn = 0

const title = computed(() => {
  if (!props.target) return ''
  return props.target.undo
    ? __('Cancel the scheduled change', null, 'Cuenta')
    : __('Change to {0}', [props.target.display], 'Cuenta')
})
const view = computed(() => planQuoteView(quote.value))
const held = computed(() => props.door.paymentActionsBlocked() && !busy.value)
const canConfirm = computed(
  () =>
    Boolean(view.value?.verb) &&
    !quoting.value &&
    !busy.value &&
    !refusal.value &&
    !props.door.paymentActionsBlocked(),
)

async function ask() {
  const mine = ++turn
  quoting.value = true
  refusal.value = null
  failure.value = ''
  try {
    const out = await seam('plan_change_quote', {
      target_plan: props.target.plan,
      cycle: cycle.value,
    })
    if (mine !== turn) return
    key = clientKey()
    quote.value = out?.ok === true ? out : null
    refusal.value = refusalView(out)
  } catch (error) {
    if (mine !== turn) return
    quote.value = null
    failure.value = failureText(error)
  } finally {
    if (mine === turn) quoting.value = false
  }
}

function chooseCycle(value) {
  if (!CYCLES.includes(value) || value === cycle.value || busy.value) return
  cycle.value = value
  quote.value = null
  ask()
}

watch(
  () => [props.open, props.target],
  ([open, target]) => {
    if (!open || !target) return
    cycle.value = CYCLES.includes(target.cycle) ? target.cycle : 'Mensual'
    quote.value = null
    ask()
  },
  { immediate: true },
)

// «Solicitar el cambio» (Boat's request_plan step) keeps the request Muelle confirms.
function next(act) {
  if (act === 'request') emit('request', props.target)
  else emit('act', act)
}

async function confirm() {
  if (!canConfirm.value) return
  busy.value = true
  failure.value = ''
  try {
    const out = await seam('change_plan', {
      target_plan: props.target.plan,
      cycle: cycle.value,
      idempotency_key: key,
    })
    if (out?.ok === true) {
      emit('done', out)
      return
    }
    refusal.value = refusalView(out)
  } catch (error) {
    // The same key goes again on a retry: Boat answers the first change once.
    failure.value = failureText(error)
  } finally {
    busy.value = false
  }
}
</script>
