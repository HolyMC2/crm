<!-- Vendored from muelle/workspace/packages/ui@0.1.0 (7f554d4509b6). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<template>
  <!-- The quick fixes a shop photo needs, on the worker's own device: turn it,
       mirror it, crop it (the frame is on from the start; a shape is one tap)
       and give it light. Nothing waits on the server: every change shows at
       once, and «Guardar foto» draws the result once and hands it to the
       screen that opened the editor (@save, a Blob), which uploads it.
       Tools and the two buttons sit at the bottom, in thumb reach. Built for
       the viewer's black (MediaViewer #editor); it fills its container. -->
  <section
    class="flex h-full min-h-0 flex-col bg-black text-white"
    :aria-label="t('Edit photo')"
    data-ui-editor
  >
    <div ref="stage" class="relative min-h-0 flex-1 touch-none select-none">
      <p
        v-if="problem"
        role="alert"
        class="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/80"
      >
        {{ problem }}
      </p>
      <p
        v-else-if="!picture"
        class="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/70"
        aria-busy="true"
      >
        <span
          class="lucide-loader-circle size-5 animate-spin"
          aria-hidden="true"
        />
        {{ t('Opening the photo…') }}
      </p>
      <div
        v-show="picture && !problem"
        class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden"
        :style="boxStyle"
        data-ui-editor-box
      >
        <canvas
          ref="canvas"
          class="block h-full w-full"
          :style="{ filter: `brightness(${gain})` }"
        />
        <div
          class="ui-editor-crop"
          :style="cropStyle"
          role="group"
          :aria-label="t('Crop area')"
          data-ui-editor-crop
          @pointerdown="grab('move', $event)"
          @pointermove="drag"
          @pointerup="drop"
          @pointercancel="drop"
        >
          <span
            v-for="corner in CORNERS"
            :key="corner"
            class="ui-editor-corner"
            :class="`is-${corner}`"
            :data-ui-editor-corner="corner"
            aria-hidden="true"
            @pointerdown.stop="grab(corner, $event)"
            @pointermove="drag"
            @pointerup="drop"
            @pointercancel="drop"
          />
        </div>
      </div>
    </div>

    <!-- The controls keep to a column a hand covers, also on a wide screen. -->
    <div class="mx-auto w-full max-w-xl flex-none space-y-2 px-3 pb-1 pt-2">
      <p
        class="min-h-5 text-center text-xs text-white/70"
        data-ui-editor-hint
      >
        {{ edited ? '' : t('Drag the corners to crop.') }}
      </p>
      <label class="flex items-center gap-3 px-1">
        <span class="lucide-sun size-5 flex-none" aria-hidden="true" />
        <span class="sr-only">{{ t('Brightness') }}</span>
        <input
          v-model.number="edit.light"
          type="range"
          class="ui-editor-range min-w-0 flex-1"
          :min="-LIGHT_RANGE"
          :max="LIGHT_RANGE"
          step="5"
          :disabled="!picture"
          data-ui-editor-light
        />
      </label>
      <div class="ui-editor-tools">
        <button
          type="button"
          class="ui-editor-tool press"
          :aria-label="t('Turn left')"
          :title="t('Turn left')"
          :disabled="!picture"
          data-ui-editor-tool="left"
          @click="turn(-1)"
        >
          <span class="lucide-rotate-ccw size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="ui-editor-tool press"
          :aria-label="t('Turn right')"
          :title="t('Turn right')"
          :disabled="!picture"
          data-ui-editor-tool="right"
          @click="turn(1)"
        >
          <span class="lucide-rotate-cw size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="ui-editor-tool press"
          :aria-label="t('Mirror photo')"
          :title="t('Mirror photo')"
          :disabled="!picture"
          data-ui-editor-tool="mirror"
          @click="mirror"
        >
          <span class="lucide-flip-horizontal size-5" aria-hidden="true" />
        </button>
        <span class="ui-editor-rule" aria-hidden="true" />
        <span role="group" :aria-label="t('Crop shape')" class="contents">
          <button
            v-for="shape in SHAPES"
            :key="shape.key"
            type="button"
            class="ui-editor-shape press"
            :aria-pressed="String(isShape(shape))"
            :disabled="!picture"
            :data-ui-editor-shape="shape.key"
            @click="setShape(shape)"
          >
            {{ shape.label ? t(shape.label) : shape.key }}
          </button>
        </span>
        <button
          v-if="edited"
          type="button"
          class="ui-editor-tool press"
          :aria-label="t('Undo changes')"
          :title="t('Undo changes')"
          data-ui-editor-tool="undo"
          @click="reset"
        >
          <span class="lucide-undo-2 size-5" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div
      class="mx-auto flex w-full max-w-xl flex-none items-center gap-2 px-3 pb-1 pt-2"
    >
      <button
        type="button"
        class="ui-editor-plain press"
        data-ui-editor-cancel
        @click="emit('cancel')"
      >
        {{ t('Cancel') }}
      </button>
      <span class="flex-1" />
      <button
        type="button"
        class="ui-editor-save press"
        :disabled="!edited || saving || !picture"
        data-ui-editor-save
        @click="save"
      >
        <span
          v-if="saving"
          class="lucide-loader-circle size-5 animate-spin"
          aria-hidden="true"
        />
        {{ t('Save photo') }}
      </button>
    </div>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from './mediaWords'
import { fitWithin, openImage } from './imageFiles'
import {
  LIGHT_RANGE,
  bakeEdit,
  dragCrop,
  flipEdit,
  isEdited,
  lightGain,
  newEdit,
  paintTurned,
  shapeEdit,
  shownSize,
  turnEdit,
} from './imageEdit'

const props = defineProps({
  /** The picture to edit: a URL of this origin, or a Blob or File. */
  src: { type: [String, Object], required: true },
  /** How to read it (tests pass their own). Resolves what openImage does. */
  reader: { type: Function, default: null },
})
const emit = defineEmits(['cancel', 'save'])

const CORNERS = ['nw', 'ne', 'sw', 'se']
// width ÷ height; 0 is free.
const SHAPES = [
  { key: 'free', ratio: 0, label: 'Free crop' },
  { key: 'square', ratio: 1, label: 'Square crop' },
  { key: '4:3', ratio: 4 / 3 },
  { key: '16:9', ratio: 16 / 9 },
]
// The preview is drawn small; the saved file is drawn from the full picture.
const PREVIEW_SIDE = 1400
const MARGIN = 16

const stage = ref(null)
const canvas = ref(null)
const picture = ref(null)
const problem = ref('')
const saving = ref(false)
const edit = ref(newEdit())
const room = ref({ width: 0, height: 0 })

const edited = computed(() => isEdited(edit.value))
const gain = computed(() => lightGain(edit.value.light))
const shown = computed(() =>
  picture.value
    ? shownSize(picture.value.width, picture.value.height, edit.value.turns)
    : { width: 1, height: 1 },
)
// The picture as it shows, fitted to the stage with room for the corners.
const box = computed(() => {
  const maxW = Math.max(1, room.value.width - MARGIN * 2)
  const maxH = Math.max(1, room.value.height - MARGIN * 2)
  const ratio = Math.min(maxW / shown.value.width, maxH / shown.value.height)
  return {
    width: shown.value.width * ratio,
    height: shown.value.height * ratio,
  }
})
const boxStyle = computed(() => ({
  width: `${box.value.width}px`,
  height: `${box.value.height}px`,
}))
const cropStyle = computed(() => {
  const { x, y, w, h } = edit.value.crop
  return {
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    width: `${w * 100}%`,
    height: `${h * 100}%`,
  }
})

function read() {
  return props.reader ? props.reader(props.src) : openImage(props.src)
}

function paint() {
  const el = canvas.value
  const pic = picture.value
  if (!el || !pic) return
  const size = fitWithin(shown.value.width, shown.value.height, PREVIEW_SIDE)
  el.width = size.width
  el.height = size.height
  const ctx = el.getContext?.('2d')
  if (!ctx) return
  const scale = size.width / shown.value.width
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.imageSmoothingQuality = 'high'
  paintTurned(
    ctx,
    pic.source,
    pic.width,
    pic.height,
    edit.value.turns,
    edit.value.flip,
  )
}
watch(() => [edit.value.turns, edit.value.flip, picture.value], paint, {
  flush: 'post',
})

function turn(by) {
  edit.value = turnEdit(edit.value, by)
}
function mirror() {
  edit.value = flipEdit(edit.value)
}
function isShape(shape) {
  return Math.abs((edit.value.ratio || 0) - shape.ratio) < 1e-3
}
function setShape(shape) {
  const pic = picture.value
  if (!pic) return
  edit.value = shapeEdit(edit.value, shape.ratio, pic.width, pic.height)
}
function reset() {
  edit.value = newEdit()
}

// ── the crop frame under the finger ─────────────────────────────────────
let held = null
function grab(handle, event) {
  if (!picture.value || (event.pointerType === 'mouse' && event.button !== 0))
    return
  event.currentTarget.setPointerCapture?.(event.pointerId)
  held = {
    handle,
    x: event.clientX,
    y: event.clientY,
    crop: { ...edit.value.crop },
    id: event.pointerId,
  }
}
function drag(event) {
  if (!held || held.id !== event.pointerId) return
  const dx = (event.clientX - held.x) / (box.value.width || 1)
  const dy = (event.clientY - held.y) / (box.value.height || 1)
  // The fixed shape in the frame's own fractions of the picture.
  const shape = edit.value.ratio
    ? (edit.value.ratio * shown.value.height) / shown.value.width
    : 0
  edit.value = {
    ...edit.value,
    crop: dragCrop(held.crop, held.handle, dx, dy, shape),
  }
}
function drop(event) {
  if (held?.id === event.pointerId) held = null
}

async function save() {
  const pic = picture.value
  if (!pic || saving.value || !edited.value) return
  saving.value = true
  try {
    const type = pic.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const blob = await bakeEdit(pic.source, pic.width, pic.height, edit.value, {
      type,
    })
    if (!blob) throw new Error('canvas')
    emit('save', { blob, type: blob.type || type, edit: { ...edit.value } })
  } catch {
    problem.value = t('This photo could not be opened for editing.')
  } finally {
    saving.value = false
  }
}

let resize = null
let gone = false
onMounted(async () => {
  const el = stage.value
  const measure = () =>
    (room.value = { width: el.clientWidth, height: el.clientHeight })
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    resize = new ResizeObserver(measure)
    resize.observe(el)
  }
  try {
    const opened = await read()
    if (gone) return opened.close?.()
    picture.value = opened
  } catch {
    problem.value = t('This photo could not be opened for editing.')
  }
})
onBeforeUnmount(() => {
  gone = true
  resize?.disconnect()
  picture.value?.close?.()
})
</script>
<style scoped>
.ui-editor-crop {
  position: absolute;
  box-sizing: border-box;
  border: 2px solid #fff;
  /* Everything outside the frame goes dark. */
  box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.6);
  cursor: move;
  touch-action: none;
}
/* A thumb-sized target around each visible corner. */
.ui-editor-corner {
  position: absolute;
  width: 2.75rem;
  height: 2.75rem;
  touch-action: none;
}
.ui-editor-corner::after {
  content: '';
  position: absolute;
  width: 1.125rem;
  height: 1.125rem;
  border: 0 solid #fff;
}
.ui-editor-corner.is-nw {
  top: -0.5rem;
  left: -0.5rem;
  cursor: nwse-resize;
}
.ui-editor-corner.is-ne {
  top: -0.5rem;
  right: -0.5rem;
  cursor: nesw-resize;
}
.ui-editor-corner.is-sw {
  bottom: -0.5rem;
  left: -0.5rem;
  cursor: nesw-resize;
}
.ui-editor-corner.is-se {
  right: -0.5rem;
  bottom: -0.5rem;
  cursor: nwse-resize;
}
.ui-editor-corner.is-nw::after {
  top: 0.375rem;
  left: 0.375rem;
  border-top-width: 4px;
  border-left-width: 4px;
}
.ui-editor-corner.is-ne::after {
  top: 0.375rem;
  right: 0.375rem;
  border-top-width: 4px;
  border-right-width: 4px;
}
.ui-editor-corner.is-sw::after {
  bottom: 0.375rem;
  left: 0.375rem;
  border-bottom-width: 4px;
  border-left-width: 4px;
}
.ui-editor-corner.is-se::after {
  right: 0.375rem;
  bottom: 0.375rem;
  border-right-width: 4px;
  border-bottom-width: 4px;
}
.ui-editor-tools {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  overflow-x: auto;
  scrollbar-width: none;
}
.ui-editor-tools::-webkit-scrollbar {
  display: none;
}
.ui-editor-tool {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 9999px;
  background: rgb(255 255 255 / 0.12);
  color: #fff;
}
.ui-editor-tool:hover,
.ui-editor-tool:focus-visible {
  background: rgb(255 255 255 / 0.22);
}
.ui-editor-rule {
  flex: none;
  width: 1px;
  height: 1.5rem;
  margin: 0 0.125rem;
  background: rgb(255 255 255 / 0.2);
}
.ui-editor-shape {
  flex: none;
  min-height: 2.75rem;
  border-radius: 9999px;
  padding: 0 0.875rem;
  background: rgb(255 255 255 / 0.12);
  color: #fff;
  font-size: 0.875rem;
}
.ui-editor-shape[aria-pressed='true'] {
  background: #fff;
  color: #111;
  font-weight: 600;
}
.ui-editor-plain {
  min-height: 2.75rem;
  border-radius: 9999px;
  padding: 0 1rem;
  color: #fff;
  font-size: 0.9375rem;
}
.ui-editor-plain:hover,
.ui-editor-plain:focus-visible {
  background: rgb(255 255 255 / 0.14);
}
.ui-editor-save {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.5rem;
  border-radius: 9999px;
  padding: 0 1.25rem;
  /* White on the editor's black: the app's accent is tuned for its own surfaces. */
  background: #fff;
  color: #111;
  font-size: 0.9375rem;
  font-weight: 600;
}
.ui-editor-tool:disabled,
.ui-editor-shape:disabled,
.ui-editor-save:disabled {
  opacity: 0.4;
}
.ui-editor-range {
  height: 2.75rem;
  accent-color: #fff;
}
</style>
