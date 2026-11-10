<!-- Vendored from muelle/workspace/packages/ui@0.1.0 (c0d7e059548a). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<template>
  <!-- The one full-screen view of photos and videos: tap a picture anywhere and
       it opens here. A swipe (← → on a keyboard, the arrows with a mouse)
       walks the set; two taps, a pinch or the button zoom in and the picture
       pans under the finger; back, Esc, ✕, a tap on the dark or a pull down
       closes it. The screen that opens it puts its own actions at the bottom,
       in thumb reach (#actions, buttons with `ui-viewer-action`), what the
       picture is above them (#caption), a state beside the count (#chip), and
       its editor in place of the pictures while `editing` (#editor). Always dark: a picture reads best on black, in
       both themes. -->
  <DialogRoot :open="open" @update:open="setOpen">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-50 bg-black"
        :style="pull ? { opacity: scrim } : undefined"
      />
      <DialogContent
        class="ui-viewer fixed inset-0 z-50 flex flex-col text-white focus:outline-none"
        :aria-describedby="undefined"
        data-ui-viewer
        :data-shell-layer="layer || undefined"
        @escape-key-down="onEscape"
        @interact-outside.prevent
        @open-auto-focus="focusSelf"
        @keydown="onKey"
      >
        <DialogTitle class="sr-only">
          {{ title || t('Photos and videos') }}
        </DialogTitle>
        <header
          class="flex flex-none items-center gap-1 px-2 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))]"
        >
          <button
            type="button"
            class="ui-viewer-btn press"
            :aria-label="t('Close')"
            :title="t('Close')"
            data-ui-viewer-close
            @click="leave"
          >
            <span class="lucide-x size-5" aria-hidden="true" />
          </button>
          <p class="min-w-0 flex-1 truncate px-1 text-sm" aria-live="polite">
            <span
              v-if="items.length > 1 && !editing"
              class="num"
              data-ui-viewer-count
              >{{ t('{0} of {1}', [index + 1, items.length]) }}</span
            >
            <span
              v-if="title"
              class="text-white/70"
              :class="items.length > 1 && !editing ? 'ml-2' : ''"
              >{{ title }}</span
            >
          </p>
          <template v-if="!editing">
            <slot name="chip" :item="current" :index="index" />
            <button
              v-if="current && current.kind !== 'video'"
              type="button"
              class="ui-viewer-btn press"
              :aria-label="zoomed ? t('Zoom out') : t('Zoom in')"
              :title="zoomed ? t('Zoom out') : t('Zoom in')"
              :aria-pressed="String(zoomed)"
              data-ui-viewer-zoom
              @click="toggleZoom()"
            >
              <span
                :class="zoomed ? 'lucide-minimize-2' : 'lucide-maximize-2'"
                class="size-5"
                aria-hidden="true"
              />
            </button>
          </template>
        </header>

        <div v-if="editing" class="relative min-h-0 flex-1">
          <slot name="editor" :item="current" :index="index" />
        </div>
        <template v-else>
          <div class="relative min-h-0 flex-1">
            <ul
              ref="pager"
              class="ui-viewer-pager"
              :class="pull ? '' : 'ui-viewer-settle'"
              :style="pullStyle"
              @scroll.passive="onScroll"
              @pointerdown="onPointerDown"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @pointercancel="onPointerCancel"
            >
              <li
                v-for="(item, i) in items"
                :key="keyOf(item)"
                class="ui-viewer-cell"
                :class="zoomed && i === index ? 'is-zoomed' : ''"
                :aria-hidden="i === index ? undefined : 'true'"
                :data-ui-viewer-cell="i"
                @click.self="onDarkTap"
              >
                <template v-if="Math.abs(i - index) <= 1">
                  <video
                    v-if="item.kind === 'video'"
                    class="ui-viewer-media"
                    :src="item.url"
                    :aria-label="item.name || t('Video {0}', [i + 1])"
                    controls
                    playsinline
                    preload="metadata"
                  />
                  <template v-else>
                    <!-- The small copy the page already showed paints at once
                         while the full picture loads over mobile data. -->
                    <img
                      v-if="soft(item)"
                      class="ui-viewer-media ui-viewer-soft"
                      :src="soft(item)"
                      alt=""
                      aria-hidden="true"
                      draggable="false"
                    />
                    <img
                      class="ui-viewer-media"
                      :class="soft(item) ? 'ui-viewer-loading' : ''"
                      :src="item.url"
                      :alt="item.alt || item.name || t('Photo {0}', [i + 1])"
                      :style="i === index ? zoomStyle : undefined"
                      draggable="false"
                      decoding="async"
                      data-ui-viewer-photo
                      @load="ready.add(keyOf(item))"
                    />
                  </template>
                </template>
              </li>
            </ul>
            <button
              v-if="index > 0"
              type="button"
              class="ui-viewer-btn ui-viewer-step press left-2"
              :aria-label="t('Previous photo')"
              :title="t('Previous photo')"
              data-ui-viewer-prev
              @click="step(-1)"
            >
              <span class="lucide-chevron-left size-6" aria-hidden="true" />
            </button>
            <button
              v-if="index < items.length - 1"
              type="button"
              class="ui-viewer-btn ui-viewer-step press right-2"
              :aria-label="t('Next photo')"
              :title="t('Next photo')"
              data-ui-viewer-next
              @click="step(1)"
            >
              <span class="lucide-chevron-right size-6" aria-hidden="true" />
            </button>
          </div>

          <footer
            class="flex-none pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
          >
            <!-- What this picture is, in the page's words: one or two lines. -->
            <div
              v-if="$slots.caption"
              class="mx-auto max-w-2xl px-4 pb-2 text-center text-sm text-white/85"
              data-ui-viewer-caption
            >
              <slot name="caption" :item="current" :index="index" />
            </div>
            <ul
              v-if="items.length > 1"
              ref="strip"
              class="ui-viewer-strip"
              :aria-label="t('Photos and videos')"
            >
              <li v-for="(item, i) in items" :key="keyOf(item)">
                <button
                  type="button"
                  class="ui-viewer-thumb press"
                  :class="i === index ? 'is-current' : ''"
                  :aria-label="
                    item.kind === 'video'
                      ? t('Video {0}', [i + 1])
                      : t('Photo {0}', [i + 1])
                  "
                  :aria-current="i === index ? 'true' : undefined"
                  :data-ui-viewer-thumb="i"
                  @click="go(i)"
                >
                  <span
                    v-if="item.kind === 'video'"
                    class="lucide-play size-4"
                    aria-hidden="true"
                  />
                  <img
                    v-else
                    :src="item.thumb || item.url"
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable="false"
                  />
                </button>
              </li>
            </ul>
            <div
              v-if="$slots.actions"
              class="flex items-stretch justify-center gap-1 px-2 pt-2"
              data-ui-viewer-actions
            >
              <slot name="actions" :item="current" :index="index" />
            </div>
          </footer>
        </template>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { useRouter } from 'vue-router'
import { t } from './mediaWords'
import { closeSheet, installSheetHistory, openSheet } from './sheetHistory'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** [{ url, kind: 'image' | 'video', key?, thumb?, preview?, name?, alt? }] */
  items: { type: Array, default: () => [] },
  /** v-model:index, the item on screen. */
  index: { type: Number, default: 0 },
  /** What the set is («Funda iPhone 13»), beside the count. */
  title: { type: String, default: '' },
  /** v-model:editing. The page's #editor takes the pictures' place; back leaves it first. */
  editing: { type: Boolean, default: false },
  /** The shell's layer name (data-shell-layer): the shortcuts and the keys skip it. */
  layer: { type: String, default: 'viewer' },
})
const emit = defineEmits(['update:open', 'update:index', 'update:editing'])

const pager = ref(null)
const strip = ref(null)
const current = computed(() => props.items[props.index] || null)
const keyOf = (item) => item.key ?? item.url

// What the gestures move, declared first: opening and walking reset it.
const scale = ref(1)
const base = ref(null) // the picture's size at rest, in px
const pull = ref(0) // how far a finger has pulled the picture down, in px
const zoomed = computed(() => scale.value > 1.01)
const zoomStyle = computed(() =>
  zoomed.value && base.value
    ? {
        width: `${base.value.width * scale.value}px`,
        height: `${base.value.height * scale.value}px`,
        maxWidth: 'none',
        maxHeight: 'none',
      }
    : undefined,
)
function zoomOut() {
  scale.value = 1
  base.value = null
}

function close() {
  emit('update:open', false)
}
function setOpen(value) {
  if (!value) leave()
}
// Leaving steps out of the editor first, then out of the viewer.
function leave() {
  if (props.editing) emit('update:editing', false)
  else close()
}
function onEscape(event) {
  if (!props.editing && !zoomed.value) return
  event.preventDefault()
  if (props.editing) emit('update:editing', false)
  else zoomOut()
}
// Focus the viewer itself, so the arrow keys work at once.
function focusSelf(event) {
  event.preventDefault()
  event.target?.focus?.({ preventScroll: true })
}

// ── the full picture over its small copy ───────────────────────────────
const ready = reactive(new Set())
function soft(item) {
  const small = item.preview || item.thumb
  return small && small !== item.url && !ready.has(keyOf(item)) ? small : ''
}

// ── walking the set: the pager scrolls natively and snaps to a picture ─────
const still =
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

function show(i, smooth) {
  const el = pager.value
  if (!el || !el.clientWidth) return
  if (Math.round(el.scrollLeft / el.clientWidth) === i) return
  el.scrollTo({
    left: i * el.clientWidth,
    behavior: smooth && !still ? 'smooth' : 'auto',
  })
}
function go(i) {
  const next = Math.min(props.items.length - 1, Math.max(0, i))
  if (next !== props.index) emit('update:index', next)
}
function step(by) {
  go(props.index + by)
}
let frame = 0
function onScroll() {
  if (frame || zoomed.value) return
  frame = requestAnimationFrame(() => {
    frame = 0
    const el = pager.value
    if (!el || !el.clientWidth) return
    const at = Math.round(el.scrollLeft / el.clientWidth)
    if (at !== props.index && at >= 0 && at < props.items.length)
      emit('update:index', at)
  })
}
function onKey(event) {
  if (props.editing || event.defaultPrevented) return
  if (event.target?.closest?.('input, textarea, select, video')) return
  const moves = { ArrowLeft: -1, ArrowRight: 1 }
  if (event.key in moves) step(moves[event.key])
  else if (event.key === 'Home') go(0)
  else if (event.key === 'End') go(props.items.length - 1)
  else return
  event.preventDefault()
}

// The picture on screen, by its key: when the page reorders the set (a new
// principal goes first) the worker keeps looking at the same picture.
let held = null
let followed = false
watch(
  () => props.items.map(keyOf).join('\n'),
  () => {
    const at = props.items.findIndex((item) => keyOf(item) === held)
    if (at < 0 || at === props.index) return
    followed = true
    emit('update:index', at)
  },
)
watch(
  () => props.index,
  async (i, was) => {
    const jump = followed
    followed = false
    held = current.value ? keyOf(current.value) : null
    zoomOut()
    pager.value?.querySelectorAll('video').forEach((video) => video.pause?.())
    await nextTick()
    show(i, !jump && Math.abs(i - was) === 1)
    strip.value
      ?.querySelector(`[data-ui-viewer-thumb="${i}"]`)
      ?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
  },
)
// The set shrank under the viewer (a picture was deleted): stay inside it,
// and close when nothing is left.
watch(
  () => props.items.length,
  (count) => {
    if (!props.open) return
    if (!count) close()
    else if (props.index > count - 1) emit('update:index', count - 1)
    else nextTick(() => show(props.index, false))
  },
)
// Back from the editor: the pager is rebuilt, so put the picture back in view.
watch(
  () => props.editing,
  async (editing) => {
    zoomOut()
    if (editing) return
    await nextTick()
    show(props.index, false)
  },
)

let resize = null
watch(
  () => props.open,
  async (open) => {
    resize?.disconnect()
    resize = null
    zoomOut()
    pull.value = 0
    held = open && current.value ? keyOf(current.value) : null
    if (!open) return
    await nextTick()
    show(props.index, false)
    // Turning the phone keeps the same picture on screen.
    if (typeof ResizeObserver !== 'undefined' && pager.value) {
      resize = new ResizeObserver(() => {
        zoomOut()
        show(props.index, false)
      })
      resize.observe(pager.value)
    }
  },
  { immediate: true, flush: 'post' },
)

// ── zoom: the picture grows inside its cell and pans by scrolling it ──────
const TAP_ZOOM = 2.5
const MAX_ZOOM = 5
function cellNow() {
  return (
    pager.value?.querySelector(`[data-ui-viewer-cell="${props.index}"]`) || null
  )
}
/** Zoom to `next` keeping the point (x, y) of the screen on the same spot of the picture. */
function zoomTo(next, x, y) {
  const cell = cellNow()
  const image = cell?.querySelector('[data-ui-viewer-photo]')
  if (!image) return
  const box = image.getBoundingClientRect()
  const view = cell.getBoundingClientRect()
  if (!base.value)
    base.value = {
      width: box.width / scale.value,
      height: box.height / scale.value,
    }
  const fx = Math.min(1, Math.max(0, (x - box.left) / (box.width || 1)))
  const fy = Math.min(1, Math.max(0, (y - box.top) / (box.height || 1)))
  scale.value = Math.min(MAX_ZOOM, Math.max(1, next))
  if (!zoomed.value) return zoomOut()
  // The size is set before the scroll, in the same frame: no jump.
  Object.assign(image.style, zoomStyle.value)
  cell.classList.add('is-zoomed')
  cell.scrollLeft = fx * base.value.width * scale.value - (x - view.left)
  cell.scrollTop = fy * base.value.height * scale.value - (y - view.top)
}
function toggleZoom(point) {
  if (zoomed.value) return zoomOut()
  const view = cellNow()?.getBoundingClientRect()
  if (!view) return
  zoomTo(
    TAP_ZOOM,
    point?.x ?? view.left + view.width / 2,
    point?.y ?? view.top + view.height / 2,
  )
}

// ── fingers on the pager: two taps zoom, a pinch zooms, a pull down closes ──
const CLOSE_AT = 110
const SLOP = 10
const scrim = computed(() => Math.max(0.35, 1 - pull.value / 360))
const pullStyle = computed(() =>
  pull.value
    ? {
        transform: `translateY(${pull.value}px) scale(${Math.max(0.86, 1 - pull.value / 1800)})`,
      }
    : undefined,
)
const fingers = new Map()
let grab = null // one finger: { x, y, pulling, moved }
let pinch = null // two fingers: { distance, scale }
let lastTap = null
let gestured = 0

function spread() {
  const [a, b] = [...fingers.values()]
  return {
    distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}
function onPointerDown(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  fingers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (fingers.size === 2) {
    grab = null
    pull.value = 0
    pinch = { distance: spread().distance, scale: scale.value }
  } else if (fingers.size === 1) {
    grab = { x: event.clientX, y: event.clientY, pulling: false, moved: false }
  }
}
function onPointerMove(event) {
  if (!fingers.has(event.pointerId)) return
  fingers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pinch && fingers.size === 2) {
    const now = spread()
    zoomTo((pinch.scale * now.distance) / pinch.distance, now.x, now.y)
    gestured = event.timeStamp
    return
  }
  if (!grab) return
  const dx = event.clientX - grab.x
  const dy = event.clientY - grab.y
  if (!grab.moved && Math.hypot(dx, dy) < SLOP) return
  grab.moved = true
  // A pull down, from rest, with a finger: the picture follows it.
  if (!grab.pulling) {
    if (zoomed.value || event.pointerType === 'mouse') return
    if (dy < SLOP || Math.abs(dx) > dy) return
    grab.pulling = true
  }
  pull.value = Math.max(0, dy)
}
function onPointerUp(event) {
  fingers.delete(event.pointerId)
  if (pinch) {
    if (fingers.size < 2) pinch = null
    if (!zoomed.value) zoomOut()
    gestured = event.timeStamp
    return
  }
  const held = grab
  grab = null
  if (!held) return
  if (held.pulling) {
    const far = pull.value >= CLOSE_AT
    pull.value = 0
    gestured = event.timeStamp
    if (far) close()
    return
  }
  if (held.moved) return
  // Two taps on the picture: in on that spot, or back out.
  if (!event.target?.closest?.('[data-ui-viewer-photo]')) return
  const tap = { x: event.clientX, y: event.clientY, at: event.timeStamp }
  if (
    lastTap &&
    tap.at - lastTap.at < 320 &&
    Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 32
  ) {
    lastTap = null
    toggleZoom(tap)
  } else lastTap = tap
}
function onPointerCancel(event) {
  // The browser took the gesture (a swipe to the next picture).
  fingers.delete(event.pointerId)
  if (fingers.size < 2) pinch = null
  grab = null
  pull.value = 0
}
// A tap on the dark beside the picture closes it; the end of a gesture does not.
function onDarkTap(event) {
  if (zoomed.value || event.timeStamp - gestured < 350) return
  close()
}

// ── back closes it: one history entry while it is open (see sheetHistory) ──
installSheetHistory(useRouter())
const token = `ui-viewer-${Math.random().toString(36).slice(2)}`
let registered = false
function onHistoryClose(reason) {
  registered = false
  if (!props.open) return
  if (reason === 'back' && props.editing) {
    // Back left the editor; the viewer stays, with its entry again.
    registered = true
    openSheet(token, onHistoryClose)
    emit('update:editing', false)
  } else close()
}
watch(
  () => props.open,
  (open) => {
    if (open && !registered) {
      registered = true
      openSheet(token, onHistoryClose)
    } else if (!open && registered) {
      registered = false
      closeSheet(token)
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  resize?.disconnect()
  if (frame) cancelAnimationFrame(frame)
  if (registered) closeSheet(token)
  registered = false
})
</script>
<style scoped>
.ui-viewer-btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 9999px;
  color: #fff;
}
.ui-viewer-btn:hover,
.ui-viewer-btn:focus-visible {
  background: rgb(255 255 255 / 0.14);
}
/* The arrows are for a pointer; a finger swipes. */
.ui-viewer-step {
  position: absolute;
  top: 50%;
  display: none;
  transform: translateY(-50%);
  background: rgb(0 0 0 / 0.45);
}
@media (hover: hover) and (pointer: fine) {
  .ui-viewer-step {
    display: inline-flex;
  }
}
.ui-viewer-pager {
  position: absolute;
  inset: 0;
  display: flex;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior: contain;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  /* Sideways is the browser's (the swipe); down and two fingers are ours. */
  touch-action: pan-x;
}
.ui-viewer-pager::-webkit-scrollbar {
  display: none;
}
.ui-viewer-settle {
  transition: transform 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}
.ui-viewer-cell {
  position: relative;
  display: flex;
  flex: 0 0 100%;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  scroll-snap-align: center;
  scroll-snap-stop: always;
}
.ui-viewer-cell.is-zoomed {
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  touch-action: pan-x pan-y;
}
/* Auto margins centre the picture and never push a zoomed one out of reach. */
.ui-viewer-media {
  flex: none;
  max-width: 100%;
  max-height: 100%;
  margin: auto;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
.ui-viewer-soft {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.ui-viewer-loading {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.ui-viewer-strip {
  display: flex;
  gap: 0.375rem;
  margin: 0;
  padding: 0.125rem 0.75rem;
  list-style: none;
  overflow-x: auto;
  scrollbar-width: none;
}
.ui-viewer-strip::-webkit-scrollbar {
  display: none;
}
.ui-viewer-strip > li:first-child {
  margin-left: auto;
}
.ui-viewer-strip > li:last-child {
  margin-right: auto;
}
.ui-viewer-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  overflow: hidden;
  border-radius: 0.5rem;
  background: rgb(255 255 255 / 0.12);
  opacity: 0.55;
}
.ui-viewer-thumb.is-current {
  opacity: 1;
  box-shadow: 0 0 0 2px #fff;
}
.ui-viewer-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
@media (prefers-reduced-motion: reduce) {
  .ui-viewer-settle {
    transition: none;
  }
}
</style>
<style>
/* What a screen puts in #actions: an icon over its word, one thumb-sized
   target each, on the viewer's black. `is-on` marks a state that holds (the
   principal), `is-danger` the confirm of a delete. */
.ui-viewer-action {
  display: flex;
  min-width: 4rem;
  min-height: 3.25rem;
  flex: 0 1 5.5rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  border-radius: 0.75rem;
  padding: 0.25rem 0.375rem;
  color: #fff;
  font-size: 0.75rem;
  line-height: 1rem;
  text-align: center;
}
.ui-viewer-action:hover,
.ui-viewer-action:focus-visible {
  background: rgb(255 255 255 / 0.14);
}
.ui-viewer-action:disabled {
  opacity: 0.45;
}
/* White on the viewer's black: the app's accent is tuned for its own surfaces. */
.ui-viewer-action.is-on,
.ui-viewer-action.is-on:disabled {
  opacity: 1;
  color: #111;
  background: #fff;
  font-weight: 600;
}
.ui-viewer-action.is-danger {
  color: #fff;
  background: #b42318;
}
.ui-viewer-chip {
  flex: none;
  border-radius: 9999px;
  padding: 0.125rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.25rem;
  color: #111;
  background: #fff;
}
</style>
