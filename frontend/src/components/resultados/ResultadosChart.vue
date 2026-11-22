<template>
  <!-- Trend: one bar per day (or week, or month), the comparison over them. -->
  <ResultadosTrend
    v-if="chart.type === 'trend'"
    :points="chart.points || []"
    :prev="compara === 'no' ? null : chart.prev || null"
    :compara="compara"
    :currency="currency"
    @filter="(f) => emit('filter', f)"
  />

  <!-- Monthly goal: how much is reached and where the month is heading. -->
  <div v-else-if="chart.type === 'progress'" data-testid="chart-progress">
    <div class="relative h-3 overflow-hidden rounded-full bg-surface-gray-2">
      <div
        class="absolute inset-y-0 left-0 rounded-full opacity-30"
        :style="{
          width: `${clamp(chart.projected_pct)}%`,
          background: 'var(--brand)',
        }"
      />
      <div
        class="absolute inset-y-0 left-0 rounded-full"
        :style="{ width: `${clamp(chart.pct)}%`, background: 'var(--brand)' }"
      />
    </div>
    <p class="mt-1.5 text-xs text-ink-gray-6">
      {{
        __('Heading to {0} of the goal at this pace', [
          formatValue(chart.projected_pct, 'percent'),
        ])
      }}
    </p>
  </div>

  <!-- Ranked rows: shop, group, product, seller, payment method. -->
  <ol
    v-else-if="chart.type === 'bars'"
    class="flex flex-col"
    data-testid="chart-bars"
  >
    <li v-for="(row, i) in shownRows" :key="`${row.label}-${i}`">
      <component
        :is="rowTag(row)"
        v-bind="rowAttrs(row)"
        class="group flex w-full flex-col gap-1.5 rounded-6 px-2 py-2 text-left"
        :class="rowTag(row) !== 'div' ? 'hover:bg-surface-gray-1' : ''"
        @click="rowClick($event, row)"
      >
        <span class="flex items-baseline gap-2">
          <span
            class="w-5 shrink-0 text-xs tabular-nums text-ink-gray-5"
            aria-hidden="true"
            >{{ i + 1 }}</span
          >
          <span class="min-w-0 flex-1">
            <span
              class="block truncate text-sm font-medium text-ink-gray-8"
              :class="
                rowTag(row) !== 'div' ? 'group-hover:text-ink-gray-9' : ''
              "
              >{{ row.label }}</span
            >
            <span
              v-if="row.sub"
              class="block truncate text-xs text-ink-gray-6"
              >{{ row.sub }}</span
            >
          </span>
          <span class="shrink-0 text-right">
            <span
              class="block text-sm font-semibold tabular-nums text-ink-gray-9"
              >{{
                formatValue(row.value, chart.format || 'money', currency)
              }}</span
            >
            <span
              v-if="row.share_pct !== undefined || rowDelta(row)"
              class="flex justify-end gap-1.5 text-xs tabular-nums"
            >
              <span
                v-if="row.share_pct !== undefined"
                class="text-ink-gray-5"
                >{{ formatValue(row.share_pct, 'percent') }}</span
              >
              <span
                v-if="rowDelta(row)"
                :class="
                  rowDelta(row).tone === 'up'
                    ? 'text-ink-green-7'
                    : rowDelta(row).tone === 'down'
                      ? 'text-ink-red-7'
                      : 'text-ink-gray-5'
                "
                >{{ rowDelta(row).label }}</span
              >
            </span>
          </span>
        </span>
        <span
          class="ml-7 block h-1.5 overflow-hidden rounded-full bg-surface-gray-2"
          aria-hidden="true"
        >
          <span
            class="block h-full rounded-full"
            :style="{
              width: `${barWidth(row.value)}%`,
              background: 'var(--brand)',
              opacity: i === 0 ? 1 : 0.75,
            }"
          />
        </span>
      </component>
    </li>
    <li v-if="hiddenRows" class="px-2 pt-1">
      <button
        class="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-gray-7 hover:text-ink-gray-9"
        @click="expanded = !expanded"
      >
        {{
          expanded
            ? __('Show fewer')
            : __('Show {0} more', [String(hiddenRows)])
        }}
        <span
          :class="expanded ? 'lucide-chevron-up' : 'lucide-chevron-down'"
          class="size-4"
          aria-hidden="true"
        />
      </button>
    </li>
  </ol>

  <!-- Columns: sales by hour or by weekday, the peak highlighted. -->
  <div v-else-if="chart.type === 'columns'" data-testid="chart-columns">
    <div
      class="mt-5 flex h-40 items-end gap-1"
      role="img"
      :aria-label="columnsSummary"
    >
      <div
        v-for="row in chart.rows"
        :key="row.key"
        class="group relative flex h-full min-w-0 flex-1 flex-col justify-end"
        :title="`${axisLabel(chart.axis, row.key, true)} · ${formatValue(row.value, chart.format, currency)}${row.tickets ? ` · ${row.tickets} tickets` : ''}`"
      >
        <span
          v-if="row.value === columnMax && row.value > 0"
          class="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-medium tabular-nums text-ink-gray-8"
          >{{ compactValue(row.value, chart.format, currency) }}</span
        >
        <span
          class="block w-full rounded-t-5 transition-opacity group-hover:opacity-100"
          :style="{
            height: `${Math.max(row.value > 0 ? 3 : 1, (row.value / (columnMax || 1)) * 100)}%`,
            background: row.value > 0 ? 'var(--brand)' : undefined,
            opacity: row.value === columnMax ? 1 : 0.55,
          }"
          :class="row.value > 0 ? '' : 'bg-surface-gray-2'"
        />
      </div>
    </div>
    <div class="mt-1.5 flex gap-1 text-xs text-ink-gray-5" aria-hidden="true">
      <span
        v-for="(row, i) in chart.rows"
        :key="row.key"
        class="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center"
        >{{ columnLabel(row, i) }}</span
      >
    </div>
  </div>

  <!-- Hour × weekday: darker cells sold more. -->
  <div
    v-else-if="chart.type === 'heatmap'"
    class="overflow-x-auto"
    data-testid="chart-heatmap"
  >
    <table
      class="w-full table-fixed border-separate"
      style="border-spacing: 3px"
    >
      <thead>
        <tr>
          <th class="w-12" />
          <th
            v-for="(hour, i) in chart.hours"
            :key="hour"
            scope="col"
            class="whitespace-nowrap text-left text-xs font-normal text-ink-gray-5"
          >
            {{ i % hourStep === 0 ? axisLabel('hour', hour) : '' }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, day) in chart.values" :key="day">
          <th
            scope="row"
            class="pr-1 text-left text-xs font-normal capitalize text-ink-gray-6"
          >
            {{ axisLabel('weekday', day) }}
          </th>
          <td
            v-for="(value, i) in row"
            :key="i"
            class="h-7 rounded-4"
            :class="value > 0 ? '' : 'bg-surface-gray-2'"
            :style="value > 0 ? heatStyle(value) : undefined"
            :title="`${axisLabel('weekday', day, true)} ${axisLabel('hour', chart.hours[i])} · ${formatValue(value, chart.format, currency)}`"
          />
        </tr>
      </tbody>
    </table>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import ResultadosTrend from '@/components/resultados/ResultadosTrend.vue'
import {
  axisLabel,
  compactValue,
  deltaChip,
  drillHref,
  formatValue,
  routerPath,
} from '@/composables/useResultados'

const ROWS_SHOWN = 6

const props = defineProps({
  chart: { type: Object, required: true },
  currency: { type: String, default: '' },
  compara: { type: String, default: 'anterior' },
  back: { type: String, default: '' },
  cardKey: { type: String, default: '' },
})
const emit = defineEmits(['filter'])
const router = useRouter()
const expanded = ref(false)

const clamp = (n) => Math.max(0, Math.min(100, Number(n) || 0))

// ── ranked rows ──────────────────────────────────────────────────────
const rows = computed(() => props.chart.rows || [])
const shownRows = computed(() =>
  expanded.value ? rows.value : rows.value.slice(0, ROWS_SHOWN),
)
const hiddenRows = computed(() => Math.max(0, rows.value.length - ROWS_SHOWN))
const rowMax = computed(() =>
  Math.max(0, ...rows.value.map((r) => Number(r.value) || 0)),
)
const barWidth = (value) =>
  rowMax.value > 0 ? Math.max(1, (Math.max(0, value) / rowMax.value) * 100) : 0
const rowDelta = (row) => deltaChip(row, props.compara)
const rowHref = (row) => drillHref(row.drill, props.back)
// A filter row is a link to this same board narrowed to it (a plain «button»
// would resolve to frappe-ui's registered Button component).
function filterHref(row) {
  const url = new URL(props.back || '/crm/resultados', 'https://x.invalid')
  for (const [key, value] of Object.entries(row.filter))
    url.searchParams.set(key, value)
  return `${url.pathname}${url.search}`
}
const rowTag = (row) => (row.filter || rowHref(row) ? 'a' : 'div')
const rowAttrs = (row) => {
  if (row.filter)
    return { href: filterHref(row), title: __('Show only {0}', [row.label]) }
  const href = rowHref(row)
  return href ? { href } : {}
}
function rowClick(event, row) {
  if (row.filter) {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return
    event.preventDefault()
    return emit('filter', row.filter)
  }
  const href = rowHref(row)
  const local = href && routerPath(href)
  if (!local || event.metaKey || event.ctrlKey || event.shiftKey) return
  event.preventDefault()
  router.push(local)
}

// ── columns ──────────────────────────────────────────────────────────
const columnMax = computed(() =>
  Math.max(0, ...(props.chart.rows || []).map((r) => Number(r.value) || 0)),
)
function columnLabel(row, i) {
  const n = props.chart.rows.length
  if (props.chart.axis === 'hour') {
    const step = n > 12 ? 3 : n > 6 ? 2 : 1
    if (i % step) return ''
  }
  return axisLabel(props.chart.axis, row.key)
}
const columnsSummary = computed(() => {
  const top = (props.chart.rows || []).find((r) => r.value === columnMax.value)
  return top
    ? __('Most sales: {0}', [axisLabel(props.chart.axis, top.key, true)])
    : ''
})

// ── heatmap ──────────────────────────────────────────────────────────
const heatMax = computed(() =>
  Math.max(0, ...(props.chart.values || []).flat().map((v) => Number(v) || 0)),
)
const hourStep = computed(() => ((props.chart.hours || []).length > 12 ? 3 : 2))
function heatStyle(value) {
  const f = heatMax.value ? value / heatMax.value : 0
  return { background: 'var(--brand)', opacity: 0.15 + f * 0.85 }
}
</script>
