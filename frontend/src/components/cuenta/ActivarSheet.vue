<template>
  <!-- Activation: the amount read back (Boat's quote, IVA included), the way to
       pay, and one filled «Pagar» that opens the processor's page. -->
  <BottomSheet
    :open="open"
    :title="title"
    :dismissible="!door.busy.value"
    @update:open="(value) => !value && $emit('close')"
  >
    <div class="space-y-4 pb-2" data-testid="cuenta-activacion">
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
            class="num title-face text-3xl font-semibold text-ink-gray-9"
            data-testid="activar-monto"
          >
            {{ charge.amount }}
          </p>
          <p class="text-sm text-ink-gray-6">{{ charge.note }}</p>
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
            :disabled="
              door.paymentActionsBlocked() || door.activationLocked.value
            "
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
        v-if="door.busy.value || door.activationLocked.value"
        id="cuenta-activar-motivo"
        class="text-sm text-ink-gray-7"
        role="status"
      >
        {{ door.paymentActionReason.value }}
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
        v-if="door.activationLocked.value"
        class="min-h-11 w-full"
        :label="__('Check status', null, 'Cuenta')"
        :loading="door.loading.value"
        @click="door.load()"
      />
      <Button
        v-if="door.activationMessage.value || door.activationLocked.value"
        class="min-h-11 w-full"
        :label="__('Check the payment with support', null, 'Cuenta')"
        @click="door.contactSupport()"
      />
      <Button
        v-if="door.activationCheckoutUrl.value"
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
        :label="__('Pay', null, 'Cuenta')"
        :loading="door.busy.value === 'activate'"
        :disabled="
          door.paymentActionsBlocked() ||
          door.activationLocked.value ||
          door.quoteLoading.value
        "
        aria-describedby="cuenta-activar-motivo"
        data-testid="activar-pagar"
        @click="door.activatePlan()"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { activationView, planView } from './cuenta'

const props = defineProps({
  door: { type: Object, required: true },
  open: { type: Boolean, default: false },
})
defineEmits(['close'])

const plan = computed(() => planView(props.door.boot.value))
const title = computed(() =>
  plan.value.name
    ? __('Activate plan {0}', [plan.value.name], 'Cuenta')
    : __('Activate your plan', null, 'Cuenta'),
)
const charge = computed(() =>
  activationView(props.door.quote.value, plan.value),
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
