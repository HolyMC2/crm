<template>
  <ReportBlock
    :title="title"
    :description="description"
    :loading="loading"
    :error="error"
    :empty="!rows.length"
    :empty-message="
      __('No matching groups for this metric in the selected period.')
    "
    @retry="$emit('retry')"
  >
    <!-- The chart fills its parent (its root is `h-full`), so the height
         lives on this box: a class on BarChart itself loses to `h-full`. -->
    <div class="h-44 w-full min-w-0">
      <BarChart
        :data="data"
        x="label"
        y="value"
        horizontal
        :x-axis="xAxis"
        :y-axis="yAxis"
        :series-config="seriesConfig"
        :echart-options="echartOptions"
        @select="onSelect"
      />
    </div>
    <details class="mt-2 text-sm">
      <summary class="cursor-pointer py-2 text-ink-gray-6">
        {{ selectable ? __('View records by group') : __('View chart values') }}
      </summary>
      <ul class="divide-y divide-outline-gray-2">
        <li v-for="(row, index) in rows" :key="index">
          <component
            :is="selectable ? 'button' : 'div'"
            class="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 py-2 text-left text-ink-gray-8"
            :class="selectable && 'rounded-4 hover:bg-surface-gray-2'"
            @click="selectable && $emit('select', row)"
          >
            <span class="min-w-0 break-words">{{ row.label }}</span
            ><span class="shrink-0 tabular-nums">{{ row.value }}</span>
          </component>
        </li>
      </ul>
    </details>
  </ReportBlock>
</template>
<script setup>
import { computed } from 'vue'
import { BarChart } from 'frappe-ui/charts'
import ReportBlock from './ReportBlock.vue'
const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  rows: { type: Array, default: () => [] },
  valueLabel: { type: String, default: '' },
  loading: Boolean,
  error: { type: String, default: '' },
  selectable: { type: Boolean, default: true },
})
const emit = defineEmits(['select', 'retry'])
// `index` rides along in each row so a selected bar maps back to the caller's
// row whatever the chart did to the label.
const data = computed(() =>
  props.rows.map((row, index) => ({
    index,
    label: `${index + 1}. ${row.label}`,
    value: row.value,
  })),
)
const onSelect = ({ row }) => {
  const selected = props.rows[row?.index]
  if (props.selectable && selected) emit('select', selected)
}
const xAxis = {
  type: 'category',
  echartOptions: {
    inverse: true,
    axisLine: { show: false },
    axisLabel: { width: 108, overflow: 'truncate' },
  },
}
const yAxis = { min: 0 }
const seriesConfig = computed(() => ({
  value: {
    label: props.valueLabel || __('Records'),
    echartOptions: { barMaxWidth: 18 },
  },
}))
const echartOptions = {
  animation: false,
  grid: { top: 8, bottom: 8, left: 0, right: 12, containLabel: true },
}
</script>
