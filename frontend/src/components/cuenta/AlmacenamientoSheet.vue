<template>
  <!-- One storage change: the extra space wanted (a stepper of Boat's blocks
       that asks Boat again), Boat's quote read back (today's charge and on
       which invoice, the monthly price from then, when the space changes),
       the consent the button gives, and one button named after what it does
       («Agregar 10 GB», «Programar la reducción»). -->
  <BottomSheet
    :open="open"
    :title="title"
    :dismissible="!busy"
    @update:open="(value) => !value && $emit('close')"
  >
    <div class="space-y-4 pb-2" data-testid="almacenamiento-cambio">
      <div class="flex items-center gap-3">
        <span class="min-w-0 flex-1 text-base text-ink-gray-8">{{
          __('Extra space', null, 'Cuenta')
        }}</span>
        <button
          type="button"
          class="press flex size-11 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 disabled:opacity-50"
          :aria-label="__('Remove {0} GB', [block], 'Cuenta')"
          :title="__('Remove {0} GB', [block], 'Cuenta')"
          :disabled="busy || target <= 0"
          data-testid="almacenamiento-menos"
          @click="step(-1)"
        >
          <span class="lucide-minus size-5" aria-hidden="true" />
        </button>
        <span
          class="num w-20 text-center text-2xl font-semibold text-ink-gray-9"
          data-testid="almacenamiento-cantidad"
          >{{ amountGb }}</span
        >
        <button
          type="button"
          class="press flex size-11 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 disabled:opacity-50"
          :aria-label="__('Add {0} GB', [block], 'Cuenta')"
          :title="__('Add {0} GB', [block], 'Cuenta')"
          :disabled="busy || target >= (change?.maxBlocks || 0)"
          data-testid="almacenamiento-mas"
          @click="step(1)"
        >
          <span class="lucide-plus size-5" aria-hidden="true" />
        </button>
      </div>

      <div role="status" aria-live="polite" class="space-y-1">
        <p v-if="quoting" class="text-base text-ink-gray-6">
          {{ __('Working out the amount…', null, 'Cuenta') }}
        </p>
        <template v-else-if="view && view.changed">
          <template v-if="view.amount">
            <p
              class="num title-face text-3xl font-semibold text-ink-gray-9"
              data-testid="almacenamiento-monto"
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
            v-for="line in view.lines"
            :key="line"
            class="pt-1 text-base text-ink-gray-8"
            data-testid="almacenamiento-linea"
          >
            {{ line }}
          </p>
          <p v-if="view.message" class="pt-1 text-base text-ink-gray-8">
            {{ view.message }}
          </p>
          <p
            v-if="view.consent"
            class="pt-2 text-sm text-ink-gray-7"
            data-testid="almacenamiento-consentimiento"
          >
            {{ view.consent }}
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
        data-testid="almacenamiento-cambio-negado"
      >
        <p class="text-base text-ink-gray-8">{{ refusal.text }}</p>
        <Button
          v-if="refusal.next"
          class="min-h-11"
          :label="refusal.next.label"
          @click="$emit('act', refusal.next.act)"
        />
      </div>
      <div v-if="!quoting && failure" role="alert" class="space-y-2">
        <p class="text-sm text-ink-red-7">{{ failure }}</p>
        <!-- A lost quote asks again; a lost confirm goes again with its key. -->
        <Button
          v-if="!quote"
          class="min-h-11"
          :label="__('Try again', null, 'Cuenta')"
          @click="ask"
        />
      </div>
      <p
        v-if="held"
        id="almacenamiento-cambio-motivo"
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
        variant="solid"
        class="min-h-11 w-full"
        :label="action ? action.label : __('Confirm', null, 'Cuenta')"
        :loading="busy"
        :disabled="!canConfirm"
        aria-describedby="almacenamiento-cambio-motivo"
        data-testid="almacenamiento-confirmar"
        @click="confirm"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { seam } from './api'
import { clientKey, failureText, refusalView } from './autoservicio'
import {
  gb,
  quoteFor,
  storageAction,
  storageQuoteView,
  storageTitle,
} from './almacenamiento'

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
  open: { type: Boolean, default: false },
  /**
   * { blocks: extra blocks today, planned: after a scheduled reduction
   * (today's when none), blockGb, maxBlocks, target: extra blocks wanted }.
   */
  change: { type: Object, default: null },
  debounceMs: { type: Number, default: 300 },
})
const emit = defineEmits(['close', 'done', 'act'])

const target = ref(0)
const quote = ref(null)
const quoting = ref(false)
const busy = ref(false)
const refusal = ref(null)
const failure = ref('')
let key = ''
let turn = 0
let wait = null

const block = computed(() => gb(props.change?.blockGb || 0))
const amountGb = computed(() =>
  __('{0} GB', [gb(target.value * (props.change?.blockGb || 0))], 'Cuenta'),
)
const title = computed(() =>
  props.change
    ? storageTitle(
        props.change.blockGb,
        props.change.blocks,
        target.value,
        props.change.planned,
      )
    : '',
)
const view = computed(() => storageQuoteView(quote.value))
// Boat's quote for this very target: a quote still answering an earlier tap
// never confirms the one on screen.
const current = computed(
  () => Boolean(props.change) && quoteFor(quote.value, target.value),
)
const action = computed(() =>
  current.value ? storageAction(quote.value) : null,
)
const held = computed(() => props.door.paymentActionsBlocked() && !busy.value)
const canConfirm = computed(
  () =>
    Boolean(view.value?.changed) &&
    Boolean(action.value) &&
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
    const out = await seam('storage_quote', { blocks: target.value })
    if (mine !== turn) return
    // A new quote is a new request: its confirm gets its own key.
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

function later() {
  clearTimeout(wait)
  // A quote already on its way answers the old target: it is dropped.
  turn++
  quoting.value = true
  wait = setTimeout(ask, props.debounceMs)
}

function step(by) {
  const next = target.value + by
  if (next < 0 || next > (props.change?.maxBlocks || 0) || busy.value) return
  target.value = next
  later()
}

watch(
  () => [props.open, props.change],
  ([open, change]) => {
    if (!open || !change) return
    target.value = change.target
    quote.value = null
    ask()
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(wait))

async function confirm() {
  if (!canConfirm.value) return
  busy.value = true
  failure.value = ''
  try {
    const out = await seam('set_storage', {
      blocks: target.value,
      idempotency_key: key,
    })
    if (out?.ok === true) {
      // The toast repeats the button's verb.
      emit('done', out, action.value?.done || '')
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
