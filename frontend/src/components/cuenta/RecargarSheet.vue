<template>
  <!-- Top-up: common amounts as chips, any other in the field, one «Continuar»
       that opens the processor's page. -->
  <BottomSheet
    :open="open"
    :title="__('Top up the wallet', null, 'Cuenta')"
    :dismissible="!door.busy.value"
    @update:open="(value) => !value && $emit('close')"
  >
    <div class="space-y-4 pb-2" data-testid="cuenta-recarga">
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'Between {0} and {1}.',
            [money(bounds.min), money(bounds.max)],
            'Cuenta',
          )
        }}
      </p>
      <div
        v-if="bounds.quick.length"
        class="flex flex-wrap gap-2"
        role="group"
        :aria-label="__('Common amounts', null, 'Cuenta')"
      >
        <button
          v-for="value in bounds.quick"
          :key="value"
          type="button"
          class="press num min-h-11 rounded-full px-4 text-base"
          :class="
            Number(door.topupAmount.value) === value
              ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
              : 'bg-surface-gray-2 text-ink-gray-8'
          "
          :aria-pressed="Number(door.topupAmount.value) === value"
          @click="door.setTopupAmount(value)"
        >
          {{ money(value, 0) }}
        </button>
      </div>
      <label class="block">
        <span class="text-sm text-ink-gray-7">{{
          __('Another amount', null, 'Cuenta')
        }}</span>
        <input
          :value="door.topupAmount.value"
          type="number"
          inputmode="decimal"
          min="0"
          placeholder="0"
          class="num mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
          @input="door.setTopupAmount($event.target.value)"
          @keyup.enter="submit"
        />
      </label>
      <p v-if="door.topupError.value" class="text-sm text-ink-red-7">
        {{ door.topupError.value }}
      </p>
      <p
        id="cuenta-recarga-motivo"
        class="text-sm text-ink-gray-6"
        role="status"
      >
        {{ door.topupActionReason.value }}
      </p>
    </div>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        :label="__('Cancel', null, 'Cuenta')"
        @click="$emit('close')"
      />
      <Button
        v-if="door.topupError.value"
        class="min-h-11 w-full"
        :label="__('Check the top-up with support', null, 'Cuenta')"
        @click="door.contactSupport()"
      />
      <Button
        variant="solid"
        class="min-h-11 w-full"
        :label="
          door.busy.value === 'topup'
            ? __('Opening…', null, 'Cuenta')
            : __('Continue', null, 'Cuenta')
        "
        :disabled="door.paymentActionsBlocked() || door.paymentReading.value"
        aria-describedby="cuenta-recarga-motivo"
        data-testid="recarga-continuar"
        @click="submit"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { formatMoney } from '@/utils/display'
import { topupChoices } from './cuenta'

const props = defineProps({
  door: { type: Object, required: true },
  open: { type: Boolean, default: false },
})
defineEmits(['close'])

const money = (value, decimals = 2) => formatMoney(value, 'MXN', { decimals })
const bounds = computed(() => topupChoices(props.door.boot.value?.store))
function submit() {
  props.door.topup({ min: bounds.value.min, max: bounds.value.max, money })
}
</script>
