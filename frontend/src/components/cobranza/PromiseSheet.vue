<template>
  <PowerSheet
    :model-value="modelValue"
    kind="promise"
    :title="__('Record promise')"
    :subtitle="subtitle"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <FormControl
      v-model="form.date"
      type="date"
      :label="__('Promised date')"
      :min="today"
    />
    <div class="flex flex-wrap gap-2">
      <Button
        v-for="preset in presets"
        :key="preset.value"
        size="sm"
        class="min-h-11 sm:min-h-7"
        :variant="form.date === preset.value ? 'solid' : 'subtle'"
        :label="preset.label"
        @click="form.date = preset.value"
      />
    </div>
    <FormControl
      v-model="form.amount"
      type="number"
      inputmode="decimal"
      :label="__('Promised amount')"
    />
    <FormControl
      v-model="form.note"
      type="textarea"
      :label="__('Note (optional)')"
    />
    <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
      {{ problem.detail }}
    </p>
    <template #actions>
      <Button
        class="min-h-11 sm:min-h-8"
        :label="__('Cancel')"
        @click="$emit('update:modelValue', false)"
      />
      <Button
        class="min-h-11 sm:min-h-8"
        variant="solid"
        :label="__('Save promise')"
        :loading="saving"
        :disabled="!form.date || !(Number(form.amount) > 0)"
        @click="save"
      />
    </template>
  </PowerSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button, FormControl } from 'frappe-ui'
import PowerSheet from '@/components/power/PowerSheet.vue'
import {
  addDays,
  followupPresets,
  money,
  problemOf,
} from '@/composables/useCobranza'
import { createRequests } from '@/composables/useCobranzaActions'

// «Registrar promesa» on one invoice. The draft stays while the sheet is
// closed and reopened for the same invoice (a dismissed sheet loses nothing).
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  invoice: { type: Object, default: null },
  today: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'saved'])
const call = createRequests()
const form = reactive({ invoice: '', date: '', amount: '', note: '' })
const saving = ref(false)
const problem = ref(null)
const presets = computed(() => followupPresets(props.today))
const subtitle = computed(() =>
  props.invoice
    ? __('Invoice {0} · owes {1}', [
        props.invoice.name,
        money(props.invoice.outstanding, props.invoice.currency),
      ])
    : '',
)

watch(
  () => [props.modelValue, props.invoice?.name],
  ([open, name]) => {
    if (!open || !name || form.invoice === name) return
    Object.assign(form, {
      invoice: name,
      date: props.today ? addDays(props.today, 3) : '',
      amount: String(props.invoice.outstanding ?? ''),
      note: '',
    })
    problem.value = null
  },
  { immediate: true },
)

async function save() {
  saving.value = true
  problem.value = null
  try {
    const result = await call(`promise:${form.invoice}`, 'add_promise', {
      invoice: form.invoice,
      date: form.date,
      amount: form.amount,
      note: form.note,
    })
    form.invoice = ''
    emit('update:modelValue', false)
    emit('saved', result)
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    saving.value = false
  }
}
</script>
