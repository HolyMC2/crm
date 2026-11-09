<template>
  <!-- «Versiones» of the file open in the Lienzo (doco canvas.py keeps its
       first version and the newest ones). A tap shows that version in the
       viewer above; its row then says what it changed against the version
       before it and, for an earlier one, restores it as a new current
       version. The version it replaces stays in the history, so a restore is
       one tap. -->
  <section
    class="border-t border-outline-gray-1 p-1"
    :aria-label="__('Versions of {0}', [file.file])"
    data-testid="canvas-versions"
  >
    <div
      v-if="list.loading"
      class="space-y-2 p-3"
      aria-busy="true"
      :aria-label="__('Opening…')"
    >
      <div class="h-3 w-1/2 animate-pulse rounded bg-surface-gray-2" />
      <div class="h-3 w-2/3 animate-pulse rounded bg-surface-gray-2" />
    </div>
    <p v-else-if="list.error" role="alert" class="p-3 text-sm text-ink-red-7">
      {{ list.error }}
    </p>
    <ul v-else class="space-y-0.5">
      <li v-for="(row, index) in list.versions" :key="row.version">
        <button
          type="button"
          class="press flex min-h-12 w-full items-center gap-3 rounded-6 px-2 py-1.5 text-left text-sm"
          :class="
            row.version === shown
              ? 'bg-[var(--brand-soft)]'
              : 'hover:bg-surface-gray-2'
          "
          :aria-pressed="row.version === shown"
          :data-version="row.version"
          @click="pick(row)"
        >
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-2">
              <span class="truncate font-medium text-ink-gray-9">{{
                __('Version {0}', [row.version])
              }}</span>
              <span
                v-if="row.version === file.version"
                class="flex-none rounded-full bg-surface-gray-2 px-2 text-xs text-ink-gray-7"
                >{{ __('current', null, 'Lienzo') }}</span
              >
            </span>
            <span class="block truncate text-ink-gray-6">{{
              [relativeTime(row.modified), originLabel(row.origin), row.note]
                .filter(Boolean)
                .join(' · ')
            }}</span>
          </span>
        </button>
        <ExpandTransition>
          <div
            v-if="
              row.version === shown && (hasBefore(index) || !isCurrent(row))
            "
            class="space-y-2 px-2 pb-2 pt-1"
          >
            <div class="flex flex-wrap gap-2">
              <button
                v-if="hasBefore(index)"
                type="button"
                class="press min-h-11 rounded-full bg-surface-gray-2 px-4 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-3"
                :aria-expanded="changes.open"
                data-testid="canvas-compare"
                @click="toggleChanges(row)"
              >
                {{ changes.open ? __('Hide changes') : __('What changed') }}
              </button>
              <button
                v-if="!isCurrent(row)"
                type="button"
                class="press min-h-11 rounded-full bg-surface-gray-10 px-4 text-sm font-medium text-ink-base hover:bg-surface-gray-9 disabled:opacity-50"
                :disabled="restoring"
                data-testid="canvas-restore"
                @click="restore(row)"
              >
                {{ __('Restore this version') }}
              </button>
            </div>
            <ExpandTransition>
              <div v-if="changes.open">
                <div
                  v-if="changes.loading"
                  class="space-y-2 p-3"
                  aria-busy="true"
                  :aria-label="__('Opening…')"
                >
                  <div
                    class="h-3 w-2/3 animate-pulse rounded bg-surface-gray-2"
                  />
                  <div
                    class="h-3 w-1/2 animate-pulse rounded bg-surface-gray-2"
                  />
                </div>
                <p
                  v-else-if="changes.error"
                  role="alert"
                  class="text-sm text-ink-red-7"
                >
                  {{ changes.error }}
                </p>
                <AssistantCanvasChanges
                  v-else-if="changes.data"
                  :changes="changes.data"
                />
              </div>
            </ExpandTransition>
          </div>
        </ExpandTransition>
      </li>
    </ul>
    <p v-if="said" role="status" class="px-2 py-2 text-sm text-ink-gray-8">
      {{ said }}
    </p>
    <p v-if="failed" role="alert" class="px-2 py-2 text-sm text-ink-red-7">
      {{ failed }}
    </p>
  </section>
</template>
<script setup>
import { reactive, ref, watch } from 'vue'
import ExpandTransition from '@/components/ui/ExpandTransition.vue'
import { relativeTime } from '@/utils/display'
import AssistantCanvasChanges from './AssistantCanvasChanges.vue'
import {
  compareVersion,
  loadVersions,
  originLabel,
  restoreVersion,
} from './assistantCanvas'

const props = defineProps({
  /** the file as the Lienzo lists it: its current version */
  file: { type: Object, required: true },
  /** the version the viewer above shows */
  shown: { type: Number, required: true },
})
// a version picked: its row, or null for the current one
const emit = defineEmits(['view'])

const list = reactive({ loading: false, error: '', versions: [] })
const changes = reactive({ open: false, loading: false, error: '', data: null })
const restoring = ref(false)
const said = ref('')
const failed = ref('')

const isCurrent = (row) => row.version === props.file.version
// the list is newest first: the row after this one is the version before it
const hasBefore = (index) => index < list.versions.length - 1

let turn = 0
async function load() {
  const mine = ++turn
  list.loading = !list.versions.length
  const out = await loadVersions(props.file)
  if (mine !== turn) return
  Object.assign(list, {
    loading: false,
    error: out.error || '',
    versions: out.versions || [],
  })
}
// a new version (a restore, the assistant writing) lists itself
watch(() => `${props.file.file}@${props.file.version}`, load, {
  immediate: true,
})

watch(
  () => props.shown,
  () => {
    Object.assign(changes, {
      open: false,
      loading: false,
      error: '',
      data: null,
    })
    failed.value = ''
  },
)

function pick(row) {
  said.value = ''
  emit('view', isCurrent(row) ? null : row)
}

let asked = 0
async function toggleChanges(row) {
  if (changes.open) {
    changes.open = false
    return
  }
  changes.open = true
  if (changes.data || changes.loading) return
  const mine = ++asked
  changes.loading = true
  const out = await compareVersion(props.file, row.version)
  // another version picked while this one compared keeps the screen
  if (mine !== asked || row.version !== props.shown) return
  Object.assign(changes, {
    loading: false,
    error: out.error || '',
    data: out.changes || null,
  })
}

async function restore(row) {
  const replaced = props.file.version
  restoring.value = true
  failed.value = ''
  const out = await restoreVersion(props.file, row.version)
  restoring.value = false
  if (out.error) {
    failed.value = out.error
    return
  }
  said.value = out.unchanged
    ? __('The current version already has this content. Nothing new was saved.')
    : __('Restored as version {0}. Version {1} stays in the history.', [
        out.file.version,
        replaced,
      ])
  emit('view', null)
}
</script>
