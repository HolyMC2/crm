<template>
  <!-- Editar a draft in a sheet (D1.2): the profile's fields (or the required
       and list fields), the items, one «Guardar». Frappe validates on save;
       its message shows here, and nothing the worker typed is lost. -->
  <BottomSheet
    :open="open"
    title="Editar borrador"
    :subtitle="subtitle"
    :dismissible="!saving"
    @update:open="close"
  >
    <EmptyState v-if="loadError" state="error" :message="loadError" />
    <p v-else-if="!form" class="py-6 text-base text-ink-gray-6">Cargando…</p>
    <EditForm
      v-else
      v-model:changes="changes"
      v-model:rows="rows"
      :fields="form.fields"
      :items="form.items"
      :doc="record.doc"
    />
    <template #actions>
      <p v-if="error" role="alert" class="text-base text-ink-red-7">
        {{ error }}
      </p>
      <button
        type="button"
        :class="BTN.filled"
        :disabled="saving || !form || !dirty"
        data-testid="documentos-edit-save"
        @click="save"
      >
        {{ saving ? 'Guardando…' : 'Guardar' }}
      </button>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { BottomSheet, EmptyState } from '@/components/ui'
import EditForm from './EditForm.vue'
import { docApi, errorText } from '@/documentos/api'
import { missingRequired, rowsChanged, rowsForSave } from '@/documentos/form'
import { BTN } from '@/documentos/tools'

const props = defineProps({
  open: { type: Boolean, default: false },
  record: { type: Object, required: true },
  // profile.editFields: the fields this document asks for, in order
  editFields: { type: Array, default: null },
  subtitle: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'saved'])

const form = ref(null)
const changes = ref({})
const rows = ref([])
const saving = ref(false)
const error = ref('')
const loadError = ref('')

const startRows = computed(() => props.record.items?.rows || [])
const dirty = computed(
  () =>
    Object.keys(changes.value).length > 0 ||
    rowsChanged(startRows.value, rows.value),
)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    error.value = ''
    loadError.value = ''
    changes.value = {}
    rows.value = startRows.value.map((r) => ({ ...r }))
    try {
      form.value = await docApi('form', {
        doctype: props.record.doctype,
        fields: props.editFields || undefined,
      })
    } catch (e) {
      loadError.value = errorText(e)
    }
  },
  { immediate: true },
)

function close(value) {
  if (!saving.value) emit('update:open', value)
}

async function save() {
  const missing = missingRequired(form.value.fields, changes.value, props.record.doc)
  if (missing.length) {
    error.value = `Falta: ${missing.join(', ')}.`
    return
  }
  saving.value = true
  error.value = ''
  const values = { ...changes.value }
  if (form.value.items && rowsChanged(startRows.value, rows.value))
    values[form.value.items.fieldname] = rowsForSave(rows.value)
  try {
    await docApi('save', {
      doctype: props.record.doctype,
      name: props.record.name,
      values,
      modified: props.record.modified,
    })
    emit('saved')
    emit('update:open', false)
  } catch (e) {
    error.value = errorText(e)
  } finally {
    saving.value = false
  }
}
</script>
