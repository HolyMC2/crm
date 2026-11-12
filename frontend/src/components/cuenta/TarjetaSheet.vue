<template>
  <!-- «Agregar tarjeta» (capability «card_setup»): Stripe's own card field,
       loaded from js.stripe.com only now, inside the sheet; «Guardar tarjeta»
       confirms it with Stripe and sends Muelle the confirmation alone. While
       the bank's check (3-D Secure) runs in Stripe's window the sheet steps
       aside, so the window takes taps and typing. -->
  <BottomSheet
    :open="open && phase !== 'challenge'"
    :title="__('Add a card', null, 'Cuenta')"
    :dismissible="phase !== 'saving'"
    @update:open="(value) => !value && close()"
  >
    <div class="space-y-4 pb-2" data-testid="tarjeta-alta">
      <p
        v-if="phase === 'starting'"
        class="text-base text-ink-gray-6"
        role="status"
      >
        {{ __('Opening the secure card form…', null, 'Cuenta') }}
      </p>
      <!-- Stripe mounts its field here; the card never touches this page.
           Saving after the bank's check, the field is gone: no empty box. -->
      <div
        v-show="phase === 'form' || (phase === 'saving' && fieldLive)"
        ref="field"
        class="min-h-11 rounded-6 bg-surface-gray-2 px-3 py-3 text-base text-ink-gray-9"
        data-testid="tarjeta-campo"
      />
      <span ref="muted" class="hidden text-ink-gray-5" aria-hidden="true" />
      <span ref="danger" class="hidden text-ink-red-7" aria-hidden="true" />
      <p
        v-if="phase === 'saving' && !fieldLive"
        class="text-base text-ink-gray-6"
        role="status"
      >
        {{ __('Saving your card…', null, 'Cuenta') }}
      </p>
      <p
        v-if="fieldError"
        class="text-sm text-ink-red-7"
        role="alert"
        data-testid="tarjeta-error-campo"
      >
        {{ fieldError }}
      </p>
      <div
        v-if="phase === 'refused' || phase === 'failed'"
        role="alert"
        class="space-y-2"
        data-testid="tarjeta-negado"
      >
        <p class="text-base text-ink-gray-8">{{ message }}</p>
        <div class="flex flex-wrap gap-2">
          <Button
            v-if="phase === 'failed'"
            class="min-h-11"
            :label="__('Try again', null, 'Cuenta')"
            @click="start"
          />
          <Button
            class="min-h-11"
            :label="__('Ask support about my card', null, 'Cuenta')"
            @click="$emit('act', 'support')"
          />
        </div>
      </div>
      <p
        v-if="message && phase === 'form'"
        class="text-sm text-ink-red-7"
        role="alert"
      >
        {{ message }}
      </p>
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'You type the card in the payment processor’s secure form. Muelle keeps no card data and charges nothing now.',
            null,
            'Cuenta',
          )
        }}
      </p>
    </div>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        :label="__('Cancel', null, 'Cuenta')"
        :disabled="phase === 'saving'"
        @click="close"
      />
      <Button
        variant="solid"
        class="min-h-11 w-full"
        :label="__('Save card', null, 'Cuenta')"
        :loading="phase === 'saving'"
        :disabled="phase !== 'form'"
        data-testid="tarjeta-guardar"
        @click="save"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { mutate, seam } from './api'
import { failureText } from './autoservicio'
import {
  BANK_ERROR,
  CHALLENGE_ERROR,
  CHALLENGE_MS,
  CONFIRM_MS,
  LOAD_ERROR,
  NETWORK_ERROR,
  STRIPE_LOCALE,
  cardStyle,
  loadStripe,
  setupOutcome,
  setupReady,
  setupRefusal,
  whenGone,
  withTimeout,
} from './tarjeta'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** Stripe's constructor; js.stripe.com when left out. */
  stripeLoader: { type: Function, default: () => loadStripe() },
  /** {set, clear} for the waits on Stripe's answers; the window's when left out. */
  timers: { type: Object, default: () => ({}) },
})
// «act»: a next step the parent takes once this sheet is closed (support).
const emit = defineEmits(['close', 'saved', 'act'])

const phase = ref('idle')
const message = ref('')
const fieldError = ref('')
const field = ref(null)
const muted = ref(null)
const danger = ref(null)
// Whether Stripe's field is in the page (it leaves with the sheet).
const fieldLive = ref(false)
let stripe = null
let card = null
let secret = ''
// Confirmed at Stripe and not yet saved: a retry saves it instead of asking again.
let confirmed = ''
// Each start, save and teardown takes a new number: a late answer of an older
// one changes nothing.
let attempt = 0

function dropCard() {
  try {
    card?.destroy?.()
  } catch {
    // already gone
  }
  card = null
  fieldLive.value = false
}

function teardown() {
  attempt++
  dropCard()
  stripe = null
  secret = ''
  confirmed = ''
}

// Stripe's field in the sheet's slot; again after the sheet stepped aside for
// the bank's check, which took the old one out of the page.
async function mountCard() {
  dropCard()
  await nextTick()
  if (!stripe || !field.value) throw new Error('card-field')
  card = stripe.elements({ locale: STRIPE_LOCALE }).create('card', {
    hidePostalCode: true,
    style: cardStyle({
      el: field.value,
      muted: muted.value,
      danger: danger.value,
    }),
  })
  card.on?.('change', (event) => {
    fieldError.value = event?.error?.message || ''
  })
  card.mount(field.value)
  fieldLive.value = true
}

async function start() {
  teardown()
  const mine = attempt
  phase.value = 'starting'
  message.value = ''
  fieldError.value = ''
  let out
  try {
    out = await mutate('start_card_setup')
  } catch (error) {
    if (mine !== attempt) return
    phase.value = 'failed'
    message.value = failureText(error)
    return
  }
  if (mine !== attempt) return
  if (!setupReady(out)) {
    phase.value = 'refused'
    message.value = setupRefusal(out)
    return
  }
  try {
    const Stripe = await props.stripeLoader()
    if (mine !== attempt) return
    stripe = Stripe(out.publishable_key, { locale: STRIPE_LOCALE })
    secret = out.client_secret
    phase.value = 'form'
    await mountCard()
  } catch {
    if (mine !== attempt) return
    teardown()
    phase.value = 'failed'
    message.value = LOAD_ERROR()
  }
}

// One of Stripe's answers, or {timedOut} after `ms`; a throw reads as a timeout.
async function ask(promise, ms) {
  try {
    return setupOutcome(await withTimeout(promise, ms, props.timers))
  } catch {
    return { kind: 'timeout' }
  }
}

async function backToForm(outcome) {
  // After the bank's check the sheet opens again with a new card field.
  const stepped = phase.value === 'challenge'
  phase.value = 'form'
  if (outcome.kind === 'error') message.value = outcome.message || BANK_ERROR()
  else if (stepped) message.value = CHALLENGE_ERROR()
  else if (outcome.kind === 'unconfirmed') message.value = BANK_ERROR()
  else message.value = NETWORK_ERROR()
  if (!stepped) return
  try {
    await mountCard()
  } catch {
    teardown()
    phase.value = 'failed'
    message.value = LOAD_ERROR()
  }
}

async function save() {
  if (phase.value !== 'form' || !stripe) return
  const mine = ++attempt
  phase.value = 'saving'
  message.value = ''
  if (!confirmed) {
    // handleActions false: a bank's check comes back as «requires_action»
    // instead of opening under the modal sheet.
    let outcome = await ask(
      stripe.confirmCardSetup(
        secret,
        { payment_method: { card } },
        { handleActions: false },
      ),
      CONFIRM_MS,
    )
    if (mine !== attempt) return
    if (outcome.kind === 'challenge') {
      const sheet = field.value?.closest?.('[data-ui-sheet]') || field.value
      phase.value = 'challenge'
      fieldLive.value = false
      // The sheet leaves the page first (and with it the modal's hold on
      // taps and focus); then Stripe opens the bank's window over the page
      // and answers once it closes.
      await nextTick()
      await whenGone(sheet)
      if (mine !== attempt) return
      outcome = await ask(stripe.confirmCardSetup(secret), CHALLENGE_MS)
      if (mine !== attempt) return
    }
    if (outcome.kind !== 'confirmed') return backToForm(outcome)
    phase.value = 'saving'
    confirmed = outcome.id
  }
  try {
    // Only the SetupIntent's id goes to Muelle: never the card or its secret.
    const out = await seam('confirm_card_setup', { setup_intent: confirmed })
    if (mine !== attempt) return
    if (out?.ok === true) {
      teardown()
      phase.value = 'done'
      emit('saved', out)
      return
    }
    message.value =
      (typeof out?.message === 'string' && out.message) ||
      __('We could not save the card. Try again.', null, 'Cuenta')
    if (['not_yours', 'stale', 'not_found'].includes(out?.reason)) {
      // Boat cannot use this confirmation: «Intentar de nuevo» starts over.
      teardown()
      phase.value = 'failed'
      return
    }
    // The bank has not confirmed yet: the next «Guardar» asks Stripe again;
    // any other refusal saves the same confirmation again.
    if (out?.reason === 'not_confirmed') confirmed = ''
    phase.value = 'form'
  } catch (error) {
    if (mine !== attempt) return
    phase.value = 'form'
    message.value = failureText(error)
  }
}

function close() {
  if (phase.value === 'saving' || phase.value === 'challenge') return
  teardown()
  phase.value = 'idle'
  emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) start()
    else {
      teardown()
      phase.value = 'idle'
    }
  },
  { immediate: true },
)
onBeforeUnmount(teardown)
</script>
