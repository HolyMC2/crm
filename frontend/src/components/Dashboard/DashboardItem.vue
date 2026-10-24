<template>
  <div class="flex h-full w-full flex-col">
    <div
      v-if="item.data?.unavailable"
      class="flex h-full w-full flex-col justify-center gap-2 rounded bg-surface-base p-4 text-ink-gray-7"
      role="status"
    >
      <strong>{{ item.data.title || __('Metric unavailable') }}</strong>
      <p class="text-sm">{{ item.data.reason }}</p>
    </div>
    <div
      v-else-if="item.type == 'number_chart'"
      class="flex min-h-0 w-full flex-1 rounded shadow overflow-hidden cursor-pointer"
    >
      <Tooltip :text="__(item.data?.tooltip || '')" class="w-full">
        <NumberCard
          v-if="item.data"
          :key="index"
          :card="false"
          class="h-full px-3 py-2"
          v-bind="numberCardProps(item.data)"
        />
      </Tooltip>
    </div>
    <div
      v-else-if="item.type == 'spacer'"
      class="rounded bg-surface-base h-full overflow-hidden text-ink-gray-5 flex items-center justify-center"
      :class="editing ? 'border border-dashed border-outline-gray-2' : ''"
    >
      {{ editing ? __('Spacer') : '' }}
    </div>
    <div
      v-else-if="item.type == 'axis_chart'"
      class="min-h-0 w-full flex-1 rounded-md bg-surface-base shadow"
    >
      <component
        :is="axisChartComponent(item.data)"
        v-if="item.data"
        v-bind="axisChartProps(item.data)"
      />
    </div>
    <div
      v-else-if="item.type == 'donut_chart'"
      class="min-h-0 w-full flex-1 rounded-md bg-surface-base shadow overflow-hidden"
    >
      <DonutChart v-if="item.data" v-bind="donutChartProps(item.data)" />
    </div>
    <p
      v-if="item.data?.metric_note && !item.data?.unavailable"
      role="note"
      class="max-h-10 shrink-0 overflow-auto bg-surface-base px-3 py-1 text-xs text-ink-gray-6"
    >
      {{ item.data.metric_note }}
    </p>
  </div>
</template>
<script setup>
import { Tooltip } from 'frappe-ui'
import { DonutChart, NumberCard } from 'frappe-ui/charts'
import {
  axisChartComponent,
  axisChartProps,
  donutChartProps,
  numberCardProps,
} from './chartProps'

defineProps({
  index: { type: Number, required: true },
  item: { type: Object, required: true },
  editing: { type: Boolean, default: false },
})
</script>
