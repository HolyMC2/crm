<template>
  <div class="c-extra-settings" data-block="extra-fields">
    <h3>{{ __('Client fields') }}</h3>
    <p class="c-muted">
      {{
        __(
          '{0} of {1} fields used. Retiring a field keeps its data, and you can reactivate it.',
          [capabilities.used ?? fields.length, capabilities.limit ?? 15],
        )
      }}
    </p>
    <div v-if="loading && !fields.length" class="c-muted" role="status">
      {{ __('Loading fields…') }}
    </div>
    <RecoveryMessage
      :error="error"
      action="cambiar los campos de clientes"
      :on-action="runGuardAction"
      @retry="load"
    />
    <ul class="c-extra-setting-list">
      <li
        v-for="field in fields"
        :key="field.fieldname"
        class="c-extra-setting"
        :data-field="field.fieldname"
        :data-state="field.state"
      >
        <div class="c-extra-setting-main">
          <strong>{{ field.label }}</strong>
          <small>{{ summary(field) }}</small>
        </div>
        <div class="c-actions">
          <template v-if="field.state === 'adjusted'"
            ><span class="c-type">{{ __('Adjusted elsewhere') }}</span
            ><Button
              :label="__('Ask support')"
              data-act="ask-support"
              @click="copySupport(field)"
          /></template>
          <template v-else>
            <Button
              :label="__('Rename')"
              data-act="rename"
              @click="start(field, 'rename')"
            /><Button
              v-if="field.kind === 'list' && field.state === 'active'"
              :label="__('Add option')"
              data-act="add-option"
              @click="start(field, 'add_option')"
            /><Button
              v-if="field.state === 'active'"
              :label="__('Retire')"
              data-act="retire"
              @click="start(field, 'retire')"
            /><Button
              v-if="field.state === 'retired'"
              :label="__('Reactivate')"
              data-act="reactivate"
              :loading="busy === field.fieldname"
              @click="change(field, { action: 'reactivate' })"
          /></template>
        </div>
        <div
          v-if="active?.fieldname === field.fieldname"
          class="c-inset"
          :data-change="active.action"
        >
          <template v-if="active.action === 'retire'">
            <p>
              {{
                field.used
                  ? __(
                      '{0} clientes have a value; it is kept. The field stops showing until you reactivate it.',
                      [field.used],
                    )
                  : __(
                      'No cliente has a value yet. The field stops showing until you reactivate it.',
                    )
              }}
            </p>
            <div class="c-actions">
              <Button
                :label="__('Retire')"
                variant="solid"
                data-act="confirm-retire"
                :loading="busy === field.fieldname"
                @click="change(field, { action: 'retire' })"
              /><Button :label="__('Cancel')" @click="active = null" />
            </div>
          </template>
          <template v-else>
            <FormControl
              v-model="active.value"
              :label="
                active.action === 'rename' ? __('New name') : __('New option')
              "
              :maxlength="60"
              data-input="change"
            />
            <div class="c-actions">
              <Button
                :label="active.action === 'rename' ? __('Rename') : __('Add option')"
                variant="solid"
                :disabled="!String(active.value || '').trim()"
                :loading="busy === field.fieldname"
                data-act="confirm-change"
                @click="submitActive(field)"
              /><Button :label="__('Cancel')" @click="active = null" />
            </div>
          </template>
        </div>
      </li>
    </ul>
    <p v-if="notice" class="c-extra-notice" role="status">{{ notice }}</p>
    <ExtraFieldForm
      v-if="adding"
      initial-mode="define"
      @defined="added"
      @cancel="adding = false"
      @open-fields="adding = false"
    />
    <Button
      v-else
      :label="__('Add field')"
      icon-left="plus"
      data-act="add-field"
      :disabled="(capabilities.used ?? fields.length) >= (capabilities.limit ?? 15)"
      @click="adding = true"
    />
  </div>
</template>
<script setup>
import { onMounted, ref } from 'vue'
import { personalizarApi } from '@/composables/useContactos'
import { kindLabel } from '@/utils/extraFields'
import ExtraFieldForm from './ExtraFieldForm.vue'
import RecoveryMessage from './RecoveryMessage.vue'

// Personalizar › «Campos de clientes» (the owner): rename, add an option, retire
// (the data stays) and reactivate. Nothing here deletes a field.
const emit = defineEmits(['changed'])
const fields = ref([]),
  capabilities = ref({}),
  loading = ref(false),
  error = ref(null),
  active = ref(null),
  busy = ref(''),
  notice = ref(''),
  adding = ref(false),
  lastField = ref(null)

function summary(field) {
  const parts = [kindLabel(field.kind) || __('Adjusted elsewhere')]
  parts.push(field.state === 'retired' ? __('Retired') : __('Active'))
  if (field.kind === 'list' && field.options?.length)
    parts.push(field.options.join(', '))
  if (field.used != null)
    parts.push(__('{0} clientes with a value', [field.used]))
  return parts.join(' · ')
}
async function load() {
  loading.value = true
  error.value = null
  try {
    const result = await personalizarApi('list_fields', {
      record_type: 'clientes',
    })
    fields.value = result.fields || []
    capabilities.value = result.capabilities || {}
  } catch (e) {
    error.value = e
  } finally {
    loading.value = false
  }
}
function start(field, action) {
  active.value = {
    fieldname: field.fieldname,
    action,
    value: action === 'rename' ? field.label : '',
  }
  notice.value = ''
}
function submitActive(field) {
  const value = String(active.value.value || '').trim()
  return change(
    field,
    active.value.action === 'rename'
      ? { action: 'rename', label: value }
      : { action: 'add_option', option: value },
  )
}
/** One change, with the version it was based on; the row updates in place. */
async function change(field, payload) {
  busy.value = field.fieldname
  lastField.value = field
  error.value = null
  try {
    const result = await personalizarApi('change_field', {
      record_type: 'clientes',
      fieldname: field.fieldname,
      change: payload,
      modified: field.modified,
    })
    const index = fields.value.findIndex(
      (item) => item.fieldname === field.fieldname,
    )
    if (index >= 0) fields.value[index] = { ...field, ...result.field }
    active.value = null
    notice.value =
      {
        retire: __('«{0}» retired. Its data stays.', [result.field.label]),
        reactivate: __('«{0}» is active again.', [result.field.label]),
        rename: __('Renamed to «{0}».', [result.field.label]),
        add_option: __('Option added to «{0}».', [result.field.label]),
      }[payload.action] || ''
    emit('changed')
  } catch (e) {
    error.value = e
  } finally {
    busy.value = ''
  }
}
/** The refusal's own way out: reload, ask support, reactivate the field it names. */
async function runGuardAction(item) {
  const target = item.target || lastField.value?.fieldname
  const field = fields.value.find((row) => row.fieldname === target)
  switch (item.kind) {
    case 'copy_request':
      return copySupport(field || lastField.value)
    case 'reactivate':
      if (field) return change(field, { action: 'reactivate' })
      return load()
    case 'use_field':
    case 'open_section':
      // The name is taken: keep the list as it is and let them pick another name.
      error.value = null
      return
    default:
      active.value = null
      return load()
  }
}
async function copySupport(field) {
  const text = __(
    'Please review the extra client field «{0}»: it was changed outside the shop screens and can no longer be edited there.',
    [field?.label || ''],
  )
  try {
    await navigator.clipboard.writeText(text)
    notice.value = __('Request copied. Send it to support.')
  } catch {
    notice.value = text
  }
}
async function added() {
  adding.value = false
  notice.value = __('Field added. Fill it on each cliente in «More details».')
  await load()
  emit('changed')
}
onMounted(load)
</script>
