<template>
  <!-- «¿Para qué sirve?»: what the saldo pays on this site and how to top it
       up, and the one «Recargar». -->
  <BottomSheet
    :open="open"
    :title="__('What is the balance for?', null, 'Cuenta')"
    @update:open="(value) => !value && $emit('close')"
  >
    <div class="space-y-3 pb-2" data-testid="cuenta-saldo-ayuda">
      <p class="text-base text-ink-gray-8">
        {{ __('With your balance you pay for:', null, 'Cuenta') }}
      </p>
      <ul class="list-disc space-y-1 pl-5 text-base text-ink-gray-8">
        <li v-for="line in help.pays" :key="line">{{ line }}</li>
      </ul>
      <p class="text-base text-ink-gray-8">{{ help.topUp }}</p>
      <p
        v-if="blocked"
        id="cuenta-saldo-ayuda-motivo"
        class="text-sm text-ink-gray-6"
        role="status"
      >
        {{ door.paymentActionReason.value }}
      </p>
    </div>
    <template #actions>
      <Button
        variant="solid"
        class="min-h-11 w-full"
        :label="__('Top up', null, 'Cuenta')"
        :disabled="blocked"
        aria-describedby="cuenta-saldo-ayuda-motivo"
        data-testid="saldo-ayuda-recargar"
        @click="$emit('topup')"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { walletHelp } from './cuenta'

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
  open: { type: Boolean, default: false },
})
defineEmits(['close', 'topup'])

const help = computed(() => walletHelp(props.door.boot.value))
const blocked = computed(() => props.door.paymentActionsBlocked())
</script>
