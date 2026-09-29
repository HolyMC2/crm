<template>
  <div class="sales-report min-w-0 space-y-5 text-ink-gray-9">
    <ReportBlock
      :title="__('Sales at a glance')"
      :description="
        __('Records created in this period, measured in their current state.')
      "
      :loading="loading"
      :error="error"
      @retry="loadReport"
    >
      <div
        v-if="report"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <button
          v-for="metric in metrics"
          :key="metric.key"
          type="button"
          class="report-stat"
          @click="drill(metric.kind, metric.bucket, metric.label)"
        >
          <span class="text-sm text-ink-gray-6">{{ metric.label }}</span>
          <strong class="break-words text-2xl font-semibold tabular-nums">{{
            metric.value
          }}</strong>
          <span class="text-xs text-ink-gray-6">{{
            deltaText(metric.key)
          }}</span>
          <span class="mt-auto text-xs text-ink-gray-6"
            >{{ __('View records') }} →</span
          >
        </button>
      </div>
      <p
        v-if="report && !report.summary.leads && !report.summary.deals"
        class="mt-4 text-sm text-ink-gray-6"
      >
        {{
          __(
            'No leads or deals were created in this period with these filters.',
          )
        }}
      </p>
      <p v-if="report" class="mt-4 text-xs leading-relaxed text-ink-gray-6">
        {{
          __('Created {0} through {1}; current state as of {2} ({3}).', [
            report.filters.from_date,
            report.filters.to_date,
            report.as_of,
            report.timezone,
          ])
        }}
      </p>
      <p
        v-if="comparisonFilters"
        class="mt-2 text-xs leading-relaxed text-ink-gray-6"
      >
        {{
          __(
            'Compared with records created {0} through {1}, also measured in their current state. This is not a historical snapshot.',
            [comparisonFilters.from_date, comparisonFilters.to_date],
          )
        }}
      </p>
      <div
        v-if="comparisonError"
        role="status"
        class="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-gray-6"
      >
        <span>{{
          __('Previous period unavailable. Current results are still shown.')
        }}</span>
        <button
          type="button"
          class="report-button"
          @click="loadComparison(report, epoch)"
        >
          {{ __('Retry comparison') }}
        </button>
      </div>
      <p
        v-if="report && !report.amounts_available"
        class="mt-3 text-sm text-ink-gray-6"
      >
        {{ __('Amounts are unavailable for your permissions.') }}
      </p>
    </ReportBlock>

    <p
      v-if="report?.groups_truncated && !loading && !error"
      role="status"
      class="rounded-lg border border-outline-gray-2 bg-surface-base p-3 text-sm text-ink-gray-6"
    >
      {{
        __(
          'Only the first 500 groups are shown. Narrow the filters to review every group; summary counts include the full permitted cohort.',
        )
      }}
    </p>
    <div class="grid min-w-0 gap-4 xl:grid-cols-3">
      <ReportChart
        :title="__('Where are deals waiting?')"
        :description="
          __(
            'Up to eight oldest open stages by average days. Current occupancy, not a sequential funnel; incomplete history is approximate.',
          )
        "
        :rows="stageRows"
        :value-label="__('Average days')"
        :loading="loading"
        :error="error"
        @retry="loadReport"
        @select="selectChart"
      />
      <ReportChart
        :title="__('Who needs follow-up help?')"
        :description="
          __(
            'Up to eight assignees with the most overdue open tasks on leads and deals created in this period. Task dates do not define this cohort.',
          )
        "
        :rows="ownerRows"
        :value-label="__('Overdue tasks')"
        :loading="loading"
        :error="error"
        @retry="loadReport"
        @select="selectChart"
      />
      <ReportChart
        :title="__('Which sources bring wins?')"
        :description="
          __(
            'Up to eight sources with the most won deals. Current recorded source, not distinct customers or campaign attribution.',
          )
        "
        :rows="sourceRows"
        :value-label="__('Won deals')"
        :loading="loading"
        :error="error"
        @retry="loadReport"
        @select="selectChart"
      />
    </div>

    <template v-if="report && !error && !loading && !overviewOnly">
      <section
        class="report-section"
        :aria-label="__('Conversion and forecast')"
      >
        <h2 class="text-base font-semibold">
          {{ __('Conversion and forecast') }}
        </h2>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <button
            class="report-stat"
            @click="drill('leads', { converted: 1 }, __('Converted leads'))"
          >
            <span class="text-sm text-ink-gray-6">{{
              __('Converted leads')
            }}</span>
            <strong>{{ number(report.summary.converted_leads) }}</strong>
            <small>{{ deltaText('converted_leads') }}</small>
          </button>
          <button
            class="report-stat"
            @click="drill('leads', {}, __('Lead conversion'))"
          >
            <span class="text-sm text-ink-gray-6">{{
              __('Lead conversion')
            }}</span>
            <strong>{{ percent(report.summary.conversion_percent) }}</strong>
            <small>{{ __('Converted leads / leads in this cohort') }}</small>
          </button>
          <button
            class="report-stat"
            @click="drill('deals', { outcome: 'Lost' }, __('Lost deals'))"
          >
            <span class="text-sm text-ink-gray-6">{{ __('Lost deals') }}</span>
            <strong>{{ number(report.summary.lost) }}</strong>
            <small>{{ deltaText('lost') }}</small>
          </button>
          <button
            class="report-stat"
            @click="
              drill('deals', {}, __('Closed win rate — review cohort deals'))
            "
          >
            <span class="text-sm text-ink-gray-6">{{
              __('Closed win rate')
            }}</span>
            <strong>{{ percent(report.summary.closed_win_percent) }}</strong>
            <small>{{ __('Won / (Won + Lost) deals') }}</small>
            <small>{{ __('Review cohort deals') }}</small>
          </button>
        </div>
        <p class="text-sm text-ink-gray-6">
          {{
            __(
              'Deal values do not establish offered, accepted, invoiced or paid amounts.',
            )
          }}
        </p>
        <p v-if="!report.amounts_available" class="text-sm text-ink-gray-6">
          {{ __('Amounts are unavailable for your permissions.') }}
        </p>
        <div v-else class="grid gap-3 sm:grid-cols-2">
          <button
            class="report-stat"
            @click="
              drill(
                'deals',
                {},
                __('Open expected value — review cohort deals'),
              )
            "
          >
            <span class="text-sm text-ink-gray-6">{{
              __('Open expected value')
            }}</span>
            <strong>{{ money(report.summary.open_expected_value) }}</strong>
            <small>{{ deltaText('open_expected_value') }}</small>
            <small>{{ __('Review cohort deals') }}</small>
          </button>
          <button
            class="report-stat"
            @click="
              drill('deals', {}, __('Weighted forecast — review cohort deals'))
            "
          >
            <span class="text-sm text-ink-gray-6">{{
              __('Weighted forecast')
            }}</span>
            <strong>{{ money(report.summary.weighted_forecast) }}</strong>
            <small>{{ deltaText('weighted_forecast') }}</small>
            <small>{{ __('Review cohort deals') }}</small>
          </button>
        </div>
        <button
          v-if="report.summary.missing_exchange_rate_count"
          class="report-button text-left"
          @click="
            drill(
              'deals',
              {},
              __('Exchange rate exclusions — review cohort deals'),
            )
          "
        >
          {{
            __(
              '{0} deals have no usable exchange rate and are excluded from amounts.',
              [report.summary.missing_exchange_rate_count],
            )
          }}
          <span class="block text-xs text-ink-gray-6">{{
            __('Review cohort deals')
          }}</span>
        </button>
      </section>
      <details class="report-section">
        <summary class="min-h-11 cursor-pointer font-medium">
          {{ __('Explore all sources, stages and owners') }}
        </summary>
        <section class="report-section" :aria-label="__('Sources')">
          <h2 class="text-lg font-semibold">{{ __('Sources') }}</h2>
          <p class="text-sm text-ink-gray-6">
            {{
              __('Current recorded source. This is not campaign attribution.')
            }}
          </p>
          <p v-if="!report.sources.length">
            {{ __('No source groups match these filters.') }}
          </p>
          <div
            v-for="row in report.sources"
            :key="row.source"
            class="report-row"
          >
            <h3 class="font-medium break-words">
              {{ row.source || __('Unknown source') }}
            </h3>
            <div class="flex flex-wrap gap-2">
              <button
                class="report-button"
                @click="
                  drill(
                    'leads',
                    { source: row.source },
                    row.source || __('Unknown source'),
                  )
                "
              >
                {{ __('Leads') }}: {{ row.leads }}
              </button>
              <button
                class="report-button"
                @click="
                  drill(
                    'leads',
                    { source: row.source, converted: 1 },
                    __('Converted leads'),
                  )
                "
              >
                {{ __('Converted') }}: {{ row.converted_leads }}
              </button>
              <button
                class="report-button"
                @click="
                  drill(
                    'deals',
                    { source: row.source },
                    row.source || __('Unknown source'),
                  )
                "
              >
                {{ __('Deals') }}: {{ row.deals }}
              </button>
              <button
                class="report-button"
                @click="
                  drill(
                    'deals',
                    { source: row.source, outcome: 'Won' },
                    __('Won deals'),
                  )
                "
              >
                {{ __('Won') }}: {{ row.won }}
              </button>
            </div>
          </div>
        </section>
        <section
          class="report-section"
          :aria-label="__('Current stage and aging')"
        >
          <h2 class="text-lg font-semibold">
            {{ __('Current stage and aging') }}
          </h2>
          <p class="text-sm text-ink-gray-6">
            {{
              __(
                'Current occupancy, not a sequential funnel. Age uses the current logged stage; incomplete history is approximate.',
              )
            }}
          </p>
          <p v-if="!report.stages.length">
            {{ __('No stages match these filters.') }}
          </p>
          <div
            v-for="row in report.stages"
            :key="`${row.pipeline}:${row.status}`"
            class="report-row"
          >
            <div class="min-w-0">
              <h3 class="font-medium break-words">
                {{ row.pipeline || __('No pipeline') }} · {{ row.status }}
              </h3>
              <button
                class="report-button text-left"
                @click="
                  drill(
                    'deals',
                    { pipeline: row.pipeline, status: row.status },
                    row.status,
                  )
                "
              >
                {{ __('Average days in stage') }}:
                {{ row.average_age_days ?? '—' }} ·
                {{ __('Approximate records') }}: {{ row.approximate_count }}
                <span class="block text-xs text-ink-gray-6">{{
                  __('Review this stage cohort')
                }}</span>
              </button>
            </div>
            <button
              class="report-button"
              @click="
                drill(
                  'deals',
                  { pipeline: row.pipeline, status: row.status },
                  row.status,
                )
              "
            >
              {{ __('Deals') }}: {{ row.count }}
            </button>
          </div>
        </section>
        <section class="report-section" :aria-label="__('Owner workload')">
          <h2 class="text-lg font-semibold">{{ __('Owner workload') }}</h2>
          <p class="text-sm text-ink-gray-6">
            {{
              __(
                'Open tasks on permitted leads and deals in this creation cohort, grouped by the current task assignee. Task dates do not define this cohort.',
              )
            }}
          </p>
          <p v-if="!report.owners.length">
            {{ __('No owner groups match these filters.') }}
          </p>
          <div v-for="row in report.owners" :key="row.owner" class="report-row">
            <h3 class="font-medium break-words">
              {{ row.owner || __('Unassigned') }}
            </h3>
            <div class="flex flex-wrap gap-2">
              <button
                class="report-button"
                @click="drill('leads', { owner: row.owner }, __('Owner leads'))"
              >
                {{ __('Leads') }}: {{ row.leads }}
              </button>
              <button
                class="report-button"
                @click="drill('deals', { owner: row.owner }, __('Owner deals'))"
              >
                {{ __('Deals') }}: {{ row.deals }}
              </button>
              <button
                class="report-button"
                @click="
                  drill(
                    'tasks',
                    { owner: row.owner, task_state: 'open' },
                    __('Open tasks'),
                  )
                "
              >
                {{ __('Open tasks') }}: {{ row.open_tasks }}
              </button>
              <button
                class="report-button"
                @click="
                  drill(
                    'tasks',
                    { owner: row.owner, task_state: 'overdue' },
                    __('Overdue tasks'),
                  )
                "
              >
                {{ __('Overdue') }}: {{ row.overdue_tasks }}
              </button>
              <button
                class="report-button"
                @click="
                  drill(
                    'tasks',
                    { owner: row.owner, task_state: 'undated' },
                    __('Undated tasks'),
                  )
                "
              >
                {{ __('No due date') }}: {{ row.undated_tasks }}
              </button>
            </div>
          </div>
        </section>
        <details class="report-section">
          <summary class="min-h-11 cursor-pointer font-medium">
            {{ __('Report definitions') }}
          </summary>
          <dl class="space-y-3">
            <div v-for="(definition, key) in report.definitions" :key="key">
              <dt class="font-medium">{{ __(key) }}</dt>
              <dd class="text-sm text-ink-gray-6">{{ __(definition) }}</dd>
            </div>
          </dl>
        </details>
      </details>
    </template>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import { money as formatMoney } from '@/utils/numberFormat'
import ReportBlock from './ReportBlock.vue'
import ReportChart from './ReportChart.vue'
import { periodDelta, previousPeriod } from './reportFilters'

const props = defineProps({
  filters: { type: Object, default: () => ({}) },
  overviewOnly: { type: Boolean, default: false },
})
const emit = defineEmits(['drill', 'loaded'])
const report = ref(null)
const previousReport = ref(null)
const loading = ref(true)
const error = ref('')
const comparisonLoading = ref(false)
const comparisonError = ref(false)
const comparisonFilters = ref(null)
let epoch = 0

const metrics = computed(() => {
  if (!report.value) return []
  const summary = report.value.summary
  return [
    {
      key: 'leads',
      label: __('Leads'),
      kind: 'leads',
      bucket: {},
      value: number(summary.leads),
    },
    {
      key: 'deals',
      label: __('Deals'),
      kind: 'deals',
      bucket: {},
      value: number(summary.deals),
    },
    {
      key: 'won',
      label: __('Won deals'),
      kind: 'deals',
      bucket: { outcome: 'Won' },
      value: number(summary.won),
    },
    {
      key: 'won_value',
      label: __('Won deal value'),
      kind: 'deals',
      bucket: { outcome: 'Won' },
      value: report.value.amounts_available ? money(summary.won_value) : '—',
    },
  ]
})
const stageRows = computed(() =>
  (report.value?.stages || [])
    .filter(
      (row) =>
        ['Open', 'Ongoing', 'On Hold'].includes(row.type) &&
        row.average_age_days != null,
    )
    .map((row) => ({
      label: `${row.pipeline || __('No pipeline')} · ${row.status || __('Unknown stage')}`,
      value: Math.round(Number(row.average_age_days) * 10) / 10,
      kind: 'deals',
      bucket: { pipeline: row.pipeline, status: row.status },
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8),
)
const ownerRows = computed(() =>
  (report.value?.owners || [])
    .filter((row) => row.overdue_tasks > 0)
    .map((row) => ({
      label: row.owner || __('Unassigned'),
      value: Number(row.overdue_tasks),
      kind: 'tasks',
      bucket: { owner: row.owner, task_state: 'overdue' },
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8),
)
const sourceRows = computed(() =>
  (report.value?.sources || [])
    .filter((row) => row.won > 0)
    .map((row) => ({
      label: row.source || __('Unknown source'),
      value: Number(row.won),
      kind: 'deals',
      bucket: { source: row.source, outcome: 'Won' },
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8),
)

function number(value) {
  return value == null ? '—' : Number(value).toLocaleString()
}
function percent(value) {
  return value == null ? '—' : `${number(value)}%`
}
function money(value) {
  return value == null ? '—' : formatMoney(value, report.value.currency, 2)
}
function deltaText(key) {
  if (comparisonLoading.value) return __('Comparing previous period…')
  const monetary = [
    'won_value',
    'open_expected_value',
    'weighted_forecast',
  ].includes(key)
  const current =
    monetary && !report.value?.amounts_available
      ? null
      : report.value?.summary[key]
  const previous =
    monetary &&
    (!previousReport.value?.amounts_available ||
      previousReport.value?.currency !== report.value?.currency)
      ? null
      : (previousReport.value?.summary[key] ?? null)
  const delta = periodDelta(current, previous)
  if (delta.state === 'unavailable')
    return __('Previous period comparison unavailable')
  if (delta.state === 'new') return __('New · previous period was zero')
  if (delta.state === 'flat') return __('No change from previous period')
  return __('{0}% vs previous period', [
    `${delta.percent > 0 ? '+' : ''}${Number(delta.percent).toLocaleString(undefined, { maximumFractionDigits: 1 })}`,
  ])
}
async function loadComparison(data, current) {
  comparisonFilters.value = previousPeriod(data.filters)
  if (!comparisonFilters.value) return
  comparisonLoading.value = true
  comparisonError.value = false
  try {
    const previous = await call('crm.api.sales_reports.get_report', {
      filters: comparisonFilters.value,
    })
    if (current === epoch) previousReport.value = previous
  } catch {
    if (current === epoch) comparisonError.value = true
  } finally {
    if (current === epoch) comparisonLoading.value = false
  }
}
async function loadReport() {
  const current = ++epoch
  loading.value = true
  error.value = ''
  report.value = null
  previousReport.value = null
  comparisonFilters.value = null
  comparisonLoading.value = false
  comparisonError.value = false
  try {
    const data = await call('crm.api.sales_reports.get_report', {
      filters: { ...props.filters },
    })
    if (current !== epoch) return
    report.value = data
    emit('loaded', data.filters)
    loading.value = false
    await loadComparison(data, current)
  } catch (err) {
    if (current === epoch)
      error.value =
        err?.exc_type === 'PermissionError'
          ? __('You do not have permission to read these report fields.')
          : __(
              'Unable to load the sales report. Retry; no empty or zero result has been assumed.',
            )
  } finally {
    if (current === epoch) loading.value = false
  }
}
function drill(kind, bucket, title) {
  emit('drill', { kind, bucket, title })
}
function selectChart(row) {
  drill(row.kind, row.bucket, row.label)
}
watch(() => JSON.stringify(props.filters), loadReport, { immediate: true })
onBeforeUnmount(() => {
  epoch++
})
</script>
<style scoped>
.report-button {
  @apply min-h-11 max-w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm text-ink-gray-9 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50;
}
.report-stat {
  @apply flex min-h-11 min-w-0 flex-col gap-2 rounded-lg border border-outline-gray-2 bg-surface-base p-4 text-left hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2;
}
.report-stat strong {
  @apply break-words text-xl tabular-nums;
}
.report-stat small {
  @apply text-xs text-ink-gray-6;
}
.report-section {
  @apply min-w-0 space-y-3 rounded-lg border border-outline-gray-2 bg-surface-base p-4;
}
.report-row {
  @apply flex flex-col gap-3 border-t border-outline-gray-2 py-3;
}
</style>
