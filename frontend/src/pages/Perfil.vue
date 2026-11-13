<template>
  <div class="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain">
    <div
      class="mx-auto w-full max-w-2xl px-4 pb-24 pt-1 sm:px-6 sm:pb-10 sm:pt-6"
    >
      <!-- On a phone the shell's bar carries the title. -->
      <h1
        v-if="!phone"
        class="title-face pb-4 text-3xl font-semibold text-ink-gray-9"
      >
        {{ __('My profile') }}
      </h1>
      <EmptyState
        v-if="failure"
        state="error"
        :message="failure"
        :action="__('Retry', null, 'Perfil')"
        @action="load"
      />
      <EmptyState
        v-else-if="!doc"
        state="loading"
        :title="__('Loading your profile…', null, 'Perfil')"
      />
      <div v-else class="space-y-6">
        <!-- Who: the photo and the name, each edited from its own control. -->
        <section
          class="border-b border-outline-gray-1 pb-5"
          :aria-label="__('You', null, 'Perfil')"
        >
          <div class="flex items-center gap-4">
            <span
              class="flex size-16 flex-none items-center justify-center overflow-hidden rounded-full bg-surface-gray-3 text-xl font-semibold text-ink-gray-8"
            >
              <img
                v-if="doc.user_image"
                :src="doc.user_image"
                alt=""
                class="size-full object-cover"
              />
              <span v-else aria-hidden="true">{{ initials }}</span>
            </span>
            <div class="min-w-0 flex-1">
              <p
                class="title-face break-words text-2xl font-semibold text-ink-gray-9 [text-wrap:balance]"
                data-testid="perfil-nombre-actual"
              >
                {{ name }}
              </p>
              <p v-if="puesto" class="text-sm text-ink-gray-6">{{ puesto }}</p>
            </div>
            <button
              type="button"
              class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 active:bg-surface-gray-2 [@media(hover:hover)]:hover:bg-surface-gray-2"
              :aria-label="__('Edit your name', null, 'Perfil')"
              :title="__('Edit your name', null, 'Perfil')"
              data-testid="perfil-editar-nombre"
              @click="nameOpen = true"
            >
              <span class="lucide-pencil size-5" aria-hidden="true" />
            </button>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <label
              class="press flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-base text-ink-gray-8"
              :class="photoBusy ? 'pointer-events-none opacity-60' : ''"
            >
              <span class="lucide-camera size-5" aria-hidden="true" />
              {{
                photoBusy
                  ? __('Uploading…', null, 'Perfil')
                  : doc.user_image
                    ? __('Change photo', null, 'Perfil')
                    : __('Add a photo', null, 'Perfil')
              }}
              <input
                type="file"
                accept="image/*"
                class="sr-only"
                data-testid="perfil-foto"
                :disabled="photoBusy"
                @change="pickPhoto"
              />
            </label>
            <!-- Two taps in place; the second waits a few seconds and loses
                 its arm when focus leaves, like Facturación's card bin. -->
            <button
              v-if="doc.user_image"
              ref="removeButton"
              type="button"
              class="press flex min-h-11 items-center gap-2 rounded-full px-4 text-base"
              :class="
                removing
                  ? 'bg-surface-red-1 text-ink-red-7'
                  : 'bg-surface-gray-2 text-ink-gray-8'
              "
              :disabled="photoBusy"
              data-testid="perfil-quitar-foto"
              @click="removePhoto"
              @blur="disarmRemove"
            >
              <span class="lucide-trash-2 size-5" aria-hidden="true" />
              {{
                removing
                  ? __('Remove', null, 'Perfil')
                  : __('Remove photo', null, 'Perfil')
              }}
            </button>
          </div>
          <p
            v-if="photoProblem"
            class="mt-2 text-sm text-ink-red-7"
            role="alert"
          >
            {{ photoProblem }}
          </p>
        </section>

        <section aria-labelledby="perfil-seguridad">
          <h2
            id="perfil-seguridad"
            class="pb-1 text-sm font-semibold text-ink-gray-7"
          >
            {{ __('Security', null, 'Perfil') }}
          </h2>
          <!-- -mx-4: the row's own padding, so its icon lines up with the headings. -->
          <!-- «Correo»: only where doco offers changing the sign-in email. -->
          <ListRow
            v-if="seguridad?.email_change"
            class="-mx-4"
            icon="lucide-mail"
            :title="__('Email', null, 'Perfil')"
            :subtitle="emailRowLine(seguridad.email_change)"
            :subtitle-lines="2"
            data-testid="perfil-correo-row"
            @click="emailOpen = true"
          />
          <ListRow
            class="-mx-4"
            icon="lucide-key-round"
            :title="__('Password', null, 'Perfil')"
            :subtitle="__('Change it when you need to.', null, 'Perfil')"
            data-testid="perfil-password-row"
            @click="passwordOpen = true"
          />
          <!-- Only where doco offers it, or for someone who already has it on. -->
          <ListRow
            v-if="seguridad?.two_step"
            class="-mx-4"
            icon="lucide-shield-check"
            :title="__('Two-step verification', null, 'Perfil')"
            :subtitle="twoStepLine(seguridad.two_step)"
            :subtitle-lines="2"
            data-testid="perfil-dos-pasos-row"
            @click="twoStepOpen = true"
          />
          <ListRow
            v-if="seguridad?.sessions"
            class="-mx-4"
            icon="lucide-monitor-smartphone"
            :title="__('Devices signed in', null, 'Perfil')"
            :subtitle="sessionsLine(seguridad.sessions)"
            data-testid="perfil-sesiones-row"
            @click="sessionsOpen = true"
          />
        </section>

        <section aria-labelledby="perfil-preferencias" class="space-y-4">
          <h2
            id="perfil-preferencias"
            class="text-sm font-semibold text-ink-gray-7"
          >
            {{ __('Preferences', null, 'Perfil') }}
          </h2>
          <div>
            <p class="pb-2 text-base text-ink-gray-8">
              {{ __('Theme', null, 'Perfil') }}
            </p>
            <Segmented
              :model-value="theme"
              :options="themes"
              :label="__('Theme', null, 'Perfil')"
              @update:model-value="setTheme"
            />
            <p class="mt-1 text-sm text-ink-gray-6">
              {{ __('It applies on this device at once.', null, 'Perfil') }}
            </p>
          </div>
          <label class="block">
            <span class="text-base text-ink-gray-8">{{
              __('Language', null, 'Perfil')
            }}</span>
            <select
              v-model="language"
              class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 pl-3 pr-8 text-base text-ink-gray-9"
              data-testid="perfil-idioma"
            >
              <option
                v-if="!languages.some((option) => option.value === language)"
                :value="language"
              >
                {{ languageLabel(language) }}
              </option>
              <option
                v-for="option in languages"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
          <label class="block">
            <span class="text-base text-ink-gray-8">{{
              __('Your time zone', null, 'Perfil')
            }}</span>
            <select
              v-model="timeZone"
              class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 pl-3 pr-8 text-base text-ink-gray-9"
              data-testid="perfil-zona"
            >
              <option v-if="!timezones.includes(timeZone)" :value="timeZone">
                {{
                  zoneLabel(timeZone) ||
                  __('The shop’s time zone', null, 'Perfil')
                }}
              </option>
              <optgroup
                v-if="zoneGroups.suggested.length"
                :label="__('Suggested', null, 'Perfil')"
              >
                <option
                  v-for="option in zoneGroups.suggested"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </optgroup>
              <optgroup
                v-if="zoneGroups.rest.length"
                :label="__('Every time zone', null, 'Perfil')"
              >
                <option
                  v-for="option in zoneGroups.rest"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </optgroup>
            </select>
            <span class="mt-1 block text-sm text-ink-gray-6">{{
              __(
                'How you see times. Business hours and due dates keep the shop’s time zone.',
                null,
                'Perfil',
              )
            }}</span>
          </label>
          <div v-if="prefsDirty" class="space-y-2">
            <Button
              variant="solid"
              class="min-h-11 w-full sm:w-auto"
              :label="__('Save preferences', null, 'Perfil')"
              :loading="prefsSaving"
              data-testid="perfil-guardar-preferencias"
              @click="savePreferences"
            />
            <p class="text-sm text-ink-gray-6">
              {{
                __(
                  'Muelle opens again so the change applies everywhere.',
                  null,
                  'Perfil',
                )
              }}
            </p>
          </div>
          <p v-if="prefsProblem" class="text-sm text-ink-red-7" role="alert">
            {{ prefsProblem }}
          </p>
        </section>
      </div>
    </div>
    <NombreSheet
      v-if="nameOpen || nameMounted"
      :open="nameOpen"
      :doc="doc"
      :submit="saveName"
      @close="nameOpen = false"
      @saved="afterName"
    />
    <PasswordSheet
      v-if="passwordOpen || passwordMounted"
      :open="passwordOpen"
      :submit="changePassword"
      @close="passwordOpen = false"
      @saved="afterPassword"
    />
    <TwoStepSheet
      v-if="twoStepOpen || twoStepMounted"
      :open="twoStepOpen"
      :status="seguridad?.two_step || null"
      :other-devices="Math.max(0, Number(seguridad?.sessions?.count || 0) - 1)"
      @close="twoStepOpen = false"
      @changed="afterTwoStep"
    />
    <CorreoSheet
      v-if="emailOpen || emailMounted"
      :open="emailOpen"
      :change="seguridad?.email_change || null"
      @close="emailOpen = false"
      @changed="loadSecurity"
    />
    <SesionesSheet
      v-if="sessionsOpen || sessionsMounted"
      :open="sessionsOpen"
      @close="sessionsOpen = false"
      @changed="loadSecurity"
    />
  </div>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'
import { Button, toast } from 'frappe-ui'
import { EmptyState, ListRow, Segmented } from '@/components/ui'
import { prepareImage } from '@/components/ui/imageFiles'
import {
  changePassword,
  languageLabel,
  loadLanguages,
  loadProfile,
  loadSeguridad,
  loadTimezones,
  nameOf,
  saveProfile,
  sessionsLine,
  timezoneGroups,
  twoStepLine,
  uploadPhoto,
  zoneLabel,
} from '@/components/perfil/perfil'
import { rowLine as emailRowLine } from '@/components/perfil/correo'
import { isMobile } from '@/composables/breakpoint'
import { shellBoot } from '@/composables/muelleShell'
import { THEME_CHOICES, useShellTheme } from '@/composables/shellTheme'
import { errorText } from '@/utils/errorText'

// Sheets mount on their first open.
const NombreSheet = defineAsyncComponent(
  () => import('@/components/perfil/NombreSheet.vue'),
)
const PasswordSheet = defineAsyncComponent(
  () => import('@/components/perfil/PasswordSheet.vue'),
)
const TwoStepSheet = defineAsyncComponent(
  () => import('@/components/perfil/TwoStepSheet.vue'),
)
const SesionesSheet = defineAsyncComponent(
  () => import('@/components/perfil/SesionesSheet.vue'),
)
const CorreoSheet = defineAsyncComponent(
  () => import('@/components/perfil/CorreoSheet.vue'),
)
// An avatar is shown small: 512 px keeps a phone photo light.
const PHOTO_SIDE = 512
// How long «Quitar» waits for its second tap.
const DISARM_MS = 4000

const phone = isMobile
const { theme, setTheme } = useShellTheme()
const themes = THEME_CHOICES.map((choice) => ({
  value: choice.value,
  label: __(choice.label),
  icon: choice.icon,
}))

const doc = ref(null)
const failure = ref('')
const languages = ref([])
const timezones = ref([])
const language = ref('')
const timeZone = ref('')
const prefsSaving = ref(false)
const prefsProblem = ref('')
const photoBusy = ref(false)
const photoProblem = ref('')
const removing = ref(false)
const removeButton = ref(null)
let disarmTimer = null
const nameOpen = ref(false)
const nameMounted = ref(false)
const passwordOpen = ref(false)
const passwordMounted = ref(false)
const twoStepOpen = ref(false)
const twoStepMounted = ref(false)
const sessionsOpen = ref(false)
const sessionsMounted = ref(false)
const emailOpen = ref(false)
const emailMounted = ref(false)
// Seguridad's rows: doco's sign-in email change («Correo»), two-step
// verification and sessions. null while loading or where the site has none.
const seguridad = ref(null)
watch(nameOpen, (open) => open && (nameMounted.value = true))
watch(passwordOpen, (open) => open && (passwordMounted.value = true))
watch(twoStepOpen, (open) => open && (twoStepMounted.value = true))
watch(sessionsOpen, (open) => open && (sessionsMounted.value = true))
watch(emailOpen, (open) => open && (emailMounted.value = true))

const user = computed(() => shellBoot.value?.user?.name || '')
// The shop's zone leads the list (window.timezone.system from the page boot).
const zoneGroups = computed(() =>
  timezoneGroups(timezones.value, {
    shop: window.timezone?.system || shellBoot.value?.time_zone || '',
    mine: doc.value?.time_zone || '',
  }),
)
const puesto = computed(() => shellBoot.value?.user?.puesto || '')
const name = computed(
  () => nameOf(doc.value) || __('No name yet', null, 'Perfil'),
)
const initials = computed(() => {
  const parts = nameOf(doc.value).split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
})
const prefsDirty = computed(
  () =>
    Boolean(doc.value) &&
    (language.value !== (doc.value.language || '') ||
      timeZone.value !== (doc.value.time_zone || '')),
)

function keep(next) {
  doc.value = { ...doc.value, ...next }
  language.value = doc.value.language || ''
  timeZone.value = doc.value.time_zone || ''
  // The rail and Más show the same name and photo without a new boot.
  if (shellBoot.value?.user) {
    shellBoot.value.user.full_name =
      nameOf(doc.value) || shellBoot.value.user.full_name
    shellBoot.value.user.image = doc.value.user_image || null
  }
}

async function load() {
  if (!user.value) return
  failure.value = ''
  try {
    const answer = await loadProfile(user.value)
    doc.value = null
    keep(answer || {})
  } catch (error) {
    failure.value = errorText(
      error,
      __(
        'Your profile could not load. Check your connection and retry.',
        null,
        'Perfil',
      ),
    )
  }
  loadSecurity()
  loadLanguages()
    .then((rows) => (languages.value = rows))
    .catch(() => {})
  loadTimezones()
    .then((rows) => (timezones.value = rows))
    .catch(() => {})
}
watch(user, load, { immediate: true })

function loadSecurity() {
  return loadSeguridad()
    .then((answer) => (seguridad.value = answer || null))
    .catch(() => (seguridad.value = null))
}

function afterTwoStep(status) {
  if (status && seguridad.value)
    seguridad.value = { ...seguridad.value, two_step: status }
  loadSecurity()
}

async function saveName(values) {
  keep(await saveProfile(user.value, values))
}
function afterName() {
  nameOpen.value = false
  toast.success(__('Name saved', null, 'Perfil'))
}
function afterPassword(signedOutOthers) {
  passwordOpen.value = false
  toast.success(
    signedOutOthers
      ? __(
          'Password changed. Your other devices are signed out.',
          null,
          'Perfil',
        )
      : __('Password changed', null, 'Perfil'),
  )
  if (signedOutOthers) loadSecurity()
}

async function pickPhoto(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  photoBusy.value = true
  photoProblem.value = ''
  removing.value = false
  try {
    const picture = await prepareImage(file, { maxSide: PHOTO_SIDE })
    const url = await uploadPhoto(user.value, picture)
    keep(await saveProfile(user.value, { user_image: url }))
    toast.success(__('Photo saved', null, 'Perfil'))
  } catch (error) {
    photoProblem.value = errorText(
      error,
      __('The photo did not upload. Try another picture.', null, 'Perfil'),
    )
  } finally {
    photoBusy.value = false
  }
}
function disarmRemove() {
  clearTimeout(disarmTimer)
  disarmTimer = null
  if (!photoBusy.value) removing.value = false
}
onBeforeUnmount(() => clearTimeout(disarmTimer))
// The bin, then «Quitar» where it was: two taps in place.
async function removePhoto() {
  if (!removing.value) {
    removing.value = true
    await nextTick()
    removeButton.value?.focus?.()
    disarmTimer = setTimeout(disarmRemove, DISARM_MS)
    return
  }
  clearTimeout(disarmTimer)
  disarmTimer = null
  photoBusy.value = true
  photoProblem.value = ''
  try {
    keep(await saveProfile(user.value, { user_image: '' }))
    toast.success(__('Photo removed', null, 'Perfil'))
  } catch (error) {
    photoProblem.value = errorText(
      error,
      __('The photo was not removed. Try again.', null, 'Perfil'),
    )
  } finally {
    photoBusy.value = false
    removing.value = false
  }
}

async function savePreferences() {
  if (!prefsDirty.value || prefsSaving.value) return
  prefsSaving.value = true
  prefsProblem.value = ''
  try {
    await saveProfile(user.value, {
      language: language.value,
      time_zone: timeZone.value,
    })
    window.location.reload()
  } catch (error) {
    prefsProblem.value = errorText(
      error,
      __('Your preferences were not saved. Try again.', null, 'Perfil'),
    )
    prefsSaving.value = false
  }
}
</script>
