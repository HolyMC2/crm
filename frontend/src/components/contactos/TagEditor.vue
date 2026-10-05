<template>
  <Dialog v-model="open" :options="{ title: 'Etiquetas' }"
    ><template #body-content
      ><div class="c-editor">
        <p>
          Estas etiquetas pertenecen a {{ source.title || source.name }}. No se
          copian a sus representantes ni a otras cuentas.
        </p>
        <FormControl
          v-model="draft.text"
          label="Etiquetas separadas por coma"
        /><RecoveryMessage
          :error="conflict ? null : error"
          action="editar etiquetas"
          @retry="save"
          @compare="compare"
          @reload="useLatest"
        /><ConflictPanel
          v-if="conflict"
          :rows="conflict.rows"
          :overlap="conflict.overlap"
          :labels="{ tags: 'Etiquetas' }"
          @reapply="reapply"
          @discard="useLatest"
        />
        <div class="c-actions">
          <Button label="Cancelar" @click="open = false" /><Button
            label="Guardar etiquetas"
            variant="solid"
            :loading="saving"
            :disabled="!!conflict"
            @click="save"
          />
        </div></div></template
  ></Dialog>
</template>
<script setup>
import { computed, ref } from 'vue'
import { contactosApi, useContactosDraft } from '@/composables/useContactos'
import {
  errorKind,
  mergeConflict,
  sourceRef,
  versionOf,
} from '@/utils/contactos'
import ConflictPanel from './ConflictPanel.vue'
import RecoveryMessage from './RecoveryMessage.vue'
const props = defineProps({
  modelValue: Boolean,
  source: { type: Object, required: true },
  tags: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'saved'])
const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
const parse = (text) => [
  ...new Set(
    String(text || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  ),
]
const { draft, id, clear } = useContactosDraft(
  `tags:${sourceRef(props.source).source}:${props.source.name}`,
  {
    text: props.tags.join(', '),
    // The record version and tags this draft started from; a restored draft keeps it.
    base: { modified: props.source.modified, tags: [...props.tags] },
  },
)
const error = ref(null),
  saving = ref(false),
  conflict = ref(null),
  latest = ref(null)
const baseOf = (record) => ({
  modified: versionOf(record),
  tags: [...(record.tags || [])],
})
async function compare() {
  try {
    const record = await contactosApi('get_record', sourceRef(props.source))
    const base = draft.value.base || { tags: props.tags }
    latest.value = record
    const result = mergeConflict(
      { tags: base.tags },
      { tags: parse(draft.value.text) },
      { tags: record.tags || [] },
    )
    conflict.value = result.rows.length ? result : null
    if (!conflict.value) reapply()
  } catch (e) {
    error.value = e
  }
}
/** Keep my tags on the latest record version; the next save expects it. */
function reapply() {
  if (!latest.value) return
  draft.value.base = baseOf(latest.value)
  conflict.value = null
  error.value = null
}
/** Drop my tag changes and continue from the latest record. */
async function useLatest() {
  try {
    const record =
      latest.value ||
      (await contactosApi('get_record', sourceRef(props.source)))
    clear()
    draft.value.text = (record.tags || []).join(', ')
    draft.value.base = baseOf(record)
    conflict.value = null
    error.value = null
  } catch (e) {
    error.value = e
  }
}
async function save() {
  if (conflict.value) return
  saving.value = true
  error.value = null
  try {
    const payload = {
      ...sourceRef(props.source),
      modified: draft.value.base?.modified || props.source.modified,
      tags: parse(draft.value.text),
    }
    const result = await contactosApi('save_tags', {
      payload,
      request_id: id(payload),
    })
    clear()
    emit('saved', result)
    open.value = false
  } catch (e) {
    error.value = e
    if (errorKind(e) === 'conflict') await compare()
  } finally {
    saving.value = false
  }
}
</script>
