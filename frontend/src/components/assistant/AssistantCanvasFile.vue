<template>
  <!-- A Lienzo file under the answer it came with, or the one open in the
       Lienzo view. HTML and PDF load in an iframe with an empty sandbox (no
       scripts, no same-origin) from canvas.preview, which sends its own CSP;
       an image is an <img> from the same door. -->
  <figure
    class="overflow-hidden rounded-7 border border-outline-gray-2"
    :data-canvas-file="file.file"
  >
    <img
      v-if="isImage(file)"
      :src="previewUrl(file)"
      :alt="file.file"
      class="block w-full object-contain"
      :class="full ? 'max-h-[70vh]' : 'max-h-64'"
      loading="lazy"
      referrerpolicy="no-referrer"
    />
    <iframe
      v-else-if="canPreview(file)"
      :src="previewUrl(file)"
      :title="file.file"
      sandbox=""
      referrerpolicy="no-referrer"
      loading="lazy"
      class="block w-full border-0 bg-white"
      :class="full ? 'h-[60vh]' : 'h-56'"
      data-testid="canvas-frame"
    />
    <figcaption
      class="flex min-h-11 items-center gap-1 border-t border-outline-gray-1 pl-3 pr-1 text-sm"
    >
      <span
        class="lucide-file-text size-4 flex-none text-ink-gray-6"
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1 truncate text-ink-gray-8">{{
        file.file
      }}</span>
      <a
        :href="downloadUrl(file)"
        class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
        :aria-label="__('Download')"
        :title="__('Download')"
        download
      >
        <span class="lucide-download size-4" aria-hidden="true" />
      </a>
      <button
        v-if="!full"
        type="button"
        class="press min-h-11 flex-none rounded-full px-3 font-medium text-ink-gray-9 hover:bg-surface-gray-2"
        data-testid="canvas-open"
        @click="$emit('open', file)"
      >
        {{ __('Open in Lienzo') }}
      </button>
    </figcaption>
  </figure>
</template>
<script setup>
import { canPreview, downloadUrl, isImage, previewUrl } from './assistantCanvas'

defineProps({
  /** { file, version, kind } */
  file: { type: Object, required: true },
  /** the Lienzo view: taller, no «Abrir en Lienzo» */
  full: { type: Boolean, default: false },
})
defineEmits(['open'])
</script>
