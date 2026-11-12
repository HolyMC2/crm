<template>
  <!-- What a confirmed purchase still lets change (Desk's allow-on-submit): the
       supplier's confirmation number and date, and when it arrives. -->
  <BottomSheet
    :open="open"
    :title="__('Confirmation and delivery')"
    :dismissible="!busy && !dirty"
    @update:open="(v) => !busy && emit('update:open', v)"
  >
    <p class="pb-3 text-base text-ink-gray-7">
      {{
        __(
          'What the supplier answered: their order number, its date, and when it arrives.',
        )
      }}
    </p>
    <div class="confirmacion-campos grid gap-3 sm:grid-cols-2">
      <FormControl
        v-model="form.order_confirmation_no"
        type="text"
        :label="__('Supplier confirmation no.')"
        :placeholder="__('Their order or quote number')"
        maxlength="140"
      />
      <FormControl
        v-model="form.order_confirmation_date"
        type="date"
        :label="__('Confirmation date')"
      />
      <FormControl
        v-model="form.schedule_date"
        class="sm:col-span-2"
        type="date"
        :label="__('Delivery date', null, 'Compras')"
      />
    </div>
    <p
      v-if="form.schedule_date !== start.schedule_date"
      class="pt-2 text-sm text-ink-gray-6"
    >
      {{ __('Lines that had the old date take the new one.') }}
    </p>
    <p v-if="error" role="alert" class="pt-2 text-base text-ink-red-7">
      {{ error }}
    </p>
    <template #actions>
      <button
        type="button"
        :class="BTN.filled"
        :disabled="busy || !dirty || !form.schedule_date"
        data-testid="confirmacion-guardar"
        @click="save"
      >
        <span
          v-if="busy"
          class="lucide-loader-circle size-5 animate-spin"
          aria-hidden="true"
        />
        {{ __('Save changes') }}
      </button>
      <button
        type="button"
        :class="BTN.text"
        :disabled="busy"
        @click="emit('update:open', false)"
      >
        {{ __('Cancel', null, 'Compras') }}
      </button>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { FormControl } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { BTN } from '@/documentos/tools'

const props = defineProps({
  open: { type: Boolean, default: false },
  // The purchase as the service reads it (`order().document`).
  document: { type: Object, default: () => ({}) },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'save'])

const KEYS = [
  'order_confirmation_no',
  'order_confirmation_date',
  'schedule_date',
]
const form = reactive(Object.fromEntries(KEYS.map((key) => [key, ''])))
const start = ref({})
watch(
  () => props.open,
  (open) => {
    if (!open) return
    start.value = Object.fromEntries(
      KEYS.map((key) => [key, props.document[key] || '']),
    )
    Object.assign(form, start.value)
  },
  { immediate: true },
)
// Only what changed travels: a number someone else typed meanwhile stays.
const changed = computed(() =>
  Object.fromEntries(
    KEYS.filter((key) => (form[key] || '') !== (start.value[key] || '')).map(
      (key) => [key, String(form[key] || '').trim() || null],
    ),
  ),
)
const dirty = computed(() => Object.keys(changed.value).length > 0)
function save() {
  if (dirty.value) emit('save', changed.value)
}
</script>
<style scoped>
/* 44 px fields on a phone. */
@media (max-width: 639px) {
  .confirmacion-campos :deep(input) {
    min-height: 44px;
    font-size: 1rem;
  }
}
</style>
