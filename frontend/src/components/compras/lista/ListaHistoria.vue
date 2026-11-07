<template>
  <!-- One product's price over time on one money axis: the supplier's printed
       price as steps that hold until the next list, what the shop paid (receipts)
       and what it ordered (purchase orders) as dots. Hover or drag reads a day;
       the list under the chart is its table view. -->
  <figure class="lista-chart m-0" data-lista-chart>
    <figcaption
      class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-gray-7"
    >
      <span v-if="model.steps.length" class="inline-flex items-center gap-1.5">
        <span class="legend-line" aria-hidden="true" />
        {{ __('List price', null, 'Lista') }}
      </span>
      <span v-if="hasSource('recibo')" class="inline-flex items-center gap-1.5">
        <span class="legend-dot" aria-hidden="true" />
        {{ __('Paid', null, 'Lista') }}
      </span>
      <span v-if="hasSource('orden')" class="inline-flex items-center gap-1.5">
        <span class="legend-dot legend-hollow" aria-hidden="true" />
        {{ __('Ordered', null, 'Lista') }}
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
        <g class="grid">
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
        <path v-if="model.path" :d="model.path" class="step-line" />
        <circle
          v-for="(dot, index) in model.dots"
          :key="index"
          :cx="dot.x"
          :cy="dot.y"
          r="4.5"
          :class="[
            'dot',
            dot.source === 'orden' ? 'dot-hollow' : '',
            hover?.dot === dot ? 'is-active' : '',
          ]"
        />
        <line
          v-if="hover"
          :x1="hover.x"
          :x2="hover.x"
          :y1="model.pad.top"
          :y2="HEIGHT - model.pad.bottom"
          class="crosshair"
        />
      </svg>
      <p
        v-else-if="model.empty"
        class="flex h-full items-center justify-center rounded-6 bg-surface-gray-1 px-4 text-center text-sm text-ink-gray-6"
      >
        {{
          __('No earlier lists or purchases of this product.', null, 'Lista')
        }}
      </p>
      <div
        v-if="hover"
        class="pointer-events-none absolute top-0 z-[1] min-w-36 rounded-6 border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm shadow-lg"
        :style="tipStyle"
        role="status"
      >
        <p class="font-medium text-ink-gray-9">{{ dayLabel(hover.t) }}</p>
        <p v-if="hover.price !== null" class="num text-ink-gray-8">
          {{ __('List {0}', [money(hover.price, currency)], 'Lista') }}
        </p>
        <template v-if="hover.dot">
          <p class="num text-ink-gray-8">
            {{
              hover.dot.source === 'orden'
                ? __(
                    'Ordered at {0}',
                    [money(hover.dot.value, currency)],
                    'Lista',
                  )
                : __('Paid {0}', [money(hover.dot.value, currency)], 'Lista')
            }}
          </p>
          <p v-if="hover.dot.supplier_name" class="truncate text-ink-gray-6">
            {{ hover.dot.supplier_name }}
          </p>
        </template>
      </div>
    </div>
    <ul
      v-if="points.length"
      class="mt-3 divide-y divide-outline-gray-1 text-sm"
      :aria-label="__('Price points', null, 'Lista')"
    >
      <li
        v-for="(p, index) in [...points].reverse()"
        :key="index"
        class="flex items-center gap-3 py-1.5"
      >
        <span class="w-20 flex-none text-ink-gray-6">{{
          formatDate(p.date)
        }}</span>
        <span class="min-w-0 flex-1 truncate">
          {{ sourceWord(p) }}
          <span v-if="p.supplier_name" class="text-ink-gray-6"
            >· {{ p.supplier_name }}</span
          >
        </span>
        <span class="num flex-none tabular-nums">{{
          money(p.price, currency)
        }}</span>
      </li>
    </ul>
  </figure>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import { money } from '@/composables/useCompras'
import { formatDate } from '@/utils/display'
import { historyModel } from '@/utils/listaPrecios'

const props = defineProps({
  points: { type: Array, default: () => [] },
  currency: { type: String, default: 'MXN' },
})

const HEIGHT = 180
const NEAR = 20
const box = ref(null)
const { width } = useElementSize(box)
const hover = ref(null)

const model = computed(() =>
  historyModel(props.points, {
    width: Math.max(240, Math.round(width.value || 0)),
    height: HEIGHT,
  }),
)
const hasSource = (source) => props.points.some((p) => p.source === source)

const summary = computed(() => {
  if (model.value.empty) return __('No price points', null, 'Lista')
  const values = props.points.map((p) => Number(p.price))
  return __(
    '{0} price points, from {1} to {2}',
    [
      props.points.length,
      money(Math.min(...values), props.currency),
      money(Math.max(...values), props.currency),
    ],
    'Lista',
  )
})

const shortMoney = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
})
const axisMoney = (value) => `$${shortMoney.format(value)}`
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
function sourceWord(p) {
  if (p.source === 'lista') return __('List price', null, 'Lista')
  if (p.source === 'orden') return __('Ordered', null, 'Lista')
  return __('Paid', null, 'Lista')
}

function scrub(event) {
  const m = model.value
  if (m.empty) return
  const rect = event.currentTarget.getBoundingClientRect()
  const x = Math.min(
    Math.max(event.clientX - rect.left, m.pad.left),
    width.value - m.pad.right,
  )
  let dot = null
  let best = NEAR
  for (const candidate of m.dots) {
    const d = Math.abs(candidate.x - x)
    if (d <= best) {
      best = d
      dot = candidate
    }
  }
  const t = dot ? dot.t : m.timeAt(x)
  hover.value = { x: dot ? dot.x : x, t, dot, price: m.priceAt(t) }
}

const tipStyle = computed(() => {
  if (!hover.value) return {}
  const w = width.value || 0
  const left = hover.value.x > w / 2 ? hover.value.x - 156 : hover.value.x + 12
  return { left: `${Math.max(0, Math.min(left, w - 150))}px` }
})
</script>

<style scoped>
/* Two hues, validated with the dataviz palette script in both themes
   (light #1d4ed8 / #ea580c, dark #3b82f6 / #ea580c). */
.lista-chart {
  --chart-list: #1d4ed8;
  --chart-paid: #ea580c;
}
:global([data-theme='dark']) .lista-chart {
  --chart-list: #3b82f6;
  --chart-paid: #ea580c;
}
.grid line {
  stroke: var(--outline-gray-1, #ededed);
  stroke-width: 1;
}
.grid text {
  fill: var(--ink-gray-5, #999);
  font-size: 11px;
}
.step-line {
  fill: none;
  stroke: var(--chart-list);
  stroke-width: 2;
  stroke-linejoin: round;
}
.dot {
  fill: var(--chart-paid);
  stroke: var(--surface-base, #fff);
  stroke-width: 2;
}
.dot-hollow {
  fill: var(--surface-base, #fff);
  stroke: var(--chart-paid);
}
.dot.is-active {
  r: 6;
}
.crosshair {
  stroke: var(--ink-gray-5, #999);
  stroke-dasharray: 3 3;
}
.legend-line {
  display: inline-block;
  width: 14px;
  height: 2px;
  background: var(--chart-list);
}
.legend-dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--chart-paid);
}
.legend-hollow {
  background: transparent;
  border: 2px solid var(--chart-paid);
}
</style>
