<template>
  <BottomSheet
    :open="open"
    :title="__('Your business details', null, 'Primeros pasos')"
    :subtitle="datos?.empresa || ''"
    :dismissible="!dirty && !saving"
    @update:open="(value) => !value && cancel()"
  >
    <p
      v-if="loading"
      role="status"
      class="flex items-center gap-2 py-6 text-sm text-ink-gray-6"
    >
      <span
        class="lucide-loader-circle size-4 animate-spin"
        aria-hidden="true"
      />
      {{ __('Loading your business…', null, 'Primeros pasos') }}
    </p>
    <div v-else-if="loadProblem" role="alert" class="space-y-3 py-4">
      <p class="text-sm text-ink-red-7">{{ loadProblem }}</p>
      <Button
        class="min-h-11"
        :label="__('Retry', null, 'Primeros pasos')"
        @click="load"
      />
    </div>
    <form
      v-else-if="datos"
      id="primeros-negocio"
      class="space-y-4 pb-2"
      novalidate
      data-testid="primeros-negocio"
      @submit.prevent="save"
    >
      <p
        v-if="missing.length"
        class="text-sm text-ink-gray-6"
        data-testid="negocio-falta"
      >
        {{
          __(
            'They print on your tickets, quotes and invoices. Missing: {0}.',
            [missing.join(', ')],
            'Primeros pasos',
          )
        }}
      </p>
      <!-- The logo: the tile is the camera's button; the photo is cropped
           and made light on the phone before it travels. A saved logo sits
           on white in both themes: the paper it prints on. -->
      <div class="flex items-center gap-4">
        <button
          type="button"
          class="press flex size-20 flex-none items-center justify-center overflow-hidden rounded-7 text-ink-gray-6"
          :class="
            logoShown
              ? 'border border-outline-gray-2 bg-white'
              : 'border-2 border-dashed border-outline-gray-3 bg-surface-gray-1'
          "
          :aria-label="
            logoShown
              ? __('Change logo', null, 'Primeros pasos')
              : __('Add your logo', null, 'Primeros pasos')
          "
          :title="
            logoShown
              ? __('Change logo', null, 'Primeros pasos')
              : __('Add your logo', null, 'Primeros pasos')
          "
          data-testid="negocio-logo"
          @click="pickLogo"
        >
          <img
            v-if="logoShown"
            :src="logoShown"
            alt=""
            class="size-full object-contain"
          />
          <span v-else class="lucide-image-plus size-7" aria-hidden="true" />
        </button>
        <div class="min-w-0 flex-1">
          <p class="text-base font-medium text-ink-gray-9">
            {{ __('Your logo', null, 'Primeros pasos') }}
          </p>
          <p class="text-sm text-ink-gray-6">
            {{
              logoFile
                ? __(
                    'Ready. It is saved with your details.',
                    null,
                    'Primeros pasos',
                  )
                : __(
                    'A square picture reads best on a ticket.',
                    null,
                    'Primeros pasos',
                  )
            }}
          </p>
          <button
            type="button"
            class="-ml-1 mt-1 flex min-h-11 items-center px-1 text-sm font-medium text-ink-gray-8 hover:underline sm:min-h-8"
            @click="pickLogo"
          >
            {{
              logoShown
                ? __('Change logo', null, 'Primeros pasos')
                : __('Take or choose a photo', null, 'Primeros pasos')
            }}
          </button>
        </div>
      </div>
      <input
        ref="picker"
        type="file"
        accept="image/*"
        class="hidden"
        data-testid="negocio-logo-input"
        @change="onPick"
      />
      <p v-if="logoProblem" role="alert" class="text-sm text-ink-red-7">
        {{ logoProblem }}
      </p>

      <label
        v-for="field in contactFields"
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
      </label>

      <!-- The rule sits above the section's name, as above the RFC: on the
           fieldset itself it would run through the legend. -->
      <div class="border-t border-outline-gray-1 pt-3">
        <fieldset class="space-y-4">
          <legend class="text-base font-medium text-ink-gray-9">
            {{ __('Address', null, 'Primeros pasos') }}
          </legend>
          <label
            v-for="field in addressFields"
            :key="field.key"
            class="block"
            :data-field="field.key"
          >
            <span class="text-sm text-ink-gray-7">{{ field.label }}</span>
            <input
              v-model="form[field.key]"
              type="text"
              :inputmode="field.inputmode"
              :autocomplete="field.autocomplete"
              class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
            />
            <span
              v-if="problems[field.key]"
              class="mt-1 block text-sm text-ink-red-7"
              >{{ problems[field.key] }}</span
            >
          </label>
        </fieldset>
      </div>

      <div
        v-if="datos.rfc_aplica"
        class="border-t border-outline-gray-1 pt-3"
        data-field="rfc"
      >
        <label v-if="datos.rfc_editable" class="block">
          <span class="text-sm text-ink-gray-7">{{
            __('RFC (optional)', null, 'Primeros pasos')
          }}</span>
          <!-- Capitals as typed (the kit generates no `uppercase`); the
               server normalizes and checks it. -->
          <input
            :value="form.rfc"
            type="text"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"
            maxlength="13"
            class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
            @input="form.rfc = $event.target.value.toUpperCase()"
          />
          <span class="mt-1 block text-sm text-ink-gray-6">{{
            __('It goes on your invoices.', null, 'Primeros pasos')
          }}</span>
        </label>
        <template v-else>
          <p class="text-sm text-ink-gray-7">
            {{ __('RFC', null, 'Primeros pasos') }}
          </p>
          <p class="num text-base text-ink-gray-9">{{ datos.rfc }}</p>
          <p class="text-sm text-ink-gray-6">
            {{
              __(
                'Your RFC goes with your invoice stamping: it changes where you turn stamping on.',
                null,
                'Primeros pasos',
              )
            }}
          </p>
        </template>
      </div>
      <p
        v-if="problem"
        role="alert"
        class="text-sm text-ink-red-7"
        data-testid="negocio-problema"
      >
        {{ problem }}
      </p>
    </form>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        :label="__('Cancel', null, 'Primeros pasos')"
        @click="cancel"
      />
      <Button
        variant="solid"
        type="submit"
        form="primeros-negocio"
        class="min-h-11 w-full"
        :label="__('Save details', null, 'Primeros pasos')"
        :loading="saving"
        :disabled="!datos || !dirty"
        data-testid="negocio-guardar"
      />
    </template>
  </BottomSheet>
  <MediaViewer
    v-if="viewerWanted"
    v-model:open="viewerOpen"
    v-model:editing="editing"
    :items="picked ? [picked] : []"
    :title="__('Your logo', null, 'Primeros pasos')"
  >
    <template #actions>
      <button
        type="button"
        class="ui-viewer-action press"
        data-testid="logo-recortar"
        @click="editing = true"
      >
        <span class="lucide-pencil size-5" aria-hidden="true" />
        {{ __('Crop', null, 'Primeros pasos') }}
      </button>
      <button
        type="button"
        class="ui-viewer-action press"
        data-testid="logo-usar"
        @click="usePicked(picked.file)"
      >
        <span class="lucide-check size-5" aria-hidden="true" />
        {{ __('Use this photo', null, 'Primeros pasos') }}
      </button>
    </template>
    <template #editor>
      <PhotoEditor
        v-if="picked"
        :src="picked.file"
        @cancel="editing = false"
        @save="onCropped"
      />
    </template>
  </MediaViewer>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { prepareImage } from '@/components/ui/imageFiles'
import { errorText } from '@/utils/errorText'
import {
  LOGO_SIDE,
  loadNegocio,
  negocioChanges,
  negocioDraft,
  negocioMissing,
  negocioProblems,
  saveNegocio,
  uploadLogo,
} from './primerosPasos'

// The viewer and the editor load on the first photo picked.
const MediaViewer = defineAsyncComponent(
  () => import('@/components/ui/MediaViewer.vue'),
)
const PhotoEditor = defineAsyncComponent(
  () => import('@/components/ui/PhotoEditor.vue'),
)

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'saved'])

const CTX = 'Primeros pasos'
const contactFields = [
  {
    key: 'telefono',
    label: __('Phone', null, CTX),
    type: 'tel',
    inputmode: 'tel',
    autocomplete: 'tel',
  },
  {
    key: 'correo',
    label: __('Email', null, CTX),
    type: 'email',
    inputmode: 'email',
    autocomplete: 'email',
  },
]
const addressFields = [
  {
    key: 'calle',
    label: __('Street and number', null, CTX),
    autocomplete: 'address-line1',
  },
  {
    key: 'colonia',
    label: __('Neighborhood', null, CTX),
    autocomplete: 'address-line2',
  },
  {
    key: 'ciudad',
    label: __('City', null, CTX),
    autocomplete: 'address-level2',
  },
  {
    key: 'estado',
    label: __('State', null, CTX),
    autocomplete: 'address-level1',
  },
  {
    key: 'cp',
    label: __('Postal code', null, CTX),
    inputmode: 'numeric',
    autocomplete: 'postal-code',
  },
]

const datos = ref(null)
const form = ref(negocioDraft())
const loading = ref(false)
const loadProblem = ref('')
const problems = ref({})
const problem = ref('')
const saving = ref(false)
const picker = ref(null)
const logoFile = ref(null)
const logoPreview = ref('')
const logoProblem = ref('')
const picked = ref(null)
const viewerWanted = ref(false)
const viewerOpen = ref(false)
const editing = ref(false)
let ticket = 0

const logoShown = computed(() => logoPreview.value || datos.value?.logo || '')
const changes = computed(() =>
  datos.value ? negocioChanges(form.value, datos.value) : {},
)
const dirty = computed(
  () => Boolean(logoFile.value) || Object.keys(changes.value).length > 0,
)
const missing = computed(() =>
  datos.value ? negocioMissing(form.value, logoShown.value) : [],
)

function revoke(url) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}
function clearPicked() {
  if (picked.value) revoke(picked.value.url)
  picked.value = null
}
function resetLogo() {
  revoke(logoPreview.value)
  logoPreview.value = ''
  logoFile.value = null
  logoProblem.value = ''
  clearPicked()
}

async function load() {
  const mine = ++ticket
  loading.value = true
  loadProblem.value = ''
  try {
    const answer = await loadNegocio()
    if (mine !== ticket) return
    datos.value = answer
    form.value = negocioDraft(answer)
  } catch (error) {
    if (mine === ticket)
      loadProblem.value = errorText(
        error,
        __('Your business details did not load. Retry.', null, CTX),
      )
  } finally {
    if (mine === ticket) loading.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    problems.value = {}
    problem.value = ''
    resetLogo()
    load()
  },
  { immediate: true },
)
onBeforeUnmount(resetLogo)

function cancel() {
  if (saving.value) return
  emit('close')
}

// ── the logo ──
function pickLogo() {
  logoProblem.value = ''
  picker.value?.click()
}
function onPick(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!String(file.type || '').startsWith('image/')) {
    logoProblem.value = __('Choose a picture for your logo.', null, CTX)
    return
  }
  clearPicked()
  picked.value = {
    key: 'logo',
    kind: 'image',
    url: URL.createObjectURL(file),
    name: file.name,
    file,
  }
  viewerWanted.value = true
  editing.value = true
  viewerOpen.value = true
}
async function usePicked(source) {
  try {
    const name = /png/.test(source.type || '') ? 'logo.png' : 'logo.jpg'
    const file =
      source instanceof File
        ? source
        : new File([source], name, { type: source.type || 'image/jpeg' })
    const light = await prepareImage(file, { maxSide: LOGO_SIDE })
    revoke(logoPreview.value)
    logoFile.value = light
    logoPreview.value = URL.createObjectURL(light)
    logoProblem.value = ''
  } catch {
    logoProblem.value = __(
      'That picture did not open. Try another one.',
      null,
      CTX,
    )
  }
  editing.value = false
  viewerOpen.value = false
  clearPicked()
}
function onCropped({ blob }) {
  usePicked(blob)
}
watch(viewerOpen, (isOpen) => {
  if (!isOpen) {
    editing.value = false
    clearPicked()
  }
})

// ── save ──
async function save() {
  if (saving.value || !dirty.value) return
  problems.value = negocioProblems(form.value, datos.value)
  if (Object.keys(problems.value).length) return
  saving.value = true
  problem.value = ''
  try {
    const values = { ...changes.value }
    if (logoFile.value)
      values.logo = await uploadLogo(logoFile.value, datos.value.empresa)
    const answer = await saveNegocio(values)
    resetLogo()
    emit('saved', answer)
  } catch (error) {
    problem.value = errorText(
      error,
      __('Your details were not saved. Try again.', null, CTX),
    )
  } finally {
    saving.value = false
  }
}
</script>
