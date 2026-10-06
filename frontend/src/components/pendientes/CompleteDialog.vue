<template>
  <Dialog
    :model-value="modelValue"
    :options="{
      title: scheduleNext ? __('Done and schedule next') : __('Mark done'),
    }"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template #body-content>
      <form class="space-y-4" @submit.prevent="save">
        <p class="text-base text-ink-gray-8">{{ row?.description }}</p>
        <p v-if="row?.reference_label" class="text-sm text-ink-gray-6">
          {{ __('On {0}', [row.reference_label]) }}
        </p>
        <FormControl
          v-model="result"
          type="textarea"
          :label="__('Outcome (optional)')"
          :placeholder="__('What happened? It is saved on the record.')"
          :rows="2"
        />
        <FormControl
          v-model="scheduleNext"
          type="checkbox"
          :label="__('Schedule the next pendiente on this record')"
        />
        <fieldset v-if="scheduleNext" class="space-y-3">
          <legend class="sr-only">{{ __('Next pendiente') }}</legend>
          <FormControl
            ref="nextInput"
            v-model="next.description"
            :label="__('What comes next?')"
            :placeholder="__('Call to confirm, send the invoice…')"
          />
          <DueField v-model="next.date" :today="today" />
          <FormControl
            v-model="next.priority"
            type="select"
            :label="__('Priority')"
            :options="priorityOptions"
          />
        </fieldset>
        <div
          v-if="problem"
          role="alert"
          class="rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          <div class="mt-2 flex flex-wrap gap-2">
            <Button
              v-if="problem.kind === 'conflict'"
              :label="__('Load current version')"
              @click="$emit('reload')"
            />
            <Button
              v-else
              :label="__('Retry')"
              :loading="saving"
              @click="save"
            />
          </div>
        </div>
        <div class="flex flex-wrap justify-end gap-2">
          <Button
            :label="__('Cancel')"
            @click="$emit('update:modelValue', false)"
          />
          <Button
            type="submit"
            variant="solid"
            :loading="saving"
            :disabled="scheduleNext && !next.description.trim()"
            :label="scheduleNext ? __('Done and schedule') : __('Mark done')"
          />
        </div>
        <p
          v-if="scheduleNext && !next.description.trim()"
          class="text-right text-sm text-ink-gray-6"
        >
          {{ __('Write what comes next to schedule it.') }}
        </p>
      </form>
    </template>
  </Dialog>
</template>
<script setup>
import { nextTick, reactive, ref, watch } from 'vue'
import { Button, Dialog, FormControl } from 'frappe-ui'
import DueField from '@/components/pendientes/DueField.vue'
import { stableRequest } from '@/utils/contactos'
import {
  datePresets,
  pendienteError,
  pendientesApi,
} from '@/composables/usePendientes'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  row: { type: Object, default: null },
  today: { type: String, default: '' },
  withNext: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'done', 'reload'])
const result = ref(''),
  scheduleNext = ref(false),
  saving = ref(false),
  problem = ref(null),
  nextInput = ref(null)
const next = reactive({ description: '', date: '', priority: 'Medium' })
const priorityOptions = [
  { label: __('High'), value: 'High' },
  { label: __('Medium'), value: 'Medium' },
  { label: __('Low'), value: 'Low' },
]
let receipt = null
// A new task resets the form; reopening the same task keeps unsaved text.
watch(
  () => [props.modelValue, props.row?.doctype, props.row?.name],
  ([open], previous) => {
    if (!open) return
    const same =
      previous &&
      previous[1] === props.row?.doctype &&
      previous[2] === props.row?.name
    if (!same) {
      result.value = ''
      next.description = ''
      next.priority = props.row?.priority || 'Medium'
      next.date = datePresets(props.today)[1]?.value || ''
      receipt = null
    }
    scheduleNext.value = props.withNext || scheduleNext.value
    problem.value = null
  },
  { immediate: true },
)
watch(scheduleNext, async (value) => {
  if (value) {
    await nextTick()
    nextInput.value?.$el?.querySelector?.('input')?.focus()
  }
})
async function save() {
  if (!props.row || saving.value) return
  const args = {
    doctype: props.row.doctype,
    name: String(props.row.name),
    modified: props.row.modified,
    result: result.value.trim(),
    next_task: scheduleNext.value
      ? {
          description: next.description.trim(),
          date: next.date,
          priority: next.priority,
        }
      : null,
  }
  // The same payload retried keeps its request id, so a lost response
  // never schedules a second follow-up.
  receipt = stableRequest(receipt, args)
  saving.value = true
  problem.value = null
  try {
    const response = await pendientesApi('complete', {
      ...args,
      request_id: receipt.id,
    })
    emit('done', response)
    emit('update:modelValue', false)
  } catch (error) {
    problem.value = pendienteError(error)
  } finally {
    saving.value = false
  }
}
</script>
