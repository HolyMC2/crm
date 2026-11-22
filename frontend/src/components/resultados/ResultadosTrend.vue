<template>
  <!-- The period's sales as bars, the comparison as a dashed line over them. -->
  <div class="select-none" data-testid="chart-trend">
    <div class="mt-2 flex gap-2">
      <div
        class="relative shrink-0 text-xs tabular-nums text-ink-gray-5"
        aria-hidden="true"
      >
        <span class="invisible block h-0 overflow-hidden">{{ widest }}</span>
        <span
          v-for="tick in ticks"
          :key="tick.value"
          class="absolute right-0 -translate-y-1/2 whitespace-nowrap leading-none"
          :style="{ top: `${tick.y}%` }"
          >{{ tick.label }}</span
        >
      </div>
      <div
        ref="plot"
        class="relative h-44 min-w-0 flex-1 touch-pan-y rounded-4 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:h-52"
        tabindex="0"
        :aria-label="summary"
        data-testid="trend-plot"
        @pointerdown="press"
        @pointermove="hover"
        @pointerleave="leave"
        @click="pick"
        @keydown="key"
      >
        <div
          v-if="active >= 0"
          class="pointer-events-none absolute inset-y-0 rounded-4 bg-surface-gray-1"
          :style="{ left: `${slot * active}%`, width: `${slot}%` }"
        />
        <div
          v-for="tick in ticks"
          :key="tick.value"
          class="pointer-events-none absolute inset-x-0 border-t"
          :class="
            tick.value === 0 ? 'border-outline-gray-3' : 'border-outline-gray-1'
          "
          :style="{ top: `${tick.y}%` }"
        />
        <div class="pointer-events-none absolute inset-0 flex">
          <div
            v-for="(bucket, i) in buckets"
            :key="bucket.key"
            class="relative h-full min-w-0 flex-1"
            data-testid="trend-bar"
          >
            <span
              v-if="bucket.value"
              class="absolute left-1/2 -translate-x-1/2 transition-opacity motion-reduce:transition-none"
              :class="bucket.value < 0 ? 'bg-surface-red-5' : ''"
              :style="barStyle(bucket, i)"
            />
          </div>
        </div>
        <svg
          v-if="prevPath"
          class="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-ink-gray-4"
          :viewBox="`0 0 ${buckets.length} 100`"
          preserveAspectRatio="none"
          aria-hidden="true"
          data-testid="trend-prev"
        >
          <path
            :d="prevPath"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray="4 4"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <template v-if="current">
          <span
            v-if="current.prev !== null"
            class="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface-base text-ink-gray-4"
            :style="{
              left: `${slot * (active + 0.5)}%`,
              top: `${y(current.prev)}%`,
              borderColor: 'currentColor',
            }"
          />
          <div
            ref="tip"
            class="pointer-events-none absolute top-0 z-10 w-max min-w-36 max-w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 py-2 text-xs shadow-lg"
            :style="tooltipStyle"
            role="status"
            data-testid="trend-tooltip"
          >
            <p class="font-medium text-ink-gray-9">
              {{ bucketTitle(current, grain) }}
            </p>
            <p class="mt-1 flex justify-between gap-3 tabular-nums">
              <span class="text-ink-gray-6">{{ __('Sales') }}</span>
              <span class="font-medium text-ink-gray-9">{{
                formatValue(current.value, 'money', currency)
              }}</span>
            </p>
            <p
              v-if="current.tickets"
              class="flex justify-between gap-3 tabular-nums"
            >
              <span class="text-ink-gray-6">{{ __('Tickets') }}</span>
              <span class="text-ink-gray-8">{{ current.tickets }}</span>
            </p>
            <p
              v-if="current.prev !== null"
              class="flex justify-between gap-3 tabular-nums"
            >
              <span class="text-ink-gray-6">{{
                prevText(current, grain)
              }}</span>
              <span class="text-ink-gray-7">{{
                formatValue(current.prev, 'money', currency)
              }}</span>
            </p>
            <p
              v-if="narrows"
              class="mt-1.5 text-ink-gray-5"
              data-testid="trend-hint"
            >
              {{
                pointer === 'mouse'
                  ? __('Click to show only {0}', [currentText])
                  : __('Tap again to show only {0}', [currentText])
              }}
            </p>
          </div>
        </template>
      </div>
    </div>
    <div class="flex gap-2" aria-hidden="true">
      <span
        class="invisible h-0 shrink-0 overflow-hidden text-xs tabular-nums"
        >{{ widest }}</span
      >
      <div class="relative mt-1.5 h-4 min-w-0 flex-1 text-xs text-ink-gray-5">
        <span
          v-for="label in labels"
          :key="label.i"
          class="absolute -translate-x-1/2 whitespace-nowrap tabular-nums"
          :style="{ left: `${slot * (label.i + 0.5)}%` }"
          >{{ label.text }}</span
        >
      </div>
    </div>
    <div
      class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-gray-6"
    >
      <span class="inline-flex items-center gap-1.5">
        <span
          class="size-2.5 shrink-0"
          :style="{ background: 'var(--brand)', borderRadius: '2px' }"
        />{{ seriesName }}
      </span>
      <span v-if="prevPath" class="inline-flex items-center gap-1.5">
        <span
          class="w-4 border-t-2 border-dashed text-ink-gray-4"
          :style="{ borderColor: 'currentColor' }"
        />{{ compareName }}
      </span>
      <span v-if="best.value > 0" class="inline-flex items-center gap-1.5">
        {{ bestName }}
        <span class="font-medium tabular-nums text-ink-gray-8"
          >{{ bucketText(best, grain) }},
          {{ formatValue(best.value, 'money', currency) }}</span
        >
      </span>
    </div>
  </div>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { compactValue, formatValue } from '@/composables/useResultados'
import {
  bucketText,
  bucketTitle,
  prevText,
  trendAxis,
  trendBuckets,
  trendGrain,
  trendLabels,
} from '@/components/resultados/trendBars'

const props = defineProps({
  points: { type: Array, default: () => [] },
  prev: { type: Array, default: null },
  compara: { type: String, default: 'anterior' },
  currency: { type: String, default: '' },
})
const emit = defineEmits(['filter'])

const plot = ref(null)
const active = ref(-1)
const pointer = ref('mouse')
// A tap on a touch screen first shows the bar; the same bar tapped again
// narrows the board to it, like a click does with a mouse.
let tappedShown = -1

const grain = computed(() => trendGrain(props.points.length))
const buckets = computed(() =>
  trendBuckets(props.points, props.prev, grain.value),
)
const slot = computed(() => 100 / (buckets.value.length || 1))
const hasPrev = computed(() => buckets.value.some((b) => b.prev !== null))
const axis = computed(() => {
  const values = buckets.value.map((b) => b.value)
  for (const b of buckets.value) if (b.prev !== null) values.push(b.prev)
  return trendAxis(values)
})
const y = (value) => {
  const { min, max } = axis.value
  return 100 - ((value - min) / (max - min || 1)) * 100
}
const ticks = computed(() =>
  axis.value.ticks.map((value) => ({
    value,
    y: y(value),
    label: compactValue(value, 'money', props.currency),
  })),
)
const widest = computed(() =>
  ticks.value.reduce((w, t) => (t.label.length > w.length ? t.label : w), ''),
)
const labels = computed(() => trendLabels(buckets.value, grain.value))

function barStyle(bucket, i) {
  const zero = y(0)
  const size = `max(2px, ${Math.abs(zero - y(bucket.value))}%)`
  const up = bucket.value > 0
  // Anchored at zero, so a small day still grows from the baseline.
  return {
    width: 'min(64%, 24px)',
    ...(up ? { bottom: `${100 - zero}%` } : { top: `${zero}%` }),
    height: size,
    background: up ? 'var(--brand)' : undefined,
    borderRadius: up ? '4px 4px 0 0' : '0 0 4px 4px',
    opacity: active.value < 0 || active.value === i ? 1 : 0.4,
  }
}

const prevPath = computed(() => {
  if (props.compara === 'no' || !hasPrev.value) return ''
  const rows = buckets.value
  if (rows.length === 1) {
    const at = y(rows[0].prev)
    return `M0.2,${at} L0.8,${at}`
  }
  let d = ''
  let pen = false
  rows.forEach((b, i) => {
    if (b.prev === null) return (pen = false)
    d += `${pen ? 'L' : 'M'}${i + 0.5},${y(b.prev)} `
    pen = true
  })
  return d.trim()
})

const current = computed(() =>
  active.value >= 0 ? buckets.value[active.value] : null,
)
const narrows = computed(() => buckets.value.length > 1)
// A date never breaks across lines: «12 nov», not «12» over «nov».
const currentText = computed(() =>
  current.value
    ? bucketText(current.value, grain.value).replace(/ /g, '\u00a0')
    : '',
)
// Beside the bar, on the side with room; where neither side has room (a
// phone), as close as fits inside the chart.
const tip = ref(null)
const room = ref({ plot: 0, tip: 0 })
watch([active, current], async () => {
  await nextTick()
  room.value = {
    plot: plot.value?.clientWidth || 0,
    tip: tip.value?.offsetWidth || 0,
  }
})
const tooltipStyle = computed(() => {
  const { plot: width, tip: wide } = room.value
  const n = buckets.value.length
  if (!width || !wide || !n) return { left: '0px', visibility: 'hidden' }
  const from = (width / n) * active.value
  const to = from + width / n
  const gap = 6
  const right = to + gap
  const left = from - gap - wide
  const center = (from + to) / 2
  let x = center > width / 2 ? left : right
  if (x < 0 || x + wide > width) x = right + wide <= width ? right : left
  x = Math.max(0, Math.min(width - wide, x))
  return { left: `${x}px` }
})

const best = computed(() =>
  buckets.value.reduce(
    (top, b) => (b.value > top.value ? b : top),
    buckets.value[0] || { value: 0 },
  ),
)
const seriesName = computed(
  () =>
    ({
      day: __('Sales per day'),
      week: __('Sales per week'),
      month: __('Sales per month'),
    })[grain.value],
)
const bestName = computed(
  () =>
    ({
      day: __('Best day'),
      week: __('Best week'),
      month: __('Best month'),
    })[grain.value],
)
const compareName = computed(() =>
  props.compara === 'anio' ? __('Last year') : __('Previous period'),
)
const summary = computed(() =>
  best.value.value > 0
    ? `${seriesName.value}. ${bestName.value}: ${bucketText(best.value, grain.value)}, ${formatValue(best.value.value, 'money', props.currency)}`
    : seriesName.value,
)

function indexAt(event) {
  const n = buckets.value.length
  const box = plot.value?.getBoundingClientRect()
  if (!n || !box?.width) return -1
  const f = (event.clientX - box.left) / box.width
  return Math.max(0, Math.min(n - 1, Math.floor(f * n)))
}
function press(event) {
  pointer.value = event.pointerType || 'mouse'
  tappedShown = pointer.value === 'mouse' ? -1 : active.value
  active.value = indexAt(event)
}
function hover(event) {
  if (event.pointerType === 'mouse') pointer.value = 'mouse'
  // A finger scrubs only while it is down; a mouse follows the pointer.
  if (event.pointerType !== 'mouse' && !event.buttons) return
  active.value = indexAt(event)
}
function leave(event) {
  if (event.pointerType === 'mouse') active.value = -1
}
function narrow(i) {
  const bucket = buckets.value[i]
  if (!bucket || !narrows.value) return
  emit('filter', { periodo: 'rango', desde: bucket.from, hasta: bucket.to })
}
function pick() {
  const i = active.value
  if (i < 0) return
  if (pointer.value !== 'mouse' && tappedShown !== i) return
  narrow(i)
}
function key(event) {
  const n = buckets.value.length
  if (!n) return
  const moves = {
    ArrowLeft: Math.max(0, (active.value < 0 ? n : active.value) - 1),
    ArrowRight: Math.min(n - 1, active.value + 1),
    Home: 0,
    End: n - 1,
  }
  if (event.key in moves) {
    event.preventDefault()
    pointer.value = 'mouse'
    active.value = moves[event.key]
  } else if (event.key === 'Enter' && active.value >= 0) {
    narrow(active.value)
  } else if (event.key === 'Escape') {
    active.value = -1
  }
}

// A finger that taps outside the chart puts the tooltip away.
function outside(event) {
  if (!plot.value?.contains(event.target)) active.value = -1
}
watch(active, (i) => {
  if (i >= 0 && pointer.value !== 'mouse')
    document.addEventListener('pointerdown', outside, true)
  else document.removeEventListener('pointerdown', outside, true)
})
onBeforeUnmount(() =>
  document.removeEventListener('pointerdown', outside, true),
)
</script>
