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
      <Tooltip :text="__(item.data?.tooltip || '')">
        <NumberChart
          v-if="item.data"
          :key="index"
          class="!items-start !px-3 !pt-2 !pb-2"
          :config="item.data"
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
      <AxisChart v-if="item.data" :config="item.data" />
    </div>
    <div
      v-else-if="item.type == 'donut_chart'"
      class="min-h-0 w-full flex-1 rounded-md bg-surface-base shadow overflow-hidden"
    >
      <DonutChart v-if="item.data" :config="item.data" />
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
import { AxisChart, DonutChart, NumberChart, Tooltip } from 'frappe-ui'

defineProps({
  index: { type: Number, required: true },
  item: { type: Object, required: true },
  editing: { type: Boolean, default: false },
})
</script>
