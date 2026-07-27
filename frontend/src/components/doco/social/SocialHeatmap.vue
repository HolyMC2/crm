<!--
  SocialHeatmap — "Mejores horarios" weekday×hour engagement heatmap (W6 B2).
  Sequential single-hue magnitude viz (dataviz skill): intensity = engagement
  normalized over TRUSTED cells only (n ≥ min_n). Buckets below min_n render greyed
  + hatched so thin data never fakes confidence; a per-weekday roll-up bar rides the
  row end. FB-only today — IG insights arrive after Meta App Review, hence the badge.

  PROPS
    shop  String|null  — branch scope (null = all shops). Drives get_heatmap.
  EMITS  — none (read-only widget).
  DATA   — createResource → doco_marketing.api.social_planner.get_heatmap({ shop }).
           Response: { source:"fb", cells:[{weekday 0=lun..6, hour 0-23, engagement,
           reach, n}], weekdays:[{weekday, engagement, reach, n}], min_n }.
  TESTIDS (B5 Playwright) — root "social-heatmap", each cell "heatmap-cell-{wd}-{h}"
           (wd 0=lun..6, h 0-23), FB badge "fb-only-badge".
  THEME  — chrome uses frappe-ui semantic tokens (auto-flip); the sequential ramp +
           hatch are CSS vars redefined under [data-theme='dark'] (the app's dark hook).
-->
<template>
  <div ref="rootEl" class="heatmap-root" data-testid="social-heatmap">
    <!-- header: FB-only badge -->
    <div class="mb-2 flex items-center justify-between gap-2">
      <span class="text-[11px] text-ink-gray-5">{{ __('Interacción por día y hora') }}</span>
      <span
        v-if="fbOnly"
        data-testid="fb-only-badge"
        class="inline-flex flex-none items-center gap-1 rounded-full bg-surface-blue-2 px-2 py-0.5 text-[10.5px] font-semibold text-ink-blue-3"
        :title="__('Instagram se suma cuando Meta apruebe la app')"
      >🟦 {{ __('Solo datos de Facebook') }}</span>
    </div>

    <!-- loading / empty / grid -->
    <div v-if="loading && !hasData" class="py-8 text-center text-[12px] text-ink-gray-4">{{ __('Cargando…') }}</div>
    <div v-else-if="error" class="py-8 text-center text-[12px] text-ink-red-4">{{ __('No se pudo cargar el mapa de calor') }}</div>
    <div v-else-if="!hasData" class="rounded-[12px] border border-dashed border-outline-gray-2 py-10 text-center text-[12px] text-ink-gray-4">
      {{ __('Aún no hay suficientes datos de publicaciones') }}
    </div>

    <template v-else>
      <!-- caption when we have posts but no confident bucket yet -->
      <p v-if="!hasTrusted" class="mb-2 text-[11px] text-ink-gray-4">
        {{ __('Aún no hay suficientes datos de publicaciones') }}
      </p>

      <div class="heatmap-scroll">
        <div class="heatmap-min">
          <!-- hour axis -->
          <div class="hm-row hm-axis">
            <div />
            <div v-for="h in 24" :key="'t' + h" class="hm-tick">{{ (h - 1) % 3 === 0 ? h - 1 : '' }}</div>
            <div class="hm-roll-head">{{ __('Semana') }}</div>
          </div>

          <!-- weekday rows -->
          <div v-for="row in rows" :key="row.wd" class="hm-row">
            <div class="hm-daylabel">{{ row.label }}</div>
            <div
              v-for="c in row.cells"
              :key="c.h"
              class="hm-cell"
              :class="{ 'hm-cell--empty': c.state === 'empty', 'hm-cell--weak': c.state === 'untrusted' }"
              :style="c.state === 'trusted' ? { background: `var(--seq-${c.step})` } : null"
              :title="c.title"
              :data-testid="`heatmap-cell-${c.wd}-${c.h}`"
            />
            <div class="hm-roll">
              <div class="hm-roll-track" :title="rollAt(row.wd).title">
                <div
                  class="hm-roll-fill"
                  :class="{ 'hm-roll-fill--weak': !rollAt(row.wd).trusted }"
                  :style="{ width: rollAt(row.wd).pct + '%' }"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- legend: sequential scale + low-confidence key (identity never color-alone) -->
      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10.5px] text-ink-gray-5">
        <div class="flex items-center gap-1.5">
          <span>{{ __('Menos') }}</span>
          <span class="flex overflow-hidden rounded-[3px]">
            <span v-for="i in 6" :key="'l' + i" class="hm-legend-swatch" :style="{ background: `var(--seq-${i - 1})` }" />
          </span>
          <span>{{ __('Más interacción') }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="hm-legend-swatch hm-cell--weak rounded-[3px]" />
          <span>{{ __('Datos insuficientes') }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, watch, toRef } from 'vue'
import { createResource } from 'frappe-ui'
import { WEEKDAYS } from '@/composables/socialCalendar'

const props = defineProps({
  // Branch scope; null/'' = all shops. Passed down by MetricsPanel from dash.params.
  shop: { type: String, default: null },
})

const heatmap = createResource({
  url: 'doco_marketing.api.social_planner.get_heatmap',
  makeParams: () => ({ shop: props.shop || undefined }),
  auto: true,
})
// Refetch when the branch filter changes (createResource auto-fetches only once).
watch(toRef(props, 'shop'), () => heatmap.reload())

const loading = computed(() => heatmap.loading)
const error = computed(() => heatmap.error)
const fbOnly = computed(() => (heatmap.data?.source || 'fb') === 'fb')
const hasData = computed(() => (heatmap.data?.cells || []).length > 0)
const minN = computed(() => heatmap.data?.min_n ?? 3)
const trustedCells = computed(() => (heatmap.data?.cells || []).filter((c) => c.n >= minN.value))
const hasTrusted = computed(() => trustedCells.value.length > 0)

// es-MX labels — row headers reuse the Monday-first WEEKDAYS export; tooltips get
// their own lowercase abbreviations + full names (weekday 0 = lunes).
const WD_ABBR = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
const WD_FULL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const hh = (h) => `${String(h).padStart(2, '0')}:00`
const fmt = (v) => Number(v || 0).toLocaleString('es-MX')
const nLabel = (n) => `${n} ${n === 1 ? __('publicación') : __('publicaciones')}`

function cellTitle(wd, h, c, weak) {
  return `${WD_ABBR[wd]} ${hh(h)} — ${__('interacción')} ${fmt(c.engagement)}, ${__('alcance')} ${fmt(c.reach)} (${nLabel(c.n)})${weak ? ' · ' + __('datos insuficientes') : ''}`
}
// intensity 0..1 → sequential step index 0(bajo)..5(alto); the CSS var flips per theme.
const stepIdx = (t) => Math.max(0, Math.min(5, Math.round(t * 5)))

const rows = computed(() => {
  const data = heatmap.data
  if (!data) return []
  const byCell = new Map((data.cells || []).map((c) => [c.weekday * 24 + c.hour, c]))
  const maxEng = Math.max(0, ...trustedCells.value.map((c) => c.engagement))
  const out = []
  for (let wd = 0; wd < 7; wd++) {
    const cells = []
    for (let h = 0; h < 24; h++) {
      const c = byCell.get(wd * 24 + h)
      if (!c || !c.n) {
        cells.push({ wd, h, state: 'empty', title: `${WD_ABBR[wd]} ${hh(h)} — ${__('sin publicaciones')}` })
      } else if (c.n < minN.value) {
        cells.push({ wd, h, state: 'untrusted', title: cellTitle(wd, h, c, true) })
      } else {
        const t = maxEng > 0 ? c.engagement / maxEng : 0
        cells.push({ wd, h, state: 'trusted', step: stepIdx(t), title: cellTitle(wd, h, c, false) })
      }
    }
    out.push({ wd, label: WEEKDAYS[wd], cells })
  }
  return out
})

// per-weekday roll-up: engagement scaled over trusted weekdays; thin weekdays render weak.
const rollups = computed(() => {
  const data = heatmap.data
  if (!data) return []
  const byWd = new Map((data.weekdays || []).map((w) => [w.weekday, w]))
  const maxEng = Math.max(0, ...(data.weekdays || []).filter((w) => w.n >= minN.value).map((w) => w.engagement))
  const out = []
  for (let wd = 0; wd < 7; wd++) {
    const w = byWd.get(wd)
    if (!w || !w.n) {
      out.push({ wd, pct: 0, trusted: false, title: `${WD_FULL[wd]} — ${__('sin publicaciones')}` })
      continue
    }
    const trusted = w.n >= minN.value
    const pct = maxEng > 0 ? Math.round((w.engagement / maxEng) * 100) : 0
    out.push({
      wd,
      pct,
      trusted,
      title: `${WD_FULL[wd]} — ${__('interacción')} ${fmt(w.engagement)}, ${__('alcance')} ${fmt(w.reach)} (${nLabel(w.n)})${trusted ? '' : ' · ' + __('datos insuficientes')}`,
    })
  }
  return out
})
const rollAt = (wd) => rollups.value[wd] || { pct: 0, trusted: false, title: '' }
</script>

<!-- Non-scoped but fully namespaced under .heatmap-root (matches the app's
     RatingInput dark-mode pattern). The sequential ramp reverses in dark: near-zero
     recedes toward the dark surface, high magnitude reads bright. -->
<style>
.heatmap-root {
  --seq-0: #cde2fb;
  --seq-1: #9ec5f4;
  --seq-2: #5598e7;
  --seq-3: #2a78d6;
  --seq-4: #184f95;
  --seq-5: #0d366b;
  --seq-strong: #2a78d6;
  --hm-empty: #f1f1ee;
  --hm-weak-base: #e6e5e1;
  --hm-hatch: rgba(137, 135, 129, 0.55);
  --hm-track: #edece8;
}
[data-theme='dark'] .heatmap-root {
  --seq-0: #104281;
  --seq-1: #184f95;
  --seq-2: #256abf;
  --seq-3: #3987e5;
  --seq-4: #6da7ec;
  --seq-5: #b7d3f6;
  --seq-strong: #3987e5;
  --hm-empty: #1f1f1e;
  --hm-weak-base: #2c2c2a;
  --hm-hatch: rgba(160, 158, 150, 0.5);
  --hm-track: #242422;
}

.heatmap-root .heatmap-scroll {
  overflow-x: auto;
}
.heatmap-root .heatmap-min {
  min-width: 520px;
}
/* one shared column template so the axis + every weekday row align */
.heatmap-root .hm-row {
  display: grid;
  grid-template-columns: 2.2rem repeat(24, minmax(0, 1fr)) 3.4rem;
  gap: 2px; /* the surface-gap spacer: separation is negative space, not strokes */
  align-items: center;
}
.heatmap-root .hm-row + .hm-row {
  margin-top: 2px;
}
.heatmap-root .hm-axis {
  margin-bottom: 2px;
}
.heatmap-root .hm-tick {
  text-align: center;
  font-size: 9px;
  line-height: 1;
  color: var(--ink-gray-4, #898781);
  font-variant-numeric: tabular-nums;
}
.heatmap-root .hm-roll-head {
  text-align: left;
  font-size: 9px;
  color: var(--ink-gray-4, #898781);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.heatmap-root .hm-daylabel {
  text-align: right;
  padding-right: 4px;
  font-size: 10px;
  font-weight: 700;
  color: var(--ink-gray-5, #898781);
}
.heatmap-root .hm-cell {
  height: 20px;
  border-radius: 3px;
  background: var(--hm-empty);
}
.heatmap-root .hm-cell--empty {
  background: var(--hm-empty);
}
/* low-confidence: greyed + 45° hatch — no fake confidence */
.heatmap-root .hm-cell--weak {
  background:
    repeating-linear-gradient(45deg, transparent 0 3px, var(--hm-hatch) 3px 4px),
    var(--hm-weak-base);
}
.heatmap-root .hm-roll {
  padding-left: 4px;
}
.heatmap-root .hm-roll-track {
  height: 8px;
  border-radius: 999px;
  background: var(--hm-track);
  overflow: hidden;
}
.heatmap-root .hm-roll-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--seq-strong); /* grows from the left baseline */
  transition: width 0.2s ease;
}
.heatmap-root .hm-roll-fill--weak {
  background:
    repeating-linear-gradient(45deg, transparent 0 3px, var(--hm-hatch) 3px 4px),
    var(--hm-weak-base);
}
.heatmap-root .hm-legend-swatch {
  display: inline-block;
  width: 14px;
  height: 12px;
}
</style>
