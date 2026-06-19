<!--
  Pipeline Analysis / Funnel (handoff §5.17) — stage funnel with drop-off + KPIs,
  period filter. Reuses doco_marketing.api.reports.get_funnel_data (→ crm funnel) +
  crm.api.dashboard.get_average_time_to_close_a_deal.
-->
<template>
  <div class="scb flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-gray-2">
    <div class="flex h-[52px] flex-none items-center gap-3 border-b border-outline-gray-1 bg-surface-white px-5">
      <button class="text-[13px] text-ink-gray-5 hover:text-ink-gray-9" @click="$router.push('/leads')">← {{ __('Leads') }}</button>
      <span style="color: #d7dae1">/</span>
      <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Análisis de embudo') }}</span>
      <div class="ml-2 flex gap-1.5">
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
      <!-- KPIs -->
      <div class="grid grid-cols-4 gap-3">
        <Kpi :label="__('Total tratos')" :value="total" />
        <Kpi :label="__('Conversión')" :value="`${conversion}%`" color="#16a34a" />
        <Kpi :label="__('Etapa final')" :value="won" color="#16a34a" />
        <Kpi :label="__('Mayor caída')" :value="biggestDrop.label" :sub="biggestDrop.drop ? `−${biggestDrop.drop}%` : ''" color="#e5484d" small />
      </div>

      <!-- funnel -->
      <div class="rounded-[12px] border border-outline-gray-2 bg-surface-white p-4">
        <div class="mb-3 text-[13px] font-bold text-ink-gray-9">{{ __('Embudo por etapa') }}</div>
        <div v-if="funnelRes.loading && !funnel.length" class="py-6 text-center text-xs text-ink-gray-4">{{ __('Cargando…') }}</div>
        <div v-else-if="!funnel.length" class="py-6 text-center text-xs text-ink-gray-4">{{ __('Sin datos') }}</div>
        <div v-for="(s, i) in funnel" :key="s.stage" class="mb-3">
          <div class="mb-1 flex items-center justify-between text-[12.5px]">
            <span class="font-medium text-ink-gray-8">{{ s.stage }}</span>
            <span class="text-ink-gray-5">
              {{ s.count }} · {{ share(s) }}%
              <span v-if="i > 0 && dropFrom(i) > 0" class="ml-1 font-semibold" style="color: #e5484d">↓ {{ dropFrom(i) }}%</span>
            </span>
          </div>
          <div class="h-6 overflow-hidden rounded-md" style="background: #f0f1f3">
            <div class="flex h-full items-center px-2.5" :style="`width:${Math.max(2, barPct(s))}%;background:#dcfce7`">
              <span class="text-[11px] font-semibold" style="color: #16a34a">{{ s.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, h, ref } from 'vue'
import { createResource } from 'frappe-ui'

const periods = [
  { key: 'month', label: __('Este mes') },
  { key: 'q', label: __('90 días') },
  { key: 'all', label: __('Todo') },
]
const period = ref('all')

function localDate(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
function range(key) {
  const now = new Date()
  const to = localDate(now)
  if (key === 'all') return { from_date: '2000-01-01', to_date: to }
  let from = new Date(now)
  if (key === 'q') from.setDate(now.getDate() - 90)
  else from = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from_date: localDate(from), to_date: to }
}

const funnelRes = createResource({ url: 'doco_marketing.api.reports.get_pipeline_funnel' })
function load() {
  funnelRes.submit(range(period.value))
}
function setPeriod(k) {
  period.value = k
  load()
}
load()

const funnel = computed(() => funnelRes.data || [])
const maxCount = computed(() => Math.max(1, ...funnel.value.map((s) => s.count || 0)))
const total = computed(() => funnel.value.reduce((a, s) => a + (s.count || 0), 0))
const won = computed(() => (funnel.value.length ? funnel.value[funnel.value.length - 1].count : 0))
const conversion = computed(() => (total.value ? Math.round((won.value / total.value) * 100) : 0))
function barPct(s) {
  return (s.count / maxCount.value) * 100
}
function share(s) {
  return total.value ? Math.round((s.count / total.value) * 100) : 0
}
function dropFrom(i) {
  const prev = funnel.value[i - 1]?.count || 0
  const cur = funnel.value[i]?.count || 0
  return prev ? Math.round((1 - cur / prev) * 100) : 0
}
const biggestDrop = computed(() => {
  let max = { label: '—', drop: 0 }
  for (let i = 1; i < funnel.value.length; i++) {
    const d = dropFrom(i)
    if (d > max.drop) max = { label: `${funnel.value[i - 1].stage} → ${funnel.value[i].stage}`, drop: d }
  }
  return max
})

const Kpi = (props) =>
  h('div', { class: 'rounded-[12px] border border-outline-gray-2 bg-surface-white p-4' }, [
    h('div', { class: 'text-[10px] font-semibold uppercase tracking-[.07em] text-ink-gray-4' }, props.label),
    h('div', { class: `${props.small ? 'text-[14px]' : 'text-[26px]'} mt-1.5 font-extrabold`, style: `color:${props.color || '#1c2230'}` }, String(props.value)),
    props.sub ? h('div', { class: 'text-[11.5px] font-semibold', style: `color:${props.color || '#5b6472'}` }, props.sub) : null,
  ])
Kpi.props = ['label', 'value', 'color', 'sub', 'small']
</script>
