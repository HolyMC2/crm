<template>
  <!-- A child table (conversiones, códigos de barras, reorden…): its rows in
       words, and one row at a time in an editor. -->
  <div data-ajustes-table>
    <template v-if="editing">
      <div class="grid gap-4">
        <div
          v-for="column in editableColumns"
          :key="column.fieldname"
          class="grid gap-1"
        >
          <label
            :for="`${uid}-${column.fieldname}`"
            class="text-sm font-medium text-ink-gray-8"
            >{{ column.label
            }}<span v-if="column.required" class="text-ink-red-7">
              *</span
            ></label
          >
          <p v-if="column.help" class="text-sm text-ink-gray-6">
            {{ column.help }}
          </p>
          <AjustesControl
            :id="`${uid}-${column.fieldname}`"
            :field="column"
            :model-value="draft[column.fieldname] ?? null"
            @update:model-value="draft[column.fieldname] = $event"
          />
        </div>
      </div>
      <p v-if="rowError" role="alert" class="mt-3 text-sm text-ink-red-7">
        {{ rowError }}
      </p>
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant="solid"
          class="min-h-11"
          :label="__('Listo')"
          @click="finishRow"
        />
        <Button
          variant="ghost"
          class="min-h-11"
          :label="__('Cancelar')"
          @click="editing = null"
        />
        <span class="flex-1" />
        <Button
          v-if="editing !== 'new'"
          variant="ghost"
          theme="red"
          class="min-h-11"
          :label="__('Quitar fila')"
          @click="removeRow"
        />
      </div>
    </template>
    <template v-else>
      <ul v-if="rows.length" class="divide-y divide-outline-gray-1">
        <li v-for="row in rows" :key="row.name">
          <component
            :is="field.can_write ? 'button' : 'div'"
            :type="field.can_write ? 'button' : undefined"
            class="flex min-h-11 w-full items-start gap-3 py-2 text-left"
            @click="field.can_write && openRow(row)"
          >
            <span class="min-w-0 flex-1">
              <span
                v-for="(column, index) in shownColumns"
                :key="column.fieldname"
                class="block break-words"
                :class="
                  index === 0
                    ? 'text-base text-ink-gray-9'
                    : 'text-sm text-ink-gray-6'
                "
              >
                <template v-if="index > 0">{{ column.label }}: </template
                >{{ cell(row, column) }}
              </span>
            </span>
            <span
              v-if="row.pending"
              class="rounded-full bg-surface-amber-2 px-2 text-xs font-medium leading-5 text-ink-amber-9"
              >{{ __('Sin guardar') }}</span
            >
            <span
              v-if="field.can_write"
              class="lucide-pencil mt-1 size-4 flex-none text-ink-gray-5"
              aria-hidden="true"
            />
          </component>
        </li>
      </ul>
      <p v-else class="py-2 text-base text-ink-gray-6">
        {{ __('Todavía no tiene filas.') }}
      </p>
      <Button
        v-if="field.can_write"
        class="mt-3 min-h-11"
        icon-left="plus"
        :label="__('Agregar fila')"
        @click="openRow(null)"
      />
      <p
        v-else-if="field.reason"
        class="mt-2 flex items-start gap-1 text-sm text-ink-gray-6"
      >
        <span class="lucide-lock mt-0.5 size-4 flex-none" aria-hidden="true" />
        {{ field.reason }}
      </p>
    </template>
  </div>
</template>
<script setup>
import { computed, reactive, ref, useId } from 'vue'
import { Button } from 'frappe-ui'
import AjustesControl from './AjustesControl.vue'
import { pendingDisplay } from './ajustes'

const props = defineProps({
  field: { type: Object, required: true },
  rows: { type: Array, default: () => [] },
})
const emit = defineEmits(['add', 'set', 'remove'])
const uid = `ajustes-row-${useId()}`

const columns = computed(() => props.field.table?.columns || [])
const editableColumns = computed(() =>
  columns.value.filter((column) => !column.read_only),
)
// The list shows the columns that carry a value somewhere, the first first.
const shownColumns = computed(() => {
  const used = columns.value.filter((column) =>
    props.rows.some((row) => {
      const value = row.values?.[column.fieldname]
      return (
        value !== null && value !== undefined && value !== '' && value !== 0
      )
    }),
  )
  return (used.length ? used : columns.value).slice(0, 4)
})

const editing = ref(null) // null | 'new' | the row
const draft = reactive({})
const rowError = ref('')

function cell(row, column) {
  const value = row.values?.[column.fieldname]
  if (!row.pending && row.display?.[column.fieldname] !== undefined)
    return row.display[column.fieldname]
  return pendingDisplay(column, value)
}
function openRow(row) {
  for (const key of Object.keys(draft)) delete draft[key]
  rowError.value = ''
  if (row) Object.assign(draft, row.values)
  editing.value = row || 'new'
}
function finishRow() {
  const missing = editableColumns.value
    .filter(
      (column) =>
        column.required &&
        (draft[column.fieldname] === null ||
          draft[column.fieldname] === undefined ||
          draft[column.fieldname] === ''),
    )
    .map((column) => column.label)
  if (missing.length) {
    rowError.value = __('Falta {0}.', [missing.join(', ')])
    return
  }
  const values = {}
  for (const column of editableColumns.value)
    if (draft[column.fieldname] !== undefined)
      values[column.fieldname] = draft[column.fieldname]
  if (editing.value === 'new') emit('add', values)
  else emit('set', editing.value, values)
  editing.value = null
}
function removeRow() {
  emit('remove', editing.value)
  editing.value = null
}
defineExpose({ editing })
</script>
