<template>
  <!-- The labels as they will print: the server's own HTML in a sandboxed
       frame (no scripts) on a grey mat. A designed size shows one label at a
       time, zoomed to fit the mat (or at its real size), and pages through
       the products; «Ver todas» lays them out side by side. Paging and
       zooming restyle the frame in place, so nothing reloads or jumps.
       `compact` (a sheet's small stage) shows the label alone. -->
  <figure
    class="relative flex flex-col overflow-hidden rounded-8 bg-surface-gray-2"
    :aria-busy="loading ? 'true' : 'false'"
    data-etq-stage
  >
    <div
      ref="mat"
      class="relative min-h-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-3"
      :class="scrolls ? 'overflow-auto' : 'overflow-hidden'"
      :tabindex="paged ? 0 : -1"
      :aria-label="paged ? `${title}: ${index + 1} de ${all}` : title"
      @keydown.left.prevent="go(-1)"
      @keydown.right.prevent="go(1)"
      @pointerdown="swipeStart"
      @pointerup="swipeEnd"
    >
      <div
        class="flex min-h-full min-w-full items-center justify-center"
        :class="framed ? '' : 'p-5'"
        :style="framed ? undefined : padStyle"
      >
        <iframe
          v-if="html"
          ref="frame"
          :srcdoc="srcdoc"
          :title="title"
          sandbox="allow-same-origin"
          class="block flex-none border-0 transition-opacity duration-150 ease-out motion-reduce:transition-none"
          :class="[
            loading ? 'opacity-70' : 'opacity-100',
            framed ? '' : 'pointer-events-none rounded-4 bg-white shadow-lg',
          ]"
          :style="frameStyle"
          @load="restyle"
        />
        <p
          v-else
          class="flex max-w-xs flex-col items-center gap-2 px-6 text-center text-sm text-ink-gray-6"
        >
          <span
            v-if="loading"
            class="lucide-loader-circle size-5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span>{{ loading ? 'Dibujando las etiquetas…' : empty }}</span>
        </p>
      </div>
    </div>

    <!-- What is on the mat, and how to look at it. -->
    <div
      v-if="html && sized && !compact"
      class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2"
    >
      <span
        class="num inline-flex min-h-8 items-center gap-1.5 rounded-full bg-surface-base px-3 text-xs text-ink-gray-7 shadow-sm"
      >
        <span
          v-if="loading"
          class="lucide-loader-circle size-3.5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        {{ sizeLabel }}
      </span>
      <div
        v-if="designed"
        class="pointer-events-auto flex items-center rounded-full bg-surface-base p-0.5 shadow-sm"
      >
        <button
          v-if="count > 1"
          type="button"
          class="press flex size-10 items-center justify-center rounded-full"
          :class="
            view === 'todas'
              ? 'bg-surface-gray-3 text-ink-gray-9'
              : 'text-ink-gray-7 hover:bg-surface-gray-2'
          "
          :aria-pressed="view === 'todas' ? 'true' : 'false'"
          aria-label="Ver todas las etiquetas"
          title="Ver todas"
          @click="setView(view === 'todas' ? 'una' : 'todas')"
        >
          <Icon icon="layout-grid" class="size-4" />
        </button>
        <button
          type="button"
          class="press flex size-10 items-center justify-center rounded-full"
          :class="
            view === 'real'
              ? 'bg-surface-gray-3 text-ink-gray-9'
              : 'text-ink-gray-7 hover:bg-surface-gray-2'
          "
          :aria-pressed="view === 'real' ? 'true' : 'false'"
          aria-label="Ver a tamaño real"
          title="Tamaño real"
          @click="setView(view === 'real' ? 'una' : 'real')"
        >
          <Icon icon="ruler" class="size-4" />
        </button>
      </div>
    </div>

    <!-- «1 de 12»: the products, one label each. -->
    <div
      v-if="paged"
      class="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-2"
    >
      <div
        class="pointer-events-auto flex items-center rounded-full bg-surface-base p-0.5 shadow-sm"
        data-etq-pager
      >
        <button
          type="button"
          class="press flex size-10 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-40"
          :disabled="index <= 0"
          aria-label="Etiqueta anterior"
          title="Anterior"
          @click="go(-1)"
        >
          <span class="lucide-chevron-left size-4" aria-hidden="true" />
        </button>
        <span class="num min-w-16 px-1 text-center text-sm text-ink-gray-8"
          >{{ index + 1 }} de {{ all }}</span
        >
        <button
          type="button"
          class="press flex size-10 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-40"
          :disabled="index >= all - 1"
          aria-label="Etiqueta siguiente"
          title="Siguiente"
          @click="go(1)"
        >
          <span class="lucide-chevron-right size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
    <slot name="caption" />
  </figure>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '@/components/Icon.vue'
import { sizeText, withBase } from '@/composables/useEtiquetas'

const props = defineProps({
  html: { type: String, default: '' },
  // The label's size; 0 when the layout does not say it.
  size: { type: Object, default: () => ({ w_mm: 0, h_mm: 0 }) },
  // Drawn by doco's design engine (one `.doco-label` per product), so the
  // stage can show them one at a time.
  designed: { type: Boolean, default: false },
  // Labels in the document.
  count: { type: Number, default: 1 },
  // A long list is drawn a window at a time: where this document starts
  // among all the labels, and how many there are (0: just these).
  offset: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  // What the size chip says («Mediana · 50 × 30 mm»); the size alone if empty.
  label: { type: String, default: '' },
  // The label alone, as large as it fits: no chips, no pager.
  compact: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  title: { type: String, default: 'Vista previa de las etiquetas' },
  empty: {
    type: String,
    default: 'Agrega productos y aquí ves las etiquetas como saldrán.',
  },
})
const index = defineModel('index', { type: Number, default: 0 })
const view = defineModel('view', { type: String, default: 'una' })

// CSS px per mm (96 dpi): «Tamaño real» on a desk screen.
const PX = 96 / 25.4
const mat = ref(null)
const frame = ref(null)
const box = ref({ width: 0, height: 0 })

const sized = computed(() => props.size?.w_mm > 0 && props.size?.h_mm > 0)
const sizeLabel = computed(() =>
  sized.value ? props.label || sizeText(props.size.w_mm, props.size.h_mm) : '',
)
const all = computed(() => Math.max(props.total, props.count))
// One label at a time; else the frame fills the mat and scrolls itself.
const single = computed(
  () => props.designed && sized.value && view.value !== 'todas',
)
const framed = computed(() => !single.value)
const paged = computed(() => single.value && all.value > 1 && !props.compact)
const scrolls = computed(() => single.value && view.value === 'real')

// Room around the label: the chips above (52 px tall), the pager below.
const pad = computed(() => {
  if (props.compact) return { top: 12, bottom: 12, side: 12 }
  return { top: sized.value ? 60 : 20, bottom: paged.value ? 60 : 20, side: 20 }
})
const padStyle = computed(() => ({
  padding: `${pad.value.top}px ${pad.value.side}px ${pad.value.bottom}px`,
}))
const labelPx = computed(() => ({
  width: props.size.w_mm * PX,
  height: props.size.h_mm * PX,
}))
const zoom = computed(() => {
  if (view.value === 'real') return 1
  const room = {
    width: box.value.width - 2 * pad.value.side,
    height: box.value.height - pad.value.top - pad.value.bottom,
  }
  if (room.width <= 0 || room.height <= 0) return 1
  const fit = Math.min(
    room.width / labelPx.value.width,
    room.height / labelPx.value.height,
  )
  return Math.max(0.2, Math.min(8, fit))
})
// «Ver todas»: two labels a row at least, never larger than one at a time.
const thumbZoom = computed(() => {
  const room = Math.max(120, box.value.width - 48)
  return Math.max(
    0.2,
    Math.min(zoom.value, room / 2 / labelPx.value.width, 2.5),
  )
})

const frameStyle = computed(() => {
  if (!single.value) return { width: '100%', height: `${box.value.height}px` }
  return {
    width: `${Math.round(labelPx.value.width * zoom.value)}px`,
    height: `${Math.round(labelPx.value.height * zoom.value)}px`,
  }
})

// The label of the document on the mat (1-based); while the next window
// draws, the nearest one of this one.
const shownAt = computed(
  () => Math.max(0, Math.min(index.value - props.offset, props.count - 1)) + 1,
)

// The stage's own rules inside the frame, on top of the label's.
const stageCss = computed(() => {
  if (!props.designed || !sized.value) return ''
  if (view.value === 'todas') {
    // The frame's own px are zoomed: room in screen px divided by the zoom.
    const z = thumbZoom.value
    const room = (px) => `${(px / z).toFixed(1)}px`
    return (
      `html{zoom:${z.toFixed(3)};background:#e9e9ea!important}` +
      `body{margin:0!important;padding:${room(props.compact ? 12 : 60)} ${room(12)} ${room(12)}!important;` +
      `background:#e9e9ea!important;display:flex;flex-wrap:wrap;gap:${room(10)};` +
      'justify-content:center;align-content:flex-start}' +
      '.doco-label{margin:0!important;box-shadow:0 1px 3px rgba(0,0,0,.2)!important}'
    )
  }
  return (
    `html{zoom:${zoom.value.toFixed(3)}}` +
    'html,body{margin:0!important;padding:0!important;background:#fff!important;overflow:hidden!important}' +
    '.doco-label{display:none!important;margin:0!important;box-shadow:none!important}' +
    `.doco-label:nth-of-type(${shownAt.value}){display:block!important}`
  )
})

// The document is set once per drawing, with the rules it starts with;
// later changes restyle it in place.
const srcdoc = ref('')
watch(
  () => props.html,
  (html) => {
    const css = `<style id="etq-stage">${stageCss.value}</style>`
    const text = withBase(html)
    srcdoc.value = /<\/head>/i.test(text)
      ? text.replace(/<\/head>/i, `${css}</head>`)
      : css + text
  },
  { immediate: true },
)
function restyle() {
  try {
    const doc = frame.value?.contentDocument
    if (!doc?.head) return
    let tag = doc.getElementById('etq-stage')
    if (!tag) {
      tag = doc.createElement('style')
      tag.id = 'etq-stage'
      doc.head.appendChild(tag)
    }
    if (tag.textContent !== stageCss.value) tag.textContent = stageCss.value
  } catch {
    // A frame the browser keeps apart: it shows the labels as drawn.
  }
}
watch(stageCss, restyle)

// Fewer labels keep the stage on one that exists.
watch(all, (count) => {
  if (index.value > count - 1) index.value = Math.max(0, count - 1)
})

function go(step) {
  const next = Math.max(0, Math.min(all.value - 1, index.value + step))
  if (next !== index.value) index.value = next
}
function setView(value) {
  view.value = value
}

// A swipe across the mat pages, as photos do.
let start = null
function swipeStart(event) {
  start = paged.value ? { x: event.clientX, y: event.clientY } : null
}
function swipeEnd(event) {
  if (!start) return
  const dx = event.clientX - start.x
  const dy = event.clientY - start.y
  start = null
  if (Math.abs(dx) > 40 && Math.abs(dy) < 40) go(dx < 0 ? 1 : -1)
}

let observer
onMounted(() => {
  const measure = () => {
    const el = mat.value
    if (el) box.value = { width: el.clientWidth, height: el.clientHeight }
  }
  measure()
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(measure)
    observer.observe(mat.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
</script>
