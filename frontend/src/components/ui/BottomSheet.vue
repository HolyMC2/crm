<template>
  <!-- The one sheet for bounded tasks (Shell SPEC §2.2.3, Material bottom
       sheet): drag handle, title, scrim; back, swipe down, Esc or the scrim
       close it. It opens at about 60% of the screen and drags (or taps on the
       handle) up to full height when its content is longer. Actions sit at
       the bottom, in thumb reach. On wider screens it is a centred dialog. -->
  <DialogRoot :open="open" @update:open="setOpen">
    <DialogPortal>
      <DialogOverlay
        class="ui-sheet-scrim fixed inset-0 z-50 bg-black-overlay-200 dark:bg-black-overlay-700"
      />
      <DialogContent
        :class="[
          'z-50 flex flex-col bg-surface-base text-ink-gray-9 shadow-xl focus:outline-none',
          phone
            ? [
                'ui-sheet fixed inset-x-0 bottom-0 mx-auto w-full max-w-2xl transform-gpu rounded-t-3xl',
                expanded ? 'h-[96dvh]' : 'max-h-[60dvh]',
              ]
            : 'ui-dialog fixed left-1/2 top-1/2 max-h-[85dvh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl',
        ]"
        :style="phone ? dragStyle : undefined"
        :aria-describedby="undefined"
        data-ui-sheet
        :data-expanded="expanded || undefined"
        @escape-key-down="onDismissAttempt"
        @interact-outside="onDismissAttempt"
        @open-auto-focus="(event) => event.preventDefault()"
      >
        <div
          ref="handle"
          :class="phone ? 'touch-none select-none' : ''"
          class="flex-none"
        >
          <div v-if="phone" class="flex justify-center pt-1">
            <!-- The handle is also a button: tap to expand or shrink. -->
            <button
              v-if="expandable"
              type="button"
              class="flex h-6 w-16 items-center justify-center"
              :aria-label="
                expanded
                  ? __('Collapse', null, 'Bottom sheet')
                  : __('Expand', null, 'Bottom sheet')
              "
              :aria-expanded="String(expanded)"
              data-ui-sheet-handle
              @click="expanded = !expanded"
            >
              <span class="h-1 w-8 rounded-full bg-surface-gray-4" />
            </button>
            <span v-else class="flex h-6 w-16 items-center justify-center">
              <span class="h-1 w-8 rounded-full bg-surface-gray-4" />
            </span>
          </div>
          <div
            v-if="title || !phone"
            class="flex items-start gap-2 px-5"
            :class="phone ? 'pb-2' : 'pb-2 pt-4'"
          >
            <div class="min-w-0 flex-1">
              <DialogTitle
                class="break-words text-xl font-semibold leading-snug [text-wrap:balance]"
                :class="title ? '' : 'sr-only'"
              >
                {{ title || ariaLabel || __('Options') }}
              </DialogTitle>
              <p v-if="subtitle" class="pt-0.5 text-sm text-ink-gray-6">
                {{ subtitle }}
              </p>
            </div>
            <DialogClose
              v-if="!phone && dismissible"
              class="-mr-2 -mt-1 flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
              :aria-label="__('Close')"
            >
              <span class="lucide-x size-5" aria-hidden="true" />
            </DialogClose>
          </div>
        </div>
        <DialogTitle v-if="!title && phone" class="sr-only">
          {{ ariaLabel || __('Options') }}
        </DialogTitle>
        <!-- Fixed under the title, outside the drag area (a chip, a search field). -->
        <div
          v-if="$slots.header"
          class="flex-none px-5 pb-2"
          data-ui-sheet-header
        >
          <slot name="header" />
        </div>
        <div
          ref="body"
          class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          :class="flush ? '' : 'px-5 pb-4'"
          data-ui-sheet-body
        >
          <div ref="content">
            <slot />
          </div>
        </div>
        <!-- Full width, stacked: the primary action last, nearest the thumb. -->
        <div
          v-if="$slots.actions"
          class="grid flex-none gap-2 border-t border-outline-gray-1 px-5 pt-3"
          :class="
            phone ? 'pb-[max(0.75rem,env(safe-area-inset-bottom))]' : 'pb-4'
          "
          data-ui-sheet-actions
        >
          <slot name="actions" />
        </div>
        <!-- Fixed at the bottom, unstyled: a composer or a custom bar. -->
        <div
          v-else-if="$slots.footer"
          class="flex-none"
          :class="phone ? 'pb-[env(safe-area-inset-bottom)]' : ''"
          data-ui-sheet-footer
        >
          <slot name="footer" />
        </div>
        <div
          v-else-if="phone"
          class="h-[env(safe-area-inset-bottom)] flex-none"
        />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { usePointerSwipe } from '@vueuse/core'
import { isMobile } from '@/composables/breakpoint'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  /** The sheet's name for screen readers when it shows no title. */
  ariaLabel: { type: String, default: '' },
  /** false: only the sheet's own actions close it (an unsaved form). */
  dismissible: { type: Boolean, default: true },
  /** No side padding in the body: for lists of full-width rows. */
  flush: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open', 'closed'])

const phone = isMobile
const handle = ref(null)
const body = ref(null)
const content = ref(null)
const expanded = ref(false)
const expandable = ref(false)
// Drag state (declared before the open watcher, which resets it).
const dragY = ref(0)
const dragging = ref(false)
const closing = ref(false)

function setOpen(value) {
  if (!value && !props.dismissible) return
  emit('update:open', value)
}
function onDismissAttempt(event) {
  if (!props.dismissible) event.preventDefault()
}

// ── expand: only when the content is longer than the 60% sheet ───────────
let resize = null
function measure() {
  const el = body.value
  if (!el) return
  expandable.value = expanded.value || el.scrollHeight > el.clientHeight + 4
}
watch(
  () => props.open,
  async (open) => {
    resize?.disconnect()
    resize = null
    if (!open) {
      expanded.value = false
      emit('closed')
      return
    }
    closing.value = false
    dragY.value = 0
    await nextTick()
    measure()
    if (typeof ResizeObserver !== 'undefined' && content.value) {
      resize = new ResizeObserver(measure)
      resize.observe(content.value)
    }
  },
  { immediate: true },
)

// ── back closes the sheet (phone): one history entry while it is open ─────
// The entry keeps vue-router's state and the URL, so the router sees no route
// change; popstate is the single place that closes on back.
const token = `ui-sheet-${Math.random().toString(36).slice(2)}`
let pushed = false
function onPopState() {
  if (!pushed || window.history.state?.uiSheet === token) return
  pushed = false
  if (props.open) {
    if (props.dismissible) emit('update:open', false)
    else pushEntry() // a guarded sheet stays; keep its entry
  }
}
function pushEntry() {
  window.history.pushState({ ...window.history.state, uiSheet: token }, '')
  pushed = true
}
watch(
  () => props.open && phone.value,
  (active) => {
    if (typeof window === 'undefined') return
    if (active && !pushed) {
      pushEntry()
      window.addEventListener('popstate', onPopState)
    } else if (!active && pushed) {
      pushed = false
      window.removeEventListener('popstate', onPopState)
      // Closed by the UI: drop our entry, unless a navigation already left it.
      if (window.history.state?.uiSheet === token) window.history.back()
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  resize?.disconnect()
  window.removeEventListener('popstate', onPopState)
  if (pushed && window.history.state?.uiSheet === token) window.history.back()
  pushed = false
})

// ── drag on the handle and title: up expands, down shrinks or closes ──────
const CLOSE_RATIO = 0.25
const FLICK = 0.5 // px per ms
const MOVE = 48 // px to expand or shrink
const CLOSE_MS = 240
let samples = []
let height = 0

function velocity() {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  const first = samples.find((s) => last.t - s.t <= 100) ?? samples[0]
  const dt = last.t - first.t
  return dt > 0 ? (last.y - first.y) / dt : 0
}

const dragStyle = computed(() => {
  if (closing.value)
    return {
      transform: 'translateY(100%)',
      transition: `transform ${CLOSE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
      animation: 'none',
    }
  if (dragging.value)
    return { transform: `translateY(${dragY.value}px)`, transition: 'none' }
  return {
    transform: dragY.value ? `translateY(${dragY.value}px)` : undefined,
    transition: 'transform 200ms ease-out, height 200ms ease-out',
  }
})

const { distanceY } = usePointerSwipe(handle, {
  pointerTypes: ['touch', 'pen', 'mouse'],
  threshold: 0,
  onSwipeStart() {
    samples = []
    height = handle.value?.closest('[data-ui-sheet]')?.offsetHeight || 0
  },
  onSwipe() {
    if (!phone.value || closing.value) return
    dragging.value = true
    const raw = -distanceY.value // + down, − up
    // Up follows with resistance (it expands on release, it does not stretch).
    dragY.value = raw >= 0 ? raw : -Math.min(MOVE, Math.sqrt(-raw) * 4)
    samples.push({ y: raw, t: performance.now() })
  },
  onSwipeEnd() {
    if (!phone.value || closing.value) return
    dragging.value = false
    const raw = samples.length ? samples[samples.length - 1].y : 0
    const flick = velocity()
    dragY.value = 0
    if (raw < -MOVE / 2 || flick < -FLICK) {
      if (expandable.value) expanded.value = true
      return
    }
    if (raw <= 0) return
    if (expanded.value && (raw > MOVE || flick > FLICK)) {
      expanded.value = false
      return
    }
    if (
      props.dismissible &&
      (raw > (height || 400) * CLOSE_RATIO || flick > FLICK)
    ) {
      closing.value = true
      window.setTimeout(() => emit('update:open', false), CLOSE_MS + 20)
    }
  },
})

defineExpose({ expanded, expandable })
</script>
<style>
@keyframes ui-sheet-in {
  from {
    transform: translateY(100%);
  }
}
@keyframes ui-sheet-out {
  to {
    transform: translateY(100%);
  }
}
@keyframes ui-fade-in {
  from {
    opacity: 0;
  }
}
@keyframes ui-fade-out {
  to {
    opacity: 0;
  }
}
.ui-sheet-scrim[data-state='open'] {
  animation: ui-fade-in 150ms ease-out;
}
.ui-sheet-scrim[data-state='closed'] {
  animation: ui-fade-out 200ms ease-in;
}
.ui-sheet[data-state='open'] {
  animation: ui-sheet-in 280ms cubic-bezier(0.32, 0.72, 0, 1);
}
.ui-sheet[data-state='closed'] {
  animation: ui-sheet-out 200ms ease-in;
}
.ui-dialog[data-state='open'] {
  animation: ui-fade-in 150ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .ui-sheet,
  .ui-sheet-scrim,
  .ui-dialog {
    animation: none !important;
    transition: none !important;
  }
}
</style>
