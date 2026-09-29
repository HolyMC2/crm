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
    <AxisChart :config="config" :events="events" class="h-44 w-full min-w-0" />
    <details class="mt-2 text-sm">
      <summary class="cursor-pointer py-2 text-ink-gray-6">
        {{ selectable ? __('View records by group') : __('View chart values') }}
      </summary>
      <ul class="divide-y divide-outline-gray-2">
        <li v-for="(row, index) in rows" :key="index">
          <component
            :is="selectable ? 'button' : 'div'"
            class="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 py-2 text-left text-ink-gray-8"
            :class="selectable && 'rounded hover:bg-surface-gray-2'"
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
import { AxisChart } from 'frappe-ui'
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
const events = {
  click: ({ dataIndex }) => {
    if (props.selectable && props.rows[dataIndex])
      emit('select', props.rows[dataIndex])
  },
}
const config = computed(() => ({
  title: '',
  data: props.rows.map((row, index) => ({
    label: `${index + 1}. ${row.label}`,
    value: row.value,
  })),
  xAxis: { key: 'label', type: 'category' },
  yAxis: { yMin: 0 },
  swapXY: true,
  series: [
    {
      name: 'value',
      type: 'bar',
      color: 'var(--ink-gray-5)',
      echartOptions: { barMaxWidth: 18 },
    },
  ],
  echartOptions: {
    animation: false,
    grid: { top: 8, bottom: 8, left: 0, right: 12, containLabel: true },
    xAxis: {
      axisLabel: { color: 'var(--ink-gray-6)' },
      splitLine: { lineStyle: { color: 'var(--outline-gray-2)' } },
    },
    yAxis: {
      inverse: true,
      axisLabel: {
        width: 108,
        overflow: 'truncate',
        color: 'var(--ink-gray-7)',
      },
    },
    tooltip: {
      renderMode: 'richText',
      backgroundColor: 'var(--surface-gray-2)',
      borderColor: 'var(--outline-gray-2)',
      textStyle: { color: 'var(--ink-gray-8)' },
      formatter: (points) => {
        const point = Array.isArray(points) ? points[0] : points
        const row = props.rows[point?.dataIndex]
        return row
          ? `${row.label}\n${props.valueLabel || __('Records')}: ${row.value}`
          : ''
      },
    },
  },
}))
</script>
