<!--
  Pipeline Analysis / Funnel — stage funnel with drop-off + KPIs, period filter.
  Reachable from the nav rail («Embudo», navModel.navItemsBottom); addon-gated.

  Payload: doco_marketing.api.reports.get_pipeline_funnel returns
  { stages: [{stage, count, type, probability, position}], won, lost, conversion }
  with the tenant's hidden stages (the inactive language twins) already excluded
  server-side, so a stage is never counted twice.
-->
<template>
  <div class="scb flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-gray-2">
    <div class="flex h-[52px] flex-none items-center gap-3 border-b border-outline-gray-1 bg-surface-base px-5">
      <button class="text-[13px] text-ink-gray-5 hover:text-ink-gray-9" @click="$router.push('/deals')">← {{ __('Deals') }}</button>
      <span class="text-ink-gray-3">/</span>
      <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Análisis de embudo') }}</span>
      <div class="ml-2 flex gap-1.5">
        <button
          v-for="p in periods"
          :key="p.key"
          class="rounded-full px-3 py-1 text-[12px] font-medium"
          :style="period === p.key ? 'color:#fff;background:#1c2230' : ''"
          :class="period === p.key ? '' : 'bg-surface-gray-2 text-ink-gray-6 hover:bg-surface-gray-3'"
          @click="setPeriod(p.key)"
        >
          {{ p.label }}
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-4 p-5">
      <!-- KPIs. Conversión is won / (won + lost) — what the pipeline CLOSES.
           Dividing won by everything still open reported ~0% forever. -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi :label="__('Total tratos')" :value="total" />
        <Kpi :label="__('Conversión')" :value="`${conversion}%`" ink="var(--ink-green-7)" />
        <Kpi :label="__('Ganados')" :value="won" ink="var(--ink-green-7)" />
        <Kpi :label="__('Perdidos')" :value="lost" ink="var(--ink-red-7)" />
        <Kpi :label="__('Mayor caída')" :value="biggestDrop.label" :sub="biggestDrop.drop ? `−${biggestDrop.drop}%` : ''" ink="var(--ink-red-7)" small />
      </div>

      <!-- funnel -->
      <div class="rounded-[12px] border border-outline-gray-2 bg-surface-base p-4">
        <div class="mb-3 text-[13px] font-bold text-ink-gray-9">{{ __('Embudo por etapa') }}</div>
        <div v-if="funnelRes.loading && !stages.length" class="py-6 text-center text-xs text-ink-gray-4">{{ __('Cargando…') }}</div>
        <div v-else-if="!stages.length" class="py-6 text-center text-xs text-ink-gray-4">{{ __('Sin datos') }}</div>
        <div v-for="s in stages" :key="s.stage" class="mb-3">
          <div class="mb-1 flex items-center justify-between text-[12.5px]">
            <span class="flex items-center gap-1.5">
              <span class="font-medium text-ink-gray-8">{{ s.stage }}</span>
              <span class="text-[10.5px] font-semibold uppercase tracking-[.05em] text-ink-gray-4">
                {{ typeLabel(s.type) }}<template v-if="s.probability"> · {{ Math.round(s.probability) }}%</template>
              </span>
            </span>
            <span class="text-ink-gray-5">
              {{ s.count }} · {{ share(s) }}%
              <span v-if="drop(s) > 0" class="ml-1 font-semibold text-ink-red-7">↓ {{ drop(s) }}%</span>
            </span>
          </div>
          <div class="h-6 overflow-hidden rounded-md bg-surface-gray-2">
            <div
              class="flex h-full items-center px-2.5"
              :style="`width:${Math.max(2, barPct(s))}%;background:${barTint(s)}`"
            >
              <span class="text-[11px] font-semibold text-ink-gray-8">{{ s.count }}</span>
            </div>
          </div>
        </div>
        <p v-if="stages.length" class="mt-4 text-[11px] text-ink-gray-4">
          {{ __('La caída se calcula sólo entre etapas abiertas, en orden de posición. Ganado y perdido son desenlaces, no pasos.') }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, h, ref } from 'vue'
import { createResource } from 'frappe-ui'
import { funnelLadder } from '@/utils/pipelineMath'

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

// A site still serving the pre-milestone backend answers with a bare stage list;
// read it as `stages` so the page degrades to counts instead of going blank.
const payload = computed(() => {
  const d = funnelRes.data
  return Array.isArray(d) ? { stages: d } : d || {}
})
const stages = computed(() => payload.value.stages || [])
const won = computed(() => payload.value.won || 0)
const lost = computed(() => payload.value.lost || 0)
const conversion = computed(() => payload.value.conversion ?? 0)
const total = computed(() => stages.value.reduce((a, s) => a + (s.count || 0), 0))
const maxCount = computed(() => Math.max(1, ...stages.value.map((s) => s.count || 0)))

const TYPE_LABELS = {
  Open: 'Abierta',
  Ongoing: 'En curso',
  'On Hold': 'En pausa',
  Won: 'Ganada',
  Lost: 'Perdida',
}
function typeLabel(t) {
  return __(TYPE_LABELS[t] || t || '')
}

// Drop-off runs down the linear Open chain only, and only up to the first
// desenlace: an Ongoing / On Hold stage is a side-track, Won / Lost close the
// funnel, and an Open stage seeded BEHIND them (Warranty Repair sits after
// Picked Up / Declined) is a re-entry, not the next step — chaining it made
// "Ready for Pickup → Warranty Repair" the biggest drop on every tenant.
const openStages = computed(() => funnelLadder(stages.value))
const drops = computed(() => {
  const out = {}
  const open = openStages.value
  for (let i = 1; i < open.length; i++) {
    const prev = open[i - 1].count || 0
    const cur = open[i].count || 0
    out[open[i].stage] = prev ? Math.round((1 - cur / prev) * 100) : 0
  }
  return out
})
function drop(s) {
  return drops.value[s.stage] || 0
}
const biggestDrop = computed(() => {
  const open = openStages.value
  let max = { label: '—', drop: 0 }
  for (let i = 1; i < open.length; i++) {
    const d = drops.value[open[i].stage] || 0
    if (d > max.drop) max = { label: `${open[i - 1].stage} → ${open[i].stage}`, drop: d }
  }
  return max
})

function barPct(s) {
  return ((s.count || 0) / maxCount.value) * 100
}
function share(s) {
  return total.value ? Math.round(((s.count || 0) / total.value) * 100) : 0
}
function barTint(s) {
  if (s.type === 'Won') return 'var(--surface-green-3)'
  if (s.type === 'Lost') return 'var(--surface-red-2)'
  return 'var(--surface-green-2)'
}

const Kpi = (props) =>
  h('div', { class: 'rounded-[12px] border border-outline-gray-2 bg-surface-base p-4' }, [
    h('div', { class: 'text-[10px] font-semibold uppercase tracking-[.07em] text-ink-gray-4' }, props.label),
    h(
      'div',
      {
        class: `${props.small ? 'text-[14px]' : 'text-[26px]'} mt-1.5 font-extrabold text-ink-gray-9`,
        style: props.ink ? `color:${props.ink}` : '',
      },
      String(props.value),
    ),
    props.sub ? h('div', { class: 'text-[11.5px] font-semibold', style: `color:${props.ink || 'var(--ink-gray-5)'}` }, props.sub) : null,
  ])
Kpi.props = ['label', 'value', 'ink', 'sub', 'small']
</script>
