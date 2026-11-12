<template>
  <!-- Desk's «Estado» on a confirmed purchase that needs a word first: on hold
       (why, for whoever opens it next) or closed (what stops being expected). -->
  <BottomSheet
    :open="open"
    :title="copy.title"
    :dismissible="!busy"
    @update:open="(v) => !busy && emit('update:open', v)"
  >
    <p class="pb-3 text-base text-ink-gray-8">{{ copy.message }}</p>
    <FormControl
      v-model="reason"
      class="estado-motivo"
      type="textarea"
      :rows="3"
      :label="copy.label"
      :placeholder="copy.placeholder"
      maxlength="1000"
    />
    <p v-if="error" role="alert" class="pt-2 text-base text-ink-red-7">
      {{ error }}
    </p>
    <template #actions>
      <button
        type="button"
        :class="BTN.filled"
        :disabled="busy || (mode === 'hold' && !reason.trim())"
        data-testid="estado-confirmar"
        @click="emit('confirm', reason.trim())"
      >
        <span
          v-if="busy"
          class="lucide-loader-circle size-5 animate-spin"
          aria-hidden="true"
        />
        {{ copy.confirm }}
      </button>
      <button
        type="button"
        :class="BTN.text"
        :disabled="busy"
        @click="emit('update:open', false)"
      >
        {{ __('Back', null, 'Compras') }}
      </button>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { FormControl } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { BTN } from '@/documentos/tools'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** 'hold' (a reason is required) or 'close' (a note is optional). */
  mode: { type: String, default: 'hold' },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'confirm'])
const reason = ref('')
watch(
  () => props.open,
  (open) => {
    if (open) reason.value = ''
  },
)
const copy = computed(() =>
  props.mode === 'hold'
    ? {
        title: __('Put on hold'),
        message: __(
          'Receiving and billing wait until you resume it. Say why, for whoever opens it next.',
        ),
        label: __('Why it waits'),
        placeholder: __('The supplier is out of stock, prices under review…'),
        confirm: __('Put on hold'),
      }
    : {
        title: __('Close purchase'),
        message: __(
          'What has not arrived is no longer expected: the purchase leaves To receive. You can reopen it later.',
        ),
        label: __('Note (optional)'),
        placeholder: __('The rest is not coming, we bought it elsewhere…'),
        confirm: __('Close purchase'),
      },
)
</script>
<style scoped>
@media (max-width: 639px) {
  .estado-motivo :deep(textarea) {
    font-size: 1rem;
  }
}
</style>
