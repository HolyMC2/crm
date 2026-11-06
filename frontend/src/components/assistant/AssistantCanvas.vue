<template>
  <!-- «Lienzo»: the assistant's private files for this person (doco
       canvas.py), newest first. The one picked opens above the list in its
       viewer (AssistantCanvasFile: a page or PDF sandboxed, a table, notes,
       text). The composer stays below, so the person can ask about it. -->
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
    <ul v-else class="space-y-0.5">
      <li v-for="file in canvas.files" :key="file.file">
        <button
          type="button"
          class="press flex min-h-12 w-full items-center gap-3 rounded-6 px-2 py-1.5 text-left text-sm"
          :class="
            selected?.file === file.file
              ? 'bg-[var(--brand-soft)]'
              : 'hover:bg-surface-gray-2'
          "
          :aria-pressed="selected?.file === file.file"
          :data-canvas="file.file"
          @click="canvas.selected = file.file"
        >
          <span
            class="flex size-9 flex-none items-center justify-center rounded-6 bg-surface-gray-2 text-ink-gray-7"
            aria-hidden="true"
          >
            <span :class="kindIcon(file.kind)" class="size-4" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium text-ink-gray-9">{{
              file.file
            }}</span>
            <span class="block truncate text-ink-gray-6">{{
              [kindLabel(file.kind), file.note, relativeTime(file.modified)]
                .filter(Boolean)
                .join(' · ')
            }}</span>
          </span>
        </button>
      </li>
    </ul>
    <p v-if="canvas.error" role="alert" class="text-sm text-ink-red-7">
      {{ canvas.error }}
    </p>
  </div>
</template>
<script setup>
import { computed, onMounted } from 'vue'
import { relativeTime } from '@/utils/display'
import AssistantCanvasFile from './AssistantCanvasFile.vue'
import { canvas, kindLabel, loadCanvas } from './assistantCanvas'

defineProps({ docked: { type: Boolean, default: false } })

// icon classes stay literal: a class built at runtime is never generated
const ICONS = {
  html: 'lucide-file',
  pdf: 'lucide-file-text',
  png: 'lucide-image',
  jpg: 'lucide-image',
  csv: 'lucide-table',
  xlsx: 'lucide-table',
  ods: 'lucide-table',
  md: 'lucide-sticky-note',
  txt: 'lucide-file-text',
  json: 'lucide-file',
}
const kindIcon = (kind) => ICONS[kind] || 'lucide-file'

const selected = computed(
  () => canvas.files.find((f) => f.file === canvas.selected) || null,
)

// «/lienzo» from any door shows today's files, not the last list read
onMounted(() => canvas.loaded || loadCanvas())
</script>
