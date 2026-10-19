<template>
  <!-- The printed page, as paper on a grey canvas: printview's HTML in a
       sandboxed iframe (no scripts), scaled so the page fits the width;
       zoom over that (buttons or a pinch), scrolling sideways when zoomed. -->
  <div
    ref="canvas"
    class="relative overflow-x-auto bg-surface-gray-2"
    :style="{ touchAction: 'pan-x pan-y' }"
    data-testid="impresion-preview"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @pointerleave="onUp"
  >
    <div
      class="mx-auto bg-white shadow"
      :style="{
        width: `${Math.round(page.width * scale)}px`,
        height: `${Math.round(page.height * scale)}px`,
        margin: `${MARGIN}px auto`,
        opacity: loading ? 0.5 : 1,
      }"
    >
      <iframe
        v-if="srcdoc"
        ref="frame"
        :srcdoc="srcdoc"
        sandbox="allow-same-origin"
        :title="title || 'Vista previa'"
        tabindex="-1"
        class="pointer-events-none block border-0 bg-white"
        :style="{
          width: `${page.width}px`,
          height: `${page.height}px`,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
        }"
        @load="measure"
      />
    </div>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import { fitScale, pinchZoom } from './impresion'

const props = defineProps({
  srcdoc: { type: String, default: '' },
  /** Zoom over the fitted width (1 = the page fits). */
  zoom: { type: Number, default: 1 },
  loading: { type: Boolean, default: false },
  title: { type: String, default: '' },
})
const emit = defineEmits(['update:zoom'])

const MARGIN = 16
// A4 at 96 dpi until the page is measured.
const page = reactive({ width: 800, height: 1130 })
const canvas = ref(null)
const frame = ref(null)
const { width } = useElementSize(canvas)
const fit = computed(() =>
  fitScale(width.value, page.width, { margin: MARGIN }),
)
const scale = computed(() => fit.value * (props.zoom || 1))

let observer = null
function measure() {
  const doc = frame.value?.contentDocument
  const body = doc?.body
  if (!body) return
  const read = () => {
    // The body shrinks to the page (previewDocument), so its size is the page's.
    // A page without its own width (no `.print-format` rule) is capped at A4.
    let w = Math.ceil(body.scrollWidth)
    if (w > 1200) {
      body.style.width = '816px'
      w = 816
    }
    page.width = Math.max(240, w)
    page.height = Math.max(200, Math.ceil(body.scrollHeight))
  }
  read()
  observer?.disconnect()
  if (typeof ResizeObserver !== 'undefined') {
    // Fonts and images arrive after load and grow the page.
    observer = new ResizeObserver(read)
    observer.observe(body)
  }
}
watch(
  () => props.srcdoc,
  () => observer?.disconnect(),
)
onBeforeUnmount(() => observer?.disconnect())

// ── pinch ────────────────────────────────────────────────────────────────
const pointers = new Map()
let start = null
function spread() {
  const [a, b] = [...pointers.values()]
  return Math.hypot(a.x - b.x, a.y - b.y)
}
function onDown(event) {
  if (event.pointerType !== 'touch') return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 2) start = { zoom: props.zoom, distance: spread() }
}
function onMove(event) {
  if (!pointers.has(event.pointerId)) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 2 && start)
    emit('update:zoom', pinchZoom(start.zoom, start.distance, spread()))
}
function onUp(event) {
  pointers.delete(event.pointerId)
  if (pointers.size < 2) start = null
}
</script>
