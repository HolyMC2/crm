<!--
  MusicPanel — «Música» in the composer. Two honest ways to give a post music:
  · a song of the shop's own (Social Music Track, with where its permission comes from):
    «Hacer reel con música» renders a Reel on the server (ffmpeg) and aims it at the
    post's Reel channels, the feed keeps its picture;
  · the platform's music library, which Meta's API cannot attach: «La publico a mano
    con música de la app» marks the post to be published by a person in the app.
  A new song is uploaded here with its rights line. Emits `changed` / `manual`.
-->
<template>
  <section class="mb-4" data-testid="music-panel">
    <h3 class="mb-1.5 text-[12px] font-semibold text-ink-gray-7">
      {{ __('Música') }}
    </h3>
    <p
      v-if="trackName || reel"
      class="mb-2 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-gray-8"
    >
      <span class="lucide-music size-4 text-ink-gray-6" aria-hidden="true" />
      <span class="min-w-0 flex-1">
        {{
          trackName ? __('Reel con «{0}»', [trackName]) : __('Reel sin música')
        }}
      </span>
      <button
        v-if="editable"
        type="button"
        class="press min-h-9 rounded-6 px-2.5 text-[12px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
        :disabled="busy"
        @click="remove"
      >
        {{ __('Quitar reel') }}
      </button>
    </p>
    <template v-if="editable">
      <p v-if="loading" class="text-[12px] text-ink-gray-5">
        {{ __('Cargando canciones…') }}
      </p>
      <template v-else>
        <ul
          v-if="tracks.length"
          class="mb-2 divide-y divide-outline-gray-1 rounded-7 border border-outline-gray-2"
          role="radiogroup"
          :aria-label="__('Canciones de la tienda')"
        >
          <li v-for="t in tracks" :key="t.name">
            <label
              class="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-1.5"
            >
              <input
                v-model="chosen"
                type="radio"
                name="song"
                :value="t.name"
                class="size-4"
              />
              <span class="min-w-0 flex-1">
                <span class="block text-[13px] text-ink-gray-9">{{
                  t.track_name
                }}</span>
                <span class="line-clamp-1 block text-[11px] text-ink-gray-5">{{
                  t.rights
                }}</span>
              </span>
              <span class="num text-[11.5px] text-ink-gray-6">{{
                songLength(t.duration)
              }}</span>
              <button
                type="button"
                class="press flex size-9 items-center justify-center rounded-full hover:bg-surface-gray-2"
                :aria-label="
                  playing === t.name ? __('Detener') : __('Escuchar')
                "
                :title="playing === t.name ? __('Detener') : __('Escuchar')"
                @click.prevent="listen(t)"
              >
                <span
                  :class="playing === t.name ? 'lucide-square' : 'lucide-play'"
                  class="size-4 text-ink-gray-7"
                  aria-hidden="true"
                />
              </button>
            </label>
          </li>
        </ul>
        <p v-else class="mb-2 text-[12px] text-ink-gray-6">
          {{
            __(
              'La tienda aún no tiene canciones propias. Sube una con permiso para redes, o publícala a mano con música de la app.',
            )
          }}
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="press min-h-10 rounded-6 bg-surface-gray-10 px-3 text-[12.5px] font-semibold text-ink-base disabled:opacity-50"
            :disabled="busy || !canRender"
            data-testid="make-reel"
            @click="makeReel"
          >
            {{
              busy
                ? __('Armando el reel…')
                : chosen
                  ? __('Hacer reel con esta canción')
                  : __('Hacer reel sin música')
            }}
          </button>
          <button
            v-if="!manual"
            type="button"
            class="press min-h-10 rounded-6 px-3 text-[12.5px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
            @click="$emit('manual', true)"
          >
            {{ __('La publico a mano con música de la app') }}
          </button>
          <button
            type="button"
            class="press min-h-10 rounded-6 px-3 text-[12.5px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
            @click="adding = !adding"
          >
            {{ __('Subir canción') }}
          </button>
        </div>
        <p v-if="!canRender" class="mt-1 text-[11px] text-ink-gray-5">
          {{
            __(
              'Este servidor no puede armar reels todavía; publícala a mano con música de la app.',
            )
          }}
        </p>
        <div
          v-if="adding"
          class="mt-2.5 space-y-2 rounded-7 border border-outline-gray-2 p-2.5"
        >
          <label class="block text-[12px] text-ink-gray-7"
            >{{ __('Nombre de la canción') }}
            <input
              v-model="song.name"
              type="text"
              class="mt-1 h-10 w-full rounded-6 bg-surface-gray-2 px-3 text-[13px]"
            />
          </label>
          <label class="block text-[12px] text-ink-gray-7"
            >{{ __('De dónde es y con qué permiso se usa') }}
            <input
              v-model="song.rights"
              type="text"
              class="mt-1 h-10 w-full rounded-6 bg-surface-gray-2 px-3 text-[13px]"
              :placeholder="
                __(
                  'Ej: licencia comercial de Epidemic Sound; grabada por la tienda',
                )
              "
            />
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="press min-h-10 rounded-6 px-3 text-[12.5px] font-semibold text-ink-gray-7 hover:bg-surface-gray-2"
              @click="fileInput?.click()"
            >
              {{ song.file ? song.file.name : __('Elegir archivo de audio') }}
            </button>
            <button
              type="button"
              class="press ml-auto min-h-10 rounded-6 bg-surface-gray-10 px-3 text-[12.5px] font-semibold text-ink-base disabled:opacity-50"
              :disabled="
                uploading ||
                !song.file ||
                !song.name.trim() ||
                !song.rights.trim()
              "
              @click="upload"
            >
              {{ uploading ? __('Subiendo…') : __('Guardar canción') }}
            </button>
          </div>
          <p class="text-[11px] text-ink-gray-5">
            {{
              __(
                'Solo música que la tienda puede usar en redes. Una canción comercial sin licencia puede hacer que Meta silencie o quite el post.',
              )
            }}
          </p>
          <input
            ref="fileInput"
            type="file"
            accept="audio/*"
            class="hidden"
            @change="onFile"
          />
        </div>
      </template>
    </template>
  </section>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { call, toast, FileUploadHandler } from 'frappe-ui'
import { errorText } from '@/utils/errorText'
import { songLength } from '@/composables/socialDaily'

const props = defineProps({
  postName: { type: String, required: true },
  shop: { type: String, default: '' },
  trackName: { type: String, default: '' },
  reel: { type: Boolean, default: false },
  manual: { type: Boolean, default: false },
  editable: { type: Boolean, default: true },
})
const emit = defineEmits(['changed', 'manual'])

const tracks = ref([])
const canRender = ref(true)
const loading = ref(false)
const busy = ref(false)
const chosen = ref('')
const playing = ref('')
const adding = ref(false)
const uploading = ref(false)
const fileInput = ref(null)
const song = ref({ name: '', rights: '', file: null })
let audio = null

async function load() {
  loading.value = true
  try {
    const r = await call('doco_marketing.api.social_taller.music_tracks', {
      shop: props.shop || undefined,
    })
    tracks.value = r?.tracks || []
    canRender.value = r?.can_render !== false
  } catch (e) {
    toast.error(errorText(e, __('No se pudieron cargar las canciones.')))
  } finally {
    loading.value = false
  }
}
onMounted(() => props.editable && load())

function stop() {
  audio?.pause()
  audio = null
  playing.value = ''
}
onBeforeUnmount(stop)
function listen(t) {
  if (playing.value === t.name) return stop()
  stop()
  audio = new Audio(t.audio)
  audio.addEventListener('ended', stop)
  audio.play().catch(stop)
  playing.value = t.name
}

async function makeReel() {
  busy.value = true
  stop()
  try {
    await call('doco_marketing.api.social_taller.make_reel', {
      post: props.postName,
      track: chosen.value || undefined,
    })
    toast.success(__('Reel listo'))
    emit('changed')
  } catch (e) {
    toast.error(errorText(e, __('No se pudo armar el reel.')))
  } finally {
    busy.value = false
  }
}

async function remove() {
  busy.value = true
  try {
    await call('doco_marketing.api.social_taller.remove_reel', {
      post: props.postName,
    })
    toast.success(__('Reel quitado'))
    emit('changed')
  } catch (e) {
    toast.error(errorText(e, __('No se pudo quitar el reel.')))
  } finally {
    busy.value = false
  }
}

function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (!file.type.startsWith('audio/')) {
    toast.error(__('Elige un archivo de audio (mp3, m4a, wav).'))
    return
  }
  song.value.file = file
  if (!song.value.name.trim())
    song.value.name = file.name.replace(/\.[^.]+$/, '')
}

async function upload() {
  uploading.value = true
  try {
    const up = await new FileUploadHandler().upload(song.value.file, {
      private: false,
    })
    const r = await call('doco_marketing.api.social_taller.add_music_track', {
      track_name: song.value.name.trim(),
      audio: up.file_url,
      rights: song.value.rights.trim(),
      shop: props.shop || undefined,
    })
    toast.success(__('Canción guardada'))
    song.value = { name: '', rights: '', file: null }
    adding.value = false
    await load()
    chosen.value = r?.name || ''
  } catch (e) {
    toast.error(errorText(e, __('No se pudo guardar la canción.')))
  } finally {
    uploading.value = false
  }
}
</script>
