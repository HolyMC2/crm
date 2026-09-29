<template>
  <details class="rounded-xl border border-outline-gray-2 bg-surface-base p-4">
    <summary class="cursor-pointer text-base font-medium text-ink-gray-9">
      {{ __('Envíos, automatizaciones y pendientes') }}
    </summary>
    <div class="mt-4 space-y-4">
      <ReportBlock
        :title="__('Salud de envíos')"
        :description="
          __('Últimos 7 días; independiente del periodo y los demás filtros.')
        "
        :loading="dispatch.loading"
        :error="dispatch.error"
        :empty="!statuses.length"
        @retry="dispatch.reload"
      >
        <dl class="flex flex-wrap gap-4 text-sm">
          <div v-for="row in statuses" :key="row.status">
            <dt class="text-ink-gray-6">{{ __(row.status) }}</dt>
            <dd class="mt-1 font-medium tabular-nums text-ink-gray-9">
              {{ row.count }}
            </dd>
          </div>
        </dl>
        <h4
          v-if="deferred.length"
          class="mb-2 mt-4 text-sm font-medium text-ink-gray-9"
        >
          {{ __('Diferidos: siguen pendientes') }}
        </h4>
        <MarketingTable
          :rows="deferred"
          label-key="reason"
          :columns="countColumns"
        />
        <h4
          v-if="dispatch.data?.top_reasons?.length"
          class="mb-2 mt-4 text-sm font-medium text-ink-gray-9"
        >
          {{ __('Motivos de fallo u omisión') }}
        </h4>
        <MarketingTable
          :rows="dispatch.data?.top_reasons || []"
          label-key="reason"
          :columns="reasonColumns"
        />
      </ReportBlock>
      <ReportBlock
        :title="__('Resultados de automatizaciones')"
        :description="
          __(
            'Borradores, envíos y respuestas por flujo y paso · solo periodo seleccionado',
          )
        "
        :loading="flows.loading"
        :error="flows.error"
        :empty="!flows.data?.length"
        @retry="flows.reload"
      >
        <MarketingTable
          :rows="flows.data || []"
          label-key="flow"
          :columns="flowColumns"
        />
      </ReportBlock>
      <ReportBlock
        :title="__('Tratos que necesitan atención')"
        :description="
          __(
            'Auditoría actual de tratos abiertos, filtrada por responsable; independiente del periodo, pipeline y empresa.',
          )
        "
        :loading="hygiene.loading"
        :error="hygiene.error"
        :empty="!hygiene.data?.count"
        @retry="hygiene.reload"
      >
        <p class="mb-3 text-sm font-medium text-ink-gray-9">
          {{ __('{0} tratos con pendientes', [hygiene.data?.count || 0]) }}
        </p>
        <ul class="mb-4 flex flex-wrap gap-2 text-sm text-ink-gray-7">
          <li v-for="(count, issue) in hygiene.data?.summary" :key="issue">
            {{ issueLabel(issue) }}: {{ count }}
          </li>
        </ul>
        <MarketingTable
          :rows="hygiene.data?.rows || []"
          label-key="deal"
          :columns="hygieneColumns"
          :link="(row) => `/deals/${encodeURIComponent(row.deal)}`"
        />
      </ReportBlock>
    </div>
  </details>
</template>

<script setup>
import { computed } from 'vue'
import ReportBlock from './ReportBlock.vue'
import MarketingTable from './MarketingTable.vue'
import { useMarketingResource } from './MarketingData'
const props = defineProps({ filters: { type: Object, required: true } })
const dispatch = useMarketingResource(
  'doco_marketing.api.reports.dispatch_health',
  () => ({ days: 7 }),
)
const flows = useMarketingResource(
  'doco_marketing.api.reports.get_flow_analytics',
  () => ({
    from_date: props.filters.from_date,
    to_date: props.filters.to_date,
  }),
)
const hygiene = useMarketingResource(
  'doco_marketing.api.reports.get_deal_hygiene',
  () => ({ owner: props.filters.owner || null }),
)
const statuses = computed(() =>
  Object.entries(dispatch.data?.by_status || {}).map(([status, count]) => ({
    status,
    count,
  })),
)
const deferred = computed(() =>
  Object.entries(dispatch.data?.deferred || {}).map(([reason, count]) => ({
    reason,
    count,
  })),
)
const countColumns = [{ key: 'count', label: __('Cantidad') }]
const reasonColumns = [
  { key: 'status', label: __('Estado'), format: (value) => __(value) },
  ...countColumns,
]
const flowColumns = [
  { key: 'step', label: __('Paso') },
  { key: 'drafted', label: __('Borradores') },
  { key: 'sent', label: __('Enviados') },
  { key: 'auto_sent', label: __('Envíos automáticos') },
  { key: 'discarded', label: __('Descartados') },
  { key: 'failed', label: __('Fallidos') },
  { key: 'replied', label: __('Con respuesta') },
  { key: 'reply_pct', label: __('Tasa de respuesta'), percent: true },
]
const issueLabels = {
  sin_propietario: __('Sin responsable'),
  sin_sucursal: __('Sin sucursal'),
  sin_contacto: __('Sin contacto'),
  sin_documentos: __('Sin documentos'),
  sla_vencido: __('SLA vencido'),
  sin_actividad: __('Sin actividad'),
}
const issueLabel = (issue) => issueLabels[issue] || __(issue)
const hygieneColumns = [
  {
    key: 'owner',
    label: __('Responsable'),
    format: (value) => value || __('Sin responsable'),
  },
  { key: 'shop', label: __('Sucursal') },
  { key: 'age_days', label: __('Días') },
  {
    key: 'issues',
    label: __('Pendientes'),
    format: (value) => value.map(issueLabel).join(' · '),
  },
]
</script>
