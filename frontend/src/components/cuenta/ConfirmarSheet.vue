<template>
  <!-- One confirm before a change to the plan or an add-on: the price and its
       cycle read back, what happens next, and one button with the job's verb. -->
  <BottomSheet
    :open="open"
    :title="confirm?.title || ''"
    :dismissible="!busy"
    @update:open="(value) => !value && $emit('close')"
  >
    <div class="space-y-3 pb-2" data-testid="cuenta-confirmar">
      <div v-if="confirm?.amount">
        <p
          class="num title-face text-3xl font-semibold text-ink-gray-9"
          data-testid="confirmar-monto"
        >
          {{ confirm.amount }}
        </p>
        <p v-if="confirm.per" class="text-sm text-ink-gray-6">
          {{ confirm.per }}
        </p>
      </div>
      <p
        v-for="line in confirm?.lines || []"
        :key="line"
        class="text-base text-ink-gray-8"
      >
        {{ line }}
      </p>
      <p v-if="error" class="text-sm text-ink-red-7" role="alert">
        {{ error }}
      </p>
      <p
        v-if="reason"
        id="cuenta-confirmar-motivo"
        class="text-sm text-ink-gray-7"
        role="status"
      >
        {{ reason }}
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
        :theme="confirm?.danger ? 'red' : 'gray'"
        class="min-h-11 w-full"
        :label="confirm?.verb || ''"
        :loading="busy"
        :disabled="disabled"
        aria-describedby="cuenta-confirmar-motivo"
        data-testid="confirmar-hacer"
        @click="$emit('confirm')"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'

defineProps({
  open: { type: Boolean, default: false },
  /** { title, amount, per, lines[], verb, danger } (tienda.js addonConfirm / planConfirm). */
  confirm: { type: Object, default: null },
  busy: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  /** Why the button cannot run now (a payment in progress), beside it. */
  reason: { type: String, default: '' },
  error: { type: String, default: '' },
})
defineEmits(['close', 'confirm'])
</script>
