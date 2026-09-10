<template>
  <form
    data-testid="inquiry-capture"
    class="space-y-4 rounded-xl border border-outline-gray-2 bg-surface-base p-4"
    @submit.prevent="submit"
  >
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-lg font-semibold text-ink-gray-9">
        {{ __('Capturar consulta') }}
      </h2>
      <button type="button" class="inquiry-button" @click="$emit('hide')">
        {{ __('Ocultar') }}
      </button>
    </div>
    <p class="text-sm text-ink-gray-6">
      {{
        __(
          'Guarda el enlace o texto que viste y registra por separado a las personas. Un alias no confirma una identidad privada. No se enviará ningún mensaje.',
        )
      }}
    </p>
    <fieldset
      :disabled="busy || !!attempt"
      class="space-y-3 disabled:opacity-60"
    >
      <label class="block space-y-1 text-sm text-ink-gray-7">
        <span>{{ __('Título') }}</span>
        <input
          v-model="draft.title"
          name="title"
          required
          maxlength="140"
          class="inquiry-input"
        />
      </label>
      <label class="block space-y-1 text-sm text-ink-gray-7">
        <span>{{ __('Origen') }}</span>
        <select
          v-model="draft.source_type"
          name="source_type"
          class="inquiry-input"
        >
          <option
            v-for="source in INQUIRY_SOURCES"
            :key="source"
            :value="source"
          >
            {{ __(INQUIRY_LABELS[source]) }}
          </option>
        </select>
      </label>
      <label class="block space-y-1 text-sm text-ink-gray-7">
        <span>{{ __('Enlace de origen (http o https)') }}</span>
        <input
          v-model="draft.source_url"
          name="source_url"
          type="url"
          maxlength="2048"
          class="inquiry-input"
        />
      </label>
      <label class="block space-y-1 text-sm text-ink-gray-7">
        <span>{{ __('Texto o contexto de la consulta') }}</span>
        <textarea
          v-model="draft.source_text"
          name="source_text"
          rows="4"
          maxlength="20000"
          class="inquiry-input"
        />
      </label>
      <div
        v-for="(person, index) in draft.people"
        :key="index"
        class="space-y-3 rounded-lg border border-outline-gray-2 p-3"
      >
        <div class="flex items-center justify-between gap-3">
          <h3 class="font-medium text-ink-gray-8">
            {{ __('Persona {0}', [index + 1]) }}
          </h3>
          <button
            type="button"
            class="inquiry-button"
            @click="draft.people.splice(index, 1)"
          >
            {{ __('Quitar persona') }}
          </button>
        </div>
        <PersonFields v-model="draft.people[index]" />
      </div>
      <button
        type="button"
        data-testid="capture-add-person"
        :disabled="draft.people.length >= 50"
        class="inquiry-button"
        @click="draft.people.push(newPerson())"
      >
        {{ __('Agregar persona') }}
      </button>
    </fieldset>
    <p v-if="error" role="alert" class="text-sm text-ink-red-7">
      {{ __(error) }}
    </p>
    <p v-if="attempt && !busy" class="text-sm text-ink-gray-6">
      {{
        __(
          'Reintentar conserva la misma captura para evitar duplicados. Para cambiar los datos, inicia explícitamente una nueva captura.',
        )
      }}
    </p>
    <div class="flex flex-wrap gap-2">
      <button
        type="submit"
        data-testid="capture-submit"
        :disabled="busy"
        class="inquiry-button inquiry-primary"
      >
        {{
          busy
            ? __('Guardando…')
            : attempt
              ? __('Reintentar captura')
              : __('Guardar consulta')
        }}
      </button>
      <button
        v-if="attempt && !busy"
        type="button"
        data-testid="capture-new-attempt"
        class="inquiry-button"
        @click="editAsNew"
      >
        {{ __('Editar como nueva captura') }}
      </button>
    </div>
  </form>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { call } from 'frappe-ui'
import PersonFields from './PersonFields.vue'
import {
  INQUIRY_API,
  INQUIRY_LABELS,
  INQUIRY_SOURCES,
  newCaptureDraft,
  newPerson,
  validateCapture,
  capturePayload,
  inquiryError,
  requestGate,
} from '@/utils/inquiries'

const props = defineProps({
  actor: { type: String, required: true },
  currentActor: { type: Function, required: true },
})
const emit = defineEmits(['created', 'hide'])
const draft = ref(newCaptureDraft())
const attempt = ref(null)
const busy = ref(false)
const error = ref('')
const gate = requestGate(() => props.currentActor())
watch(
  () => props.currentActor(),
  () => {
    gate.invalidate()
    draft.value = newCaptureDraft()
    attempt.value = null
    busy.value = false
    error.value = ''
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => gate.invalidate())

function editAsNew() {
  draft.value.client_request_id = newCaptureDraft().client_request_id
  attempt.value = null
  error.value = ''
}

async function submit() {
  if (busy.value || !props.actor || props.actor !== props.currentActor()) return
  error.value = validateCapture(draft.value)
  if (error.value) return
  // Snapshot survives uncertain network failures. A retry sends identical input.
  attempt.value ||= capturePayload(draft.value)
  const token = gate.begin()
  busy.value = true
  try {
    const inquiry = await call(`${INQUIRY_API}.create_inquiry`, {
      payload: attempt.value,
    })
    if (!gate.current(token)) return
    if (!inquiry?.name) throw new Error('Invalid inquiry response')
    draft.value = newCaptureDraft()
    attempt.value = null
    emit('created', inquiry)
  } catch (e) {
    if (gate.current(token)) error.value = inquiryError(e).message
  } finally {
    if (gate.current(token)) busy.value = false
  }
}
</script>
