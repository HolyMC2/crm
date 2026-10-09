<template>
  <div class="min-w-0 space-y-6">
    <p class="text-sm leading-relaxed text-ink-gray-6">
      {{
        __(
          'Cada bloque usa el periodo, responsable y pipeline cuando sus datos tienen esa dimensión, y aclara los filtros que no aplican. Marketing no admite el filtro de empresa. Los números subrayados abren sus registros.',
        )
      }}
    </p>
    <div class="grid min-w-0 gap-4 xl:grid-cols-2">
      <ReportChart
        :title="__('¿De dónde llegan los prospectos?')"
        :description="note(__('Hasta 8 orígenes principales'), source.meta)"
        :rows="channels"
        :value-label="__('Leads')"
        :loading="source.loading"
        :error="source.error"
        @select="(row) => openDrill(row.drill, row.label)"
        @retry="source.reload"
      />
      <ReportChart
        :title="__('¿Qué campañas generan contactos?')"
        :description="
          note(__('Hasta 8 campañas con más contactos'), attribution.meta)
        "
        :rows="campaigns"
        :value-label="__('Contactos')"
        :loading="attribution.loading"
        :error="attribution.error"
        :selectable="true"
        @select="openCampaign"
        @retry="attribution.reload"
      />
    </div>
    <details
      class="rounded-xl border border-outline-gray-2 bg-surface-base p-4"
    >
      <summary class="cursor-pointer text-base font-medium text-ink-gray-9">
        {{ __('Detalle de canales y atribución') }}
      </summary>
      <div class="mt-4 space-y-4">
        <ReportBlock
          :title="__('Origen de prospectos y tratos')"
          :description="note('', source.meta)"
          :loading="source.loading"
          :error="source.error"
          :empty="!sources.length"
          @retry="source.reload"
        >
          <MarketingTable
            :rows="sources"
            :columns="sourceColumns"
            @drill="forward"
          />
        </ReportBlock>
        <ReportBlock
          :title="__('Atribución por campaña')"
          :description="
            note(
              __(
                'Contactos y tratos atribuidos por el servidor; los ingresos no descuentan inversión ni representan rentabilidad.',
              ),
              attribution.meta,
            )
          "
          :loading="attribution.loading"
          :error="attribution.error"
          :empty="!attribution.data?.length"
          @retry="attribution.reload"
        >
          <MarketingTable
            :rows="attribution.data || []"
            label-key="campaign"
            :columns="attributionColumns"
            :link="campaignLink"
            :currency="attribution.meta?.currency"
            @drill="forward"
          />
        </ReportBlock>
        <ReportBlock
          :title="__('Resultados por campaña')"
          :description="
            note(
              __(
                'Inscripciones, entregas y resultados en el periodo. Sin datos de inversión para calcular ROI.',
              ),
              roi.meta,
              roiMetrics,
            )
          "
          :loading="roi.loading"
          :error="roi.error"
          :empty="!roi.data?.length"
          @retry="roi.reload"
        >
          <MarketingTable
            :rows="roi.data || []"
            label-key="campaign"
            :columns="roiColumns"
            :link="campaignLink"
            :currency="roi.meta?.currency"
            @drill="forward"
          />
        </ReportBlock>
        <ReportBlock
          :title="__('Origen social')"
          :description="
            note(
              __('Prospectos, tratos e ingresos atribuidos al origen social'),
              social.meta,
            )
          "
          :loading="social.loading"
          :error="social.error"
          :empty="!social.data?.rows?.some((row) => row.leads || row.deals)"
          @retry="social.reload"
        >
          <MarketingTable
            :rows="social.data?.rows || []"
            label-key="origin"
            :columns="socialColumns"
            :currency="social.data?.currency"
            @drill="forward"
          />
          <p v-if="social.data?.total" class="mt-3 text-sm text-ink-gray-7">
            {{
              __('Total social: {0} prospectos · {1} tratos · {2} ganados', [
                social.data.total.leads,
                social.data.total.deals,
                social.data.total.won,
              ])
            }}
            · {{ moneyText(social.data.total, 'pesos', social.data.currency) }}
          </p>
        </ReportBlock>
      </div>
    </details>
    <details
      class="rounded-xl border border-outline-gray-2 bg-surface-base p-4"
    >
      <summary class="cursor-pointer text-base font-medium text-ink-gray-9">
        {{ __('Conversión y calidad de prospectos') }}
      </summary>
      <div class="mt-4 grid gap-4 xl:grid-cols-2">
        <ReportChart
          :title="__('Conversión de prospectos')"
          :description="
            note(
              __(
                'Leads creados en el periodo y cuántos de ellos ya se convirtieron.',
              ),
              funnel.meta,
            )
          "
          :rows="funnelRows"
          :value-label="__('Registros')"
          :loading="funnel.loading"
          :error="funnel.error"
          @select="(row) => openDrill(row.drill, row.label)"
          @retry="funnel.reload"
        />
        <ReportChart
          :title="__('Distribución de calificación')"
          :description="
            note(
              __('Calificación actual de los prospectos sin convertir.'),
              kpis.meta,
              { score_distribution: __('Distribución de calificación') },
            )
          "
          :rows="grades"
          :value-label="__('Leads')"
          :loading="kpis.loading"
          :error="kpis.error"
          @select="(row) => openDrill(row.drill, row.label)"
          @retry="kpis.reload"
        />
      </div>
    </details>
    <MarketingScorecards :filters="filters" @drill="forward" />
    <MarketingOperations :filters="filters" @drill="forward" />
    <details
      class="rounded-xl border border-outline-gray-2 bg-surface-base p-4"
    >
      <summary class="cursor-pointer text-base font-medium text-ink-gray-9">
        {{ __('Reactivación de contactos') }}
      </summary>
      <div class="mt-4"><MarketingReactivation /></div>
    </details>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import ReportBlock from './ReportBlock.vue'
import ReportChart from './ReportChart.vue'
import MarketingTable from './MarketingTable.vue'
import MarketingScorecards from './MarketingScorecards.vue'
import MarketingOperations from './MarketingOperations.vue'
import MarketingReactivation from './MarketingReactivation.vue'
import {
  drillFor,
  marketingFilters,
  moneyText,
  scopeNote,
  sourceRows,
  useMarketingResource,
} from './MarketingData'
const props = defineProps({ filters: { type: Object, required: true } })
const emit = defineEmits(['drill'])
const router = useRouter()
const params = () => marketingFilters(props.filters)
const resource = (method, options) =>
  useMarketingResource(`doco_marketing.api.reports.${method}`, params, options)
const source = resource('get_lead_source_breakdown')
const attribution = resource('get_campaign_attribution', { list: true })
const roi = resource('get_campaign_roi', { list: true })
const social = resource('get_social_funnel')
const funnel = resource('get_funnel_data', { list: true })
const kpis = resource('get_report_kpis')
const note = (text, meta, metrics) =>
  [text, scopeNote(meta, metrics)].filter(Boolean).join(' ')
function openDrill(drill, title) {
  if (drill) emit('drill', { drill, title })
}
const forward = (payload) => emit('drill', payload)
const sources = computed(() => sourceRows(source.data))
const channels = computed(() =>
  sources.value.slice(0, 8).map((row) => ({
    label: row.name,
    value: row.leads,
    drill: row.drills.leads,
  })),
)
const campaigns = computed(() =>
  (attribution.data || [])
    .slice()
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 8)
    .map((row) => ({
      label: row.campaign,
      value: row.leads,
      campaign: row.campaign,
    })),
)
const funnelRows = computed(() =>
  (funnel.data || []).map((row) => ({
    label: __(row.stage),
    value: row.count,
    drill: drillFor(row, 'value'),
  })),
)
const grades = computed(() =>
  Object.entries(kpis.data?.score_distribution || {}).map(([grade, count]) => ({
    label: grade === 'Ungraded' ? __('Sin calificación') : grade,
    value: count,
    drill: kpis.data?.score_drills?.[grade] || null,
  })),
)
const campaignLink = (row) => `/campaigns/${encodeURIComponent(row.campaign)}`
function openCampaign(row) {
  router.push(campaignLink(row))
}
const sourceColumns = [
  { key: 'leads', label: __('Leads') },
  { key: 'deals', label: __('Tratos') },
]
const attributionColumns = [
  { key: 'leads', label: __('Contactos') },
  { key: 'won', label: __('Ganados') },
  { key: 'conv_pct', label: __('Conversión'), percent: true },
  { key: 'revenue', label: __('Ingresos atribuidos'), money: true },
]
const roiColumns = [
  { key: 'enrolled', label: __('Inscritos') },
  { key: 'sent', label: __('Enviados') },
  { key: 'failed', label: __('Fallidos') },
  { key: 'skipped', label: __('Omitidos') },
  { key: 'pending', label: __('Pendientes') },
  { key: 'touched', label: __('Contactados') },
  ...attributionColumns.slice(1),
]
const roiMetrics = Object.fromEntries(
  roiColumns.map((column) => [column.key, column.label]),
)
const socialColumns = [
  ...sourceColumns,
  { key: 'won', label: __('Ganados') },
  { key: 'pesos', label: __('Ingresos atribuidos'), money: true },
]
</script>
