<template>
  <div class="min-w-0 space-y-6">
    <p class="text-sm leading-relaxed text-ink-gray-6">
      {{
        __(
          'Los canales usan el periodo y responsable seleccionados. Campañas, actividad social y desempeño usan solo el periodo. Marketing no admite filtros de pipeline o empresa.',
        )
      }}
    </p>
    <div class="grid min-w-0 gap-4 xl:grid-cols-2">
      <ReportChart
        :selectable="false"
        :title="__('¿De dónde llegan los leads?')"
        :description="
          __(
            'Hasta 8 orígenes principales · periodo y responsable seleccionados',
          )
        "
        :rows="channels"
        :value-label="__('Leads')"
        :loading="source.loading"
        :error="source.error"
        @retry="source.reload"
      />
      <ReportChart
        :title="__('¿Qué campañas generan contactos?')"
        :description="
          __('Hasta 8 campañas con más contactos · solo periodo seleccionado')
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
          :title="__('Origen de leads y tratos')"
          :loading="source.loading"
          :error="source.error"
          :empty="!sources.length"
          @retry="source.reload"
        >
          <MarketingTable :rows="sources" :columns="sourceColumns" />
        </ReportBlock>
        <ReportBlock
          :title="__('Atribución por campaña')"
          :description="
            __(
              'Contactos y tratos atribuidos por el servidor; los ingresos no descuentan inversión ni representan rentabilidad.',
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
          />
        </ReportBlock>
        <ReportBlock
          :title="__('Resultados por campaña')"
          :description="
            __(
              'Inscripciones, entregas y resultados en el periodo. Sin datos de inversión para calcular ROI.',
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
          />
        </ReportBlock>
        <ReportBlock
          :title="__('Origen social')"
          :description="
            __(
              'Leads, tratos e ingresos atribuidos al origen social · solo periodo seleccionado',
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
          />
          <p v-if="social.data?.total" class="mt-3 text-sm text-ink-gray-7">
            {{
              __('Total social: {0} leads · {1} tratos · {2} ganados', [
                social.data.total.leads,
                social.data.total.deals,
                social.data.total.won,
              ])
            }}
            · {{ money(social.data.total.pesos, social.data.currency) }}
          </p>
        </ReportBlock>
      </div>
    </details>
    <details
      class="rounded-xl border border-outline-gray-2 bg-surface-base p-4"
    >
      <summary class="cursor-pointer text-base font-medium text-ink-gray-9">
        {{ __('Conversión y calidad de leads') }}
      </summary>
      <div class="mt-4 grid gap-4 xl:grid-cols-2">
        <ReportChart
          :selectable="false"
          :title="__('Etapas de conversión')"
          :description="
            __(
              'Conteos por etapa; mezcla cohortes de leads y tratos, no una tasa de conversión del mismo grupo.',
            )
          "
          :rows="funnelRows"
          :value-label="__('Registros')"
          :loading="funnel.loading"
          :error="funnel.error"
          @retry="funnel.reload"
        />
        <ReportChart
          :selectable="false"
          :title="__('Distribución de calificación')"
          :description="
            __(
              'Estado actual de las calificaciones; no responde al periodo ni al responsable.',
            )
          "
          :rows="grades"
          :value-label="__('Leads')"
          :loading="kpis.loading"
          :error="kpis.error"
          @retry="kpis.reload"
        />
      </div>
    </details>
    <MarketingScorecards :filters="filters" />
    <MarketingOperations :filters="filters" />
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
import { money } from '@/utils/numberFormat'
import ReportBlock from './ReportBlock.vue'
import ReportChart from './ReportChart.vue'
import MarketingTable from './MarketingTable.vue'
import MarketingScorecards from './MarketingScorecards.vue'
import MarketingOperations from './MarketingOperations.vue'
import MarketingReactivation from './MarketingReactivation.vue'
import { sourceRows, useMarketingResource } from './MarketingData'
const props = defineProps({ filters: { type: Object, required: true } })
const router = useRouter()
const dates = () => ({
  from_date: props.filters.from_date,
  to_date: props.filters.to_date,
})
const scoped = () => ({ ...dates(), user: props.filters.owner || null })
const resource = (method, params = dates) =>
  useMarketingResource(`doco_marketing.api.reports.${method}`, params)
const source = resource('get_lead_source_breakdown', scoped)
const attribution = resource('get_campaign_attribution')
const roi = resource('get_campaign_roi')
const social = resource('get_social_funnel')
const funnel = resource('get_funnel_data', scoped)
const kpis = resource('get_report_kpis', scoped)
const sources = computed(() => sourceRows(source.data))
const channels = computed(() =>
  sources.value
    .slice(0, 8)
    .map((row) => ({ label: row.name, value: row.leads })),
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
  })),
)
const grades = computed(() =>
  Object.entries(kpis.data?.score_distribution || {}).map(([grade, count]) => ({
    label: grade === 'Ungraded' ? __('Sin calificación') : grade,
    value: count,
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
const socialColumns = [
  ...sourceColumns,
  { key: 'won', label: __('Ganados') },
  { key: 'pesos', label: __('Ingresos atribuidos'), money: true },
]
</script>
