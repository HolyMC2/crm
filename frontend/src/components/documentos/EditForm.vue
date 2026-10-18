<template>
  <!-- The fields of a draft, one control per field type (D6's Ajustes
       controls: 44px, es-MX), then the items. Labels and «obligatorio» here;
       the controls carry no label of their own. -->
  <div class="flex flex-col gap-5">
    <div class="flex flex-col gap-4">
      <div
        v-for="field in shown"
        :key="field.fieldname"
        class="flex flex-col gap-1"
        :data-field="field.fieldname"
      >
        <label
          :for="`doc-f-${field.fieldname}`"
          class="text-sm font-medium text-ink-gray-8"
        >
          {{ field.label
          }}<span v-if="field.reqd" class="text-ink-red-7"> · obligatorio</span>
        </label>
        <AjustesControl
          :id="`doc-f-${field.fieldname}`"
          :field="controlField(field)"
          :model-value="valueOf(field, changes, doc)"
          @update:model-value="set(field.fieldname, $event)"
        />
        <p v-if="field.description" class="text-sm text-ink-gray-6">
          {{ field.description }}
        </p>
      </div>
    </div>
    <ItemsEditor
      v-if="items"
      :model-value="rows"
      :label="items.label || 'Artículos'"
      :fields="items.fields"
      @update:model-value="emit('update:rows', $event)"
    />
  </div>
</template>
<script setup>
import { computed } from 'vue'
import AjustesControl from '@/components/ajustes/AjustesControl.vue'
import ItemsEditor from './ItemsEditor.vue'
import { dependsOk, valueOf } from '@/documentos/form'

const props = defineProps({
  // form().fields
  fields: { type: Array, default: () => [] },
  // form().items: { fieldname, label, fields } or null
  items: { type: Object, default: null },
  // the document as loaded (record.doc or draft().doc)
  doc: { type: Object, default: () => ({}) },
  // { fieldname: value } the worker changed
  changes: { type: Object, default: () => ({}) },
  rows: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:changes', 'update:rows'])

const current = computed(() => ({ ...props.doc, ...props.changes }))
const shown = computed(() =>
  props.fields.filter((f) => dependsOk(f.depends_on, current.value)),
)

// AjustesControl reads Link targets from `link` and Select choices from `options`.
function controlField(field) {
  if (field.fieldtype === 'Link') return { ...field, link: field.options }
  if (field.fieldtype === 'Dynamic Link') {
    const target = current.value[field.options]
    return target
      ? { ...field, fieldtype: 'Link', link: target }
      : { ...field, fieldtype: 'Data' }
  }
  return field
}

function set(fieldname, value) {
  emit('update:changes', { ...props.changes, [fieldname]: value })
}
</script>
