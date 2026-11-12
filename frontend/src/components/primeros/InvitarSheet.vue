<template>
  <!-- «Invitar a alguien»: Abordo's invitation (every puesto this site has,
       except a technician, who is added in Equipo with their laboratorio).
       The new person gets their own login; the link is shown once to share
       and never kept here. -->
  <BottomSheet
    :open="open"
    :title="
      result
        ? __('Invitation ready', null, 'Equipo')
        : __('Invite someone', null, 'Equipo')
    "
    :dismissible="!saving && (Boolean(result) || !dirty)"
    @update:open="(value) => !value && close()"
  >
    <div v-if="result" class="space-y-3 pb-2" data-testid="invitar-listo">
      <p class="text-base text-ink-gray-9" data-testid="invitar-resultado">
        {{ resultLine }}
      </p>
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'The link works once and expires within 24 hours. Share it only with this person.',
            null,
            'Equipo',
          )
        }}
      </p>
      <div class="grid gap-2">
        <a
          v-if="result.whatsapp_url"
          :href="result.whatsapp_url"
          target="_blank"
          rel="noopener noreferrer"
          class="press flex min-h-11 items-center justify-center gap-2 rounded-7 bg-surface-gray-2 px-4 text-base font-medium text-ink-gray-9 hover:bg-surface-gray-3"
          data-testid="invitar-whatsapp"
        >
          <span class="lucide-message-circle size-5" aria-hidden="true" />
          {{ __('Send by WhatsApp', null, 'Equipo') }}
        </a>
        <button
          type="button"
          class="press flex min-h-11 items-center justify-center gap-2 rounded-7 bg-surface-gray-2 px-4 text-base font-medium text-ink-gray-9 hover:bg-surface-gray-3"
          data-testid="invitar-copiar"
          @click="copyLink"
        >
          <span class="lucide-copy size-5" aria-hidden="true" />
          {{ __('Copy link', null, 'Equipo') }}
        </button>
      </div>
      <p v-if="copied" role="status" class="text-sm text-ink-gray-7">
        {{ copied }}
      </p>
      <img
        v-if="result.qr_data_uri"
        :src="result.qr_data_uri"
        :alt="__('Invitation QR code', null, 'Equipo')"
        class="mx-auto block w-52 max-w-full rounded-6 bg-white p-2"
      />
    </div>
    <p
      v-else-if="loading"
      role="status"
      class="flex items-center gap-2 py-6 text-sm text-ink-gray-6"
    >
      <span
        class="lucide-loader-circle size-4 animate-spin"
        aria-hidden="true"
      />
      {{ __('Loading the puestos…', null, 'Equipo') }}
    </p>
    <div v-else-if="loadProblem" role="alert" class="space-y-3 py-4">
      <p class="text-sm text-ink-red-7">{{ loadProblem }}</p>
      <Button
        class="min-h-11"
        :label="__('Retry', null, 'Equipo')"
        @click="load"
      />
    </div>
    <form
      v-else-if="opciones"
      id="primeros-invitar"
      class="space-y-4 pb-2"
      novalidate
      data-testid="primeros-invitar"
      @submit.prevent="send"
    >
      <label
        v-for="field in FIELDS"
        :key="field.key"
        class="block"
        :data-field="field.key"
      >
        <span class="text-sm text-ink-gray-7">{{ field.label }}</span>
        <input
          v-model="form[field.key]"
          :type="field.type"
          :inputmode="field.inputmode"
          :autocomplete="field.autocomplete"
          class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
        />
        <span
          v-if="problems[field.key]"
          class="mt-1 block text-sm text-ink-red-7"
          >{{ problems[field.key] }}</span
        >
        <span
          v-else-if="field.hint"
          class="mt-1 block text-sm text-ink-gray-6"
          >{{ field.hint }}</span
        >
      </label>
      <div data-field="perfil">
        <ChipGroup
          v-model="form.perfil"
          :label="__('Puesto', null, 'Equipo')"
          :options="puestos"
          :clear-value="form.perfil"
          testid="invitar-puesto"
        />
        <p
          v-if="problems.perfil"
          class="mt-1 text-sm text-ink-red-7"
          role="alert"
        >
          {{ problems.perfil }}
        </p>
        <p v-else-if="perfil" class="mt-1 text-sm text-ink-gray-6">
          {{ perfil.description }}
        </p>
        <p
          v-if="opciones.tecnico_en_equipo"
          class="mt-1 text-sm text-ink-gray-6"
        >
          {{
            __(
              'A technician is added in Equipo, with their laboratorio.',
              null,
              'Equipo',
            )
          }}
          <button
            type="button"
            class="-my-3 inline-flex min-h-11 items-center py-3 font-medium text-ink-gray-8 hover:underline"
            data-testid="invitar-tecnico"
            @click="emit('tecnico')"
          >
            {{ __('Add a technician', null, 'Equipo') }}
          </button>
        </p>
      </div>
      <label
        v-if="perfil?.pos && opciones.pos_profiles.length > 1"
        class="block"
        data-field="pos_profile"
      >
        <span class="text-sm text-ink-gray-7">{{
          __('Register they sell at', null, 'Equipo')
        }}</span>
        <select
          v-model="form.pos_profile"
          class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
        >
          <option
            v-for="name in opciones.pos_profiles"
            :key="name"
            :value="name"
          >
            {{ name }}
          </option>
        </select>
      </label>
      <div class="space-y-1.5">
        <p class="text-xs font-medium text-ink-gray-6">
          {{ __('Send the invitation by', null, 'Equipo') }}
        </p>
        <Segmented
          v-model="form.entrega"
          :options="entregas"
          :label="__('Send the invitation by', null, 'Equipo')"
        />
      </div>
      <p
        v-if="problem"
        role="alert"
        class="text-sm text-ink-red-7"
        data-testid="invitar-problema"
      >
        {{ problem }}
      </p>
    </form>
    <template #actions>
      <Button
        v-if="result"
        variant="solid"
        class="min-h-11 w-full"
        :label="__('Done', null, 'Equipo')"
        data-testid="invitar-cerrar"
        @click="close"
      />
      <template v-else>
        <Button
          class="min-h-11 w-full"
          :label="__('Cancel', null, 'Equipo')"
          @click="close"
        />
        <Button
          variant="solid"
          type="submit"
          form="primeros-invitar"
          class="min-h-11 w-full"
          :label="__('Send invitation', null, 'Equipo')"
          :loading="saving"
          :disabled="!opciones"
          data-testid="invitar-enviar"
        />
      </template>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet, ChipGroup, Segmented } from '@/components/ui'
import { errorText } from '@/utils/errorText'
import {
  invitar,
  invitePayload,
  inviteProblems,
  loadInvitar,
} from './primerosPasos'

const props = defineProps({
  open: { type: Boolean, default: false },
})
// invited: the person exists (refresh the list); tecnico: add a technician in
// Equipo instead; close: Cancelar or Listo.
const emit = defineEmits(['close', 'invited', 'tecnico'])

const CTX = 'Equipo'
const FIELDS = [
  {
    key: 'nombre',
    label: __('Name', null, CTX),
    type: 'text',
    autocomplete: 'off',
  },
  {
    key: 'email',
    label: __('Email', null, CTX),
    type: 'email',
    inputmode: 'email',
    autocomplete: 'off',
    hint: __('They sign in with it.', null, CTX),
  },
  {
    key: 'telefono',
    label: __('Phone (optional)', null, CTX),
    type: 'tel',
    inputmode: 'tel',
    autocomplete: 'off',
    hint: __(
      'To send it by WhatsApp. Include the country code if it is abroad.',
      null,
      CTX,
    ),
  },
]
const entregas = [
  { value: 'correo', label: __('Email', null, CTX) },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'enlace', label: __('Link and QR', null, CTX) },
]

const blank = () => ({
  nombre: '',
  email: '',
  telefono: '',
  perfil: '',
  pos_profile: '',
  entrega: 'correo',
})
const opciones = ref(null)
const form = ref(blank())
const loading = ref(false)
const loadProblem = ref('')
const problems = ref({})
const problem = ref('')
const saving = ref(false)
const result = ref(null)
const copied = ref('')
let ticket = 0

const puestos = computed(() =>
  (opciones.value?.perfiles || []).map((p) => ({
    value: p.name,
    label: p.name,
  })),
)
const perfil = computed(() =>
  (opciones.value?.perfiles || []).find((p) => p.name === form.value.perfil),
)
// What happened, in the sheet's words (the server's message repeats the
// link's rules, said once below).
const resultLine = computed(() => {
  if (!result.value) return ''
  if (result.value.mail_sent)
    return __('We sent the invitation to their email.', null, CTX)
  if (result.value.entrega === 'correo')
    return __(
      'The email did not go out: send them the link or show them the QR.',
      null,
      CTX,
    )
  return __('Send them the link or show them the QR.', null, CTX)
})
const dirty = computed(() =>
  Boolean(
    form.value.nombre.trim() ||
      form.value.email.trim() ||
      form.value.telefono.trim(),
  ),
)

async function load() {
  const mine = ++ticket
  loading.value = true
  loadProblem.value = ''
  try {
    const answer = await loadInvitar()
    if (mine !== ticket) return
    opciones.value = answer
    form.value.pos_profile = answer.pos_default || ''
  } catch (error) {
    if (mine === ticket)
      loadProblem.value = errorText(
        error,
        __('The puestos did not load. Retry.', null, CTX),
      )
  } finally {
    if (mine === ticket) loading.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    form.value = blank()
    problems.value = {}
    problem.value = ''
    result.value = null
    copied.value = ''
    load()
  },
  { immediate: true },
)
watch(
  () => [form.value.entrega, form.value.telefono, form.value.perfil],
  () => {
    if (Object.keys(problems.value).length)
      problems.value = inviteProblems(form.value, opciones.value)
  },
)

function close() {
  if (saving.value) return
  // The link is shown once: it leaves with the sheet.
  result.value = null
  emit('close')
}

async function send() {
  if (saving.value) return
  problems.value = inviteProblems(form.value, opciones.value)
  if (Object.keys(problems.value).length) return
  saving.value = true
  problem.value = ''
  try {
    const answer = await invitar(invitePayload(form.value, opciones.value))
    if (answer?.accion) {
      emit('tecnico')
      return
    }
    result.value = answer
    emit('invited', answer)
  } catch (error) {
    problem.value = errorText(
      error,
      __('The invitation was not sent. Try again.', null, CTX),
    )
  } finally {
    saving.value = false
  }
}

async function copyLink() {
  const url = result.value?.access_url
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    copied.value = __('Link copied.', null, CTX)
  } catch {
    copied.value = __(
      'Your phone did not let us copy it. Share it by WhatsApp or the QR.',
      null,
      CTX,
    )
  }
}
</script>
