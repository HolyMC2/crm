<!--
  MediaEditor — the composer's photo block (W6 B3 extract from SocialComposer). Owns the
  tile grid (multi-select add, remove, drag-to-reorder), the public unattached uploads
  (Meta fetches the URL, so never private — save_post adopts them server-side) AND the
  per-photo alt-text list (accesibilidad; save_post round-trips media alt_text). It edits
  the passed `media` array IN PLACE by reference (push/splice/mutate rows) — the parent's
  form.media and FB preview stay live off the same array, matching the props-carry-reactive
  idiom the B0 decompose established. Read-only once the post is live (canCancel=false).
-->
<template>
  <template v-if="media.length || canCancel">
    <label class="mb-1 block text-[11px] font-semibold text-ink-gray-6">{{ __('Fotos') }}</label>
    <div class="mb-1 flex flex-wrap gap-2">
      <div
        v-for="(m, i) in media" :key="m.media_file + ':' + i"
        class="group relative size-16 overflow-hidden rounded-md border"
        :class="mediaOver === i && mediaDrag !== i ? 'border-green-500 dark:border-green-400 ring-2 ring-green-300 dark:ring-green-500' : 'border-outline-gray-2'"
        :draggable="canCancel"
        :title="canCancel ? __('arrastra para ordenar') : ''"
        @dragstart="mediaDrag = i"
        @dragend="mediaDrag = -1; mediaOver = -1"
        @dragover.prevent="mediaOver = i"
        @dragleave="mediaOver = (mediaOver === i ? -1 : mediaOver)"
        @drop.prevent="onMediaDrop(i)"
      >
        <img :src="m.media_file" class="size-full object-cover" alt="" />
        <span v-if="media.length > 1" class="absolute bottom-0 left-0 rounded-tr bg-black/50 px-1 text-[9px] font-bold text-white">{{ i + 1 }}</span>
        <button
          v-if="canCancel" type="button"
          class="absolute right-0.5 top-0.5 hidden size-4 items-center justify-center rounded-full bg-black/60 text-[10px] leading-none text-white group-hover:flex"
          :title="__('Quitar foto')" @click="removeMedia(i)"
        >✕</button>
      </div>
      <button
        v-if="canCancel && media.length < 10" type="button"
        class="flex size-16 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-outline-gray-3 text-ink-gray-5 hover:border-green-500 dark:hover:border-green-400 hover:text-ink-green-3 disabled:opacity-50"
        :disabled="uploadBusy > 0" :title="__('Agregar fotos')" @click="pickMedia"
      >
        <span v-if="uploadBusy" class="px-1 text-[9.5px] font-semibold">{{ __('subiendo…') }}</span>
        <template v-else>
          <span class="text-lg leading-none">+</span>
          <span class="text-[9.5px] font-semibold">{{ __('Foto') }}</span>
        </template>
      </button>
    </div>
    <p class="mb-2 text-[10.5px] text-ink-gray-4">{{ __('Hasta 10 fotos (JPG/PNG). Varias fotos se publican como carrusel en FB.') }}</p>
    <input ref="mediaInput" type="file" accept="image/*" multiple class="hidden" @change="onMediaPick" />

    <!-- per-photo alt text (accesibilidad) — round-trips through save_post -->
    <template v-if="media.length">
      <label class="mb-0.5 block text-[11px] font-semibold text-ink-gray-6">{{ __('Texto alternativo') }}</label>
      <p class="mb-1.5 text-[10.5px] text-ink-gray-4">{{ __('Accesibilidad — describe la imagen.') }}</p>
      <div v-for="(m, i) in media" :key="'alt-' + m.media_file + ':' + i" class="mb-1.5 flex items-center gap-2">
        <img :src="m.media_file" class="size-8 flex-none rounded object-cover" alt="" />
        <input
          v-model="m.alt_text" type="text" :disabled="!canCancel"
          :data-testid="`alt-text-input-${i}`"
          class="w-full rounded-md border border-outline-gray-2 px-2 py-1 text-[12px] disabled:opacity-60"
          :placeholder="__('Foto') + ' ' + (i + 1) + ' — ' + __('describe la imagen…')"
        />
      </div>
    </template>
    <div class="mb-3" />
  </template>
</template>

<script setup>
import { ref } from 'vue'
import { toast, FileUploadHandler } from 'frappe-ui'

const props = defineProps({
  media: { type: Array, default: () => [] },
  canCancel: { type: Boolean, default: false },
})

const mediaInput = ref(null)
const uploadBusy = ref(0) // uploads in flight
function pickMedia() {
  mediaInput.value?.click()
}
async function onMediaPick(e) {
  const files = Array.from(e.target.files || [])
  e.target.value = '' // allow re-picking the same file
  const room = 10 - props.media.length
  if (files.length > room) toast.error(__('Máximo 10 fotos por publicación.'))
  for (const f of files.slice(0, Math.max(room, 0))) {
    if (!f.type.startsWith('image/')) {
      toast.error(__('Solo imágenes (JPG/PNG)') + ': ' + f.name)
      continue
    }
    uploadBusy.value++
    try {
      const up = await new FileUploadHandler().upload(f, { private: false })
      props.media.push({ media_file: up.file_url, media_type: 'Image', alt_text: '' })
    } catch {
      toast.error(__('No se pudo subir') + ': ' + f.name)
    } finally {
      uploadBusy.value--
    }
  }
}
function removeMedia(i) {
  props.media.splice(i, 1)
}
// drag-to-reorder tiles (same idiom as the calendar's drag-reschedule)
const mediaDrag = ref(-1)
const mediaOver = ref(-1)
function onMediaDrop(i) {
  const from = mediaDrag.value
  mediaDrag.value = -1
  mediaOver.value = -1
  if (from < 0 || from === i) return
  const arr = props.media
  arr.splice(i, 0, arr.splice(from, 1)[0])
}
</script>
