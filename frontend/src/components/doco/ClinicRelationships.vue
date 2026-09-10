<template>
  <div class="mt-4 space-y-4" data-testid="clinic-relationships">
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm text-ink-gray-6">
        Vínculos administrativos y próximas citas.
      </p>
      <button
        type="button"
        class="text-sm text-ink-blue-9 hover:underline"
        :disabled="loading || busy"
        @click="refresh"
      >
        {{ loading ? 'Actualizando…' : 'Actualizar' }}
      </button>
    </div>
    <p
      v-if="errorCode"
      role="alert"
      class="rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-gray-8"
    >
      {{ clinicMessage(errorCode) }}
    </p>
    <p v-if="loading && !context" role="status" class="text-sm text-ink-gray-6">
      Cargando vínculos de Clínica…
    </p>
    <template v-if="context">
      <ul v-if="context.links.length" class="space-y-3">
        <li
          v-for="link in context.links"
          :key="link.id"
          class="rounded-lg border border-outline-gray-2 p-3"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="break-words text-sm font-medium text-ink-gray-9">
                {{ link.label }}
              </p>
              <p class="mt-1 text-sm text-ink-gray-6">
                {{ relationshipLabels[link.relationship] }}
              </p>
            </div>
            <div class="flex flex-wrap gap-3 text-sm">
              <a
                v-if="can('book_appointment')"
                :href="bookingRoute(link.id)"
                class="text-ink-blue-9 hover:underline"
                >Agendar cita</a
              >
              <button
                v-if="can('unlink_patient')"
                type="button"
                :disabled="busy"
                class="text-ink-gray-6 hover:underline"
                @click="confirmUnlink = link.id"
              >
                Quitar vínculo
              </button>
            </div>
          </div>
          <div v-if="confirmUnlink === link.id" class="mt-3 space-y-2 text-sm">
            <p>
              Se quitará la relación con este registro de CRM. El paciente y sus
              citas se conservan.
            </p>
            <div class="flex gap-3">
              <button
                type="button"
                class="text-red-600 hover:underline"
                :disabled="busy"
                @click="unlink(link.id)"
              >
                {{ busy ? 'Guardando…' : 'Confirmar desvinculación' }}
              </button>
              <button
                type="button"
                :disabled="busy"
                @click="confirmUnlink = ''"
              >
                Conservar vínculo
              </button>
            </div>
          </div>
        </li>
      </ul>
      <p v-else class="text-sm text-ink-gray-6">
        Este registro todavía no tiene un paciente vinculado.
      </p>

      <div v-if="context.appointments.length" class="space-y-2">
        <h4 class="text-sm font-medium text-ink-gray-8">
          Próximas citas
          <span class="font-normal text-ink-gray-5">· {{ displayZone }}</span>
        </h4>
        <ul class="space-y-2 text-sm">
          <li
            v-for="appointment in context.appointments"
            :key="appointment.id"
            class="flex flex-wrap justify-between gap-2 border-b border-outline-gray-1 pb-2"
          >
            <span
              >{{ linkLabel(appointment.link) }} ·
              {{ appointmentDate(appointment.start) }}</span
            >
            <span class="text-ink-gray-6">{{
              statusLabel(appointment.status)
            }}</span>
          </li>
        </ul>
      </div>
      <p v-else-if="context.links.length" class="text-sm text-ink-gray-6">
        No hay próximas citas visibles para estos vínculos.
      </p>

      <div
        v-if="can('link_patient') || can('register_patient')"
        class="flex flex-wrap gap-2"
      >
        <button
          v-if="can('link_patient')"
          type="button"
          :disabled="busy"
          :aria-pressed="mode === 'link'"
          class="rounded border border-outline-gray-3 px-3 py-2 text-sm hover:bg-surface-gray-2"
          @click="mode = 'link'"
        >
          Vincular paciente existente
        </button>
        <button
          v-if="can('register_patient')"
          type="button"
          :disabled="busy"
          :aria-pressed="mode === 'register'"
          class="rounded border border-outline-gray-3 px-3 py-2 text-sm hover:bg-surface-gray-2"
          @click="openRegistration"
        >
          Registrar paciente
        </button>
      </div>

      <form
        v-if="mode === 'link' && can('link_patient')"
        class="space-y-3 rounded-lg bg-surface-gray-1 p-3"
        autocomplete="off"
        @submit.prevent="searchPatients"
      >
        <label class="block text-sm text-ink-gray-8">
          Buscar por nombre o identificador del paciente
          <input
            v-model="query"
            class="clinic-input"
            type="search"
            maxlength="80"
            minlength="2"
            required
            :disabled="busy"
            @input="selected = null"
          />
        </label>
        <button
          type="submit"
          class="rounded border border-outline-gray-3 px-3 py-2 text-sm"
          :disabled="busy || searching || query.trim().length < 2"
        >
          {{ searching ? 'Buscando…' : 'Buscar paciente' }}
        </button>
        <div v-if="searched === query.trim() && !searching">
          <ul v-if="candidates.length" class="max-h-52 space-y-1 overflow-auto">
            <li v-for="patient in candidates" :key="patient.name">
              <button
                type="button"
                :disabled="busy"
                :aria-pressed="selected?.name === patient.name"
                class="w-full rounded border border-outline-gray-2 bg-surface-gray-1 p-2 text-left text-sm focus:ring-2 focus:ring-outline-gray-3"
                @click="selected = patient"
              >
                {{ patient.patient_name }}
                <span class="text-ink-gray-5">· {{ patient.name }}</span>
              </button>
            </li>
          </ul>
          <p v-else-if="searched && !errorCode" class="text-sm text-ink-gray-6">
            No se encontraron pacientes. Verifica la búsqueda antes de registrar
            uno nuevo.
          </p>
        </div>
        <template v-if="selected">
          <p class="text-sm font-medium">
            Paciente seleccionado: {{ selected.patient_name }}
          </p>
          <label class="block text-sm text-ink-gray-8">
            Esta persona en CRM representa a
            <select
              v-model="relationship"
              class="clinic-input"
              :disabled="busy"
            >
              <option value="Patient">El paciente</option>
              <option value="Guardian">Su tutor/a</option>
              <option value="Payer">Su responsable de pago</option>
            </select>
          </label>
          <button
            type="button"
            class="rounded bg-gray-800 px-3 py-2 text-sm text-white"
            :disabled="busy"
            @click="linkPatient"
          >
            {{ busy ? 'Guardando…' : 'Confirmar vínculo' }}
          </button>
        </template>
        <button
          type="button"
          class="ml-3 text-sm text-ink-gray-6"
          :disabled="busy"
          @click="closeDraft"
        >
          Cerrar
        </button>
      </form>

      <form
        v-if="mode === 'register' && can('register_patient')"
        class="space-y-3 rounded-lg bg-surface-gray-1 p-3"
        autocomplete="off"
        @submit.prevent="registerPatient"
      >
        <p class="text-sm text-ink-gray-6">
          La persona de este registro de CRM será el paciente. Para un tutor o
          pagador, vincula un paciente existente.
        </p>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="block text-sm"
            >Nombre(s)<input
              v-model="registration.first_name"
              class="clinic-input"
              maxlength="80"
              required
              :disabled="busy"
          /></label>
          <label class="block text-sm"
            >Primer apellido<input
              v-model="registration.last_name"
              class="clinic-input"
              maxlength="80"
              required
              :disabled="busy"
          /></label>
          <label class="block text-sm"
            >Segundo apellido <span class="text-ink-gray-5">(opcional)</span
            ><input
              v-model="registration.maternal_surname"
              class="clinic-input"
              maxlength="80"
              :disabled="busy"
          /></label>
          <label class="block text-sm"
            >Fecha de nacimiento<input
              v-model="registration.dob"
              class="clinic-input"
              type="date"
              required
              :disabled="busy"
          /></label>
          <label class="block text-sm"
            >Teléfono<input
              v-model="registration.mobile"
              class="clinic-input"
              type="tel"
              inputmode="tel"
              maxlength="40"
              required
              :disabled="busy"
          /></label>
          <label class="block text-sm"
            >Sexo<select
              v-model="registration.sex"
              class="clinic-input"
              required
              :disabled="busy || !options"
            >
              <option value="" disabled>Selecciona una opción</option>
              <option
                v-for="sex in options?.sexes || []"
                :key="sex.value"
                :value="sex.value"
              >
                {{ sex.label }}
              </option>
            </select></label
          >
        </div>
        <p v-if="!options" role="status" class="text-sm text-ink-gray-6">
          Las opciones de registro todavía no están disponibles.
        </p>
        <button
          v-if="!options"
          type="button"
          class="text-sm text-ink-blue-9"
          @click="loadOptions"
        >
          Volver a cargar opciones
        </button>
        <div class="flex gap-3">
          <button
            type="submit"
            class="rounded bg-gray-800 px-3 py-2 text-sm text-white"
            :disabled="busy || !options"
          >
            {{ busy ? 'Guardando…' : 'Registrar y vincular' }}
          </button>
          <button
            type="button"
            class="text-sm text-ink-gray-6"
            :disabled="busy"
            @click="closeDraft"
          >
            Cerrar
          </button>
        </div>
      </form>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useClinicRelationships } from '@/composables/clinicRelationships'
import { bookingRoute, clinicMessage } from '@/utils/clinicRelationships'

const props = defineProps({
  doctype: { type: String, required: true },
  docname: { type: String, required: true },
})
const {
  context,
  loading,
  busy,
  errorCode,
  cleared,
  candidates,
  searching,
  options,
  refresh,
  execute,
  findPatients,
  loadOptions,
} = useClinicRelationships(() => ({
  doctype: props.doctype,
  name: props.docname,
}))
const mode = ref('')
const query = ref('')
const searched = ref('')
const selected = ref(null)
const relationship = ref('Patient')
const confirmUnlink = ref('')
const emptyRegistration = () => ({
  first_name: '',
  last_name: '',
  maternal_surname: '',
  dob: '',
  mobile: '',
  sex: '',
})
const registration = reactive(emptyRegistration())
const relationshipLabels = {
  Patient: 'Paciente',
  Guardian: 'Este registro representa a su tutor/a',
  Payer: 'Este registro representa a su responsable de pago',
}
const can = (action) => context.value?.actions.includes(action)
const displayZone = computed(
  () =>
    options.value?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
)
const appointmentDate = (value) =>
  new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: displayZone.value,
  }).format(new Date(value))
const linkLabel = (id) =>
  context.value?.links.find((link) => link.id === id)?.label || 'Cita'
const statusLabel = (status) =>
  ({
    Scheduled: 'Programada',
    Open: 'Pendiente',
    Confirmed: 'Confirmada',
    'Checked In': 'Llegó',
    'Checked Out': 'Atendida',
  })[status] || status

function closeDraft() {
  mode.value = query.value = searched.value = confirmUnlink.value = ''
  selected.value = null
  candidates.value = []
  relationship.value = 'Patient'
  Object.assign(registration, emptyRegistration())
}
watch(cleared, closeDraft)
async function searchPatients() {
  selected.value = null
  searched.value = query.value.trim()
  await findPatients(query.value)
}
async function openRegistration() {
  mode.value = 'register'
  await loadOptions()
}
async function linkPatient() {
  if (
    selected.value &&
    (await execute('link_patient', {
      patient: selected.value.name,
      relationship: relationship.value,
    }))
  )
    closeDraft()
}
async function registerPatient() {
  if (await execute('register_patient', { ...registration })) closeDraft()
}
async function unlink(link) {
  if (await execute('unlink_patient', { link })) confirmUnlink.value = ''
}
</script>

<style scoped>
.clinic-input {
  @apply mt-1 block w-full rounded border border-outline-gray-3 bg-surface-gray-1 px-3 py-2 text-sm text-ink-gray-9;
}
</style>
