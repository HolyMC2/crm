<template>
  <CobranzaSheet
    :model-value="modelValue"
    kind="call"
    :title="__('Log call')"
    :subtitle="invoice ? __('Invoice {0}', [invoice.name]) : ''"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <fieldset>
      <legend class="mb-2 text-sm text-ink-gray-7">
        {{ __('How did it go?') }}
      </legend>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Button
          v-for="option in outcomes"
          :key="option.value"
          class="min-h-12 justify-start sm:min-h-8"
          :variant="form.outcome === option.value ? 'solid' : 'subtle'"
          :aria-pressed="form.outcome === option.value"
          :label="option.label"
          @click="form.outcome = option.value"
        />
      </div>
    </fieldset>
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
        :label="__('Cancel')"
        @click="$emit('update:modelValue', false)"
      />
      <Button
        variant="solid"
        :label="__('Save call')"
        :loading="saving"
        @click="save"
      />
    </template>
  </CobranzaSheet>
</template>
<script setup>
import { reactive, ref, watch } from 'vue'
import { Button, FormControl } from 'frappe-ui'
import CobranzaSheet from '@/components/cobranza/CobranzaSheet.vue'
import { problemOf } from '@/composables/useCobranza'
import { createRequests } from '@/composables/useCobranzaActions'

// «Anotar llamada» on one invoice; the draft survives a dismissed sheet.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  invoice: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'saved'])
const call = createRequests()
const form = reactive({ invoice: '', outcome: 'answered', note: '' })
const saving = ref(false)
const problem = ref(null)
const outcomes = [
  { label: __('Answered'), value: 'answered' },
  { label: __('No answer'), value: 'no_answer' },
  { label: __('Left a message'), value: 'message' },
  { label: __('Visit'), value: 'visit' },
  { label: __('I wrote to them on WhatsApp'), value: 'whatsapp' },
]

watch(
  () => [props.modelValue, props.invoice?.name],
  ([open, name]) => {
    if (!open || !name || form.invoice === name) return
    Object.assign(form, { invoice: name, outcome: 'answered', note: '' })
    problem.value = null
  },
  { immediate: true },
)

async function save() {
  saving.value = true
  problem.value = null
  try {
    const result = await call(`call:${form.invoice}`, 'log_call', {
      invoice: form.invoice,
      outcome: form.outcome,
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
