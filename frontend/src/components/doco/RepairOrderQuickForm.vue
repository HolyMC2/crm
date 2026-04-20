<template>
  <div>
    <div class="h-px w-full border-t my-5" />
    <div class="mb-3 flex items-center gap-2">
      <span class="text-base font-medium text-ink-gray-9">{{ __('Repair Order') }}</span>
      <span class="text-xs text-ink-gray-5">{{ __('(optional)') }}</span>
    </div>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-4">
      <div>
        <div class="mb-2 text-sm text-ink-gray-5">{{ __('Device Model') }}</div>
        <Link
          class="form-control"
          :value="modelValue.device_model"
          doctype="Device Model"
          :placeholder="__('Select phone model')"
          @change="update('device_model', $event)"
        />
      </div>
      <div>
        <div class="mb-2 text-sm text-ink-gray-5">{{ __('Repair Type') }}</div>
        <Link
          class="form-control"
          :value="modelValue.repair_to_be_done"
          doctype="Repair Type"
          :placeholder="__('Select repair type')"
          @change="update('repair_to_be_done', $event)"
        />
      </div>
      <div>
        <div class="mb-2 text-sm text-ink-gray-5">{{ __('Device Condition') }}</div>
        <FormControl
          type="select"
          class="form-control"
          :value="modelValue.general_status"
          :options="[
            { label: '', value: '' },
            { label: __('Good'), value: 'Good' },
            { label: __('Bad'), value: 'Bad' },
            { label: __('Really Bad'), value: 'Really Bad' },
          ]"
          @change="update('general_status', $event.target.value)"
        />
      </div>
      <div>
        <div class="mb-2 text-sm text-ink-gray-5">{{ __('Technician') }}</div>
        <Link
          class="form-control"
          :value="modelValue.technician"
          doctype="User"
          :placeholder="__('Assign technician')"
          @change="update('technician', $event)"
        />
      </div>
      <div>
        <div class="mb-2 text-sm text-ink-gray-5">{{ __('Client') }}</div>
        <Link
          class="form-control"
          :value="modelValue.client"
          doctype="Contact"
          :placeholder="__('Select client')"
          @change="update('client', $event)"
        />
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div
        v-for="cb in checkboxes"
        :key="cb.field"
        class="flex items-center gap-2 cursor-pointer"
        @click="update(cb.field, !modelValue[cb.field])"
      >
        <FormControl
          type="checkbox"
          :modelValue="modelValue[cb.field]"
          @change.stop
        />
        <label class="text-sm text-ink-gray-5 cursor-pointer select-none">
          {{ __(cb.label) }}
        </label>
      </div>
    </div>
  </div>
</template>

<script setup>
import Link from '@/components/Controls/Link.vue'
import { FormControl } from 'frappe-ui'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({
      device_model: '',
      repair_to_be_done: '',
      general_status: '',
      technician: '',
      client: '',
      has_sim_tray: false,
      is_wet: false,
      turns_on: false,
      broken_screen: false,
    }),
  },
})

const emit = defineEmits(['update:modelValue'])

const __ = window.__ || ((t) => t)

const checkboxes = [
  { field: 'has_sim_tray', label: __('Has SIM Tray?') },
  { field: 'is_wet',       label: __('Is it Wet?') },
  { field: 'turns_on',     label: __('Does it Turn On?') },
  { field: 'broken_screen', label: __('Broken Screen?') },
]

function update(field, value) {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}
</script>
