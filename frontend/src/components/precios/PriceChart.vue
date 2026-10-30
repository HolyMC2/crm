<template>
  <!-- What a product cost and sold for over time, on one money axis: each
       purchase a dot (cost per unit, joined by a line), the price on one list
       as steps. Drag or hover to read any day; the purchases list under the
       chart is its table view. -->
  <figure class="precios-chart m-0" data-precios-chart>
    <figcaption
      class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-gray-7"
    >
      <span class="inline-flex items-center gap-1.5">
        <span class="legend-line legend-price" aria-hidden="true" />
        Precio {{ list }}
      </span>
      <span v-if="model.points.length" class="inline-flex items-center gap-1.5">
        <span class="legend-dot legend-cost" aria-hidden="true" />
        Costo por {{ unit }}
      </span>
    </figcaption>
    <div
      ref="box"
      class="relative mt-2 select-none"
      :style="{ height: `${HEIGHT}px` }"
    >
      <svg
        v-if="width && !model.empty"
        :width="width"
        :height="HEIGHT"
        :viewBox="`0 0 ${width} ${HEIGHT}`"
        role="img"
        :aria-label="summary"
        class="block touch-pan-y overflow-visible"
        @pointermove="scrub"
        @pointerdown="scrub"
        @pointerleave="hover = null"
      >
        <g class="grid-lines">
          <g v-for="tick in model.ticks" :key="tick.value">
            <line
              :x1="model.pad.left"
              :x2="width - model.pad.right"
              :y1="tick.y"
              :y2="tick.y"
            />
            <text
              :x="model.pad.left - 6"
              :y="tick.y"
              dy="0.32em"
              text-anchor="end"
              class="num"
            >
              {{ axisMoney(tick.value) }}
            </text>
          </g>
          <text
            v-for="month in model.months"
            :key="month.t"
            :x="month.x"
            :y="HEIGHT - 6"
            text-anchor="middle"
          >
            {{ monthLabel(month.t) }}
          </text>
        </g>
        <path v-if="model.costPath" :d="model.costPath" class="cost-line" />
        <path v-if="model.pricePath" :d="model.pricePath" class="price-line" />
        <circle
          v-for="(point, index) in model.points"
          :key="index"
          :cx="point.x"
          :cy="point.y"
          r="4"
          class="cost-dot"
          :class="hover?.point === point ? 'is-active' : ''"
        />
        <!-- Direct labels at the right end: where each line ends today. -->
        <text
          v-if="lastStep"
          :x="width - model.pad.right"
          :y="lastStep.y - 8"
          text-anchor="end"
          class="end-label price-ink num"
        >
          {{ money(lastStep.value, currency) }}
        </text>
        <template v-if="hover">
          <line
            :x1="hover.x"
            :x2="hover.x"
            :y1="model.pad.top"
            :y2="HEIGHT - model.pad.bottom"
            class="crosshair"
          />
        </template>
      </svg>
      <p
        v-else-if="model.empty"
        class="flex h-full items-center justify-center rounded-6 bg-surface-gray-1 px-4 text-center text-sm text-ink-gray-6"
      >
        Sin compras ni cambios de precio en estas fechas.
      </p>
      <div
        v-if="hover"
        class="pointer-events-none absolute top-0 z-[1] min-w-36 rounded-6 border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm shadow-lg"
        :style="tipStyle"
        role="status"
      >
        <p class="font-medium text-ink-gray-9">{{ dayLabel(hover.t) }}</p>
        <p v-if="hover.price !== null" class="num text-ink-gray-8">
          Precio {{ money(hover.price, currency) }}
        </p>
        <template v-if="hover.point">
          <p class="num text-ink-gray-8">
            Costo {{ money(hover.point.value, currency) }}
            <span v-if="hover.margin !== null" class="text-ink-gray-6"
              >· margen {{ hover.margin }} %</span
            >
          </p>
          <p v-if="hover.point.supplier" class="truncate text-ink-gray-6">
            {{ hover.point.supplier }} · {{ qtyLabel(hover.point.qty) }}
          </p>
        </template>
      </div>
    </div>
  </figure>
</template>
<script setup>
import { computed, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import { chartModel, marginPct, money } from '@/composables/usePrecios'

const props = defineProps({
  history: { type: Object, required: true },
  list: { type: String, required: true },
  currency: { type: String, default: 'MXN' },
  unit: { type: String, default: 'pieza' },
})

const HEIGHT = 208
const NEAR = 24
const box = ref(null)
const { width } = useElementSize(box)
const hover = ref(null)

const model = computed(() =>
  chartModel(props.history, {
    list: props.list,
    width: Math.max(240, Math.round(width.value || 0)),
    height: HEIGHT,
  }),
)
const lastStep = computed(
  () => model.value.steps?.[model.value.steps.length - 1] || null,
)

const summary = computed(() => {
  const m = model.value
  if (m.empty) return 'Sin datos'
  const bits = [`Precio en ${props.list}`]
  if (m.points.length)
    bits.push(
      `${m.points.length} compras, de ${money(Math.min(...m.points.map((p) => p.value)), props.currency)} a ${money(Math.max(...m.points.map((p) => p.value)), props.currency)}`,
    )
  return bits.join('; ')
})

const shortMoney = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
})
function axisMoney(value) {
  return `$${shortMoney.format(value)}`
}
function monthLabel(t) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' })
    .format(new Date(t))
    .replace('.', '')
}
function dayLabel(t) {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(t))
    .replace(/\./g, '')
}
function qtyLabel(qty) {
  const n = Number(qty || 0)
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${props.unit}`
}

function scrub(event) {
  const m = model.value
  if (m.empty) return
  const rect = event.currentTarget.getBoundingClientRect()
  const x = Math.min(
    Math.max(event.clientX - rect.left, m.pad.left),
    width.value - m.pad.right,
  )
  let point = null
  let best = NEAR
  for (const candidate of m.points) {
    const d = Math.abs(candidate.x - x)
    if (d <= best) {
      best = d
      point = candidate
    }
  }
  const t = point ? point.t : m.timeAt(x)
  const price = m.priceAt(t)
  hover.value = {
    x: point ? point.x : x,
    t,
    point,
    price,
    margin: point && price ? marginPct(price, point.value) : null,
  }
}

const tipStyle = computed(() => {
  if (!hover.value) return {}
  const w = width.value || 0
  const left = hover.value.x > w / 2 ? hover.value.x - 156 : hover.value.x + 12
  return { left: `${Math.max(0, Math.min(left, w - 150))}px` }
})
</script>
<style scoped>
.precios-chart {
  --chart-price: #1d4ed8;
  --chart-cost: #ea580c;
}
:global([data-theme='dark']) .precios-chart {
  --chart-price: #3b82f6;
  --chart-cost: #ea580c;
}
.grid-lines line {
  stroke: var(--outline-gray-1, #ededed);
  stroke-width: 1;
}
.grid-lines text {
  fill: var(--ink-gray-5, #999);
  font-size: 11px;
}
.price-line {
  fill: none;
  stroke: var(--chart-price);
  stroke-width: 2;
  stroke-linejoin: round;
}
.cost-line {
  fill: none;
  stroke: var(--chart-cost);
  stroke-width: 2;
  stroke-opacity: 0.45;
  stroke-linejoin: round;
}
.cost-dot {
  fill: var(--chart-cost);
  stroke: var(--surface-base, #fff);
  stroke-width: 2;
}
.cost-dot.is-active {
  r: 6;
}
.crosshair {
  stroke: var(--ink-gray-5, #999);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
.end-label {
  font-size: 12px;
  font-weight: 600;
}
.price-ink {
  fill: var(--ink-gray-8, #333);
}
.legend-line {
  display: inline-block;
  width: 16px;
  height: 2px;
  border-radius: 1px;
}
.legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 9999px;
}
.legend-price {
  background: var(--chart-price);
}
.legend-cost {
  background: var(--chart-cost);
}
</style>
