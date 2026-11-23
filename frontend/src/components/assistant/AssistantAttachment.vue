<template>
  <!-- A file that goes with the next message, and a way to take it off before
       sending. Alone it is a chip: a photo's thumbnail, or a PDF's or XML's
       name, with its size. Among several (`compact`) it is a square tile, so
       every file shows at once: the photo, or the file's icon and name. -->
  <div
    v-if="compact"
    class="relative size-16 flex-none"
    :title="file.name"
    data-testid="assistant-attachment"
  >
    <img
      v-if="file.previewUrl"
      :src="file.previewUrl"
      :alt="file.name"
      class="size-16 rounded-6 object-cover"
    />
    <span
      v-else
      class="flex size-16 flex-col items-center justify-center gap-1 rounded-6 bg-surface-gray-2 px-1.5"
    >
      <span
        class="lucide-file-text size-5 text-ink-gray-7"
        aria-hidden="true"
      />
      <span
        class="w-full truncate text-center text-xs text-ink-gray-7"
        data-testid="assistant-attachment-name"
        >{{ file.name }}</span
      >
    </span>
    <button
      type="button"
      class="absolute -right-3 -top-3 flex size-11 items-center justify-center"
      :aria-label="__('Remove file')"
      :title="__('Remove file')"
      data-testid="assistant-attachment-remove"
      @click="$emit('remove')"
    >
      <span
        class="ui-inverse flex size-6 items-center justify-center rounded-full shadow-sm"
      >
        <span class="lucide-x size-3.5" aria-hidden="true" />
      </span>
    </button>
  </div>
  <div
    v-else
    class="mx-2 mt-2 flex items-center gap-2 rounded-7 bg-surface-base p-1.5 shadow-sm"
    data-testid="assistant-attachment"
  >
    <img
      v-if="file.previewUrl"
      :src="file.previewUrl"
      :alt="file.name"
      class="size-11 flex-none rounded-6 object-cover"
    />
    <span
      v-else
      class="flex size-11 flex-none items-center justify-center rounded-6 bg-surface-gray-2"
      aria-hidden="true"
    >
      <span class="lucide-file-text size-5 text-ink-gray-7" />
    </span>
    <span class="min-w-0 flex-1">
      <span
        class="block truncate text-sm font-medium text-ink-gray-9"
        data-testid="assistant-attachment-name"
        >{{ file.name }}</span
      >
      <span class="block text-xs text-ink-gray-6">{{ sizeText }}</span>
    </span>
    <button
      type="button"
      class="flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
      :aria-label="__('Remove file')"
      :title="__('Remove file')"
      data-testid="assistant-attachment-remove"
      @click="$emit('remove')"
    >
      <span class="lucide-x size-4" aria-hidden="true" />
    </button>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { fileSizeText } from './assistantFiles'

const props = defineProps({
  file: { type: Object, required: true },
  compact: { type: Boolean, default: false },
})
defineEmits(['remove'])

const sizeText = computed(() => fileSizeText(props.file.size))
</script>
