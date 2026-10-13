<template>
  <section class="c-record-section c-extra-section" data-section="extra">
    <div class="c-section-heading">
      <h2>{{ __('More details') }}</h2>
      <Button
        v-if="canAdd"
        :label="__('Add field')"
        icon-left="plus"
        variant="ghost"
        data-act="add-field"
        @click="openEditor(define ? 'define' : 'request')"
      />
    </div>
    <p v-if="!fields.length" class="c-muted" data-empty="extra">
      {{
        define
          ? __('Add the details your shop needs, like how they found you.')
          : __('Your shop has no extra details for clientes yet.')
      }}
    </p>
    <ul v-else class="c-extra-list">
      <li
        v-for="field in fields"
        :key="field.fieldname"
        class="c-extra-item"
        :data-field="field.fieldname"
      >
        <div
          v-if="editing === field.fieldname"
          class="c-extra-edit"
          data-editing="1"
        >
          <!-- Contactos' one meta renderer; a Lista keeps a «Sin dato» choice. -->
          <MetaFields
            class="c-extra-input"
            :model-value="{ [field.fieldname]: draft }"
            :fields="[editorField(field)]"
            :disabled="saving"
            data-input="value"
            @update:model-value="draft = $event[field.fieldname]"
          />
          <div v-if="latest" class="c-inset" data-compare="extra">
            <p>
              {{
                __('Now it says: {0}. Yours: {1}.', [
                  shown(field, latest.fields?.[field.fieldname]),
                  shown(field, draft),
                ])
              }}
            </p>
            <div class="c-actions">
              <Button
                :label="__('Keep mine')"
                variant="solid"
                @click="keepMine(field)"
              /><Button :label="__('Keep the current one')" @click="dropMine" />
            </div>
          </div>
          <RecoveryMessage
            v-else
            :error="error"
            action="guardar este dato"
            :on-compare="compare"
            :on-reload="dropMine"
            @retry="save(field)"
          />
          <div class="c-actions">
            <Button :label="__('Cancel')" @click="cancel" /><Button
              variant="solid"
              :label="__('Save')"
              :loading="saving"
              :disabled="!!latest"
              data-act="save-extra"
              @click="save(field)"
            />
          </div>
        </div>
        <template v-else>
          <span class="c-extra-label">{{ field.label }}</span>
          <span class="c-extra-value" :class="{ empty: isEmpty(field) }">{{
            shown(field, record.fields?.[field.fieldname])
          }}</span>
          <Button
            v-if="writable(field)"
            :ref="(el) => setEditButton(field.fieldname, el)"
            :label="__('Edit')"
            :aria-label="__('Edit {0}', [field.label])"
            variant="ghost"
            data-act="edit-extra"
            @click="edit(field)"
          />
          <span
            v-else-if="field.adjusted"
            class="c-type"
            :title="__('Changed elsewhere; only support can change it now.')"
            >{{ __('Adjusted elsewhere') }}</span
          >
        </template>
      </li>
    </ul>
    <button
      v-if="!canAdd"
      type="button"
      class="c-link c-extra-ask"
      data-act="ask-owner"
      @click="openEditor('request')"
    >
      {{ __('Missing a detail? Ask the owner') }}
    </button>
    <p v-if="notice" class="c-extra-notice" role="status">{{ notice }}</p>
    <ExtraFieldsEditor
      v-if="editorOpen"
      v-model="editorOpen"
      :mode="editorMode"
      :record="{ name: record.name, title: record.title }"
      :reason-text="fieldCaps.reason || ''"
      @defined="defined"
      @requested="notice = $event"
      @use-field="useField"
      @open-section="$emit('open-section', $event)"
      @open-fields="$emit('open-fields')"
    />
  </section>
</template>
<script setup>
import { computed, nextTick, ref } from 'vue'
import { contactosApi } from '@/composables/useContactos'
import { stableRequest } from '@/utils/contactos'
import {
  extraDisplay,
  extraFields,
  extraOptions,
  extraPayloadValue,
} from '@/utils/extraFields'
import ExtraFieldsEditor from './ExtraFieldsEditor.vue'
import MetaFields from './MetaFields.vue'
import RecoveryMessage from './RecoveryMessage.vue'

// «Más datos» on a cliente: the shop's extra fields, filled in place through
// Contactos' one writer (save_record); the owner adds fields from here.
const props = defineProps({
  record: { type: Object, required: true },
  capabilities: { type: Object, default: () => ({}) },
})
const emit = defineEmits([
  'saved',
  'defined',
  'reload',
  'open-section',
  'open-fields',
])
const fields = computed(() => extraFields(props.record.editor_meta?.fields))
const fieldCaps = computed(() => props.capabilities.fields || {})
const define = computed(() => !!fieldCaps.value.define)
// The owner adds fields; a manager gets the same button and is offered to ask.
const canAdd = computed(() => define.value || !!props.capabilities.manager)
const editing = ref(''),
  draft = ref(''),
  saving = ref(false),
  error = ref(null),
  latest = ref(null),
  notice = ref(''),
  editorOpen = ref(false),
  editorMode = ref('define')
let receipt = null
const editButtons = new Map()
function setEditButton(fieldname, el) {
  if (el) editButtons.set(fieldname, el)
  else editButtons.delete(fieldname)
}

const shown = (field, value) => extraDisplay(field, value)
const isEmpty = (field) => {
  const value = props.record.fields?.[field.fieldname]
  return field.kind !== 'check' && (value === '' || value == null)
}
const writable = (field) =>
  !field.read_only && !!props.record.capabilities?.write
/** The field as MetaFields renders it: never required, a Lista with an empty choice. */
const editorField = (field) => ({
  ...field,
  reqd: 0,
  read_only: 0,
  options:
    field.kind === 'list'
      ? [
          { label: __('No data'), value: '' },
          ...extraOptions(field).map((value) => ({ label: value, value })),
        ]
      : field.options,
})

function edit(field, value) {
  editing.value = field.fieldname
  const current = props.record.fields?.[field.fieldname]
  draft.value =
    value !== undefined
      ? value
      : field.kind === 'check'
        ? current
          ? 1
          : 0
        : current ?? ''
  error.value = null
  latest.value = null
  notice.value = ''
}
function cancel() {
  editing.value = ''
  error.value = null
  latest.value = null
}
async function save(field, base = props.record) {
  if (saving.value) return
  const payload = {
    source: 'customer',
    name: props.record.name,
    modified: base.modified,
    fields: { [field.fieldname]: extraPayloadValue(field, draft.value) },
    baseline: { [field.fieldname]: base.fields?.[field.fieldname] ?? null },
  }
  receipt = stableRequest(receipt, payload)
  saving.value = true
  error.value = null
  try {
    const result = await contactosApi('save_record', {
      payload,
      request_id: receipt.id,
    })
    receipt = null
    editing.value = ''
    latest.value = null
    notice.value = __('Saved.')
    emit('saved', result)
    // Keep the person where they were: focus returns to this row's «Editar».
    await nextTick()
    editButtons.get(field.fieldname)?.$el?.focus?.({ preventScroll: true })
  } catch (e) {
    error.value = e
  } finally {
    saving.value = false
  }
}
/** «Comparar cambios»: the value now on the cliente next to the one typed here. */
async function compare() {
  try {
    latest.value = await contactosApi('get_record', {
      source: 'customer',
      name: props.record.name,
    })
    error.value = null
  } catch (e) {
    error.value = e
  }
}
function keepMine(field) {
  const base = latest.value
  latest.value = null
  return save(field, base)
}
/** «Recargar»: drop what was typed and show the cliente as it is now. */
function dropMine() {
  editing.value = ''
  latest.value = null
  error.value = null
  emit('reload')
}
function openEditor(mode) {
  editorMode.value = mode
  editorOpen.value = true
  notice.value = ''
}
/** A new field (or a reactivated one) opens here ready to fill. */
function defined(field) {
  if (field?.fieldname) {
    editing.value = field.fieldname
    draft.value = field.kind === 'check' ? 0 : ''
  }
  emit('defined', field)
}
function useField(fieldname) {
  const field = fields.value.find((item) => item.fieldname === fieldname)
  if (field && writable(field)) edit(field)
}
</script>
