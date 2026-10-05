<template>
  <Dialog
    v-model="open"
    :options="{
      title: followup ? 'Reprogramar seguimiento' : 'Añadir seguimiento',
    }"
  >
    <template #body-content
      ><div class="c-editor">
        <p class="c-muted">
          Se guarda en tu tarea nativa y aparece en Pendientes.
        </p>
        <RecoveryMessage
          :error="conflict ? null : error"
          action="editar mi seguimiento"
          @retry="save"
          @compare="compare"
          @reload="useLatest"
        />
        <ConflictPanel
          v-if="conflict"
          :rows="conflict.rows"
          :overlap="conflict.overlap"
          :labels="{ date: 'Fecha', status: 'Estado' }"
          @reapply="reapply"
          @discard="useLatest"
        />
        <FormControl
          v-model="draft.description"
          type="textarea"
          label="Qué necesitas hacer *"
          :disabled="!!followup"
        />
        <FormControl v-model="draft.date" type="date" label="Fecha *" />
        <FormControl
          v-model="draft.priority"
          type="select"
          label="Prioridad"
          :disabled="!!followup"
          :options="
            ['Medium', 'High', 'Low'].map((value) => ({
              value,
              label: { Medium: 'Normal', High: 'Alta', Low: 'Baja' }[value],
            }))
          "
        />
        <p v-if="followup" class="c-muted">
          Reprogramar cambia la fecha de esta misma tarea.
        </p>
        <div class="c-actions c-editor-footer">
          <Button label="Cancelar" @click="open = false" /><Button
            label="Guardar seguimiento"
            variant="solid"
            :loading="saving"
            :disabled="!!conflict || !draft.description.trim() || !draft.date"
            @click="save"
          />
        </div></div
    ></template>
  </Dialog>
</template>
<script setup>
import { computed, ref } from 'vue'
import { contactosApi, useContactosDraft } from '@/composables/useContactos'
import { errorKind, mergeConflict, sourceRef } from '@/utils/contactos'
import ConflictPanel from './ConflictPanel.vue'
import RecoveryMessage from './RecoveryMessage.vue'
const props = defineProps({
  modelValue: Boolean,
  source: { type: Object, required: true },
  followup: Object,
})
const emit = defineEmits(['update:modelValue', 'saved'])
const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
const saving = ref(false),
  error = ref(null),
  conflict = ref(null),
  latest = ref(null)
const versionBase = (task) =>
  task
    ? {
        modified: task.modified,
        date: task.date || task.due_date || '',
        status: task.status,
      }
    : null
const { draft, id, clear } = useContactosDraft(
  `followup:${sourceRef(props.source).source}:${props.source.name}:${props.followup?.name || 'new'}`,
  {
    description: props.followup?.description || '',
    date: props.followup?.date || props.followup?.due_date || '',
    priority: props.followup?.priority || 'Medium',
    // The task version this draft started from; a restored draft keeps it.
    base: versionBase(props.followup),
  },
)
/** The current task, checked server-side for own-task and parent permission. */
function findLatest() {
  return contactosApi('get_followup', { name: props.followup.name })
}
async function compare() {
  try {
    const task = await findLatest()
    const base = draft.value.base || versionBase(props.followup)
    latest.value = task
    const result = mergeConflict(
      { date: base.date, status: base.status },
      { date: draft.value.date, status: base.status },
      { date: task.date || task.due_date || '', status: task.status },
    )
    conflict.value = result.rows.length ? result : null
    if (!conflict.value) reapply()
  } catch (e) {
    error.value = e
  }
}
/** Keep my date on the latest task version; the next save expects that version. */
function reapply() {
  if (!latest.value) return
  draft.value.base = versionBase(latest.value)
  conflict.value = null
  error.value = null
}
/** Drop my change and continue from the latest task. */
async function useLatest() {
  try {
    const task = latest.value || (await findLatest())
    clear()
    draft.value.date = task.date || task.due_date || ''
    draft.value.base = versionBase(task)
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
    const base = draft.value.base || versionBase(props.followup)
    const payload = props.followup
      ? {
          name: props.followup.name,
          modified: base.modified,
          status: base.status,
          date: draft.value.date,
        }
      : {
          ...sourceRef(props.source),
          description: draft.value.description,
          date: draft.value.date,
          priority: draft.value.priority,
        }
    const result = await contactosApi(
      props.followup ? 'update_followup' : 'create_followup',
      { payload, request_id: id(payload) },
    )
    clear()
    emit('saved', result)
    open.value = false
  } catch (e) {
    error.value = e
    if (props.followup && errorKind(e) === 'conflict') await compare()
  } finally {
    saving.value = false
  }
}
</script>
