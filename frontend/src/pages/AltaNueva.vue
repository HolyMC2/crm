<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <!-- «Registrar algo nuevo»: a piece the shop has not created yet. Photos of
         the piece and its label, how many, where it goes and what it is for;
         whoever creates products decides it in «Altas por revisar». -->
    <AppBar
      v-if="isPhone"
      back="/productos/altas"
      :back-label="__('New products', null, CTX)"
      :title="__('Register something new', null, CTX)"
    />
    <div class="mx-auto w-full max-w-xl space-y-5 px-4 pb-32 pt-3 sm:px-6">
      <header v-if="!isPhone" class="flex flex-wrap items-center gap-3">
        <RouterLink
          to="/productos/altas"
          class="press inline-flex min-h-11 items-center rounded-6 px-2 text-base text-ink-gray-7 hover:bg-surface-gray-2 sm:min-h-8"
          >{{ __('New products', null, CTX) }}</RouterLink
        >
        <h1 class="title-face flex-1 text-2xl font-semibold text-ink-gray-9">
          {{ __('Register something new', null, CTX) }}
        </h1>
      </header>

      <section
        v-if="sent"
        role="status"
        class="space-y-4 py-6"
        data-alta-enviada
      >
        <p class="text-xl font-semibold text-ink-gray-9">
          {{ __('Sent', null, CTX) }}
        </p>
        <p class="text-base text-ink-gray-7">
          {{
            __(
              'The assistant reads the label and whoever creates products decides. You will get a pendiente to print its label.',
              null,
              CTX,
            )
          }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="press min-h-11 rounded-6 bg-[var(--muelle-accent)] px-4 text-base font-medium text-[var(--muelle-accent-ink)]"
            data-alta-otra
            @click="reset"
          >
            {{ __('Register another', null, CTX) }}
          </button>
          <RouterLink
            to="/productos/altas"
            class="press inline-flex min-h-11 items-center rounded-6 bg-surface-gray-2 px-4 text-base text-ink-gray-8"
            >{{ __('See my registrations', null, CTX) }}</RouterLink
          >
        </div>
      </section>

      <form
        v-else
        id="alta-nueva"
        class="space-y-5"
        novalidate
        @submit.prevent="send"
      >
        <!-- Photos: square tiles, the dashed one is the camera. -->
        <section aria-labelledby="alta-fotos" class="space-y-2">
          <h2 id="alta-fotos" class="text-sm text-ink-gray-7">
            {{ __('Photos of the piece and of its label', null, CTX) }}
          </h2>
          <ul class="grid grid-cols-3 gap-2 sm:grid-cols-4">
            <li
              v-for="(photo, index) in photos"
              :key="photo.url"
              class="relative aspect-square overflow-hidden rounded-6 bg-surface-gray-2"
              data-alta-foto
            >
              <img
                :src="photo.url"
                :alt="__('Photo {0}', [index + 1], CTX)"
                class="size-full object-cover"
              />
              <button
                type="button"
                class="press absolute right-1 top-1 flex size-9 items-center justify-center rounded-full bg-surface-white/90 text-ink-gray-8"
                :aria-label="__('Remove photo', null, CTX)"
                :title="__('Remove photo', null, CTX)"
                @click="removePhoto(index)"
              >
                <span class="lucide-x size-4" aria-hidden="true" />
              </button>
            </li>
            <li v-if="photos.length < photoCap" class="aspect-square">
              <label
                class="press flex size-full cursor-pointer flex-col items-center justify-center gap-1 rounded-6 border-2 border-dashed border-outline-gray-3 text-sm text-ink-gray-7"
                data-alta-camara
              >
                <span class="lucide-camera size-6" aria-hidden="true" />
                {{ __('Take photo', null, CTX) }}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  class="sr-only"
                  @change="pick"
                />
              </label>
            </li>
          </ul>
          <label
            v-if="photos.length < photoCap"
            class="press inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-ink-gray-8 underline underline-offset-2"
          >
            {{ __('Choose from the gallery', null, CTX) }}
            <input
              type="file"
              accept="image/*"
              multiple
              class="sr-only"
              @change="pick"
            />
          </label>
        </section>

        <label class="block space-y-1">
          <span class="text-sm text-ink-gray-7">{{
            __('What is it? (optional)', null, CTX)
          }}</span>
          <input
            v-model="form.nombre"
            class="alta-campo w-full"
            maxlength="140"
            :placeholder="__('E.g. charging connector A26', null, CTX)"
            data-alta-nombre
          />
        </label>

        <div class="space-y-1">
          <span id="alta-cuantos" class="text-sm text-ink-gray-7">{{
            __('How many are there?', null, CTX)
          }}</span>
          <div
            class="flex items-center gap-2"
            role="group"
            aria-labelledby="alta-cuantos"
          >
            <button
              type="button"
              class="press flex size-11 items-center justify-center rounded-6 bg-surface-gray-2 text-ink-gray-8"
              :aria-label="__('One less', null, CTX)"
              :title="__('One less', null, CTX)"
              :disabled="form.cantidad <= 1"
              @click="form.cantidad = Math.max(1, Number(form.cantidad) - 1)"
            >
              <span class="lucide-minus size-4" aria-hidden="true" />
            </button>
            <input
              v-model.number="form.cantidad"
              type="number"
              inputmode="numeric"
              min="1"
              class="alta-campo num w-24 text-center"
              :aria-label="__('How many are there?', null, CTX)"
              data-alta-cantidad
            />
            <button
              type="button"
              class="press flex size-11 items-center justify-center rounded-6 bg-surface-gray-2 text-ink-gray-8"
              :aria-label="__('One more', null, CTX)"
              :title="__('One more', null, CTX)"
              @click="form.cantidad = Number(form.cantidad || 0) + 1"
            >
              <span class="lucide-plus size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div class="space-y-1">
          <span id="alta-lugar" class="text-sm text-ink-gray-7">{{
            __('Where does it go?', null, CTX)
          }}</span>
          <div
            v-if="place"
            class="flex min-h-11 items-center gap-2 rounded-6 bg-surface-gray-2 px-3"
            data-alta-lugar-elegido
          >
            <span
              class="lucide-inbox size-4 text-ink-gray-6"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 truncate text-base text-ink-gray-9">{{
              place.label
            }}</span>
            <button
              type="button"
              class="press min-h-11 px-2 text-sm font-medium text-ink-gray-8 underline underline-offset-2"
              @click="place = null"
            >
              {{ __('Change', null, CTX) }}
            </button>
          </div>
          <template v-else>
            <input
              v-model="placeSearch"
              class="alta-campo w-full"
              aria-labelledby="alta-lugar"
              :placeholder="__('Search the drawer or shelf', null, CTX)"
              data-alta-lugar
              @input="findPlaces"
            />
            <ul v-if="places.length" class="divide-y divide-outline-gray-1">
              <li v-for="option in places" :key="option.name">
                <button
                  type="button"
                  class="press flex min-h-11 w-full items-center gap-2 px-1 text-left text-base text-ink-gray-9"
                  @click="choosePlace(option)"
                >
                  <span
                    class="lucide-inbox size-4 text-ink-gray-6"
                    aria-hidden="true"
                  />
                  {{ option.label }}
                </button>
              </li>
            </ul>
            <p class="text-sm text-ink-gray-6">
              {{
                __(
                  'Without a place it goes to your usual store; the drawer can be set later.',
                  null,
                  CTX,
                )
              }}
            </p>
          </template>
        </div>

        <fieldset class="space-y-2">
          <legend class="text-sm text-ink-gray-7">
            {{ __('What is it for?', null, CTX) }}
          </legend>
          <label
            v-for="tipo in tipoOptions"
            :key="tipo.value"
            class="press flex min-h-14 cursor-pointer items-center gap-3 rounded-6 px-3"
            :class="
              form.tipo === tipo.value
                ? 'bg-surface-gray-3 ring-1 ring-outline-gray-4'
                : 'bg-surface-gray-2'
            "
          >
            <input
              v-model="form.tipo"
              type="radio"
              name="alta-tipo"
              :value="tipo.value"
              class="size-4"
            />
            <span class="flex min-w-0 flex-col">
              <span class="text-base text-ink-gray-9">{{ tipo.label }}</span>
              <span class="text-sm text-ink-gray-6">{{ tipo.hint }}</span>
            </span>
          </label>
        </fieldset>

        <label class="block space-y-1">
          <span class="text-sm text-ink-gray-7">{{
            __('Code on the label (optional)', null, CTX)
          }}</span>
          <input
            v-model="form.codigo"
            class="alta-campo num w-full"
            maxlength="60"
            autocomplete="off"
            data-alta-codigo
          />
        </label>

        <label class="block space-y-1">
          <span class="text-sm text-ink-gray-7">{{
            __('Notes (optional)', null, CTX)
          }}</span>
          <textarea
            v-model="form.notas"
            rows="2"
            maxlength="1000"
            class="alta-campo alta-area w-full py-2"
          />
        </label>

        <p
          v-if="problem"
          role="alert"
          class="text-sm text-ink-red-7"
          data-alta-problema
        >
          {{ problem }}
        </p>
      </form>
    </div>

    <div
      v-if="!sent"
      class="sticky bottom-0 border-t border-outline-gray-1 bg-surface-base px-4 py-3 sm:px-6"
    >
      <div class="mx-auto flex w-full max-w-xl flex-col gap-1">
        <button
          type="submit"
          form="alta-nueva"
          class="press min-h-11 w-full rounded-6 bg-[var(--muelle-accent)] px-4 text-base font-medium text-[var(--muelle-accent-ink)] disabled:opacity-50"
          :disabled="!ready || sending"
          data-alta-enviar
        >
          {{
            sending
              ? __('Sending…', null, CTX)
              : __('Send to review', null, CTX)
          }}
        </button>
        <p v-if="!ready" class="text-sm text-ink-gray-6" data-alta-falta>
          {{ missing }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { AppBar } from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import {
  CTX,
  altasApi,
  problemOf,
  requestId,
  sendAltaPhoto,
  tipos,
} from '@/composables/useAltas'

const t = (...args) => __(...args)
const tipoOptions = tipos(t)
const photoCap = ref(4)
const photos = ref([])
const form = reactive(blank())
const place = ref(null)
const placeSearch = ref('')
const places = ref([])
const sending = ref(false)
const sent = ref(false)
const problem = ref('')
let placeTimer = null
// One id per registration, so a retry after a lost answer never makes two.
let request = requestId()

function blank() {
  return { nombre: '', cantidad: 1, tipo: 'Para vender', codigo: '', notas: '' }
}

const ready = computed(
  () =>
    Number(form.cantidad) > 0 &&
    (photos.value.length > 0 || form.nombre.trim().length > 0),
)
const missing = computed(() =>
  Number(form.cantidad) > 0
    ? __('Take a photo or write what it is.', null, CTX)
    : __('Write how many there are.', null, CTX),
)

function pick(event) {
  const files = Array.from(event.target.files || [])
  for (const file of files) {
    if (photos.value.length >= photoCap.value) break
    photos.value.push({ file, url: URL.createObjectURL(file) })
  }
  event.target.value = ''
}

function removePhoto(index) {
  const [gone] = photos.value.splice(index, 1)
  if (gone) URL.revokeObjectURL(gone.url)
}

function findPlaces() {
  clearTimeout(placeTimer)
  placeTimer = setTimeout(loadPlaces, 250)
}

async function loadPlaces() {
  try {
    const answer = await altasApi('ubicaciones', { search: placeSearch.value })
    places.value = answer?.rows || []
  } catch {
    places.value = []
  }
}

function choosePlace(option) {
  place.value = option
  places.value = []
  placeSearch.value = ''
}

async function send() {
  if (!ready.value || sending.value) return
  sending.value = true
  problem.value = ''
  try {
    const { name } = await altasApi('proponer', {
      request_id: request,
      tipo: form.tipo,
      cantidad: Number(form.cantidad),
      nombre: form.nombre.trim(),
      ubicacion: place.value?.name || '',
      codigo: form.codigo.trim(),
      notas: form.notas.trim(),
    })
    for (const [index, photo] of photos.value.entries()) {
      if (!photo.sent) {
        await sendAltaPhoto(name, photo.file, {
          request: `${request}-foto-${index}`,
        })
        photo.sent = true
      }
    }
    await altasApi('enviar', { alta: name })
    sent.value = true
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    sending.value = false
  }
}

function reset() {
  for (const photo of photos.value) URL.revokeObjectURL(photo.url)
  photos.value = []
  Object.assign(form, blank())
  place.value = null
  sent.value = false
  problem.value = ''
  request = requestId()
}

onMounted(async () => {
  try {
    const boot = await altasApi('boot')
    photoCap.value = boot?.photo_cap || 4
  } catch {
    // The form works with the default cap; a refusal shows on «Enviar».
  }
  loadPlaces()
})
onBeforeUnmount(() => {
  clearTimeout(placeTimer)
  for (const photo of photos.value) URL.revokeObjectURL(photo.url)
})
</script>

<style scoped>
/* The shell's filled field: 44 px on a phone, 40 on a desk. */
.alta-campo {
  height: 2.75rem;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  background: var(--surface-gray-2);
  padding: 0 0.75rem;
  font-size: 1rem;
  color: var(--ink-gray-9);
}
.alta-campo:focus {
  outline: none;
  border-color: var(--outline-gray-4);
  background: var(--surface-base, transparent);
}
@media (min-width: 640px) {
  .alta-campo {
    height: 2.5rem;
  }
}
.alta-campo.alta-area {
  height: auto;
}
</style>
