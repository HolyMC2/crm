<template>
  <details class="rounded-xl border border-outline-gray-2 bg-surface-base p-4">
    <summary class="cursor-pointer text-base font-medium text-ink-gray-9">
      {{ __('Envíos, automatizaciones y pendientes') }}
    </summary>
    <div class="mt-4 space-y-4">
      <ReportBlock
        :title="__('Salud de envíos')"
        :description="
          note(
            __('Envíos creados o enviados en el periodo seleccionado.'),
            dispatch.meta,
          )
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
              <button
                v-if="row.drill && row.count"
                type="button"
                class="report-drill"
                @click="open(row.drill, __(row.status))"
              >
                {{ row.count }}
              </button>
              <template v-else>{{ row.count }}</template>
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
          @drill="forward"
        />
        <h4
          v-if="dispatch.data?.top_reasons?.length"
          class="mb-2 mt-4 text-sm font-medium text-ink-gray-9"
        >
          {{ __('Motivos de fallo u omisión') }}
        </h4>
        <MarketingTable
          :rows="reasons"
          label-key="reason"
          :columns="reasonColumns"
          @drill="forward"
        />
      </ReportBlock>
      <ReportBlock
        :title="__('Resultados de automatizaciones')"
        :description="
          note(
            __('Borradores, envíos y respuestas por flujo y paso.'),
            flows.meta,
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
          @drill="forward"
        />
      </ReportBlock>
      <ReportBlock
        :title="__('Tratos que necesitan atención')"
        :description="
          note(
            __(
              'Estado actual de los tratos abiertos creados en el periodo; no admite filtro de empresa.',
            ),
            hygiene.meta,
          )
        "
        :loading="hygiene.loading"
        :error="hygiene.error"
        :empty="!hygiene.data?.count"
        @retry="hygiene.reload"
      >
        <p class="mb-3 text-sm font-medium text-ink-gray-9">
          <button
            v-if="hygiene.data?.drill"
            type="button"
            class="report-drill"
            @click="open(hygiene.data.drill, __('Tratos con pendientes'))"
          >
            {{ __('{0} tratos con pendientes', [hygiene.data?.count || 0]) }}
          </button>
          <template v-else>
            {{ __('{0} tratos con pendientes', [hygiene.data?.count || 0]) }}
          </template>
        </p>
        <ul class="mb-4 flex flex-wrap gap-2 text-sm text-ink-gray-7">
          <li v-for="(count, issue) in hygiene.data?.summary" :key="issue">
            <button
              v-if="hygiene.data?.summary_drills?.[issue]"
              type="button"
              class="report-drill"
              @click="
                open(hygiene.data.summary_drills[issue], issueLabel(issue))
              "
            >
              {{ issueLabel(issue) }}: {{ count }}
            </button>
            <template v-else>{{ issueLabel(issue) }}: {{ count }}</template>
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
import {
  marketingFilters,
  scopeNote,
  useMarketingResource,
} from './MarketingData'
const props = defineProps({ filters: { type: Object, required: true } })
const emit = defineEmits(['drill'])
const forward = (payload) => emit('drill', payload)
function open(drill, title) {
  if (drill) emit('drill', { drill, title })
}
const note = (text, meta) => [text, scopeNote(meta)].filter(Boolean).join(' ')
const params = () => marketingFilters(props.filters)
// `days` only applies when the page sends no period (legacy callers).
const dispatch = useMarketingResource(
  'doco_marketing.api.reports.dispatch_health',
  () => ({ days: 7, ...params() }),
)
const flows = useMarketingResource(
  'doco_marketing.api.reports.get_flow_analytics',
  params,
  { list: true },
)
const hygiene = useMarketingResource(
  'doco_marketing.api.reports.get_deal_hygiene',
  params,
)
const statuses = computed(() =>
  Object.entries(dispatch.data?.by_status || {}).map(([status, count]) => ({
    status,
    count,
    drill: dispatch.data?.by_status_drills?.[status] || null,
  })),
)
const deferred = computed(() =>
  Object.entries(dispatch.data?.deferred || {}).map(([reason, count]) => ({
    reason,
    count,
    drills: { count: dispatch.data?.deferred_drills?.[reason] || null },
  })),
)
const reasons = computed(() =>
  (dispatch.data?.top_reasons || []).map((row) => ({
    ...row,
    drills: { count: row.drill || null },
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

<style scoped>
.report-drill {
  @apply min-h-11 rounded px-1 text-left tabular-nums underline underline-offset-4 hover:bg-surface-gray-2 focus-visible:outline focus-visible:outline-2;
}
</style>
