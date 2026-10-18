<template>
  <!-- One question before an action that cannot be taken back (confirm,
       cancel, delete): what happens, one filled button, a way out. -->
  <BottomSheet
    :open="open"
    :title="copy?.title || ''"
    :dismissible="!busy"
    @update:open="(v) => !busy && emit('update:open', v)"
  >
    <p class="pb-2 text-base text-ink-gray-8">{{ copy?.message }}</p>
    <p v-if="error" role="alert" class="pb-2 text-base text-ink-red-7">
      {{ error }}
    </p>
    <template #actions>
      <button
        type="button"
        :class="copy?.tone === 'danger' ? BTN.danger : BTN.filled"
        :disabled="busy"
        data-testid="documentos-confirm"
        @click="emit('confirm')"
      >
        <span
          v-if="busy"
          class="lucide-loader-circle size-5 animate-spin"
          aria-hidden="true"
        />
        {{ copy?.confirm || 'Confirmar' }}
      </button>
      <button
        type="button"
        :class="BTN.text"
        :disabled="busy"
        @click="emit('update:open', false)"
      >
        {{ copy?.back || 'Volver' }}
      </button>
    </template>
  </BottomSheet>
</template>
<script setup>
import { BottomSheet } from '@/components/ui'
import { BTN } from '@/documentos/tools'

defineProps({
  open: { type: Boolean, default: false },
  // { title, message, confirm, back?, tone: 'primary' | 'danger' } (tools.js confirmCopy)
  copy: { type: Object, default: null },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'confirm'])
</script>
