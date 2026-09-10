<template>
  <article
    data-testid="inquiry-detail"
    class="space-y-5 rounded-xl border border-outline-gray-2 bg-surface-base p-4 sm:p-5"
    :aria-busy="!!pending"
  >
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="break-words text-xl font-semibold text-ink-gray-9">
          {{ inquiry.title }}
        </h2>
        <p class="mt-1 text-sm text-ink-gray-6">
          {{ inquiry.name }} · {{ __(INQUIRY_LABELS[inquiry.status]) }}
        </p>
      </div>
      <button
        type="button"
        data-testid="detail-reload"
        class="inquiry-button"
        :disabled="!!pending"
        @click="$emit('reload')"
      >
        {{ __('Recargar datos') }}
      </button>
    </header>
    <p v-if="!inquiry.can_write" class="text-sm text-ink-gray-6">
      {{ __('Esta consulta es de solo lectura para tu usuario.') }}
    </p>
    <p v-if="error" role="alert" class="text-sm text-ink-red-7">
      {{ __(error.message) }}
    </p>
    <p v-if="localError" role="alert" class="text-sm text-ink-red-7">
      {{ __(localError) }}
    </p>
    <section class="space-y-2 border-b border-outline-gray-1 pb-4">
      <h3 class="font-semibold text-ink-gray-9">
        {{ __('Contexto de origen') }}
      </h3>
      <p class="text-sm text-ink-gray-6">
        {{ __(INQUIRY_LABELS[inquiry.source_type] || inquiry.source_type) }} ·
        {{ __('Capturada por') }} {{ inquiry.owner }}
      </p>
      <a
        v-if="sourceUrl"
        :href="sourceUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-block break-all text-sm text-ink-blue-9 underline"
        >{{ __('Abrir enlace de origen') }}</a
      >
      <p
        v-if="inquiry.source_text"
        data-testid="inquiry-source-text"
        class="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-gray-8"
      >
        {{ inquiry.source_text }}
      </p>
      <InquirySourceEvidence :evidence="inquiry.source_evidence" />
    </section>
    <form class="space-y-3" @submit.prevent="save">
      <h3 class="font-semibold text-ink-gray-9">{{ __('Seguimiento') }}</h3>
      <fieldset
        :disabled="!inquiry.can_write || !!pending"
        class="grid gap-3 disabled:opacity-60 sm:grid-cols-2"
      >
        <label class="space-y-1 text-sm text-ink-gray-7 sm:col-span-2">
          <span>{{ __('Título') }}</span>
          <input
            v-model="edit.title"
            name="detail-title"
            required
            maxlength="140"
            class="inquiry-input"
          />
        </label>
        <label class="space-y-1 text-sm text-ink-gray-7">
          <span>{{ __('Responsable') }}</span>
          <select
            v-model="edit.assigned_to"
            name="assigned_to"
            class="inquiry-input"
            required
          >
            <option
              v-if="
                edit.assigned_to &&
                !assignees.some((user) => user.name === edit.assigned_to)
              "
              :value="edit.assigned_to"
            >
              {{ edit.assigned_to }}
            </option>
            <option
              v-for="user in assignees"
              :key="user.name"
              :value="user.name"
            >
              {{ user.full_name || user.name }} ({{ user.name }})
            </option>
          </select>
        </label>
        <label class="space-y-1 text-sm text-ink-gray-7">
          <span>{{ __('Próxima acción (hora local)') }}</span>
          <input
            v-model="edit.next_action_at"
            name="next_action_at"
            type="datetime-local"
            step="1"
            class="inquiry-input"
          />
        </label>
        <label class="space-y-1 text-sm text-ink-gray-7">
          <span>{{ __('Estado') }}</span>
          <select
            v-model="edit.status"
            name="detail-status"
            class="inquiry-input"
          >
            <option
              v-for="status in INQUIRY_STATUSES"
              :key="status"
              :value="status"
            >
              {{ __(INQUIRY_LABELS[status]) }}
            </option>
          </select>
        </label>
        <div class="flex flex-wrap items-end gap-2">
          <button
            type="submit"
            data-testid="detail-save"
            class="inquiry-button inquiry-primary"
          >
            {{
              pending === 'update_inquiry'
                ? __('Guardando…')
                : __('Guardar seguimiento')
            }}
          </button>
          <button
            type="button"
            data-testid="detail-close"
            class="inquiry-button"
            @click="toggleClosed"
          >
            {{
              inquiry.status === 'Closed'
                ? __('Reabrir consulta')
                : __('Cerrar consulta')
            }}
          </button>
        </div>
      </fieldset>
      <p class="text-xs text-ink-gray-6">
        {{
          __(
            'Recargar actualiza el registro y conserva tus campos de seguimiento pendientes. Guarda para aplicar tu borrador a la versión actual.',
          )
        }}
      </p>
    </form>
    <section class="space-y-3 border-t border-outline-gray-1 pt-4">
      <h3 class="font-semibold text-ink-gray-9">
        {{ __('Personas en la conversación') }}
      </h3>
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'Cada persona tiene su propio papel. El referente recomienda o menciona; agrega por separado a quienes solicitan o muestran interés. Crear o vincular un prospecto no envía mensajes.',
          )
        }}
      </p>
      <p v-if="!inquiry.people?.length" class="text-sm text-ink-gray-6">
        {{ __('Aún no se han identificado personas.') }}
      </p>
      <div
        v-for="person in inquiry.people"
        :key="person.person_key"
        :data-person="person.person_key"
        class="space-y-2 rounded-lg border border-outline-gray-2 p-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h4 class="font-medium text-ink-gray-9">{{ person.display_name }}</h4>
          <span
            class="rounded-full bg-surface-gray-2 px-2 py-1 text-xs text-ink-gray-7"
            >{{ __(INQUIRY_LABELS[person.role]) }}</span
          >
        </div>
        <p
          v-if="person.email || person.phone"
          class="break-words text-sm text-ink-gray-6"
        >
          {{ [person.email, person.phone].filter(Boolean).join(' · ') }}
        </p>
        <router-link
          v-if="person.lead && person.lead_accessible !== false"
          :to="{ name: 'Lead', params: { leadId: person.lead } }"
          class="text-sm text-ink-blue-9 underline"
          >{{ __('Abrir prospecto') }} · {{ person.lead }}</router-link
        >
        <p v-else-if="person.converted_at" class="text-sm text-ink-gray-6">
          {{
            __('Persona ya vinculada a un prospecto al que no tienes acceso.')
          }}
        </p>
        <p
          v-else-if="person.role === 'Referrer'"
          class="text-sm text-ink-gray-6"
        >
          {{
            __(
              'El referente no se convierte en prospecto. Agrega una persona interesada por separado.',
            )
          }}
        </p>
        <button
          v-if="
            inquiry.can_write &&
            canConvertPerson(person, inquiry.status) &&
            selectedPerson !== person.person_key
          "
          type="button"
          data-testid="select-prospect"
          class="inquiry-button"
          :disabled="!!pending"
          @click="selectPerson(person)"
        >
          {{ __('Seleccionar para prospecto') }}
        </button>
        <form
          v-if="
            selectedPerson === person.person_key &&
            inquiry.can_write &&
            canConvertPerson(person, inquiry.status)
          "
          class="space-y-3 rounded-lg bg-surface-gray-1 p-3"
          @submit.prevent="convert(person)"
        >
          <fieldset :disabled="!!pending" class="space-y-3">
            <legend class="mb-2 text-sm font-medium text-ink-gray-8">
              {{ __('Prospecto para {0}', [person.display_name]) }}
            </legend>
            <label class="flex items-center gap-2 text-sm text-ink-gray-7"
              ><input
                v-model="conversionMode"
                type="radio"
                value="create"
                name="conversion-mode"
              />{{ __('Crear un prospecto nuevo') }}</label
            >
            <label class="flex items-center gap-2 text-sm text-ink-gray-7"
              ><input
                v-model="conversionMode"
                type="radio"
                value="link"
                name="conversion-mode"
              />{{ __('Vincular un prospecto existente') }}</label
            >
            <Link
              v-if="conversionMode === 'link'"
              v-model="existingLead"
              doctype="CRM Lead"
              :disabled="!!pending"
              :label="__('Selecciona el prospecto existente')"
              :placeholder="__('Buscar prospecto por selección explícita')"
            />
            <p
              v-if="conversionMode === 'link' && existingLead"
              class="text-sm text-ink-gray-8"
            >
              {{ __('Prospecto seleccionado: {0}', [existingLead]) }}
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                type="submit"
                data-testid="convert-person"
                class="inquiry-button inquiry-primary"
              >
                {{
                  pending === 'convert_person'
                    ? __('Guardando…')
                    : conversionMode === 'link'
                      ? __('Vincular prospecto seleccionado')
                      : __('Crear prospecto para esta persona')
                }}
              </button>
              <button
                type="button"
                class="inquiry-button"
                @click="selectedPerson = ''"
              >
                {{ __('Cancelar') }}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
      <p v-if="inquiry.status === 'Closed'" class="text-sm text-ink-gray-6">
        {{ __('Reabre la consulta para agregar personas o crear prospectos.') }}
      </p>
      <form
        v-else-if="inquiry.can_write"
        data-testid="detail-add-person"
        class="space-y-3 rounded-lg bg-surface-gray-1 p-3"
        @submit.prevent="addPerson"
      >
        <h4 class="font-medium text-ink-gray-9">
          {{ __('Agregar otra persona') }}
        </h4>
        <fieldset :disabled="!!pending" class="space-y-3">
          <PersonFields v-model="personDraft" />
          <button type="submit" class="inquiry-button">
            {{
              pending === 'add_person'
                ? __('Guardando…')
                : __('Agregar persona')
            }}
          </button>
        </fieldset>
      </form>
    </section>
  </article>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Link from '@/components/Controls/Link.vue'
import PersonFields from './PersonFields.vue'
import InquirySourceEvidence from './InquirySourceEvidence.vue'
import {
  INQUIRY_LABELS,
  INQUIRY_STATUSES,
  safeSourceUrl,
  newPerson,
  validatePerson,
  personPayload,
  canConvertPerson,
  toLocalDatetime,
  toSystemDatetime,
} from '@/utils/inquiries'

const props = defineProps({
  inquiry: { type: Object, required: true },
  assignees: { type: Array, default: () => [] },
  pending: { type: String, default: '' },
  error: { type: Object, default: null },
  mutate: { type: Function, required: true },
})
defineEmits(['reload'])
const sourceUrl = computed(() => safeSourceUrl(props.inquiry.source_url))
const edit = ref(editable(props.inquiry))
let baseline = editable(props.inquiry)
watch(
  () => props.inquiry,
  (inquiry) => {
    const next = editable(inquiry)
    for (const field of Object.keys(next)) {
      if (edit.value[field] === baseline[field]) edit.value[field] = next[field]
    }
    baseline = next
  },
)
const personDraft = ref(newPerson())
const selectedPerson = ref('')
const conversionMode = ref('create')
const existingLead = ref('')
const localError = ref('')

function editable(inquiry) {
  return {
    title: inquiry.title,
    status: inquiry.status,
    assigned_to: inquiry.assigned_to || '',
    next_action_at: toLocalDatetime(inquiry.next_action_at),
  }
}
async function save() {
  localError.value = ''
  if (!edit.value.title.trim()) {
    localError.value = 'Escribe un título para la consulta.'
    return
  }
  const values = Object.fromEntries(
    Object.entries(edit.value).filter(
      ([field, value]) => value !== baseline[field],
    ),
  )
  if ('title' in values) values.title = values.title.trim()
  if ('next_action_at' in values)
    values.next_action_at = toSystemDatetime(values.next_action_at)
  if (!Object.keys(values).length) return
  const result = await props.mutate('update_inquiry', { values })
  if (result && !result.access_revoked) edit.value = editable(result)
}
async function toggleClosed() {
  const status = props.inquiry.status === 'Closed' ? 'New' : 'Closed'
  const result = await props.mutate('update_inquiry', { values: { status } })
  if (result && !result.access_revoked) edit.value.status = result.status
}
async function addPerson() {
  localError.value = validatePerson(personDraft.value)
  if (localError.value) return
  const result = await props.mutate('add_person', {
    person: personPayload(personDraft.value),
  })
  if (result) personDraft.value = newPerson()
}
function selectPerson(person) {
  selectedPerson.value = person.person_key
  conversionMode.value = 'create'
  existingLead.value = ''
  localError.value = ''
}
async function convert(person) {
  localError.value = ''
  if (!canConvertPerson(person, props.inquiry.status)) return
  if (conversionMode.value === 'link' && !existingLead.value) {
    localError.value =
      'Selecciona explícitamente el prospecto que vas a vincular.'
    return
  }
  const result = await props.mutate('convert_person', {
    person_key: person.person_key,
    ...(conversionMode.value === 'link'
      ? { existing_lead: existingLead.value }
      : {}),
  })
  if (result) selectedPerson.value = ''
}
</script>
