<!-- Embudo: where deals of one pipeline stop, and whether that is improving.
     State (pipeline + period) lives in the URL so a drill-down's Back returns here. -->
<template>
  <div
    class="flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-base"
  >
    <header
      class="flex h-12 flex-none items-center gap-2 border-b border-outline-gray-1 px-4 sm:px-5"
    >
      <button
        type="button"
        class="text-sm text-ink-gray-5 hover:text-ink-gray-8"
        @click="router.push('/deals')"
      >
        ← {{ __('Tratos') }}
      </button>
      <span class="text-ink-gray-3" aria-hidden="true">/</span>
      <h1 class="truncate text-base font-semibold text-ink-gray-9">
        {{ __('Embudo') }}
      </h1>
    </header>

    <div class="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-4 sm:px-5">
      <!-- selectors -->
      <div class="flex flex-col gap-3">
        <label
          v-if="pipelineOptions.length"
          class="flex min-w-0 flex-wrap items-center gap-2 text-sm text-ink-gray-6"
        >
          {{ __('Embudo de ventas') }}
          <select
            class="h-8 min-w-0 max-w-full rounded border border-outline-gray-2 bg-surface-base px-2 text-sm text-ink-gray-8"
            :value="pipeline"
            data-testid="pipeline-select"
            @change="navigate({ pipeline: $event.target.value })"
          >
            <option
              v-for="item in pipelineOptions"
              :key="item.name"
              :value="item.name"
            >
              {{ item.pipeline_name || item.name
              }}{{ item.archived ? ' · ' + __('Archivado') : '' }}
            </option>
          </select>
        </label>
        <PeriodPicker
          :period="state.period"
          :range="range"
          @change="navigate"
        />
        <p class="text-xs text-ink-gray-5">
          {{
            __('Tratos creados del {0} al {1}', [
              day(range.from),
              day(range.to),
            ])
          }}
          ·
          {{
            __('comparado con {0} – {1}', [
              day(previous.from),
              day(previous.to),
            ])
          }}
        </p>
      </div>

      <!-- error -->
      <div
        v-if="error"
        role="alert"
        class="flex flex-wrap items-center gap-2 rounded-lg border border-outline-red-2 bg-surface-red-1 px-4 py-3 text-sm text-ink-red-7"
      >
        {{
          __(
            'No se pudo cargar el embudo. Revisa el acceso e inténtalo de nuevo.',
          )
        }}
        <button type="button" class="font-medium underline" @click="load">
          {{ __('Reintentar') }}
        </button>
      </div>

      <!-- loading skeleton -->
      <div
        v-else-if="!current"
        class="flex animate-pulse flex-col gap-4"
        role="status"
        :aria-label="__('Cargando…')"
        data-testid="funnel-skeleton"
      >
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            v-for="n in 4"
            :key="n"
            class="h-20 rounded-lg bg-surface-gray-2"
          />
        </div>
        <div v-for="n in 4" :key="'s' + n" class="flex flex-col gap-2 px-3">
          <div class="h-3 w-32 rounded bg-surface-gray-2" />
          <div
            class="h-2.5 rounded-full bg-surface-gray-2"
            :class="skeletonWidth(n)"
          />
        </div>
      </div>

      <!-- empty -->
      <div
        v-else-if="!current.total"
        class="flex flex-col items-start gap-3 rounded-lg border border-outline-gray-1 px-5 py-8"
        data-testid="funnel-empty"
      >
        <div class="text-base font-medium text-ink-gray-8">
          {{ __('No hay tratos creados en este período') }}
        </div>
        <p class="text-sm text-ink-gray-6">
          {{
            prevModel && prevModel.total
              ? __('En el período anterior se crearon {0}.', [prevModel.total])
              : __('Prueba con un período más amplio o revisa otro embudo.')
          }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-if="state.period !== 'year'"
            type="button"
            class="rounded bg-surface-gray-2 px-3 py-1.5 text-sm text-ink-gray-8 hover:bg-surface-gray-3"
            @click="navigate({ period: 'year', from: '', to: '' })"
          >
            {{ __('Ver este año') }}
          </button>
          <button
            type="button"
            class="rounded px-3 py-1.5 text-sm text-ink-gray-7 hover:bg-surface-gray-1"
            @click="drill()"
          >
            {{ __('Abrir tratos del embudo') }} →
          </button>
        </div>
      </div>

      <!-- funnel -->
      <template v-else>
        <div
          class="flex flex-col gap-5 transition-opacity"
          :class="loading ? 'opacity-60' : ''"
          :aria-busy="loading"
        >
          <section class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div
              v-for="tile in tiles"
              :key="tile.key"
              class="min-w-0 rounded-lg border border-outline-gray-1 px-4 py-3"
            >
              <div class="truncate text-xs text-ink-gray-5">
                {{ tile.label }}
              </div>
              <div
                class="mt-1 truncate text-xl font-semibold sm:text-2xl tabular-nums text-ink-gray-9"
              >
                {{ tile.value }}
              </div>
              <div
                class="flex flex-wrap items-center gap-x-2 text-xs text-ink-gray-5"
              >
                <span v-if="tile.sub" class="truncate">{{ tile.sub }}</span>
                <DeltaText
                  :value="tile.delta"
                  :kind="tile.kind || 'count'"
                  :good="tile.good || 'up'"
                  :currency="currency"
                />
              </div>
            </div>
          </section>

          <p
            v-if="stuck"
            class="rounded-lg bg-surface-gray-1 px-4 py-3 text-sm text-ink-gray-7"
            data-testid="funnel-headline"
          >
            {{
              __(
                'Donde más se detienen: {0}. Solo el {1} % pasa a {2}; {3} tratos siguen ahí.',
                [
                  stuck.stage,
                  Math.round(stuck.conversion),
                  stuckNext,
                  stuck.stalled,
                ],
              )
            }}
            <button
              type="button"
              class="ml-1 font-medium text-ink-gray-8 underline"
              @click="drill(stuck.status)"
            >
              {{ __('Ver esos tratos') }}
            </button>
          </p>

          <section class="flex flex-col gap-2">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="text-sm font-semibold text-ink-gray-8">
                {{ __('Etapas') }}
              </h2>
              <span v-if="metricsUnavailable" class="text-xs text-ink-gray-5">
                {{ __('Valores no disponibles para tu usuario') }}
              </span>
            </div>
            <FunnelSteps
              :model="current"
              :delta="delta"
              :currency="currency"
              @drill="drill"
            />
          </section>

          <p class="text-xs leading-relaxed text-ink-gray-5">
            {{
              __(
                'Se calcula con la etapa actual de cada trato creado en el período: un trato en una etapa posterior, o ganado, cuenta como que pasó por las anteriores. «Siguen en» incluye tratos que aún avanzan. El historial no registra tiempo por etapa.',
              )
            }}
          </p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { call, createResource } from 'frappe-ui'
import { useRoute, useRouter } from 'vue-router'
import FunnelSteps from '@/components/PipelineAnalysis/FunnelSteps.vue'
import PeriodPicker from '@/components/PipelineAnalysis/PeriodPicker.vue'
import DeltaText from '@/components/PipelineAnalysis/DeltaText.vue'
import { formatDate } from '@/utils'
import { money } from '@/utils/numberFormat'
import {
  DEFAULT_PERIOD,
  addDays,
  funnelDelta,
  funnelModel,
  funnelQuery,
  localToday,
  metricsByStatus,
  parseFunnelQuery,
  periodRange,
  previousRange,
} from '@/utils/pipelineMath'

const route = useRoute()
const router = useRouter()
const today = localToday()

const state = computed(() => parseFunnelQuery(route.query))
const range = computed(
  () =>
    periodRange(state.value.period, today, state.value) ||
    periodRange(DEFAULT_PERIOD, today),
)
const previous = computed(() => previousRange(range.value))

const pipelines = createResource({
  url: 'crm.pipeline.api.get_pipelines',
  params: { include_archived: true },
  auto: true,
})
const pipelineOptions = computed(() => pipelines.data || [])
// The question is always about ONE pipeline: default to the configured default.
const fallbackPipeline = computed(() => {
  const rows = pipelineOptions.value
  const live = rows.filter((row) => !row.archived)
  return (live.find((row) => row.is_default) || live[0] || rows[0])?.name || ''
})
const pipeline = computed(() => {
  const wanted = state.value.pipeline
  return pipelineOptions.value.some((row) => row.name === wanted)
    ? wanted
    : fallbackPipeline.value
})
const ready = computed(
  () => pipelines.fetched || !!pipelines.error || !!pipelines.data,
)

function navigate(patch) {
  const next = { ...state.value, pipeline: pipeline.value, ...patch }
  router.push({ path: route.path, query: funnelQuery(next) })
}

// ── data ────────────────────────────────────────────────────────────────────
const current = ref(null)
const prevModel = ref(null)
const currency = ref(null)
const metricsUnavailable = ref(false)
const loading = ref(false)
const error = ref(null)
let request = 0

function funnel(r) {
  return call('crm.api.dashboard.get_pipeline_funnel', {
    from_date: r.from,
    to_date: r.to,
    filters: pipeline.value ? { pipeline: pipeline.value } : {},
  })
}
// Stage values come from the deal list's own aggregate: same permissions and
// FX handling as the Deals board. Denied amounts leave the funnel count-only.
function metrics(r) {
  const filters = [
    ['creation', '>=', r.from],
    ['creation', '<', addDays(r.to, 1)],
  ]
  if (pipeline.value) filters.push(['pipeline', '=', pipeline.value])
  return call('crm.api.doc.aggregate_deal_metrics', { filters }).catch(
    () => null,
  )
}

async function load() {
  const mine = ++request
  loading.value = true
  error.value = null
  const cur = range.value
  const prev = previous.value
  try {
    const [now, before, nowMetrics, beforeMetrics] = await Promise.all([
      funnel(cur),
      funnel(prev).catch(() => null),
      metrics(cur),
      metrics(prev),
    ])
    if (mine !== request) return
    const valued = metricsByStatus(nowMetrics)
    current.value = funnelModel(now, valued)
    prevModel.value = before
      ? funnelModel(before, valued ? metricsByStatus(beforeMetrics) : null)
      : null
    currency.value = valued ? nowMetrics.currency || null : null
    metricsUnavailable.value = !valued
  } catch (e) {
    if (mine !== request) return
    error.value = e
    current.value = null
  } finally {
    if (mine === request) loading.value = false
  }
}

watch(
  () =>
    ready.value &&
    JSON.stringify([pipeline.value, range.value.from, range.value.to]),
  (key) => key && load(),
  { immediate: true },
)
// Settle an absent or unknown pipeline in the URL so the link is shareable.
watch(
  () => [ready.value, pipeline.value, state.value.pipeline],
  ([isReady, resolved, asked]) => {
    if (isReady && resolved && resolved !== asked)
      router.replace({
        path: route.path,
        query: funnelQuery({ ...state.value, pipeline: resolved }),
      })
  },
  { immediate: true },
)

const delta = computed(() => funnelDelta(current.value, prevModel.value))

// ── drill-down: the Deals list reads this report query (see DealsView) ─────
function drill(status) {
  router.push({
    path: '/deals',
    query: {
      report: 'pipeline',
      ...(status ? { status } : {}),
      ...(pipeline.value ? { pipeline: pipeline.value } : {}),
      created_from: range.value.from,
      created_to: range.value.to,
    },
  })
}

// ── presentation ────────────────────────────────────────────────────────────
function day(value) {
  return formatDate(value, '', true)
}
function skeletonWidth(n) {
  return ['w-full', 'w-3/4', 'w-1/2', 'w-1/3'][n - 1]
}
const stuck = computed(() =>
  current.value?.steps.find((step) => step.biggestDrop),
)
const stuckNext = computed(() => {
  const steps = current.value?.steps || []
  const i = steps.indexOf(stuck.value)
  return steps[i + 1]?.stage || __('Ganado')
})
const tiles = computed(() => {
  const m = current.value
  const d = delta.value
  const pct = (n) => (n == null ? '—' : `${Math.round(n)} %`)
  return [
    {
      key: 'total',
      label: __('Tratos creados'),
      value: m.total,
      delta: d?.total ?? null,
      good: 'none',
    },
    {
      key: 'open',
      label: __('Siguen abiertos'),
      value: m.open,
    },
    {
      key: 'rate',
      label: __('Tasa de cierre'),
      value: pct(m.winRate),
      sub: __('{0} ganados · {1} perdidos', [m.won.count, m.lost.count]),
      delta: d?.winRate ?? null,
      kind: 'pp',
    },
    currency.value
      ? {
          key: 'won',
          label: __('Valor ganado'),
          value: money(m.won.value, currency.value),
          delta: d?.wonValue ?? null,
          kind: 'money',
        }
      : {
          key: 'won',
          label: __('Ganados'),
          value: m.won.count,
          delta: d?.won ?? null,
        },
  ].map((tile) => ({ delta: null, ...tile }))
})
</script>
