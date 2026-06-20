<!--
  Reports — FCRM redesign (handoff §5.11). KPI cards + conversion funnel + score
  distribution + campaign attribution + lead-source breakdown, with a period filter.
  Data: doco_marketing.api.reports.* (which reuses crm.api.dashboard.*).
-->
<template>
  <div class="scb flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-gray-2">
    <!-- toolbar -->
    <div class="flex h-[52px] flex-none items-center gap-3 border-b border-outline-gray-1 bg-surface-white px-5">
      <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Reportes') }}</span>
      <div class="flex gap-1.5">
        <button
          v-for="p in periods"
          :key="p.key"
          class="rounded-full px-3 py-1 text-[12px] font-medium"
          :style="period === p.key ? 'color:#fff;background:#1c2230' : 'color:#5b6472;background:#f4f5f7'"
          @click="setPeriod(p.key)"
        >
          {{ p.label }}
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-4 p-5">
      <div v-if="restricted" class="rounded-[10px] border px-4 py-2.5 text-[12.5px]" style="color: #b9790a; background: #fdf6e9; border-color: #f1dca6">
        {{ __('Algunas métricas (ingresos, atribución) requieren permiso de manager.') }}
      </div>
      <!-- KPI cards -->
      <div class="grid grid-cols-4 gap-3">
        <KpiCard :label="__('Leads captados')" :value="kpiVal(kpis.total_leads)" to="/leads" />
        <KpiCard :label="__('Deals ganados')" :value="kpiVal(kpis.won_deals)" color="#16a34a" />
        <KpiCard :label="__('Conversión')" :value="`${convRate}%`" color="#2f6fed" />
        <KpiCard :label="__('Grado promedio')" :value="kpis.avg_grade || '—'" to="/score-rules" />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <!-- funnel -->
        <Card :title="__('Embudo de conversión')">
          <div v-if="!funnel.length" class="py-6 text-center text-xs text-ink-gray-4">{{ __('Sin datos') }}</div>
          <div v-for="s in funnel" :key="s.stage" class="mb-2.5">
            <div class="mb-1 flex items-center justify-between text-[12px]">
              <span class="font-medium text-ink-gray-8">{{ s.stage }}</span>
              <span class="text-ink-gray-5">{{ s.count }} · {{ s.pct }}%</span>
            </div>
            <div class="h-2 rounded-sm" style="background: #f0f1f3">
              <div class="h-full rounded-sm" :style="`width:${s.pct}%;background:#16a34a;opacity:.75`" />
            </div>
          </div>
        </Card>

        <!-- score distribution -->
        <Card :title="__('Distribución de score')">
          <div v-for="g in gradeBars" :key="g.grade" class="mb-2.5 flex items-center gap-3">
            <span class="w-4 text-[12.5px] font-bold" :style="`color:${g.color}`">{{ g.grade }}</span>
            <div class="h-2 flex-1 rounded-sm" style="background: #f0f1f3">
              <div class="h-full rounded-sm" :style="`width:${g.pct}%;background:${g.color}`" />
            </div>
            <span class="w-10 text-right text-[12px] text-ink-gray-6">{{ g.count }}</span>
          </div>
        </Card>
      </div>

      <!-- campaign attribution -->
      <Card :title="__('Atribución por campaña')">
        <div v-if="!attribution.length" class="py-4 text-center text-xs text-ink-gray-4">{{ __('Sin atribución registrada') }}</div>
        <div v-else>
          <div class="grid items-center border-b border-outline-gray-1 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-gray-4" :style="`grid-template-columns:${ATTR_GRID}`">
            <div>{{ __('Campaña') }}</div><div>{{ __('Leads') }}</div><div>{{ __('Ganados') }}</div><div>{{ __('Conv%') }}</div><div>{{ __('Ingresos') }}</div>
          </div>
          <div
            v-for="a in attribution"
            :key="a.campaign"
            class="grid cursor-pointer items-center border-b border-outline-gray-1 py-2 text-[12.5px] hover:bg-surface-gray-1"
            :style="`grid-template-columns:${ATTR_GRID}`"
            @click="$router.push(`/campaigns/${a.campaign}`)"
          >
            <div class="font-medium text-ink-gray-9">{{ a.campaign }}</div>
            <div>{{ a.leads }}</div>
            <div class="font-semibold" style="color: #16a34a">{{ a.won }}</div>
            <div>{{ a.conv_pct }}%</div>
            <div class="font-medium">{{ money(a.revenue) }}</div>
          </div>
        </div>
      </Card>

      <!-- source breakdown -->
      <Card :title="__('Origen de leads')">
        <div v-if="!sourceCards.length" class="py-4 text-center text-xs text-ink-gray-4">{{ __('Sin datos') }}</div>
        <div v-else class="grid grid-cols-3 gap-3">
          <div v-for="s in sourceCards" :key="s.name" class="rounded-[10px] border border-outline-gray-2 p-3">
            <div class="flex items-center gap-1.5 text-[12px] font-semibold text-ink-gray-8">
              <span class="h-2 w-2 rounded-full" :style="`background:${s.dot}`" />{{ s.name }}
            </div>
            <div class="mt-1 text-[20px] font-bold text-ink-gray-9">{{ s.leads }}</div>
            <div class="text-[11px] text-ink-gray-5">{{ s.deals }} {{ __('deals') }}</div>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>

<script setup>
import { computed, h, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createResource } from 'frappe-ui'
import { CHANNEL_META, GRADE_COLORS } from '@/composables/crmFormat'

const router = useRouter()

const ATTR_GRID = '1fr 70px 80px 70px 110px'
const periods = [
  { key: 'week', label: __('Esta semana') },
  { key: 'month', label: __('Este mes') },
  { key: 'year', label: __('Este año') },
]
const period = ref('month')

function localDate(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
function range(key) {
  const now = new Date()
  const to = localDate(now)
  let from = new Date(now)
  if (key === 'week') from.setDate(now.getDate() - now.getDay())
  else if (key === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1)
  else from = new Date(now.getFullYear(), 0, 1)
  return { from_date: localDate(from), to_date: to }
}

// get_report_kpis + get_campaign_attribution are manager-gated server-side; a
// Sales User gets PermissionError. Catch it (no uncaught console error) and show a
// banner instead of blank cards. The server gate is the real protection.
const restricted = ref(false)
const onRestricted = () => (restricted.value = true)
const kpisRes = createResource({ url: 'doco_marketing.api.reports.get_report_kpis', onError: onRestricted })
const funnelRes = createResource({ url: 'doco_marketing.api.reports.get_funnel_data', onError: onRestricted })
const attrRes = createResource({ url: 'doco_marketing.api.reports.get_campaign_attribution', onError: onRestricted })
const srcRes = createResource({ url: 'doco_marketing.api.reports.get_lead_source_breakdown', onError: onRestricted })

function load() {
  const r = range(period.value)
  kpisRes.submit(r)
  funnelRes.submit(r)
  attrRes.submit(r)
  srcRes.submit(r)
}
function setPeriod(k) {
  period.value = k
  load()
}
load()

const kpis = computed(() => kpisRes.data || {})
const funnel = computed(() => funnelRes.data || [])
const attribution = computed(() => attrRes.data || [])

function kpiVal(x) {
  if (x == null) return 0
  return typeof x === 'object' ? (x.value ?? x.count ?? x.total ?? 0) : x
}
const convRate = computed(() => {
  const l = Number(kpiVal(kpis.value.total_leads)) || 0
  const w = Number(kpiVal(kpis.value.won_deals)) || 0
  return l ? Math.round((w / l) * 100) : 0
})

// score distribution bars
const gradeBars = computed(() => {
  const d = kpis.value.score_distribution || {}
  const total = ['A', 'B', 'C', 'D', 'Ungraded'].reduce((a, g) => a + (d[g] || 0), 0) || 1
  return ['A', 'B', 'C', 'D'].map((g) => ({
    grade: g,
    count: d[g] || 0,
    pct: Math.round(((d[g] || 0) / total) * 100),
    color: GRADE_COLORS[g][0],
  }))
})

// source breakdown — crm dashboard returns echart {data:[{name,value}]} or a list
function normalize(x) {
  const arr = Array.isArray(x) ? x : x?.data || []
  const m = {}
  for (const it of arr) {
    const name = it.name || it.source || it.label || it[0]
    const val = it.value ?? it.count ?? it[1] ?? 0
    if (name) m[name] = (m[name] || 0) + Number(val || 0)
  }
  return m
}
const sourceCards = computed(() => {
  const data = srcRes.data || {}
  const leads = normalize(data.leads_by_source)
  const deals = normalize(data.deals_by_source)
  const names = [...new Set([...Object.keys(leads), ...Object.keys(deals)])]
  return names
    .map((name) => ({ name, leads: leads[name] || 0, deals: deals[name] || 0, dot: sourceDot(name) }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 6)
})
function sourceDot(name) {
  const k = String(name || '').toLowerCase()
  for (const c of Object.keys(CHANNEL_META)) if (k.includes(c) || k.includes(CHANNEL_META[c][0].toLowerCase())) return CHANNEL_META[c][1]
  return '#9aa2ae'
}
function money(v) {
  return `$${Number(v || 0).toLocaleString()}`
}

// presentational helpers
const Card = (props, { slots }) =>
  h('div', { class: 'rounded-[12px] border border-outline-gray-2 bg-surface-white p-4' }, [
    h('div', { class: 'mb-3 text-[13px] font-bold text-ink-gray-9' }, props.title),
    slots.default?.(),
  ])
Card.props = ['title']

const KpiCard = (props) =>
  h(
    'div',
    {
      class: 'rounded-[12px] border border-outline-gray-2 bg-surface-white p-4' + (props.to ? ' cursor-pointer hover:border-outline-gray-3' : ''),
      onClick: () => props.to && router.push(props.to),
    },
    [
      h('div', { class: 'text-[10px] font-semibold uppercase tracking-[.07em] text-ink-gray-4' }, props.label),
      h('div', { class: 'mt-1.5 text-[26px] font-extrabold', style: `color:${props.color || '#1c2230'}` }, String(props.value)),
    ],
  )
KpiCard.props = ['label', 'value', 'color', 'to']
</script>
