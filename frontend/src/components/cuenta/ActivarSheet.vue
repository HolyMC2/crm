<template>
  <!-- Activation: the amount read back (Boat's quote, IVA included), the way to
       pay, and one filled «Pagar» that opens the processor's page. With Boat's
       «activation_choice» the plan and the cycle are chosen here first, each
       move asks Boat for the total again, and «Pagar $X» pays that total. -->
  <BottomSheet
    :open="open"
    :title="title"
    :dismissible="!door.busy.value"
    @update:open="(value) => !value && $emit('close')"
  >
    <div class="space-y-4 pb-2" data-testid="cuenta-activacion">
      <template v-if="choosing">
        <fieldset
          v-if="cards.length"
          class="space-y-2"
          data-testid="activar-planes"
        >
          <legend class="pb-1 text-sm font-semibold text-ink-gray-7">
            {{ __('Choose your plan', null, 'Cuenta') }}
          </legend>
          <!-- A plan that does not fit reads muted, dashed, with Boat's
               reason in full contrast below. -->
          <label
            v-for="card in cards"
            :key="card.plan"
            class="flex min-h-12 items-start gap-3 rounded-7 border px-3 py-2.5"
            :class="[
              card.selected
                ? 'border-outline-gray-4 bg-surface-gray-2'
                : 'border-outline-gray-2',
              card.available ? 'press' : 'border-dashed',
            ]"
            :data-plan="card.plan"
            :aria-disabled="card.available ? undefined : 'true'"
          >
            <input
              type="radio"
              name="cuenta-activar-plan"
              class="mt-1 size-4 flex-none"
              :value="card.plan"
              :checked="card.selected"
              :disabled="!card.available || Boolean(door.busy.value)"
              @change="door.choosePlan(card.plan)"
            />
            <!-- The name, then its price on its own line: every card reads
                 the same at 305 px, where a name and a price share no row. -->
            <span class="min-w-0 flex-1">
              <span
                class="block text-base font-medium"
                :class="card.available ? 'text-ink-gray-9' : 'text-ink-gray-5'"
                >{{ card.name }}</span
              >
              <span
                class="block text-sm"
                :class="card.available ? 'text-ink-gray-8' : 'text-ink-gray-5'"
                data-testid="activar-plan-precio"
                ><span class="num font-medium">{{ card.price }}</span>
                {{ card.per }}</span
              >
              <span
                class="block text-sm"
                :class="card.available ? 'text-ink-gray-6' : 'text-ink-gray-5'"
                >{{ card.includes }}</span
              >
              <span
                v-if="card.apps"
                class="block text-sm"
                :class="card.available ? 'text-ink-gray-6' : 'text-ink-gray-5'"
                >{{ card.apps }}</span
              >
              <span v-if="card.current" class="block text-sm text-ink-gray-6">{{
                __('Your trial plan', null, 'Cuenta')
              }}</span>
              <span
                v-if="card.reason"
                class="block text-sm text-ink-gray-8"
                data-testid="activar-plan-motivo"
                >{{ card.reason }}</span
              >
            </span>
          </label>
        </fieldset>
        <div v-if="chosen" class="space-y-1">
          <Segmented
            v-if="cycles.length"
            :model-value="door.activationChoice.value?.cycle"
            :options="cycles"
            :label="__('Billing cycle', null, 'Cuenta')"
            data-testid="activar-ciclo"
            @update:model-value="door.chooseCycle"
          />
          <p class="text-sm text-ink-gray-7" data-testid="activar-ciclo-nota">
            {{ note }}
          </p>
        </div>
        <div
          v-if="door.choiceMessage.value"
          class="flex flex-wrap items-center gap-x-3 gap-y-2"
        >
          <p
            role="alert"
            class="min-w-0 flex-1 basis-48 text-sm text-ink-gray-8"
            data-testid="activar-eleccion-aviso"
          >
            {{ door.choiceMessage.value }}
          </p>
          <Button
            v-if="door.choiceRetry.value && !door.quoteLoading.value"
            class="min-h-11"
            :label="__('Try once more', null, 'Cuenta')"
            :disabled="Boolean(door.busy.value)"
            data-testid="activar-reintentar"
            @click="door.retryQuote()"
          />
        </div>
      </template>
      <div role="status" aria-live="polite">
        <p
          v-if="door.quoteLoading.value"
          class="text-base text-ink-gray-6"
          data-testid="activar-calculando"
        >
          {{ __('Working out the amount…', null, 'Cuenta') }}
        </p>
        <template v-else>
          <p
            v-if="charge.amount"
            class="num title-face text-3xl font-semibold text-ink-gray-9"
            data-testid="activar-monto"
          >
            {{ charge.amount }}
          </p>
          <p v-if="charge.note" class="text-sm text-ink-gray-6">
            {{ charge.note }}
          </p>
          <p
            v-if="charge.covers"
            class="mt-1 text-sm text-ink-gray-7"
            data-testid="activar-cubre"
          >
            {{ charge.covers }}
          </p>
          <p v-if="charge.free" class="mt-1 text-sm text-ink-gray-7">
            {{
              __(
                'Nothing is charged now: your plan activates when you confirm.',
                null,
                'Cuenta',
              )
            }}
          </p>
        </template>
      </div>
      <ul
        v-if="!door.quoteLoading.value && charge.lines.length"
        class="divide-y divide-outline-gray-1 border-y border-outline-gray-1"
        data-testid="activar-lineas"
      >
        <li
          v-for="line in charge.lines"
          :key="line.key"
          class="flex items-baseline gap-3 py-2 text-base"
        >
          <span class="min-w-0 flex-1 text-ink-gray-8">{{ line.label }}</span>
          <span class="num shrink-0 text-ink-gray-9">{{ line.amount }}</span>
        </li>
      </ul>

      <!-- A choice only when there is one to make: a saved card or the
           processor's page. Without a card the line below says how. -->
      <fieldset v-if="choices.length > 1" class="space-y-2">
        <legend class="pb-1 text-sm font-semibold text-ink-gray-7">
          {{ __('How to pay', null, 'Cuenta') }}
        </legend>
        <label
          v-for="choice in choices"
          :key="choice.value"
          class="press flex min-h-12 items-center gap-3 rounded-7 border px-3 py-2"
          :class="
            door.activationMethod.value === choice.value
              ? 'border-outline-gray-4 bg-surface-gray-2'
              : 'border-outline-gray-2'
          "
        >
          <input
            type="radio"
            name="cuenta-forma-de-pago"
            class="size-4 flex-none"
            :value="choice.value"
            :checked="door.activationMethod.value === choice.value"
            :disabled="door.paymentActionsBlocked() || locked"
            @change="door.chooseMethod(choice.value)"
          />
          <span class="min-w-0 flex-1">
            <span class="block text-base font-medium text-ink-gray-9">{{
              choice.label
            }}</span>
            <span
              class="block text-sm text-ink-gray-6"
              :class="choice.value === 'saved' ? 'num' : ''"
              >{{ choice.detail }}</span
            >
          </span>
        </label>
      </fieldset>

      <p
        v-if="door.activationMessage.value && !door.activationLocked.value"
        class="text-sm text-ink-red-7"
      >
        {{ door.activationMessage.value }}
      </p>
      <p
        v-if="door.busy.value || locked"
        id="cuenta-activar-motivo"
        class="text-sm text-ink-gray-7"
        role="status"
      >
        {{ door.paymentActionReason.value }}
      </p>
      <!-- Another choice while a payment page is open for the earlier one:
           Boat closes that page before it charges the new total. -->
      <p
        v-else-if="door.choiceDiffers.value"
        id="cuenta-activar-cambio"
        class="text-sm text-ink-gray-7"
        data-testid="activar-cambio"
      >
        {{
          __(
            'When you pay, we close the payment left open for your earlier choice; nothing is charged twice.',
            null,
            'Cuenta',
          )
        }}
      </p>
      <p v-if="door.supportError.value" class="text-sm text-ink-red-7">
        {{ door.supportError.value }}
      </p>
      <p class="text-sm text-ink-gray-6" data-testid="activar-como">
        {{
          choices.length > 1
            ? __(
                'The charge happens on the payment processor’s secure page. Muelle keeps no card data.',
                null,
                'Cuenta',
              )
            : __(
                'You pay on the payment processor’s secure page. Muelle keeps no card data.',
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
        @click="$emit('close')"
      />
      <Button
        v-if="locked"
        class="min-h-11 w-full"
        :label="__('Check status', null, 'Cuenta')"
        :loading="door.loading.value"
        @click="door.load()"
      />
      <Button
        v-if="
          (door.activationMessage.value || door.activationLocked.value) &&
          !door.choiceDiffers.value
        "
        class="min-h-11 w-full"
        :label="__('Check the payment with support', null, 'Cuenta')"
        @click="door.contactSupport()"
      />
      <Button
        v-if="door.activationCheckoutUrl.value && !door.choiceDiffers.value"
        variant="solid"
        class="min-h-11 w-full"
        :label="__('Continue the secure payment', null, 'Cuenta')"
        :disabled="door.paymentActionsBlocked()"
        data-testid="activar-continuar"
        @click="door.resumeActivation()"
      />
      <Button
        v-else
        variant="solid"
        class="min-h-11 w-full"
        :label="payLabel"
        :loading="door.busy.value === 'activate'"
        :disabled="
          door.paymentActionsBlocked() ||
          locked ||
          door.quoteLoading.value ||
          (choosing && !charge.exact)
        "
        :aria-describedby="
          door.choiceDiffers.value && !door.busy.value
            ? 'cuenta-activar-cambio'
            : 'cuenta-activar-motivo'
        "
        data-testid="activar-pagar"
        @click="door.activatePlan()"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { BottomSheet, Segmented } from '@/components/ui'
import { chosenOption, cycleChoices, cycleNote, planCards } from './activarPlan'
import { activationView, planView, validQuote } from './cuenta'

const props = defineProps({
  door: { type: Object, required: true },
  open: { type: Boolean, default: false },
})
defineEmits(['close'])

const plan = computed(() => planView(props.door.boot.value))
// The payment door is shut, except for a new choice while the earlier one's
// payment page is open: Boat closes that page and the new total is paid.
const locked = computed(
  () => props.door.activationLocked.value && !props.door.choiceDiffers?.value,
)
// Boat's «activation_choice»: the plan and cycle are chosen here.
const choosing = computed(() => Boolean(props.door.choiceOn?.value))
const chosen = computed(() =>
  choosing.value
    ? chosenOption(
        props.door.choiceOptions.value,
        props.door.activationChoice.value,
      )
    : null,
)
const cards = computed(() =>
  choosing.value
    ? planCards(
        props.door.choiceOptions.value,
        props.door.activationChoice.value,
      )
    : [],
)
const cycles = computed(() => cycleChoices(chosen.value))
const note = computed(() =>
  cycleNote(chosen.value, props.door.activationChoice.value?.cycle),
)
const title = computed(() => {
  const name = chosen.value?.plan_name || plan.value.name
  return name
    ? __('Activate plan {0}', [name], 'Cuenta')
    : __('Activate your plan', null, 'Cuenta')
})
// With the choice on, only Boat's total for it: no plan price to fall back on.
const charge = computed(() =>
  choosing.value && !validQuote(props.door.quote.value)
    ? { exact: false, amount: '', lines: [], note: '', covers: '', free: false }
    : activationView(props.door.quote.value, plan.value),
)
const payLabel = computed(() =>
  choosing.value && charge.value.exact
    ? __('Pay {0}', [charge.value.amount], 'Cuenta')
    : __('Pay', null, 'Cuenta'),
)
// Paid with the saved card and converted: the sheet has closed; say it once.
watch(
  () => props.door.activated?.value,
  (text) => text && toast.success(text),
)
// A saved card first when there is one; the processor's page always.
const choices = computed(() => {
  const card = props.door.cards.value[0]
  return [
    ...(card
      ? [
          {
            value: 'saved',
            label: __('Saved card', null, 'Cuenta'),
            detail: `${card.brand || ''} ···· ${card.last4 || ''}`.trim(),
          },
        ]
      : []),
    {
      value: 'hosted',
      label: __('On the payment page', null, 'Cuenta'),
      detail: __('On the payment processor’s secure page', null, 'Cuenta'),
    },
  ]
})
</script>
