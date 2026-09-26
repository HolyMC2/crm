<template>
  <div
    class="flex p-3 items-center justify-between cursor-pointer hover:bg-surface-sidebar rounded"
  >
    <button
      type="button"
      class="min-h-11 w-7/12 min-w-0 text-left focus-visible:ring-2"
      @click="updateStep('view', data)"
    >
      <div class="text-base-medium text-ink-gray-7">{{ data.name }}</div>
      <div
        v-if="data.description && data.description.length > 0"
        class="text-p-base w-full text-ink-gray-5 mt-0.5 whitespace-nowrap overflow-ellipsis overflow-hidden"
      >
        {{ data.description }}
      </div>
    </button>
    <div class="w-3/12">
      <select
        v-model="localData.priority"
        class="w-full min-h-11 text-base hover:bg-surface-gray-3 rounded-md p-0 pl-2 pr-5 bg-transparent -ml-2 border-0 text-ink-gray-8 focus-visible:!ring-0 bg-none truncate"
        :disabled="pending || !data.can_write"
        :aria-label="__('Assignment priority')"
        @change="onPriorityChange"
      >
        <option
          v-for="option in priorityOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
    </div>
    <div class="flex justify-between items-center w-2/12">
      <Switch
        size="sm"
        :disabled="pending || !data.can_write"
        :modelValue="!data.disabled"
        @update:modelValue="onToggle"
      />
      <Dropdown
        v-if="dropdownOptions.length"
        placement="right"
        :options="dropdownOptions"
      >
        <Button
          icon="lucide-more-horizontal"
          :aria-label="__('Assignment actions')"
          :disabled="pending"
          class="min-h-11 min-w-11"
          variant="ghost"
          @click="isConfirmingDelete = false"
        />
      </Dropdown>
    </div>
  </div>
  <p v-if="error" role="alert" class="p-3 text-sm text-ink-red-5">
    {{ error }}
  </p>
  <Dialog
    v-model:open="duplicateDialog.show"
    :title="__('Duplicate Assignment Rule')"
  >
    <template #default>
      <div class="flex flex-col gap-4">
        <FormControl
          v-model="duplicateDialog.name"
          :label="__('New Assignment Rule Name')"
          type="text"
        />
      </div>
    </template>
    <template #actions>
      <div class="flex gap-2 justify-end">
        <Button
          variant="subtle"
          :label="__('Close')"
          @click="duplicateDialog.show = false"
        />
        <Button
          variant="solid"
          :label="__('Duplicate')"
          :loading="pending"
          class="min-h-11"
          @click="duplicate()"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import {
  Button,
  call,
  Dialog,
  Dropdown,
  FormControl,
  Switch,
  toast,
} from 'frappe-ui'
import { useTelemetry } from 'frappe-ui/frappe'
import { computed, inject, ref, reactive, watch } from 'vue'
import { ConfirmDelete } from '../../../utils'
import {
  useSettingsDraft,
  settingsErrorMessage,
} from '@/composables/settingsSession'

const { capture } = useTelemetry()

const assignmentRulesList = inject('assignmentRulesList')
const updateStep = inject('updateStep')

const props = defineProps({
  data: { type: Object, required: true },
})

const localData = reactive({ ...props.data })
watch(
  () => props.data,
  (val) => Object.assign(localData, val),
  { deep: true },
)

const priorityOptions = [
  { label: 'Low', value: '0' },
  { label: 'Low-Medium', value: '1' },
  { label: 'Medium', value: '2' },
  { label: 'Medium-High', value: '3' },
  { label: 'High', value: '4' },
]

const duplicateDialog = ref({
  show: false,
  name: '',
})

const isConfirmingDelete = ref(false)

const pending = ref(false)
const error = ref('')
useSettingsDraft({
  dirty: () => duplicateDialog.value.show && !!duplicateDialog.value.name,
  pending,
})
async function mutate(method, args, onSuccess) {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    const result = await call(method, args)
    onSuccess?.(result)
    await assignmentRulesList.reload()
  } catch (e) {
    Object.assign(localData, props.data)
    error.value =
      e.exc_type === 'ValidationError'
        ? e.messages?.[0] || e.message
        : settingsErrorMessage(e)
  } finally {
    pending.value = false
  }
}
const deleteAssignmentRule = () =>
  mutate(
    'frappe.client.delete',
    {
      doctype: 'Assignment Rule',
      name: props.data.name,
    },
    () => {
      isConfirmingDelete.value = false
      toast.success(__('Assignment rule deleted'))
    },
  )
const dropdownOptions = computed(() => [
  ...(props.data.can_duplicate
    ? [
        {
          label: __('Duplicate'),
          icon: 'copy',
          onClick: () => {
            duplicateDialog.value = {
              show: true,
              name: props.data.name + ' (Copy)',
            }
          },
        },
      ]
    : []),
  ...(props.data.can_delete
    ? ConfirmDelete({
        onConfirmDelete: deleteAssignmentRule,
        isConfirmingDelete,
      })
    : []),
])
const duplicate = () =>
  mutate(
    'crm.api.assignment_rule.duplicate_assignment_rule',
    {
      docname: props.data.name,
      new_name: duplicateDialog.value.name,
    },
    (data) => {
      duplicateDialog.value.show = false
      duplicateDialog.value.name = ''
      toast.success(__('Assignment rule duplicated'))
      updateStep('view', data)
    },
  )

const onPriorityChange = () => {
  setAssignmentRuleValue('priority', localData.priority)
}

const onToggle = () => {
  if (!props.data.users_exists && props.data.disabled) {
    toast.error(__('Cannot enable rule without adding users in it'))
    return
  }
  capture('assignment_rule_toggled', { enabled: Boolean(props.data.disabled) })
  setAssignmentRuleValue('disabled', !props.data.disabled, 'status')
}

const setAssignmentRuleValue = (key, value, fieldName = undefined) => {
  if (!props.data.can_write) return
  return mutate(
    'frappe.client.set_value',
    {
      doctype: 'Assignment Rule',
      name: props.data.name,
      fieldname: key,
      value,
    },
    () => toast.success(__('Assignment rule {0} updated', [fieldName || key])),
  )
}
</script>
