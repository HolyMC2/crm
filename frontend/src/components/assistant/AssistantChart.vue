<template>
  <!-- The chart an answer carries, with its values one tap away: the table
       is the chart's text twin (screen readers, copying a figure). -->
  <figure class="min-w-0" data-testid="assistant-chart" :data-kind="chart.kind">
    <!-- The chart fills its parent (its root is `h-full`), so the height
         lives on this box, as in ReportChart. -->
    <div
      class="w-full min-w-0"
      :class="drawn.component === 'donut' ? 'h-80' : 'h-56'"
    >
      <DonutChart
        v-if="drawn.component === 'donut'"
        v-bind="drawn.props"
        :title="chart.title"
        :subtitle="chart.subtitle"
      />
      <LineChart
        v-else-if="drawn.component === 'line'"
        v-bind="drawn.props"
        :title="chart.title"
        :subtitle="chart.subtitle"
      />
      <BarChart
        v-else
        v-bind="drawn.props"
        :title="chart.title"
        :subtitle="chart.subtitle"
      />
    </div>
    <details class="mt-2 text-sm">
      <summary class="cursor-pointer py-2 text-ink-gray-6">
        {{ __('View chart values') }}
      </summary>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-ink-gray-8">
          <thead>
            <tr class="text-ink-gray-6">
              <th
                v-for="(column, index) in table.columns"
                :key="index"
                scope="col"
                class="py-1 pr-3 font-medium"
                :class="index && 'text-right'"
              >
                {{ column }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-gray-2">
            <tr v-for="(row, index) in table.rows" :key="index">
              <td
                v-for="(cell, at) in row"
                :key="at"
                class="py-1.5 pr-3"
                :class="at && 'num text-right'"
              >
                {{ cell }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </figure>
</template>
<script setup>
import { computed } from 'vue'
import { BarChart, DonutChart, LineChart } from 'frappe-ui/charts'
import { chartProps, tableOf } from './assistantChart'

const props = defineProps({
  chart: { type: Object, required: true },
  answer: { type: Object, default: null },
})
const drawn = computed(() => chartProps(props.chart))
const table = computed(() => tableOf(props.answer, props.chart))
</script>
