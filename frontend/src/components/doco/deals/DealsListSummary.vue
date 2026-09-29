<!--
  Deals list strip: pipeline + stage quick filters, the totals of everything
  the list matches (count · value · probability-weighted, exact across all
  pages, from aggregate_deal_metrics) and the Funnel toggle. On a phone it also
  carries the «Filters» button that opens the bottom sheet.

  Presentational: the page owns the filters, the metrics and the funnel state.
-->
<template>
  <div
    class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-outline-gray-1 px-3 pb-2.5 sm:px-5"
  >
    <div v-if="pipelines.length" class="w-44 flex-none">
      <FormControl
        type="select"
        size="sm"
        variant="outline"
        :aria-label="__('Sales pipeline')"
        :model-value="pipeline"
        :options="pipelineOptions"
        @update:model-value="(v) => emit('update:pipeline', v || '')"
      />
    </div>
    <div v-if="stageOptions.length" class="w-40 flex-none">
      <FormControl
        type="select"
        size="sm"
        variant="outline"
        :aria-label="__('Stage')"
        :model-value="stage"
        :options="stageSelectOptions"
        @update:model-value="(v) => emit('update:stage', v || '')"
      />
    </div>

    <div
      class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1 text-sm"
      aria-live="polite"
    >
      <button
        v-if="error"
        type="button"
        class="text-ink-red-6 underline-offset-2 hover:underline"
        @click="emit('retry')"
      >
        {{ __('Totals unavailable · Retry') }}
      </button>
      <template v-else>
        <span class="text-ink-gray-8">
          <span class="font-semibold">{{ loading ? '…' : summary.count }}</span>
          {{ __('deals') }}
        </span>
        <span class="text-ink-gray-7" :title="__('Total value')">
          {{ __('Value') }}
          <span class="font-semibold text-ink-gray-8">{{
            loading ? '…' : formatMoney(summary.value)
          }}</span>
        </span>
        <span
          class="text-ink-gray-6"
          :title="__('Sum of each open deal\'s value × its probability')"
        >
          {{ __('Weighted') }}
          <span class="font-medium text-ink-gray-7">{{
            loading ? '…' : formatMoney(summary.weighted)
          }}</span>
        </span>
        <span v-if="summary.missingFx" class="text-xs text-ink-amber-7">
          {{ __('Missing exchange rate') }}: {{ summary.missingFx }}
        </span>
      </template>
    </div>

    <div class="ml-auto flex flex-none items-center gap-2">
      <Button
        v-if="showFilters"
        size="sm"
        :label="
          filterCount ? `${__('Filters')} · ${filterCount}` : __('Filters')
        "
        :theme="filterCount ? 'green' : 'gray'"
        variant="subtle"
        @click="emit('openFilters')"
      />
      <Button
        size="sm"
        :variant="funnel ? 'solid' : 'subtle'"
        :label="__('Funnel')"
        iconLeft="filter"
        :aria-pressed="funnel"
        @click="emit('update:funnel', !funnel)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { FormControl } from 'frappe-ui'
import { money } from '@/utils/numberFormat'

const props = defineProps({
  summary: { type: Object, required: true },
  currency: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  error: { type: Boolean, default: false },
  pipelines: { type: Array, default: () => [] },
  pipeline: { type: String, default: '' },
  stage: { type: String, default: '' },
  stageOptions: { type: Array, default: () => [] },
  funnel: { type: Boolean, default: false },
  showFilters: { type: Boolean, default: false },
  filterCount: { type: Number, default: 0 },
})

const emit = defineEmits([
  'update:pipeline',
  'update:stage',
  'update:funnel',
  'retry',
  'openFilters',
])

const pipelineOptions = computed(() => [
  { label: __('All pipelines'), value: '' },
  ...props.pipelines.map((p) => ({
    label: p.archived
      ? `${p.pipeline_name || p.name} · ${__('Archived')}`
      : p.pipeline_name || p.name,
    value: p.name,
  })),
])

const stageSelectOptions = computed(() => [
  { label: __('All stages'), value: '' },
  ...props.stageOptions.map((s) => ({ label: __(s.label), value: s.value })),
])

function formatMoney(value) {
  return money(Number(value) || 0, props.currency || null)
}
</script>
