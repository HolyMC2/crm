<template>
  <!-- A bounded task: the shared bottom sheet on a phone, a dialog on desktop. -->
  <BottomSheet
    :open="modelValue"
    :title="__('New pendiente')"
    :dismissible="!form.description.trim()"
    @update:open="$emit('update:modelValue', $event)"
  >
    <form
      id="pendiente-create-form"
      class="space-y-4 pb-2"
      @submit.prevent="save"
    >
      <p
        v-if="reference?.reference_name"
        class="rounded-lg bg-surface-gray-2 px-3 py-2 text-sm text-ink-gray-7"
      >
        {{
          __('On {0}', [reference.reference_label || reference.reference_name])
        }}
        <span v-if="savesAsSalesTask(reference)" class="block text-ink-gray-6">
          {{ __('Saved as your sales task: the record keeps its owner.') }}
        </span>
      </p>
      <FormControl
        ref="descriptionInput"
        v-model="form.description"
        type="textarea"
        :rows="2"
        :label="__('What needs to happen?')"
        :placeholder="__('Call to confirm, send the quote…')"
      />
      <DueField v-model="form.date" :today="today" />
      <FormControl
        v-model="form.priority"
        type="select"
        :label="__('Priority')"
        :options="[
          { label: __('High'), value: 'High' },
          { label: __('Medium'), value: 'Medium' },
          { label: __('Low'), value: 'Low' },
        ]"
      />
      <div
        v-if="problem"
        role="alert"
        class="rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
      </div>
      <!-- A sales task (assignee, activity, time) is CRM's own form. -->
      <Button
        v-if="salesTask && !reference?.reference_name"
        variant="ghost"
        icon-left="briefcase"
        class="min-h-11"
        :label="__('New sales task')"
        @click="$emit('sales-task')"
      />
    </form>
    <template #actions>
      <Button
        size="lg"
        class="min-h-11 w-full"
        :label="__('Cancel')"
        @click="$emit('update:modelValue', false)"
      />
      <Button
        type="submit"
        form="pendiente-create-form"
        variant="solid"
        size="lg"
        class="min-h-11 w-full"
        :loading="saving"
        :disabled="!form.description.trim() || !form.date"
        :label="__('Save pendiente')"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { nextTick, reactive, ref, watch } from 'vue'
import { Button, FormControl } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import DueField from '@/components/pendientes/DueField.vue'
import { stableRequest } from '@/utils/contactos'
import {
  pendienteError,
  pendientesApi,
  savesAsSalesTask,
} from '@/composables/usePendientes'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  today: { type: String, default: '' },
  // {reference_type, reference_name, reference_label} from the calling record
  reference: { type: Object, default: null },
  /** Offer CRM's sales task form too (the worker may create both). */
  salesTask: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'created', 'sales-task'])
const form = reactive({ description: '', date: '', priority: 'Medium' })
const saving = ref(false),
  problem = ref(null),
  descriptionInput = ref(null)
let receipt = null
watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    if (!form.date) form.date = props.today
    problem.value = null
    await nextTick()
    descriptionInput.value?.$el?.querySelector?.('textarea')?.focus()
  },
  { immediate: true },
)
async function save() {
  if (saving.value || !form.description.trim() || !form.date) return
  const args = {
    description: form.description.trim(),
    date: form.date,
    priority: form.priority,
    reference_type: props.reference?.reference_type || null,
    reference_name: props.reference?.reference_name || null,
  }
  receipt = stableRequest(receipt, args)
  saving.value = true
  problem.value = null
  try {
    const response = await pendientesApi('create', {
      ...args,
      request_id: receipt.id,
    })
    form.description = ''
    form.date = ''
    form.priority = 'Medium'
    receipt = null
    emit('created', response.row)
    emit('update:modelValue', false)
  } catch (error) {
    problem.value = pendienteError(error)
  } finally {
    saving.value = false
  }
}
</script>
