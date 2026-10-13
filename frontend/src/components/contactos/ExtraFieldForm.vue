<template>
  <form
    class="c-editor c-extra-form"
    data-form="extra-field"
    novalidate
    @submit.prevent="submit"
  >
    <p v-if="mode === 'request'" class="c-hint" data-hint="owner-only">
      <strong>{{ reason }}</strong>
      {{
        record?.name
          ? __('Write which detail you need and we will ask the owner.')
          : __('Write which detail you need and copy the request for the owner.')
      }}
    </p>
    <FormControl
      v-model="draft.label"
      :label="__('Name of the detail')"
      :placeholder="__('For example: How did you find us?')"
      :maxlength="LABEL_MAX"
      data-input="label"
    />
    <div class="c-extra-kinds">
      <span id="extra-kind-label" class="c-extra-kinds-label">{{
        __('Type')
      }}</span>
      <div
        class="c-extra-kind-row"
        role="radiogroup"
        aria-labelledby="extra-kind-label"
      >
        <button
          v-for="item in kinds"
          :key="item.value"
          type="button"
          role="radio"
          class="c-extra-kind"
          :class="{ active: draft.kind === item.value }"
          :aria-checked="draft.kind === item.value"
          :data-kind="item.value"
          @click="draft.kind = item.value"
        >
          {{ item.label }}
        </button>
      </div>
    </div>
    <FormControl
      v-if="draft.kind === 'list'"
      v-model="draft.options"
      type="textarea"
      :label="__('Options, one per line')"
      :placeholder="__('For example: Facebook')"
      data-input="options"
    />
    <p class="c-muted">
      {{ __('Everyone who can see clientes sees this detail. It is not printed.') }}
    </p>
    <div v-if="guard" class="c-recovery" role="alert" :data-guard="guard.code">
      <strong>{{ guard.message }}</strong>
      <div class="c-actions">
        <Button
          v-for="(item, index) in guard.actions || []"
          :key="`${item.kind}:${item.target || index}`"
          :label="item.label"
          :variant="index === 0 ? 'solid' : 'subtle'"
          :data-guard-action="item.kind"
          @click="runGuardAction(item)"
        />
      </div>
    </div>
    <RecoveryMessage
      v-else
      :error="error"
      action="agregar un campo de clientes"
      @retry="submit"
    />
    <p v-if="done" class="c-extra-done" role="status">{{ done }}</p>
    <div class="c-actions c-editor-footer">
      <Button :label="__('Cancel')" @click="$emit('cancel')" />
      <Button
        variant="solid"
        :label="primaryLabel"
        :loading="saving"
        :disabled="!ready || saving"
        data-act="submit-extra-field"
        @click="submit"
      />
    </div>
  </form>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import {
  personalizarApi,
  useContactosDraft,
} from '@/composables/useContactos'
import { errorGuard } from '@/utils/contactos'
import {
  LABEL_MAX,
  OPTIONS_MAX,
  OPTION_MAX,
  extraKinds,
  requestText,
} from '@/utils/extraFields'
import RecoveryMessage from './RecoveryMessage.vue'

const props = defineProps({
  // 'define' (owner) or 'request' (anyone else: ask the owner for it).
  initialMode: { type: String, default: 'define' },
  // The cliente the request starts from ({ name, title }); none from Personalizar.
  record: { type: Object, default: null },
  reasonText: { type: String, default: '' },
})
const emit = defineEmits([
  'defined',
  'requested',
  'use-field',
  'open-section',
  'open-fields',
  'cancel',
  'mode',
])
const kinds = extraKinds()
const mode = ref(props.initialMode === 'request' ? 'request' : 'define')
const reason = ref(props.reasonText || __('Only the owner adds or retires fields.'))
const EMPTY = { label: '', kind: 'text', options: '' }
const { draft, id, clear } = useContactosDraft('extra-field:new', EMPTY)
const saving = ref(false),
  error = ref(null),
  guard = ref(null),
  done = ref('')
watch(mode, (value) => emit('mode', value), { immediate: true })
// Changing what was typed drops the answer to the previous attempt.
watch(
  () => [draft.value.label, draft.value.kind, draft.value.options],
  () => {
    guard.value = null
  },
)
function reset() {
  clear()
  draft.value = { ...EMPTY }
}

const label = computed(() => String(draft.value.label || '').trim())
const options = computed(() =>
  String(draft.value.options || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
)
const ready = computed(
  () =>
    label.value.length > 0 &&
    label.value.length <= LABEL_MAX &&
    (draft.value.kind !== 'list' ||
      (options.value.length > 0 &&
        options.value.length <= OPTIONS_MAX &&
        options.value.every((option) => option.length <= OPTION_MAX))),
)
const primaryLabel = computed(() =>
  mode.value === 'define'
    ? __('Save field')
    : props.record?.name
      ? __('Ask the owner')
      : __('Copy request'),
)

async function submit() {
  if (!ready.value || saving.value) return
  error.value = null
  guard.value = null
  done.value = ''
  saving.value = true
  try {
    if (mode.value === 'define') await define()
    else if (props.record?.name) await ask()
    else await copyRequest()
  } finally {
    saving.value = false
  }
}
async function define() {
  // The same request id for the same field: «Reintentar» never makes two.
  const payload = {
    record_type: 'clientes',
    label: label.value,
    kind: draft.value.kind,
    options: draft.value.kind === 'list' ? options.value : [],
  }
  try {
    const result = await personalizarApi('define_field', {
      ...payload,
      request_id: id(payload),
    })
    reset()
    emit('defined', result.field)
  } catch (e) {
    refused(e)
  }
}
async function ask() {
  try {
    const result = await personalizarApi('request_field', {
      record_type: 'clientes',
      name: props.record.name,
      label: label.value,
      kind: draft.value.kind,
    })
    const names = [...(result.asked || []), ...(result.already || [])]
      .map((person) => person.full_name || person.user)
      .join(', ')
    reset()
    done.value = result.asked?.length
      ? __('We asked {0}. They will see it in their to-do list.', [names])
      : __('{0} already has it in their to-do list.', [names])
    emit('requested', done.value)
  } catch (e) {
    refused(e)
  }
}
async function copyRequest() {
  const text = requestText({
    label: label.value,
    kind: draft.value.kind,
    record: props.record?.title || props.record?.name,
  })
  try {
    await navigator.clipboard.writeText(text)
    done.value = __('Request copied. Send it to the owner.')
  } catch {
    done.value = text
  }
}
function refused(e) {
  const found = errorGuard(e)
  if (found?.code === 'not_owner') {
    // Not the owner: keep what they typed and offer to ask for it instead.
    reason.value = found.message
    if (found.actions?.some((item) => item.kind === 'request_field')) {
      mode.value = 'request'
      return
    }
  }
  if (found?.actions?.length) guard.value = found
  else error.value = e
}
async function runGuardAction(item) {
  switch (item.kind) {
    case 'retry':
      return submit()
    case 'request_field':
      guard.value = null
      mode.value = 'request'
      return
    case 'copy_request':
      return copyRequest()
    case 'use_field':
      return emit('use-field', item.target)
    case 'open_section':
      return emit('open-section', item.target)
    case 'open_fields':
      return emit('open-fields')
    case 'reactivate':
      try {
        const result = await personalizarApi('change_field', {
          record_type: 'clientes',
          fieldname: item.target,
          change: { action: 'reactivate' },
          modified: item.modified,
        })
        reset()
        emit('defined', result.field)
      } catch (e) {
        guard.value = null
        error.value = e
      }
  }
}
</script>
