<!--
  ReportsAgents — per-agent DEAL analytics (P2 spec 7.1 / S2). Distinct from the
  message-provenance "Desempeño por agente" scorecard already in Reports.vue: this
  table is deal-ownership based (abiertos / ganados / valor ganado / respuesta
  mediana). Manager-gated server-side (doco_marketing.api.agent_metrics.
  get_agent_metrics — System/Sales Manager only). A non-manager gets a
  PermissionError → the "solo gerentes" banner, the same amber-box pattern
  pages/Reports.vue uses. Sortable table on desktop; stacked cards ≤640px (never
  side-scrolls). All colors are frappe-ui tokens (dark-safe).
-->
<template>
  <div>
    <div
      v-if="restricted"
      class="rounded-[10px] border border-outline-amber-2 bg-surface-amber-1 px-4 py-2.5 text-[12.5px] text-ink-amber-3"
    >
      {{ __('El desempeño por agente requiere permiso de gerente (Sales Manager o System Manager).') }}
    </div>

    <template v-else>
      <div v-if="loading && !agents.length" class="py-6 text-center text-xs text-ink-gray-4">
        {{ __('Cargando…') }}
      </div>
      <div v-else-if="!agents.length" class="py-4 text-center text-xs text-ink-gray-4">
        {{ __('Sin actividad en el periodo') }}
      </div>

      <template v-else>
        <!-- desktop: sortable table -->
        <div class="hidden sm:block">
          <div
            class="grid items-center gap-x-2 border-b border-outline-gray-1 pb-1.5"
            :style="`grid-template-columns:${GRID}`"
          >
            <button
              v-for="c in columns"
              :key="c.key"
              type="button"
              class="press flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[.07em]"
              :class="[
                c.align === 'right' ? 'justify-end text-right' : 'text-left',
                sort.key === c.key ? 'text-ink-gray-7' : 'text-ink-gray-4',
              ]"
              @click="onSort(c.key)"
            >
              <span>{{ c.label }}</span>
              <span v-if="sort.key === c.key" class="text-[9px]">{{ sort.dir === 'desc' ? '▼' : '▲' }}</span>
            </button>
          </div>
          <div
            v-for="a in sortedAgents"
            :key="a.agent"
            class="grid items-center gap-x-2 border-b border-outline-gray-1 py-2 text-[12.5px]"
            :style="`grid-template-columns:${GRID}`"
          >
            <div class="truncate font-medium text-ink-gray-9" :title="a.agent">{{ a.agent_name }}</div>
            <div class="text-right text-ink-gray-8">{{ a.open }}</div>
            <div class="text-right font-semibold text-ink-green-3">{{ a.won }}</div>
            <div class="text-right font-medium text-ink-gray-9">{{ money(a.won_value) }}</div>
            <div class="text-right" :class="a.median_response_secs == null ? 'text-ink-gray-4' : 'text-ink-gray-8'">
              {{ fmtDuration(a.median_response_secs) }}
            </div>
          </div>
        </div>

        <!-- mobile ≤640: sort chips + stacked cards -->
        <div class="sm:hidden">
          <div class="mb-2.5 flex flex-wrap gap-1.5">
            <button
              v-for="c in columns"
              :key="c.key"
              type="button"
              class="press rounded-full px-2.5 py-1 text-[11px] font-medium"
              :class="sort.key === c.key ? 'bg-surface-gray-3 text-ink-gray-9' : 'bg-surface-gray-2 text-ink-gray-6'"
              @click="onSort(c.key)"
            >
              {{ c.label }}<span v-if="sort.key === c.key"> {{ sort.dir === 'desc' ? '▼' : '▲' }}</span>
            </button>
          </div>
          <div class="flex flex-col gap-2.5">
            <div
              v-for="a in sortedAgents"
              :key="a.agent"
              class="rounded-[10px] border border-outline-gray-2 bg-surface-white p-3"
            >
              <div class="mb-2 truncate text-[13px] font-bold text-ink-gray-9" :title="a.agent">{{ a.agent_name }}</div>
              <div class="grid grid-cols-2 gap-y-2 text-[12px]">
                <div>
                  <div class="text-[10px] font-semibold uppercase tracking-[.06em] text-ink-gray-4">{{ __('Abiertos') }}</div>
                  <div class="text-ink-gray-9">{{ a.open }}</div>
                </div>
                <div>
                  <div class="text-[10px] font-semibold uppercase tracking-[.06em] text-ink-gray-4">{{ __('Ganados') }}</div>
                  <div class="font-semibold text-ink-green-3">{{ a.won }}</div>
                </div>
                <div>
                  <div class="text-[10px] font-semibold uppercase tracking-[.06em] text-ink-gray-4">{{ __('Valor ganado') }}</div>
                  <div class="font-medium text-ink-gray-9">{{ money(a.won_value) }}</div>
                </div>
                <div>
                  <div class="text-[10px] font-semibold uppercase tracking-[.06em] text-ink-gray-4">{{ __('Resp. mediana') }}</div>
                  <div :class="a.median_response_secs == null ? 'text-ink-gray-4' : 'text-ink-gray-9'">
                    {{ fmtDuration(a.median_response_secs) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { createResource } from 'frappe-ui'
import { money } from '@/utils/numberFormat'
import { fmtDuration, sortAgents, nextSort } from '@/utils/agentMetricsFormat'

const props = defineProps({
  // 'week' | 'month' | 'year' — the parent page's period filter.
  period: { type: String, default: 'month' },
})

const GRID = '1fr 68px 68px 110px 92px'
const columns = [
  { key: 'agent_name', label: __('Agente'), align: 'left' },
  { key: 'open', label: __('Abiertos'), align: 'right' },
  { key: 'won', label: __('Ganados'), align: 'right' },
  { key: 'won_value', label: __('Valor'), align: 'right' },
  { key: 'median_response_secs', label: __('Resp.'), align: 'right' },
]

// Manager-gated server-side; a non-manager gets PermissionError → show the banner
// (the server gate is the real protection, this is only the UX).
const restricted = ref(false)
const res = createResource({
  url: 'doco_marketing.api.agent_metrics.get_agent_metrics',
  onError: () => (restricted.value = true),
})
function load() {
  restricted.value = false
  res.submit({ period: props.period })
}
load()
watch(() => props.period, load)

const loading = computed(() => res.loading)
const agents = computed(() => res.data?.agents || [])
const sort = ref({ key: 'won_value', dir: 'desc' })
const sortedAgents = computed(() => sortAgents(agents.value, sort.value.key, sort.value.dir))
function onSort(key) {
  sort.value = nextSort(sort.value, key)
}
</script>
