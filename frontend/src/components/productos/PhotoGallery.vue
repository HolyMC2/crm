<template>
  <section
    id="fotos"
    class="relative scroll-mt-4 rounded-7 border bg-surface-base"
    :class="
      dropping
        ? 'border-[var(--muelle-accent)] ring-1 ring-[var(--muelle-accent)]'
        : 'border-outline-gray-2'
    "
    data-testid="producto-fotos"
    @dragenter="onDragOver"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <header
      class="flex flex-wrap items-center gap-2 border-b border-outline-gray-1 px-4 py-3"
    >
      <h2 class="flex-1 text-base font-semibold text-ink-gray-9">
        {{ __('Photos', null, CTX) }}
      </h2>
      <button
        v-if="photos.data.value?.can_share && photos.principal.value"
        type="button"
        class="press inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-2 sm:min-h-9"
        :disabled="sharing"
        :title="
          __('A ready-to-post image with photo, name and price', null, CTX)
        "
        data-testid="fotos-historia"
        @click="story"
      >
        <span
          :class="
            sharing ? 'lucide-loader-circle animate-spin' : 'lucide-share-2'
          "
          class="size-4"
          aria-hidden="true"
        />
        {{ __('Story image', null, CTX) }}
      </button>
    </header>

    <p
      v-if="photos.problem.value"
      role="alert"
      class="mx-4 mt-3 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
    >
      {{ photos.problem.value }}
    </p>
    <p
      v-if="photos.data.value && !canManage && photos.data.value.reason"
      class="mx-4 mt-3 text-sm text-ink-gray-6"
    >
      {{ photos.data.value.reason }}
    </p>

    <div
      v-if="!photos.data.value"
      class="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 p-4"
      aria-hidden="true"
    >
      <span
        v-for="n in 3"
        :key="n"
        class="aspect-square animate-pulse rounded-6 bg-surface-gray-2"
      />
    </div>
    <template v-else>
      <p
        v-if="!tiles.length && !canManage"
        class="px-4 py-4 text-sm text-ink-gray-6"
      >
        {{ __('No photos yet.', null, CTX) }}
      </p>
      <ul
        v-else
        class="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 p-4 md:grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]"
        data-testid="fotos-grid"
      >
        <li
          v-for="tile in tiles"
          :key="tile.key"
          class="relative aspect-square overflow-hidden rounded-6 bg-surface-gray-2 ring-1"
          :class="
            tile.principal
              ? 'ring-2 ring-[var(--muelle-accent)]'
              : 'ring-outline-gray-2'
          "
          :data-foto="tile.file_url || tile.key"
          :data-estado="tile.state"
        >
          <!-- The whole tile opens the picture full screen. -->
          <button
            type="button"
            class="press block size-full"
            :aria-label="tileLabel(tile)"
            :disabled="tile.state === 'failed'"
            @click="open(tile)"
          >
            <!-- A video shows its first frame under the play mark. -->
            <span
              v-if="tile.kind === 'video'"
              class="relative flex size-full items-center justify-center"
            >
              <video
                v-if="tile.state === 'saved'"
                :src="`${tile.file_url}#t=0.1`"
                class="absolute inset-0 size-full object-cover"
                preload="metadata"
                muted
                playsinline
                tabindex="-1"
                aria-hidden="true"
              />
              <span
                class="relative flex size-10 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <span class="lucide-play size-5" aria-hidden="true" />
              </span>
            </span>
            <img
              v-else
              :src="photos.tileSrc(tile)"
              alt=""
              class="size-full object-cover"
              :class="tile.state === 'failed' ? 'opacity-40' : ''"
              loading="lazy"
              decoding="async"
            />
          </button>
          <span
            v-if="tile.principal"
            class="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-[var(--muelle-accent)] px-2 py-0.5 text-xs font-semibold text-[var(--muelle-accent-ink)]"
            data-testid="foto-principal"
            >{{ __('Main', null, CTX) }}</span
          >
          <span
            v-if="tile.state === 'sending'"
            class="pointer-events-none absolute inset-x-1.5 bottom-1.5 rounded-full bg-black/70 px-2 py-0.5 text-center text-xs text-white"
            role="status"
          >
            {{
              tile.progress
                ? __('Uploading {0}%', [tile.progress])
                : __('Uploading…', null, CTX)
            }}
          </span>
          <template v-else-if="tile.state === 'failed'">
            <span
              class="absolute inset-x-1.5 top-1.5 rounded-6 bg-surface-red-1 px-2 py-1 text-xs text-ink-red-7"
              role="alert"
              >{{ tile.error || __('It was not uploaded.', null, CTX) }}</span
            >
            <span class="absolute inset-x-1.5 bottom-1.5 flex gap-1">
              <button
                type="button"
                class="press min-h-8 flex-1 rounded-full bg-surface-base px-2 text-xs font-semibold text-ink-gray-9 shadow-sm"
                @click="photos.retry(tile)"
              >
                {{ __('Retry', null, CTX) }}
              </button>
              <button
                type="button"
                class="press flex size-8 items-center justify-center rounded-full bg-surface-base text-ink-gray-8 shadow-sm"
                :aria-label="__('Remove', null, CTX)"
                :title="__('Remove', null, CTX)"
                @click="photos.remove(tile)"
              >
                <span class="lucide-x size-4" aria-hidden="true" />
              </button>
            </span>
          </template>
          <!-- A saved tile's tools: one small island in its corner. -->
          <span
            v-else-if="canManage"
            class="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-full bg-surface-base/90 p-0.5 shadow-sm"
          >
            <button
              v-if="confirming === tile.key"
              type="button"
              class="press min-h-8 rounded-full px-2.5 text-xs font-semibold text-ink-red-7"
              data-testid="foto-borrar-si"
              @click="confirmRemove(tile)"
            >
              {{ __('Delete', null, 'Lista') }}
            </button>
            <template v-else>
              <button
                v-if="tile.kind === 'image' && !tile.principal"
                type="button"
                class="press flex size-8 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2"
                :aria-label="__('Make main', null, CTX)"
                :title="__('Make main', null, CTX)"
                data-testid="foto-hacer-principal"
                @click="photos.makeMain(tile)"
              >
                <span class="lucide-star size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="press flex size-8 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2"
                :aria-label="__('Delete photo', null, CTX)"
                :title="__('Delete photo', null, CTX)"
                data-testid="foto-borrar"
                @click="confirming = tile.key"
              >
                <span class="lucide-trash-2 size-4" aria-hidden="true" />
              </button>
            </template>
          </span>
        </li>
        <li v-if="canManage" class="aspect-square">
          <button
            type="button"
            class="press flex size-full flex-col items-center justify-center gap-1.5 rounded-6 border border-dashed border-outline-gray-3 px-1 text-center text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-1"
            data-testid="fotos-agregar"
            @pointerenter="isPhone && loadCameraSheet()"
            @click="isPhone ? shoot() : pick()"
          >
            <span
              :class="isPhone ? 'lucide-camera' : 'lucide-image-plus'"
              class="size-6"
              aria-hidden="true"
            />
            {{
              isPhone ? __('Take photo') : __('Add photos or videos', null, CTX)
            }}
          </button>
        </li>
      </ul>
      <p v-if="canManage" class="px-4 pb-4 text-sm text-ink-gray-6">
        <button
          v-if="isPhone"
          type="button"
          class="press min-h-11 font-medium text-ink-gray-8 underline underline-offset-2"
          data-testid="fotos-galeria"
          @click="pick()"
        >
          {{ __('Choose from the gallery', null, CTX) }}
        </button>
        <template v-else>{{
          __('Or drop them here, or paste one you copied.', null, CTX)
        }}</template>
      </p>
    </template>

    <input
      ref="input"
      type="file"
      accept="image/*,video/mp4,video/quicktime,video/webm"
      multiple
      class="hidden"
      data-testid="fotos-input"
      @change="onPick"
    />

    <MediaViewer
      v-if="viewerWanted"
      v-model:open="viewerOpen"
      v-model:index="at"
      v-model:editing="editing"
      :items="photos.media.value"
      :title="title"
    >
      <template #actions="{ item: shown }">
        <template v-if="shown && shown.tile.state === 'saved'">
          <button
            v-if="canManage && shown.kind === 'image'"
            type="button"
            class="ui-viewer-action press"
            :class="shown.tile.principal ? 'is-on' : ''"
            :disabled="shown.tile.principal"
            data-testid="visor-principal"
            @click="photos.makeMain(shown.tile)"
          >
            <span class="lucide-star size-5" aria-hidden="true" />
            {{
              shown.tile.principal
                ? __('Main', null, CTX)
                : __('Make main', null, CTX)
            }}
          </button>
          <button
            v-if="canEdit && shown.kind === 'image'"
            type="button"
            class="ui-viewer-action press"
            data-testid="visor-editar"
            @click="editing = true"
          >
            <span class="lucide-pencil size-5" aria-hidden="true" />
            {{ __('Edit') }}
          </button>
          <button
            v-if="canEdit && shown.kind === 'image'"
            type="button"
            class="ui-viewer-action press"
            data-testid="visor-girar"
            @click="photos.turn(shown.tile)"
          >
            <span class="lucide-rotate-cw size-5" aria-hidden="true" />
            {{ __('Turn', null, CTX) }}
          </button>
          <button
            v-if="canManage"
            type="button"
            class="ui-viewer-action press"
            :class="confirming === shown.key ? 'is-danger' : ''"
            data-testid="visor-borrar"
            @click="
              confirming === shown.key
                ? confirmRemove(shown.tile)
                : (confirming = shown.key)
            "
          >
            <span class="lucide-trash-2 size-5" aria-hidden="true" />
            {{
              confirming === shown.key
                ? __('Yes, delete', null, CTX)
                : __('Delete', null, 'Lista')
            }}
          </button>
        </template>
        <p v-else-if="shown" class="py-3 text-sm text-white/80" role="status">
          {{ __('Uploading…', null, CTX) }}
        </p>
      </template>
      <template #editor="{ item: shown }">
        <PhotoEditor
          v-if="shown"
          :key="shown.key"
          :src="shown.url"
          @cancel="editing = false"
          @save="saveEdit(shown.tile, $event)"
        />
      </template>
    </MediaViewer>
  </section>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { toast } from 'frappe-ui'
import { mediaKind } from '@/components/ui/imageFiles'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { loadCameraSheet, openCamera } from '@/components/captura/cameraDoor'
import { CTX, problemOf, productosApi } from '@/composables/useProductos'

// A product's photos and videos, the principal first. Whoever keeps the
// catalogue adds (camera, gallery, a drop or a paste), chooses the principal
// with the star and deletes with the bin; a tap opens the picture full screen,
// where the same actions sit at the thumb and «Editar» crops, turns and
// lightens it. The story image is Mercado's (shown where it is installed).
const MediaViewer = defineAsyncComponent(
  () => import('@/components/ui/MediaViewer.vue'),
)
const PhotoEditor = defineAsyncComponent(
  () => import('@/components/ui/PhotoEditor.vue'),
)

const props = defineProps({
  /** The page's useProductPhotos(): the hero and this section share it. */
  photos: { type: Object, required: true },
  item: { type: String, required: true },
  title: { type: String, default: '' },
})

const tiles = computed(() => props.photos.tiles.value)
const canManage = computed(() => props.photos.canManage.value)
const canEdit = computed(() => props.photos.canEdit.value)

const input = ref(null)
const confirming = ref('')
const sharing = ref(false)

function tileLabel(tile) {
  const at = tiles.value.indexOf(tile) + 1
  return tile.kind === 'video'
    ? __('Open video {0}', [at], CTX)
    : __('Open photo {0}', [at], CTX)
}

// ── full screen ─────────────────────────────────────────────────────────
const viewerWanted = ref(false)
const viewerOpen = ref(false)
const editing = ref(false)
const at = ref(0)
function open(tile) {
  const found = props.photos.media.value.findIndex(
    (entry) => entry.key === (tile?.key ?? props.photos.principal.value?.key),
  )
  at.value = Math.max(0, found)
  confirming.value = ''
  viewerWanted.value = true
  viewerOpen.value = true
}
watch([at, viewerOpen], () => (confirming.value = ''))
function confirmRemove(tile) {
  confirming.value = ''
  props.photos.remove(tile)
}
function saveEdit(tile, { blob }) {
  editing.value = false
  props.photos.replace(tile, blob)
}
// A refusal while the picture is full screen is said over it.
watch(
  () => props.photos.problem.value,
  (problem) => {
    if (problem && viewerOpen.value) toast.error(problem)
  },
)

// ── adding ────────────────────────────────────────────────────────────────
let principalNext = false
function pick({ principal = false } = {}) {
  principalNext = principal
  input.value?.click()
}
function onPick(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (files.length) props.photos.add(files, { principal: principalNext })
  principalNext = false
}
// «Tomar foto»: the shell's camera hands back one picture and closes at once;
// the tile shows it while it goes up.
function shoot({ principal = false } = {}) {
  return openCamera({
    title: __('Product photo'),
    photo: true,
    onFiles: (files) => {
      props.photos.add(files, { principal })
      return true
    },
  })
}

const dropping = ref(false)
function carriesFiles(event) {
  return (
    canManage.value &&
    Array.from(event.dataTransfer?.types || []).includes('Files')
  )
}
function onDragOver(event) {
  if (!carriesFiles(event)) return
  event.preventDefault()
  dropping.value = true
}
function onDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) dropping.value = false
}
function onDrop(event) {
  if (!carriesFiles(event)) return
  event.preventDefault()
  dropping.value = false
  const files = Array.from(event.dataTransfer.files || [])
  if (files.length) props.photos.add(files)
}
// A copied picture (a screenshot, a supplier's photo) pastes straight in,
// unless the worker is typing somewhere.
function onPaste(event) {
  if (!canManage.value || viewerOpen.value) return
  if (event.target?.closest?.('input, textarea, [contenteditable="true"]'))
    return
  const files = Array.from(event.clipboardData?.files || []).filter((file) =>
    mediaKind(file.name, file.type),
  )
  if (!files.length) return
  event.preventDefault()
  props.photos.add(files)
}

async function story() {
  // Opened inside the click, so a popup blocker lets it through.
  const tab = window.open('', '_blank')
  sharing.value = true
  try {
    const answer = await productosApi('mercado.api.exports.build_item_share', {
      item_code: props.item,
      aspect: 'story',
    })
    if (answer?.file_url && tab) tab.location.href = answer.file_url
    else if (answer?.file_url) window.location.assign(answer.file_url)
    else tab?.close()
  } catch (error) {
    tab?.close()
    const found = problemOf(error)
    toast.error(found.detail || found.title)
  } finally {
    sharing.value = false
  }
}

watch(() => props.item, props.photos.load)
onMounted(() => {
  props.photos.load()
  document.addEventListener('paste', onPaste)
})
onBeforeUnmount(() => document.removeEventListener('paste', onPaste))
defineExpose({ open, pick, shoot })
</script>
