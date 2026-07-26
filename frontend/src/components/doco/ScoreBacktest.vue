<!--
  ScoreBacktest — monthly lead-scoring backtest (P2 spec 5.4 remainder / S17).
  Answers the MANAGER question S6's per-lead breakdown does not: do higher-graded
  leads actually convert more? A month selector (3/6/12), the observed win-rate per
  grade band, and an A-vs-D lift headline. Prop-less panel mounted below the
  distribution block in pages/ScoreRules.vue.

  Data: doco_marketing.api.score_backtest.get_backtest — manager-gated server-side
  (System/Sales Manager). A non-manager gets a PermissionError → the "solo gerentes"
  amber banner, the same pattern ReportsAgents.vue uses. Grade colours reuse
  GRADE_COLORS (composables/crmFormat) exactly like the distribution above it, so
  the two read as one surface. All text is es-MX via __(); dark-safe tokens
  throughout; win-rates are derived server-side from the CURRENT stored score
  (score_basis="current") — the footnote states that honestly.
-->
<template>
  <section class="mt-5 border-t border-outline-gray-1 pt-4">
    <div class="mb-2.5 flex items-center justify-between gap-2">
      <div class="text-[11px] font-bold uppercase tracking-[.07em] text-ink-gray-4">{{ __('Backtest de score') }}</div>
      <div class="flex flex-none gap-1">
        <button
          v-for="m in MONTH_OPTIONS"
          :key="m"
          type="button"
          class="press rounded-full px-2 py-0.5 text-[11px] font-semibold"
          :class="months === m ? 'bg-surface-gray-3 text-ink-gray-9' : 'bg-surface-gray-2 text-ink-gray-5'"
          @click="months = m"
        >
          {{ __('{0}m', [m]) }}
        </button>
      </div>
    </div>

    <!-- non-manager: server refused → banner (the server gate is the real guard) -->
    <div
      v-if="restricted"
      class="rounded-[10px] border border-outline-amber-2 bg-surface-amber-1 px-3 py-2 text-[12px] text-ink-amber-3"
    >
      {{ __('El backtest de score requiere permiso de gerente.') }}
    </div>

    <template v-else>
      <div v-if="loading && !data" class="py-5 text-center text-xs text-ink-gray-4">{{ __('Cargando…') }}</div>

      <template v-else-if="hasData">
        <!-- lift headline -->
        <div class="mb-3 rounded-[10px] border border-outline-gray-1 bg-surface-gray-1 px-3 py-2.5">
          <template v-if="liftLabel">
            <div class="text-[12.5px] leading-snug text-ink-gray-8">
              {{ __('Los leads A cierran') }}
              <span class="font-bold text-ink-gray-9">{{ liftLabel }}</span>
              {{ __('más que los D') }}
            </div>
          </template>
          <div v-else class="text-[12px] leading-snug text-ink-gray-5">
            {{ __('Aún no hay suficientes cierres para comparar A vs D.') }}
          </div>
        </div>

        <!-- per-grade win-rate bars (overall) -->
        <div class="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[.06em] text-ink-gray-4">
          <span>{{ __('Cierre por grado') }}</span>
          <span>{{ __('ganados/leads') }}</span>
        </div>
        <div v-for="row in rows" :key="row.grade" class="mb-2 flex items-center gap-2">
          <span class="w-3.5 flex-none text-[12.5px] font-bold" :style="`color:${gradeColor(row.grade)}`">{{ row.grade }}</span>
          <div class="h-2.5 min-w-0 flex-1 rounded-sm bg-surface-gray-2">
            <div class="h-full rounded-sm" :style="`width:${barPct(row.win_rate)}%;background:${gradeColor(row.grade)}`" />
          </div>
          <span class="w-14 flex-none text-right text-[11px] tabular-nums text-ink-gray-5">{{ row.converted }}/{{ row.leads }}</span>
          <span class="w-9 flex-none text-right text-[12px] font-semibold tabular-nums text-ink-gray-8">{{ pct(row.win_rate) }}</span>
        </div>

        <!-- avg-score signal (honest, from the current stored score) -->
        <div
          v-if="overall.avg_score_converted != null || overall.avg_score_lost != null"
          class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-gray-5"
        >
          <span v-if="overall.avg_score_converted != null">
            {{ __('Score prom. ganados') }}: <span class="font-semibold text-ink-gray-8">{{ overall.avg_score_converted }}</span>
          </span>
          <span v-if="overall.avg_score_lost != null">
            {{ __('perdidos') }}: <span class="font-semibold text-ink-gray-8">{{ overall.avg_score_lost }}</span>
          </span>
        </div>

        <!-- monthly cohorts -->
        <div v-if="monthlyRows.length" class="mt-4">
          <div class="mb-1.5 text-[10px] font-semibold uppercase tracking-[.06em] text-ink-gray-4">{{ __('Por mes') }}</div>
          <div v-for="c in monthlyRows" :key="c.cohort" class="mb-1.5 flex items-center gap-2">
            <span class="w-16 flex-none truncate text-[11px] text-ink-gray-6">{{ monthLabel(c.cohort) }}</span>
            <div class="h-1.5 min-w-0 flex-1 rounded-sm bg-surface-gray-2">
              <div class="h-full rounded-sm bg-surface-gray-5" :style="`width:${barPct(c.win_rate)}%`" />
            </div>
            <span class="w-9 flex-none text-right text-[11px] tabular-nums text-ink-gray-6">{{ pct(c.win_rate) }}</span>
            <span class="w-8 flex-none text-right text-[10.5px] tabular-nums text-ink-gray-4">{{ c.leads }}</span>
          </div>
        </div>

        <div class="mt-3 text-[10px] leading-snug text-ink-gray-4">{{ __('Basado en el score actual de cada lead, no el del día de creación.') }}</div>
      </template>

      <div v-else class="py-4 text-center text-xs text-ink-gray-4">{{ __('Sin leads en el periodo') }}</div>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { createResource } from 'frappe-ui'
import { GRADE_COLORS } from '@/composables/crmFormat'
import { pct, fmtLift, monthLabel, gradeRows, barPct } from '@/utils/backtestFormat'

const MONTH_OPTIONS = [3, 6, 12]
const months = ref(6)

// Manager-gated server-side; a non-manager gets PermissionError → banner (the
// server gate is the real protection, this is only the UX).
const restricted = ref(false)
const res = createResource({
  url: 'doco_marketing.api.score_backtest.get_backtest',
  onError: () => (restricted.value = true),
})
function load() {
  restricted.value = false
  res.submit({ months: months.value })
}
load()
watch(months, load)

const loading = computed(() => res.loading)
const data = computed(() => res.data || null)
const overall = computed(() => data.value?.overall || {})
const hasData = computed(() => (overall.value.leads || 0) > 0)
const rows = computed(() => gradeRows(overall.value.grades))
const monthlyRows = computed(() => data.value?.cohorts || [])
const liftLabel = computed(() => fmtLift(overall.value.lift))

function gradeColor(g) {
  return GRADE_COLORS[g]?.[0] || 'var(--surface-gray-5)'
}
</script>
