<template>
  <!-- The file that goes with the next message: a photo's thumbnail, or a
       PDF's or XML's name and size, and a way to take it off before sending. -->
  <div
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
      <span class="block truncate text-sm font-medium text-ink-gray-9">{{
        file.name
      }}</span>
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

const props = defineProps({ file: { type: Object, required: true } })
defineEmits(['remove'])

const sizeText = computed(() => fileSizeText(props.file.size))
</script>
