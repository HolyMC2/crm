<template>
  <Dialog
    v-model="open"
    :options="{
      title: address?.name ? 'Editar dirección' : 'Añadir dirección',
      size: 'xl',
    }"
  >
    <template #body-content
      ><div class="c-editor">
        <RecoveryMessage
          :error="conflict ? null : error"
          action="editar la dirección vinculada"
          @retry="load"
          @compare="compare"
          @reload="useLatest"
        />
        <ConflictPanel
          v-if="conflict"
          :rows="conflict.rows"
          :overlap="conflict.overlap"
          :labels="fieldLabels"
          title="Comparar con la dirección actual"
          @reapply="reapply"
          @discard="useLatest"
        />
        <div
          v-if="
            address?.shared ||
            address?.shared_safe === false ||
            address?.impact_editable === false
          "
          class="c-inset"
        >
          <h3>
            {{
              address.shared
                ? 'Esta dirección se comparte'
                : 'Revisa el alcance de la dirección'
            }}
          </h3>
          <p
            v-for="link in address.visible_links || []"
            :key="link.doctype + link.name"
          >
            {{ link.title || link.name }} ({{ sourceLabel(link.doctype) }})
          </p>
          <FormControl
            v-if="address.shared_safe && address.impact_editable !== false"
            v-model="draft.confirm_shared"
            type="checkbox"
            label="Confirmo el cambio para estos registros visibles"
          />
          <p v-else>
            No podemos mostrar todo el alcance del cambio. Crea otra dirección
            vinculada para continuar.
          </p>
          <Button
            label="Crear otra dirección"
            @click="draft.create_new = true"
          />
          <p v-if="draft.create_new" class="c-hint">
            Se guardará una nueva dirección. La dirección compartida conserva
            sus datos.
          </p>
        </div>
        <MetaFields v-model="draft.fields" :fields="meta?.fields || []" />
        <div class="c-actions c-editor-footer">
          <Button label="Cancelar" @click="open = false" /><Button
            label="Guardar dirección"
            variant="solid"
            :loading="saving"
            :disabled="
              !meta ||
              !!conflict ||
              ((address?.shared ||
                address?.shared_safe === false ||
                address?.impact_editable === false) &&
                !draft.create_new &&
                (!address.shared_safe ||
                  address.impact_editable === false ||
                  !draft.confirm_shared))
            "
            @click="save"
          />
        </div></div
    ></template>
  </Dialog>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { contactosApi, useContactosDraft } from '@/composables/useContactos'
import {
  errorKind,
  mergeConflict,
  sourceRef,
  sourceLabel,
  versionOf,
  writableFields,
} from '@/utils/contactos'
import ConflictPanel from './ConflictPanel.vue'
import MetaFields from './MetaFields.vue'
import RecoveryMessage from './RecoveryMessage.vue'
const props = defineProps({
  modelValue: Boolean,
  source: { type: Object, required: true },
  address: Object,
})
const emit = defineEmits(['update:modelValue', 'saved'])
const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
const meta = ref(null),
  saving = ref(false),
  error = ref(null),
  conflict = ref(null),
  latest = ref(null)
const fieldLabels = computed(() =>
  Object.fromEntries(
    (meta.value?.fields || []).map((f) => [
      f.fieldname,
      f.label || f.fieldname,
    ]),
  ),
)
const { draft, id, clear } = useContactosDraft(
  `address:${sourceRef(props.source).source}:${props.source.name}:${props.address?.name || 'new'}`,
  {
    fields: { ...props.address?.fields },
    confirm_shared: false,
    create_new: false,
    // Versions and values this draft started from; a restored draft keeps them.
    base: {
      modified: props.address?.modified || null,
      source_modified: props.source.modified || null,
      fields: { ...props.address?.fields },
    },
  },
)
const editsExisting = () => !!props.address?.name && !draft.value.create_new
watch(
  () => props.modelValue,
  (v) => {
    if (v) load()
  },
  { immediate: true },
)
async function load() {
  try {
    meta.value = await contactosApi('get_editor_meta', { source: 'address' })
    error.value = null
  } catch (e) {
    error.value = e
  }
}
/** Latest parent record and, when editing one, the latest address. */
async function fetchLatest() {
  const parent = await contactosApi('get_record', sourceRef(props.source))
  const address = editsExisting()
    ? await contactosApi('get_record', {
        source: 'address',
        name: props.address.name,
      })
    : null
  return { parent, address }
}
function pick(fields) {
  const known = new Set(Object.keys(fieldLabels.value))
  return Object.fromEntries(
    Object.entries(fields || {}).filter(([key]) => known.has(key)),
  )
}
async function compare() {
  try {
    latest.value = await fetchLatest()
    const base = draft.value.base || {}
    // A new address only depends on its parent's version: there are no address
    // fields to compare, so reapplying just adopts the parent's new version.
    const result = latest.value.address
      ? mergeConflict(
          pick(base.fields),
          pick(draft.value.fields),
          pick(latest.value.address.fields),
        )
      : null
    conflict.value = result?.rows.length ? result : null
    if (!conflict.value) reapply()
  } catch (e) {
    error.value = e
  }
}
function baseFrom({ parent, address }) {
  return {
    modified: address
      ? versionOf(address, 'Address', props.address?.name)
      : draft.value.base?.modified || null,
    source_modified: versionOf(parent),
    fields: { ...(address?.fields || draft.value.base?.fields || {}) },
  }
}
/** Keep my changes on the latest versions; the next save expects them. */
function reapply() {
  if (!latest.value) return
  if (conflict.value)
    draft.value.fields = {
      ...draft.value.fields,
      ...conflict.value.rebased,
    }
  draft.value.base = baseFrom(latest.value)
  conflict.value = null
  error.value = null
}
/** Drop my changes and continue from the latest address. */
async function useLatest() {
  try {
    const current = await fetchLatest()
    clear()
    latest.value = current
    if (current.address) draft.value.fields = { ...current.address.fields }
    draft.value.base = baseFrom(current)
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
    const base = draft.value.base || {}
    const payload = {
      ...sourceRef(props.source),
      source_modified: base.source_modified || props.source.modified,
      fields: writableFields(
        draft.value.fields,
        meta.value.fields,
        editsExisting() ? base.fields || props.address?.fields : null,
      ),
      confirm_shared: draft.value.confirm_shared,
    }
    if (editsExisting()) {
      payload.address_name = props.address.name
      payload.modified = base.modified || props.address.modified
    }
    const result = await contactosApi('save_address', {
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
