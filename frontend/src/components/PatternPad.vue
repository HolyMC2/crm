<template>
  <div class="select-none">
    <svg
      ref="svg"
      :viewBox="`0 0 ${SIZE} ${SIZE}`"
      class="touch-none cursor-pointer rounded-md border bg-surface-white"
      :style="{ width: '180px', height: '180px' }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerUp"
    >
      <!-- Lines between visited dots -->
      <polyline
        v-if="path.length > 1"
        :points="lineCoords"
        fill="none"
        stroke="rgb(99 102 241)"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0.7"
      />
      <!-- Live segment to current pointer -->
      <line
        v-if="isDragging && path.length >= 1 && pointer.x !== null"
        :x1="dotCenter(path[path.length - 1]).x"
        :y1="dotCenter(path[path.length - 1]).y"
        :x2="pointer.x"
        :y2="pointer.y"
        stroke="rgb(99 102 241)"
        stroke-width="3"
        stroke-linecap="round"
        opacity="0.5"
      />
      <!-- The 9 dots -->
      <g v-for="n in 9" :key="n">
        <circle
          :cx="dotCenter(n).x"
          :cy="dotCenter(n).y"
          :r="DOT_R"
          :fill="path.includes(n) ? 'rgb(99 102 241)' : 'rgb(229 231 235)'"
          stroke="rgb(156 163 175)"
          stroke-width="1"
        />
        <circle
          v-if="path.includes(n)"
          :cx="dotCenter(n).x"
          :cy="dotCenter(n).y"
          r="6"
          fill="white"
        />
      </g>
    </svg>
    <div class="mt-1 flex items-center gap-2 text-xs">
      <span class="font-mono text-ink-gray-6">
        {{ path.length ? path.join('-') : __('Draw pattern') }}
      </span>
      <button
        v-if="path.length"
        type="button"
        class="text-ink-gray-5 underline hover:text-ink-gray-8"
        @click="reset"
      >
        {{ __('Clear') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const SIZE = 200
const PAD = 30
const STEP = (SIZE - PAD * 2) / 2
const DOT_R = 16
const HIT_R = 28 // generous hitbox so dragging through dots is forgiving

const svg = ref(null)
const isDragging = ref(false)
const pointer = ref({ x: null, y: null })
const path = ref(parsePattern(props.modelValue))

watch(
  () => props.modelValue,
  (v) => {
    if (path.value.join('-') !== v) path.value = parsePattern(v)
  },
)

watch(
  path,
  (v) => {
    emit('update:modelValue', v.join('-'))
  },
  { deep: true },
)

function parsePattern(s) {
  if (!s) return []
  return String(s)
    .split('-')
    .map((n) => parseInt(n, 10))
    .filter((n) => n >= 1 && n <= 9)
}

// dot positions: 1 2 3 / 4 5 6 / 7 8 9 (top-left is 1)
function dotCenter(n) {
  const i = n - 1
  const col = i % 3
  const row = Math.floor(i / 3)
  return { x: PAD + col * STEP, y: PAD + row * STEP }
}

function svgPoint(evt) {
  const rect = svg.value.getBoundingClientRect()
  const x = ((evt.clientX - rect.left) / rect.width) * SIZE
  const y = ((evt.clientY - rect.top) / rect.height) * SIZE
  return { x, y }
}

function hitTest(p) {
  for (let n = 1; n <= 9; n++) {
    const c = dotCenter(n)
    if (Math.hypot(c.x - p.x, c.y - p.y) <= HIT_R) return n
  }
  return null
}

function maybeAddDot(n) {
  if (!n || path.value.includes(n)) return
  path.value = [...path.value, n]
}

function onPointerDown(evt) {
  isDragging.value = true
  path.value = []
  const p = svgPoint(evt)
  pointer.value = p
  maybeAddDot(hitTest(p))
  svg.value.setPointerCapture(evt.pointerId)
}

function onPointerMove(evt) {
  if (!isDragging.value) return
  const p = svgPoint(evt)
  pointer.value = p
  maybeAddDot(hitTest(p))
}

function onPointerUp() {
  isDragging.value = false
  pointer.value = { x: null, y: null }
}

function reset() {
  path.value = []
  pointer.value = { x: null, y: null }
}

const lineCoords = computed(() =>
  path.value.map((n) => {
    const c = dotCenter(n)
    return `${c.x},${c.y}`
  }).join(' '),
)
</script>
