<template>
  <!-- One project editor for new and existing projects (Shell SPEC §7 DE7):
       the name, its dates, its state, a note. A bounded task: the shared sheet. -->
  <BottomSheet
    :open="modelValue"
    :title="editing ? __('Edit project') : __('New project')"
    :dismissible="!dirty"
    @update:open="$emit('update:modelValue', $event)"
  >
    <form id="proyecto-form" class="space-y-4 pb-2" @submit.prevent="save">
      <FormControl
        ref="nameInput"
        v-model="form.project_name"
        type="text"
        :label="__('Project name')"
        :placeholder="__('Store opening, Christmas campaign…')"
        maxlength="140"
      />
      <!-- es-MX dates (D1's DateField), never the browser's mm/dd/yyyy. -->
      <div class="flex flex-wrap gap-3">
        <div class="space-y-1.5">
          <span class="block text-xs text-ink-gray-5">{{ __('Starts') }}</span>
          <DateField
            v-model="form.expected_start_date"
            mode="date"
            :label="__('Starts')"
          />
        </div>
        <div class="space-y-1.5">
          <span class="block text-xs text-ink-gray-5">{{ __('Ends') }}</span>
          <DateField
            v-model="form.expected_end_date"
            mode="date"
            :label="__('Ends')"
          />
        </div>
      </div>
      <fieldset v-if="editing" class="flex flex-wrap gap-2">
        <legend class="mb-1.5 block text-xs text-ink-gray-5">
          {{ __('Status') }}
        </legend>
        <Button
          v-for="status in STATUSES"
          :key="status"
          class="min-h-11 sm:min-h-8"
          :variant="form.status === status ? 'subtle' : 'ghost'"
          :aria-pressed="form.status === status"
          :label="statusLabel(status)"
          @click="form.status = status"
        />
      </fieldset>
      <FormControl
        v-model="form.notes"
        type="textarea"
        :rows="3"
        :label="__('Notes')"
        :placeholder="__('What this project is for, who is in it…')"
      />
      <div
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
      </div>
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
        form="proyecto-form"
        variant="solid"
        size="lg"
        class="min-h-11 w-full"
        :loading="saving"
        :disabled="!form.project_name.trim()"
        :label="editing ? __('Save changes') : __('Save project')"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { Button, FormControl } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import DateField from '@/components/ui/DateField.vue'
import { stableRequest } from '@/utils/contactos'
import {
  STATUSES,
  proyectoError,
  proyectosApi,
  statusLabel,
} from '@/composables/useProyectos'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** Edit this project (the record's projection) instead of creating one. */
  project: { type: Object, default: null },
  today: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'saved'])

const editing = computed(() => Boolean(props.project))
const blank = () => ({
  project_name: '',
  expected_start_date: '',
  expected_end_date: '',
  status: 'Open',
  notes: '',
})
const form = reactive(blank())
let initial = blank()
const nameInput = ref(null)
const saving = ref(false)
const problem = ref(null)
let receipt = null
const dirty = computed(() =>
  Object.keys(initial).some((key) => form[key] !== initial[key]),
)

function fill(project) {
  Object.assign(form, {
    project_name: project.project_name || '',
    expected_start_date: project.expected_start_date || '',
    expected_end_date: project.expected_end_date || '',
    status: project.status || 'Open',
    notes: project.notes_text || '',
  })
  initial = { ...form }
}

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (!isOpen) return
    problem.value = null
    if (editing.value) fill(props.project)
    else {
      Object.assign(form, blank(), { expected_start_date: props.today })
      initial = { ...form }
    }
    await nextTick()
    nameInput.value?.$el?.querySelector?.('input')?.focus()
  },
  { immediate: true },
)

function changes() {
  const values = {}
  for (const key of Object.keys(initial))
    if (form[key] !== initial[key]) values[key] = form[key]
  if ('project_name' in values) values.project_name = form.project_name.trim()
  return values
}

async function save() {
  if (saving.value || !form.project_name.trim()) return
  saving.value = true
  problem.value = null
  try {
    let response
    if (editing.value) {
      const values = changes()
      if (!Object.keys(values).length) {
        emit('update:modelValue', false)
        return
      }
      receipt = stableRequest(receipt, { name: props.project.name, values })
      response = await proyectosApi('actualizar', {
        name: props.project.name,
        modified: props.project.modified,
        values,
        request_id: receipt.id,
      })
    } else {
      const values = {
        project_name: form.project_name.trim(),
        expected_start_date: form.expected_start_date,
        expected_end_date: form.expected_end_date,
        notes: form.notes,
      }
      receipt = stableRequest(receipt, values)
      response = await proyectosApi('crear', {
        values,
        request_id: receipt.id,
      })
    }
    receipt = null
    emit('saved', response.project)
    emit('update:modelValue', false)
  } catch (error) {
    problem.value = proyectoError(error)
  } finally {
    saving.value = false
  }
}
</script>
