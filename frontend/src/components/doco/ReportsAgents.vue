<template>
  <ReportBlock
    :title="__('Tratos por agente')"
    :description="
      __(
        'Esta consulta admite su propio periodo, sin filtros de responsable, pipeline o empresa.',
      )
    "
    :loading="resource.loading"
    :error="resource.error"
    :empty="false"
    @retry="resource.reload"
  >
    <label
      class="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-gray-7"
    >
      {{ __('Periodo de tratos por agente') }}
      <select
        v-model="period"
        class="rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-2 text-ink-gray-9"
      >
        <option value="week">{{ __('Esta semana') }}</option>
        <option value="month">{{ __('Este mes') }}</option>
        <option value="year">{{ __('Este año') }}</option>
      </select>
    </label>
    <p v-if="resource.data" class="mb-3 text-sm text-ink-gray-6">
      {{ __('Del {0} al {1}', [resource.data.from, resource.data.to]) }}
    </p>
    <label
      class="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-gray-7"
    >
      {{ __('Ordenar por') }}
      <select
        v-model="sortKey"
        class="min-w-0 rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-2 text-ink-gray-9"
      >
        <option v-for="column in columns" :key="column.key" :value="column.key">
          {{ column.label }}
        </option>
      </select>
      <button
        type="button"
        class="rounded-lg border border-outline-gray-2 px-3 py-2 text-ink-gray-9 focus-visible:outline focus-visible:outline-2"
        @click="direction = direction === 'desc' ? 'asc' : 'desc'"
      >
        {{ direction === 'desc' ? __('Descendente') : __('Ascendente') }}
      </button>
    </label>
    <p v-if="!agents.length" class="py-4 text-sm text-ink-gray-6">
      {{ __('Sin actividad en el periodo') }}
    </p>
    <MarketingTable
      v-else
      :rows="agents"
      label-key="agent_name"
      :columns="columns.slice(1)"
      :currency="resource.data?.currency"
    />
  </ReportBlock>
</template>

<script setup>
import { computed, ref } from 'vue'
import { sortAgents } from '@/utils/agentMetricsFormat'
import ReportBlock from '@/components/Reports/ReportBlock.vue'
import MarketingTable from '@/components/Reports/MarketingTable.vue'
import { useMarketingResource } from '@/components/Reports/MarketingData'
const period = ref('month')
const sortKey = ref('won_value')
const direction = ref('desc')
const resource = useMarketingResource(
  'doco_marketing.api.agent_metrics.get_agent_metrics',
  () => ({ period: period.value }),
)
const agents = computed(() =>
  sortAgents(resource.data?.agents || [], sortKey.value, direction.value),
)
const columns = [
  { key: 'agent_name', label: __('Agente') },
  { key: 'open', label: __('Abiertos') },
  { key: 'won', label: __('Ganados') },
  { key: 'won_value', label: __('Valor ganado'), money: true },
  {
    key: 'median_response_secs',
    label: __('Respuesta mediana'),
    duration: true,
  },
]
</script>
