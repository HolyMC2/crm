<template>
  <Dialog
    v-model="open"
    :options="{
      title: source?.name ? 'Editar datos' : 'Nuevo contacto',
      size: 'xl',
    }"
  >
    <template #body-content>
      <div class="c-editor">
        <p class="c-muted">
          {{
            source?.name
              ? 'Los cambios se guardan únicamente en el registro seleccionado.'
              : 'Crea una persona o empresa. La cuenta comercial y la dirección son opcionales.'
          }}
        </p>
        <p v-if="restored" class="c-hint">
          Recuperamos el borrador de esta sesión.
        </p>
        <RecoveryMessage
          :error="conflict ? null : error"
          action="crear o editar este registro"
          @retry="retry"
          @compare="compare"
          @reload="useLatest"
        />
        <p v-if="loading" role="status">Cargando campos disponibles…</p>
        <template v-else>
          <FormControl
            v-if="!source?.name"
            type="select"
            label="Tipo de registro"
            :model-value="draft.source"
            :options="sourceOptions"
            @update:model-value="changeSource"
          />
          <div v-if="source?.name" class="c-origin">
            Registro:
            {{ sourceLabel(meta?.doctype || source.doctype || source.source) }}
            · {{ source.name }}
          </div>
          <MetaFields
            v-model="draft.fields"
            :fields="meta?.fields || []"
            :disabled="saving"
          />
          <template v-if="draft.source === 'contact'">
            <div class="c-section-heading">
              <h3>Teléfonos</h3>
              <Button
                label="Añadir teléfono"
                variant="ghost"
                :disabled="!phoneWritable"
                @click="
                  draft.phones.push({
                    phone: '',
                    is_primary_phone: 0,
                    is_primary_mobile_no: 0,
                  })
                "
              />
            </div>
            <div
              v-for="(phone, index) in draft.phones"
              :key="index"
              class="c-channel-row"
            >
              <FormControl
                v-model="phone.phone"
                :label="`Teléfono ${index + 1}`"
                type="tel"
                :disabled="!phoneWritable"
              />
              <FormControl
                type="checkbox"
                label="Principal"
                :model-value="!!phone.is_primary_mobile_no"
                :disabled="!phoneWritable"
                @update:model-value="primary('phones', index, $event)"
              />
              <Button
                :aria-label="`Quitar teléfono ${index + 1}`"
                icon="x"
                variant="ghost"
                :disabled="!phoneWritable"
                @click="draft.phones.splice(index, 1)"
              />
            </div>
            <div class="c-section-heading">
              <h3>Correos</h3>
              <Button
                label="Añadir correo"
                variant="ghost"
                :disabled="!emailWritable"
                @click="draft.emails.push({ email_id: '', is_primary: 0 })"
              />
            </div>
            <div
              v-for="(email, index) in draft.emails"
              :key="index"
              class="c-channel-row"
            >
              <FormControl
                v-model="email.email_id"
                type="email"
                :label="`Correo ${index + 1}`"
                :disabled="!emailWritable"
              />
              <FormControl
                type="checkbox"
                label="Principal"
                :model-value="!!email.is_primary"
                :disabled="!emailWritable"
                @update:model-value="primary('emails', index, $event)"
              />
              <Button
                :aria-label="`Quitar correo ${index + 1}`"
                icon="x"
                variant="ghost"
                :disabled="!emailWritable"
                @click="draft.emails.splice(index, 1)"
              />
            </div>
          </template>
          <template v-if="!source?.name">
            <FormControl
              v-if="draft.source === 'contact'"
              type="select"
              label="Cuenta comercial opcional"
              :model-value="draft.party_source"
              :options="partyOptions"
              @update:model-value="loadParty"
            />
            <div v-if="draft.party_source" class="c-inset">
              <h3>Datos de la cuenta comercial</h3>
              <MetaFields
                v-model="draft.party_fields"
                :fields="partyMeta?.fields || []"
              />
            </div>
            <FormControl
              v-model="draft.with_address"
              type="checkbox"
              label="Añadir dirección en el mismo guardado"
              @update:model-value="loadAddress"
            />
            <div v-if="draft.with_address" class="c-inset">
              <h3>Dirección</h3>
              <MetaFields
                v-model="draft.address_fields"
                :fields="addressMeta?.fields || []"
              />
            </div>
          </template>
          <div v-if="matches.length" class="c-candidates">
            <h3>Hay datos compartidos con otros registros</h3>
            <p>
              Un teléfono o correo compartido no confirma que sea la misma
              persona.
            </p>
            <label
              v-for="candidate in matches"
              :key="candidate.source + candidate.name"
              class="c-candidate"
            >
              <input
                v-model="draft.existing_key"
                type="radio"
                name="existing-contacto"
                :value="candidate.source + ':' + candidate.name"
              />
              <span
                >{{ candidate.title || candidate.name
                }}<small
                  >{{ sourceLabel(candidate.doctype || candidate.source) }} ·
                  {{ candidate.reason || 'Canal o nombre compartido' }}</small
                ></span
              >
            </label>
            <FormControl
              v-model="draft.candidate_decision"
              type="select"
              label="Decisión explícita"
              :options="decisions"
            />
          </div>
          <ConflictPanel
            v-if="conflict"
            :rows="conflict.rows"
            :overlap="conflict.overlap"
            :labels="fieldLabels"
            @reapply="reapply"
            @discard="useLatest"
          />
          <div class="c-actions c-editor-footer">
            <Button label="Cancelar" @click="open = false" /><Button
              :label="
                source?.name
                  ? 'Guardar cambios'
                  : matches.length
                    ? 'Guardar decisión'
                    : 'Revisar y crear'
              "
              variant="solid"
              :loading="saving"
              :disabled="
                loading ||
                saving ||
                !!conflict ||
                !(source?.name ? meta?.can_write : meta?.can_create)
              "
              @click="save"
            />
          </div>
        </template>
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { contactosApi, useContactosDraft } from '@/composables/useContactos'
import {
  errorKind,
  mergeConflict,
  sourceRef,
  sourceSlug,
  sourceLabel,
  versionOf,
  writableFields,
} from '@/utils/contactos'
import ConflictPanel from './ConflictPanel.vue'
import MetaFields from './MetaFields.vue'
import RecoveryMessage from './RecoveryMessage.vue'
import './contactos.css'
const props = defineProps({
  modelValue: Boolean,
  source: Object,
  defaults: { type: Object, default: () => ({}) },
  initial: Object,
  context: Object,
})
const emit = defineEmits(['update:modelValue', 'saved'])
const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
const meta = ref(null),
  partyMeta = ref(null),
  addressMeta = ref(null),
  loading = ref(false),
  saving = ref(false),
  error = ref(null),
  matches = ref([]),
  conflict = ref(null),
  latest = ref(null)
const editing = computed(() => !!props.source?.name)
const phoneWritable = computed(() =>
  meta.value?.fields?.some((f) => f.fieldname === 'phone_nos' && !f.read_only),
)
const emailWritable = computed(() =>
  meta.value?.fields?.some((f) => f.fieldname === 'email_ids' && !f.read_only),
)
const fieldLabels = computed(() => ({
  ...Object.fromEntries(
    (meta.value?.fields || []).map((f) => [
      f.fieldname,
      f.label || f.fieldname,
    ]),
  ),
  phone_nos: 'Teléfonos',
  email_ids: 'Correos',
}))
// Contextual defaults (Inbox name, phone, email) seed creation only. An existing
// record always starts from its complete native data, so a partial context can
// never replace its channel tables.
const { draft, id, clear, acceptInitial, restored } = useContactosDraft(
  `identity:${props.source?.doctype || props.source?.source || 'new'}:${props.source?.name || 'new'}`,
  {
    source: sourceSlug(
      props.source?.doctype ||
        props.source?.source ||
        props.defaults.source ||
        'contact',
    ),
    fields: editing.value
      ? {}
      : { ...(props.initial || {}), ...(props.defaults.fields || {}) },
    phones: editing.value ? [] : props.defaults.phones || [],
    emails: editing.value ? [] : props.defaults.emails || [],
    party_source: props.defaults.party_source || '',
    party_fields: {},
    with_address: false,
    address_fields: {},
    candidate_decision: props.defaults.candidate_decision || '',
    existing_key: props.defaults.existing_key || '',
    base: null,
  },
)
const sourceOptions = [
  { label: 'Persona', value: 'contact' },
  { label: 'Empresa', value: 'organization' },
  { label: 'Cliente', value: 'customer' },
  { label: 'Proveedor', value: 'supplier' },
]
const partyOptions = [
  { label: 'Sin cuenta comercial', value: '' },
  { label: 'Cliente', value: 'customer' },
  { label: 'Proveedor', value: 'supplier' },
]
const decisions = [
  { label: 'Selecciona cómo continuar', value: '' },
  { label: 'Es otra persona / empresa', value: 'different' },
  { label: 'Usar el registro existente', value: 'use_existing' },
  { label: 'Vincular el rol solicitado', value: 'link_role' },
]
watch(
  () => props.modelValue,
  (v) => {
    if (v) load()
  },
  { immediate: true },
)
/** The native version and complete field values a draft is based on. */
function snapshot(record) {
  return {
    modified: versionOf(record, meta.value?.doctype, props.source?.name),
    fields: JSON.parse(JSON.stringify(record?.fields || {})),
  }
}
function hydrate(record) {
  acceptInitial({
    ...draft.value,
    fields: { ...(record.fields || {}) },
    phones: JSON.parse(JSON.stringify(record.fields?.phone_nos || [])),
    emails: JSON.parse(JSON.stringify(record.fields?.email_ids || [])),
    base: snapshot(record),
  })
}
function formFields() {
  const fields = { ...draft.value.fields }
  if (draft.value.source === 'contact') {
    fields.phone_nos = draft.value.phones.filter((p) =>
      String(p.phone || '').trim(),
    )
    fields.email_ids = draft.value.emails.filter((e) =>
      String(e.email_id || '').trim(),
    )
  }
  return fields
}
function showConflict(record) {
  const known = new Set(Object.keys(fieldLabels.value))
  const pick = (fields) =>
    Object.fromEntries(
      Object.entries(fields || {}).filter(([key]) => known.has(key)),
    )
  latest.value = record
  // A restored draft without its starting version is compared with the latest
  // one: the worker sees every difference before anything is saved.
  const base = draft.value.base?.fields || record.fields
  const result = mergeConflict(
    pick(base),
    pick(formFields()),
    pick(record.fields),
  )
  conflict.value = result.rows.length ? result : null
}
async function load() {
  loading.value = true
  error.value = null
  try {
    meta.value = await contactosApi('get_editor_meta', {
      source: draft.value.source,
    })
    if (editing.value) {
      const record = await contactosApi('get_record', sourceRef(props.source))
      latest.value = record
      // Hydrate only before editing starts. A retry or reopened draft keeps the
      // worker's edits and its original baseline; a newer version is compared.
      if (!draft.value.base && !restored) hydrate(record)
      else if (
        !draft.value.base ||
        draft.value.base.modified !== snapshot(record).modified
      )
        showConflict(record)
    }
    if (draft.value.party_source) await loadParty(draft.value.party_source)
    if (draft.value.with_address) await loadAddress(true)
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}
/** Reintentar: replay an unanswered save with its request ID, else reload metadata. */
function retry() {
  return draft.value.submitted ? save() : load()
}
async function changeSource(value) {
  draft.value.source = value
  draft.value.fields = {}
  if (value !== 'contact') draft.value.party_source = ''
  matches.value = []
  await load()
}
async function loadParty(value) {
  draft.value.party_source = value
  if (value) {
    try {
      partyMeta.value = await contactosApi('get_editor_meta', { source: value })
    } catch (e) {
      error.value = e
    }
  }
}
async function loadAddress(value) {
  if (value) {
    try {
      addressMeta.value = await contactosApi('get_editor_meta', {
        source: 'address',
      })
    } catch (e) {
      error.value = e
    }
  }
}
function primary(collection, index, value) {
  draft.value[collection].forEach((row, i) => {
    if (collection === 'phones') {
      row.is_primary_mobile_no = i === index && value ? 1 : 0
      row.is_primary_phone = row.is_primary_mobile_no
    } else row.is_primary = i === index && value ? 1 : 0
  })
}
async function compare() {
  try {
    showConflict(await contactosApi('get_record', sourceRef(props.source)))
    if (!conflict.value) reapply()
  } catch (e) {
    error.value = e
  }
}
/** Keep my changes on top of the latest version; the next save expects that version. */
function reapply() {
  if (!latest.value) return
  const merged = {
    ...(latest.value.fields || {}),
    ...(conflict.value?.rebased || {}),
  }
  draft.value.fields = { ...merged }
  if (draft.value.source === 'contact') {
    draft.value.phones = JSON.parse(JSON.stringify(merged.phone_nos || []))
    draft.value.emails = JSON.parse(JSON.stringify(merged.email_ids || []))
  }
  draft.value.base = snapshot(latest.value)
  delete draft.value.submitted
  conflict.value = null
  error.value = null
}
/** Drop my draft and continue from the latest version. */
async function useLatest() {
  try {
    const record = await contactosApi('get_record', sourceRef(props.source))
    clear()
    latest.value = record
    hydrate(record)
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
    const formSignature = JSON.stringify({
      source: draft.value.source,
      fields: draft.value.fields,
      phones: draft.value.phones,
      emails: draft.value.emails,
      party_source: draft.value.party_source,
      party_fields: draft.value.party_fields,
      with_address: draft.value.with_address,
      address_fields: draft.value.address_fields,
      candidate_decision: draft.value.candidate_decision,
      existing_key: draft.value.existing_key,
      base: draft.value.base?.modified || null,
    })
    if (draft.value.submitted?.signature === formSignature) {
      const payload = draft.value.submitted.payload
      const result = await contactosApi(
        editing.value ? 'save_record' : 'create_identity',
        { payload, request_id: id(payload) },
      )
      clear()
      emit('saved', result)
      open.value = false
      return
    }
    // Only fields changed since the draft's base version are sent, with that
    // version as the expected one: a newer native edit makes the server refuse
    // the save instead of being overwritten.
    const fields = writableFields(
      formFields(),
      meta.value.fields,
      editing.value ? draft.value.base?.fields || {} : null,
    )
    let payload = { source: draft.value.source, fields }
    if (editing.value) {
      // The server checks each sent field against its original value. A
      // changed phone/email table is sent whole, with its whole original
      // table as baseline, as an explicit replacement.
      const original = draft.value.base?.fields || {}
      payload = {
        ...payload,
        name: props.source.name,
        modified: draft.value.base?.modified,
        baseline: Object.fromEntries(
          Object.keys(fields).map((key) => [key, original[key] ?? null]),
        ),
      }
      if ('phone_nos' in fields || 'email_ids' in fields)
        payload.channel_mode = 'replace'
    } else {
      if (draft.value.party_source)
        payload.party = {
          source: draft.value.party_source,
          fields: writableFields(
            draft.value.party_fields,
            partyMeta.value?.fields,
          ),
        }
      if (draft.value.with_address)
        payload.address = {
          fields: writableFields(
            draft.value.address_fields,
            addressMeta.value?.fields,
          ),
        }
      const candidates = await contactosApi('candidates', { payload })
      matches.value = candidates.rows || candidates.candidates || []
      if (matches.value.length) {
        if (!draft.value.candidate_decision) return
        if (draft.value.candidate_decision !== 'different') {
          const chosen = matches.value.find(
            (c) => `${c.source}:${c.name}` === draft.value.existing_key,
          )
          if (!chosen) {
            error.value = new Error(
              'Selecciona un registro autorizado para continuar.',
            )
            return
          }
          const ref =
            chosen.refs?.find((r) => r.name === chosen.name) || chosen.refs?.[0]
          payload.existing = {
            doctype: chosen.doctype || ref?.doctype,
            name: chosen.name,
            modified: chosen.modified || ref?.modified,
          }
        }
        payload.candidate_decision = draft.value.candidate_decision
      }
    }
    draft.value.submitted = { signature: formSignature, payload }
    const result = await contactosApi(
      editing.value ? 'save_record' : 'create_identity',
      { payload, request_id: id(payload) },
    )
    clear()
    emit('saved', result)
    open.value = false
  } catch (e) {
    error.value = e
    if (editing.value && errorKind(e) === 'conflict') await compare()
  } finally {
    saving.value = false
  }
}
</script>
