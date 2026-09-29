<template>
  <details class="rounded-xl border border-outline-gray-2 bg-surface-base p-4">
    <summary class="cursor-pointer text-base font-medium text-ink-gray-9">
      {{ __('Desempeño del equipo y sucursales') }}
    </summary>
    <div class="mt-4 space-y-4">
      <ReportBlock
        :title="__('Actividad por agente')"
        :description="
          note(__('Mensajes, llamadas, reparaciones y tratos.'), agentMetrics)
        "
        :loading="score.loading"
        :error="score.error"
        :empty="!score.data?.agents?.length"
        @retry="score.reload"
      >
        <MarketingTable
          :rows="score.data?.agents || []"
          label-key="agent_name"
          :columns="agentColumns"
          :currency="score.data?.currency"
          @drill="forward"
        />
      </ReportBlock>
      <ReportsAgents />
      <ReportBlock
        :title="__('Desempeño por sucursal')"
        :description="
          note(
            __(
              'Tratos por fecha de creación; facturado y cobrado por fecha de factura, en la moneda de cada documento.',
            ),
          )
        "
        :loading="score.loading"
        :error="score.error"
        :empty="!score.data?.shops?.length"
        @retry="score.reload"
      >
        <MarketingTable
          :rows="score.data?.shops || []"
          label-key="shop"
          :columns="shopColumns"
          :currency="score.data?.currency"
          @drill="forward"
        />
      </ReportBlock>
      <ReportBlock
        :title="__('Desempeño por territorio')"
        :description="
          note(__('Territorio y sucursal son dimensiones distintas.'))
        "
        :loading="score.loading"
        :error="score.error"
        :empty="!score.data?.territories?.length"
        @retry="score.reload"
      >
        <MarketingTable
          :rows="score.data?.territories || []"
          label-key="territory"
          :columns="dealColumns"
          :currency="score.data?.currency"
          @drill="forward"
        />
      </ReportBlock>
    </div>
  </details>
</template>

<script setup>
import ReportBlock from './ReportBlock.vue'
import MarketingTable from './MarketingTable.vue'
import ReportsAgents from '@/components/doco/ReportsAgents.vue'
import {
  marketingFilters,
  scopeNote,
  useMarketingResource,
} from './MarketingData'
const props = defineProps({ filters: { type: Object, required: true } })
const emit = defineEmits(['drill'])
const forward = (payload) => emit('drill', payload)
const score = useMarketingResource(
  'doco_marketing.api.reports.get_agent_scorecard',
  () => marketingFilters(props.filters),
)
const note = (text, metrics) =>
  [text, scopeNote(score.meta, metrics)].filter(Boolean).join(' ')
const dealColumns = [
  { key: 'deals', label: __('Tratos') },
  { key: 'won', label: __('Ganados') },
  { key: 'conv_pct', label: __('Conversión'), percent: true },
  { key: 'won_pesos', label: __('Valor ganado'), money: true },
]
const sla = { key: 'sla_kept_pct', label: __('SLA cumplido'), percent: true }
const agentColumns = [
  { key: 'sent', label: __('WhatsApp enviados') },
  { key: 'messenger_sent', label: __('Messenger enviados') },
  { key: 'avg_response_secs', label: __('Respuesta promedio'), duration: true },
  { key: 'calls', label: __('Llamadas') },
  { key: 'repairs', label: __('Reparaciones entregadas') },
  ...dealColumns,
  sla,
]
const shopColumns = [
  ...dealColumns,
  sla,
  { key: 'invoiced', label: __('Facturado'), money: true },
  { key: 'paid', label: __('Cobrado'), money: true },
]
const agentMetrics = Object.fromEntries(
  agentColumns.map((column) => [column.key, column.label]),
)
</script>
