<template>
  <!-- A Lienzo file under the answer it came with, or the one open in the
       Lienzo view. HTML and PDF load in an iframe with an empty sandbox (no
       scripts, no same-origin) from canvas.preview, which sends its own CSP;
       an image is an <img> from the same door. In the Lienzo view a table
       (csv, xlsx, ods) and a text file (md, txt, json) are read through the
       facade and drawn here as text: a csv in a frame downloads instead of
       showing, and Markdown read raw is a wall of «#» and «**». There the
       file-and-clock button in the caption opens the file's versions under
       it (AssistantCanvasVersions); the viewer shows the version picked. -->
  <div
    class="overflow-hidden rounded-7 border border-outline-gray-2"
    :data-canvas-file="file.file"
  >
    <figure>
      <img
        v-if="isImage(shown)"
        :src="previewUrl(shown)"
        :alt="file.file"
        class="block w-full object-contain"
        :class="full ? 'max-h-[70vh]' : 'max-h-64'"
        loading="lazy"
        referrerpolicy="no-referrer"
      />
      <iframe
        v-else-if="canPreview(shown)"
        :key="`${shown.file}@${shown.version || 0}`"
        :src="previewUrl(shown)"
        :title="file.file"
        sandbox=""
        referrerpolicy="no-referrer"
        loading="lazy"
        class="block w-full border-0 bg-white"
        :class="full ? 'h-[60vh]' : 'h-56'"
        data-testid="canvas-frame"
      />
      <div
        v-else-if="full && read.loading"
        class="space-y-2 p-4"
        aria-busy="true"
        :aria-label="__('Opening…')"
      >
        <div class="h-3 w-2/3 animate-pulse rounded bg-surface-gray-2" />
        <div class="h-3 w-1/2 animate-pulse rounded bg-surface-gray-2" />
        <div class="h-3 w-3/4 animate-pulse rounded bg-surface-gray-2" />
      </div>
      <p
        v-else-if="full && read.error"
        role="alert"
        class="p-4 text-sm text-ink-red-7"
      >
        {{ read.error }}
      </p>
      <div
        v-else-if="full && read.grid"
        class="max-h-[60vh] overflow-auto"
        data-testid="canvas-table"
      >
        <p
          v-if="!read.grid.columns?.length"
          class="p-4 text-sm text-ink-gray-6"
        >
          {{ __('This table is empty.') }}
        </p>
        <table v-else class="w-full text-left text-sm">
          <thead class="sticky top-0 bg-surface-gray-1 text-ink-gray-6">
            <tr>
              <th
                v-for="(column, c) in read.grid.columns"
                :key="c"
                scope="col"
                class="whitespace-nowrap px-3 py-2 font-medium"
                :class="figures[c] && 'text-right'"
              >
                {{ column }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-gray-1">
            <tr v-for="(row, r) in read.grid.rows" :key="r">
              <td
                v-for="(cell, c) in row"
                :key="c"
                class="whitespace-nowrap px-3 py-1.5 text-ink-gray-9"
                :class="figures[c] && 'num text-right'"
              >
                {{ cell }}
              </td>
            </tr>
          </tbody>
        </table>
        <p
          v-if="read.grid.truncated"
          class="border-t border-outline-gray-1 px-3 py-2 text-xs text-ink-gray-6"
        >
          {{
            __('Showing {0} of {1} rows. Download it for all of them.', [
              read.grid.rows.length,
              read.grid.total_rows,
            ])
          }}
        </p>
      </div>
      <div
        v-else-if="full && shown.kind === 'md' && read.text != null"
        class="max-h-[60vh] overflow-auto p-4"
        data-testid="canvas-notes"
      >
        <AssistantProse :text="read.text" />
      </div>
      <pre
        v-else-if="full && read.text != null"
        class="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-sm text-ink-gray-9"
        data-testid="canvas-text"
        >{{ shown.kind === 'json' ? prettyJson(read.text) : read.text }}</pre
      >
      <p v-else-if="full" class="p-4 text-sm text-ink-gray-6">
        {{ __('This file only downloads. Use the button below.') }}
      </p>
      <figcaption
        class="flex min-h-11 items-center gap-1 border-t border-outline-gray-1 pl-3 pr-1 text-sm"
      >
        <span class="min-w-0 flex-1">
          <span class="block truncate text-ink-gray-8">{{ file.file }}</span>
          <span v-if="full" class="block truncate text-xs text-ink-gray-6">{{
            [
              kindLabel(shown.kind),
              viewing
                ? __('version {0}, an earlier one', [viewing.version])
                : file.version > 1 && __('version {0}', [file.version]),
            ]
              .filter(Boolean)
              .join(' · ')
          }}</span>
        </span>
        <a
          :href="downloadUrl(shown)"
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
        <template v-else>
          <button
            v-if="file.version > 1"
            type="button"
            class="press flex size-11 flex-none items-center justify-center rounded-full hover:bg-surface-gray-2"
            :class="
              history ? 'bg-surface-gray-2 text-ink-gray-9' : 'text-ink-gray-7'
            "
            :aria-expanded="history"
            :aria-label="__('Versions of {0}', [file.file])"
            :title="__('Versions')"
            data-testid="canvas-history"
            @click="history = !history"
          >
            <span class="lucide-file-clock size-4" aria-hidden="true" />
          </button>
          <!-- a small delete is two taps in place: the bin, then «Borrar» -->
          <button
            v-if="!confirming"
            type="button"
            class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
            :aria-label="__('Delete {0}', [file.file])"
            :title="__('Delete')"
            data-testid="canvas-delete"
            @click="confirming = true"
          >
            <span class="lucide-trash-2 size-4" aria-hidden="true" />
          </button>
          <button
            v-else
            ref="confirm"
            type="button"
            class="press min-h-11 flex-none rounded-full bg-surface-red-2 px-3 font-medium text-ink-red-7 hover:bg-surface-red-3"
            data-testid="canvas-delete-confirm"
            @click="remove"
            @blur="confirming = false"
          >
            {{ __('Delete') }}
          </button>
        </template>
      </figcaption>
    </figure>
    <ExpandTransition>
      <AssistantCanvasVersions
        v-if="full && history"
        :file="file"
        :shown="shown.version"
        @view="viewing = $event"
      />
    </ExpandTransition>
  </div>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  nextTick,
  reactive,
  ref,
  watch,
} from 'vue'
import ExpandTransition from '@/components/ui/ExpandTransition.vue'
import AssistantProse from './AssistantProse.vue'
import {
  canPreview,
  deleteFile,
  downloadUrl,
  isFigure,
  isImage,
  kindLabel,
  prettyJson,
  previewUrl,
  readFile,
} from './assistantCanvas'

const props = defineProps({
  /** { file, version, kind } */
  file: { type: Object, required: true },
  /** the Lienzo view: taller, read in place, no «Abrir en Lienzo» */
  full: { type: Boolean, default: false },
})
defineEmits(['open'])

// the versions mount on their first open
const AssistantCanvasVersions = defineAsyncComponent(
  () => import('./AssistantCanvasVersions.vue'),
)
const history = ref(false)
/** an earlier version picked in «Versiones»; null shows the current one */
const viewing = ref(null)
const shown = computed(() =>
  viewing.value ? { ...props.file, ...viewing.value } : props.file,
)
// another file closes them; a new version (restored, or written by the
// assistant) shows itself
watch(
  () => props.file.file,
  () => {
    history.value = false
    viewing.value = null
  },
)
watch(
  () => props.file.version,
  () => (viewing.value = null),
)

const confirming = ref(false)
const confirm = ref(null)
watch(confirming, (on) => on && nextTick(() => confirm.value?.focus()))

const read = reactive({ loading: false, error: '', grid: null, text: null })
let turn = 0
watch(
  () => props.full && `${shown.value.file}@${shown.value.version || 0}`,
  async (key) => {
    Object.assign(read, { loading: false, error: '', grid: null, text: null })
    confirming.value = false
    const file = shown.value
    if (!key || canPreview(file) || isImage(file)) return
    const mine = ++turn
    read.loading = true
    const out = await readFile(file)
    // a file picked while this one loaded keeps the screen
    if (mine !== turn) return
    Object.assign(
      read,
      { loading: false, error: '', grid: null, text: null },
      out,
    )
  },
  { immediate: true },
)

// a column of amounts or counts lines up on the right, its heading too
const figures = computed(() => {
  const rows = read.grid?.rows || []
  return (read.grid?.columns || []).map(
    (_, c) =>
      rows.some((row) => isFigure(row[c])) &&
      rows.every((row) => row[c] === '' || row[c] == null || isFigure(row[c])),
  )
})

async function remove() {
  confirming.value = false
  await deleteFile(props.file)
}
</script>
