<template>
  <!-- «Lienzo»: the assistant's private files for this person (doco
       canvas.py), newest first. One opens below the list in the sandboxed
       viewer; xlsx and ods only download. -->
  <div
    class="space-y-3 py-2"
    :class="
      docked ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4' : ''
    "
    data-testid="assistant-canvas-view"
  >
    <AssistantCanvasFile v-if="selected" :file="selected" full />

    <p
      v-if="canvas.loaded && !canvas.files.length"
      class="pt-4 text-center text-sm text-ink-gray-6"
      data-testid="assistant-canvas-empty"
    >
      {{
        __(
          'The Lienzo is empty. Ask Muelle for a chart or a table and it shows up here and under its answer.',
        )
      }}
    </p>
    <ul v-else class="divide-y divide-outline-gray-1">
      <li v-for="file in canvas.files" :key="file.file">
        <button
          type="button"
          class="press flex min-h-11 w-full items-center gap-3 py-2 text-left text-sm hover:bg-surface-gray-2"
          :class="{ 'bg-surface-gray-2': selected?.file === file.file }"
          :aria-pressed="selected?.file === file.file"
          :data-canvas="file.file"
          @click="canvas.selected = file.file"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium text-ink-gray-9">{{
              file.file
            }}</span>
            <span class="block truncate text-ink-gray-6">{{
              [file.note, relativeTime(file.modified)]
                .filter(Boolean)
                .join(' · ')
            }}</span>
          </span>
          <span class="shrink-0 text-xs text-ink-gray-6">{{ file.kind }}</span>
        </button>
      </li>
    </ul>
    <p v-if="canvas.error" role="alert" class="text-sm text-ink-red-7">
      {{ canvas.error }}
    </p>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { relativeTime } from '@/utils/display'
import AssistantCanvasFile from './AssistantCanvasFile.vue'
import { canvas } from './assistantCanvas'

defineProps({ docked: { type: Boolean, default: false } })

const selected = computed(
  () => canvas.files.find((f) => f.file === canvas.selected) || null,
)
</script>
