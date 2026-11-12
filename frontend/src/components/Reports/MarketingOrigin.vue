<template>
  <ReportBlock
    :title="__('¿Qué publicaciones y anuncios traen clientes?')"
    :description="description"
    :loading="origin.loading"
    :error="origin.error"
    :empty="!rows.length"
    :empty-message="__('No hay prospectos ni tratos en este periodo.')"
    @retry="origin.reload"
  >
    <template #actions>
      <div
        class="flex flex-wrap items-center gap-2"
        role="group"
        :aria-label="__('Agrupar por')"
      >
        <span class="text-sm text-ink-gray-6">{{ __('Agrupar por') }}</span>
        <button
          v-for="option in ORIGIN_GROUPS"
          :key="option.value"
          type="button"
          :class="[
            'min-h-11 rounded-full px-3 text-sm font-medium',
            option.value === group
              ? 'bg-surface-gray-3 text-ink-gray-9'
              : 'bg-surface-gray-1 text-ink-gray-6 hover:bg-surface-gray-2',
          ]"
          :aria-pressed="option.value === group"
          @click="group = option.value"
        >
          {{ option.label() }}
        </button>
      </div>
    </template>
    <MarketingTable
      :rows="rows"
      label-key="label"
      :columns="columns"
      :currency="origin.data?.currency"
      @drill="(payload) => emit('drill', payload)"
    />
  </ReportBlock>
</template>

<script setup>
import { computed, ref } from 'vue'
import ReportBlock from './ReportBlock.vue'
import MarketingTable from './MarketingTable.vue'
import {
  ORIGIN_GROUPS,
  originParams,
  originRows,
  scopeNote,
  useMarketingResource,
} from './MarketingData'

const props = defineProps({ filters: { type: Object, required: true } })
const emit = defineEmits(['drill'])
const group = ref('utm_source')
const origin = useMarketingResource(
  'doco_marketing.api.reports.get_origin_funnel',
  () => originParams(props.filters, group.value),
)
const rows = computed(() => originRows(origin.data))
const description = computed(() =>
  [
    __(
      'Prospectos y tratos creados en el periodo según la etiqueta del enlace con el que llegó la visita, y cuántos de esos tratos ya se ganaron.',
    ),
    scopeNote(origin.meta),
  ]
    .filter(Boolean)
    .join(' '),
)
const columns = [
  { key: 'leads', label: __('Prospectos') },
  { key: 'deals', label: __('Tratos') },
  { key: 'won', label: __('Ganados') },
  { key: 'won_value', label: __('Valor ganado'), money: true },
  { key: 'lead_to_deal_pct', label: __('De prospecto a trato'), percent: true },
  { key: 'deal_to_won_pct', label: __('De trato a ganado'), percent: true },
]
</script>
