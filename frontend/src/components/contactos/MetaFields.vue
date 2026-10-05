<template>
  <div class="c-form-grid">
    <template v-for="field in visibleFields" :key="field.fieldname">
      <NativeLinkField
        v-if="field.fieldtype === 'Link'"
        :label="`${field.label || field.fieldname}${field.reqd ? ' *' : ''}`"
        :doctype="field.options"
        :model-value="modelValue[field.fieldname] || ''"
        :disabled="disabled || !!field.read_only"
        @update:model-value="set(field, $event)"
      />
      <FormControl
        v-else-if="field.fieldtype === 'Check'"
        type="checkbox"
        :label="field.label"
        :model-value="!!modelValue[field.fieldname]"
        :disabled="disabled || !!field.read_only"
        @update:model-value="set(field, $event ? 1 : 0)"
      />
      <FormControl
        v-else
        :type="inputType(field)"
        :label="`${field.label || field.fieldname}${field.reqd ? ' *' : ''}`"
        :options="
          field.fieldtype === 'Select' ? fieldOptions(field) : undefined
        "
        :model-value="modelValue[field.fieldname] ?? ''"
        :disabled="disabled || !!field.read_only"
        :required="!!field.reqd"
        @update:model-value="set(field, $event)"
      />
    </template>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { fieldOptions } from '@/utils/contactos'
import NativeLinkField from './NativeLinkField.vue'
const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  fields: { type: Array, default: () => [] },
  disabled: Boolean,
})
const emit = defineEmits(['update:modelValue'])
const visibleFields = computed(() =>
  props.fields.filter(
    (field) =>
      ![
        'Section Break',
        'Column Break',
        'Tab Break',
        'HTML',
        'Table',
        'Table MultiSelect',
        'Button',
        'Image',
      ].includes(field.fieldtype),
  ),
)
const inputType = (field) =>
  ({
    Select: 'select',
    Date: 'date',
    Datetime: 'datetime-local',
    Int: 'number',
    Float: 'number',
    Currency: 'number',
    'Small Text': 'textarea',
    Text: 'textarea',
    'Long Text': 'textarea',
  })[field.fieldtype] || 'text'
const set = (field, value) =>
  emit('update:modelValue', { ...props.modelValue, [field.fieldname]: value })
</script>
