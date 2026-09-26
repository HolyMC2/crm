<template>
  <div class="sales-report min-w-0 space-y-5 p-3 sm:p-5 text-ink-gray-9">
    <form
      class="rounded border border-outline-gray-2 bg-surface-base p-4"
      @submit.prevent="apply"
    >
      <h1 class="mb-3 text-xl font-semibold">{{ __('Sales reports') }}</h1>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label
          >{{ __('Created from')
          }}<input v-model="form.from_date" type="date" class="report-input"
        /></label>
        <label
          >{{ __('Created through')
          }}<input v-model="form.to_date" type="date" class="report-input"
        /></label>
        <Link v-model="form.owner" doctype="User" :label="__('Owner')" />
        <Link
          v-model="form.pipeline"
          doctype="CRM Pipeline"
          :label="__('Sales pipeline')"
        />
        <label
          >{{ __('Sales company')
          }}<input v-model="form.company" maxlength="140" class="report-input"
        /></label>
      </div>
      <p class="my-3 text-sm text-ink-gray-6">
        {{
          __(
            'Leave dates blank for the last 30 site dates. Filters only narrow records you are permitted to read.',
          )
        }}
      </p>
      <button class="report-button" type="submit" :disabled="loading">
        {{ __('Apply filters') }}
      </button>
    </form>
    <p v-if="loading" role="status">{{ __('Loading sales report…') }}</p>
    <div v-if="error" role="alert" class="space-y-2">
      <p>{{ error }}</p>
      <button class="report-button" @click="loadReport(applied)">
        {{ __('Retry report') }}
      </button>
    </div>
    <template v-if="report && !error && !loading">
      <p class="text-sm text-ink-gray-6">
        {{
          __('Created {0} through {1}; current state as of {2} ({3}).', [
            report.filters.from_date,
            report.filters.to_date,
            report.as_of,
            report.timezone,
          ])
        }}
      </p>
      <p v-if="report.groups_truncated" role="status">
        {{
          __(
            'Only the first 500 groups are shown. Narrow the filters to review every group; summary counts include the full permitted cohort.',
          )
        }}
      </p>
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button class="report-stat" @click="drill('leads', {}, __('Leads'))">
          <span>{{ __('Leads') }}</span
          ><strong>{{ report.summary.leads }}</strong>
        </button>
        <button
          class="report-stat"
          @click="drill('leads', { converted: 1 }, __('Converted leads'))"
        >
          <span>{{ __('Converted leads') }}</span
          ><strong>{{ report.summary.converted_leads }}</strong>
        </button>
        <button class="report-stat" @click="drill('deals', {}, __('Deals'))">
          <span>{{ __('Deals') }}</span
          ><strong>{{ report.summary.deals }}</strong>
        </button>
        <button
          class="report-stat"
          @click="drill('deals', { outcome: 'Won' }, __('Won deals'))"
        >
          <span>{{ __('Won deals') }}</span
          ><strong>{{ report.summary.won }}</strong>
        </button>
        <button
          class="report-stat"
          @click="drill('deals', { outcome: 'Lost' }, __('Lost deals'))"
        >
          <span>{{ __('Lost deals') }}</span
          ><strong>{{ report.summary.lost }}</strong>
        </button>
        <div class="report-stat">
          <span>{{ __('Lead conversion') }}</span
          ><strong>{{ percent(report.summary.conversion_percent) }}</strong
          ><small>{{ __('Converted leads / leads in this cohort') }}</small>
        </div>
        <div class="report-stat">
          <span>{{ __('Closed win rate') }}</span
          ><strong>{{ percent(report.summary.closed_win_percent) }}</strong
          ><small>{{ __('Won / (Won + Lost) deals') }}</small>
        </div>
      </div>
      <section class="report-section" :aria-label="__('Commercial forecast')">
        <h2 class="text-lg font-semibold">{{ __('Commercial forecast') }}</h2>
        <p class="text-sm text-ink-gray-6">
          {{
            __(
              'Deal values do not establish offered, accepted, invoiced or paid amounts.',
            )
          }}
        </p>
        <p v-if="!report.amounts_available">
          {{ __('Amounts are unavailable for your permissions.') }}
        </p>
        <dl v-else class="grid gap-3 sm:grid-cols-3">
          <div>
            <dt>{{ __('Open expected value') }}</dt>
            <dd class="font-semibold">
              {{ money(report.summary.open_expected_value) }}
            </dd>
          </div>
          <div>
            <dt>{{ __('Weighted forecast') }}</dt>
            <dd class="font-semibold">
              {{ money(report.summary.weighted_forecast) }}
            </dd>
          </div>
          <div>
            <dt>{{ __('Won deal value') }}</dt>
            <dd class="font-semibold">{{ money(report.summary.won_value) }}</dd>
          </div>
        </dl>
        <p v-if="report.summary.missing_exchange_rate_count" role="status">
          {{
            __(
              '{0} deals have no usable exchange rate and are excluded from amounts.',
              [report.summary.missing_exchange_rate_count],
            )
          }}
        </p>
      </section>
      <ReportRecords
        v-if="drawer"
        :key="drawerKey"
        :filters="report.filters"
        :bucket="drawer.bucket"
        :kind="drawer.kind"
        :title="drawer.title"
        :return-to="route.fullPath"
        @close="closeRecords"
      />
      <section class="report-section" :aria-label="__('Sources')">
        <h2 class="text-lg font-semibold">{{ __('Sources') }}</h2>
        <p class="text-sm text-ink-gray-6">
          {{ __('Current recorded source. This is not campaign attribution.') }}
        </p>
        <p v-if="!report.sources.length">
          {{ __('No source groups match these filters.') }}
        </p>
        <div v-for="row in report.sources" :key="row.source" class="report-row">
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
            <p class="text-sm">
              {{ __('Average days in stage') }}:
              {{ row.average_age_days ?? '—' }} ·
              {{ __('Approximate records') }}: {{ row.approximate_count }}
            </p>
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
    </template>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import Link from '@/components/Controls/Link.vue'
import ReportRecords from './ReportRecords.vue'
const route = useRoute(),
  router = useRouter()
const keys = ['from_date', 'to_date', 'owner', 'pipeline', 'company']
const form = reactive(Object.fromEntries(keys.map((key) => [key, ''])))
const report = ref(null),
  loading = ref(false),
  error = ref(''),
  applied = ref({})
let epoch = 0,
  lastKey = null
const queryFilters = () =>
  Object.fromEntries(
    keys
      .filter((key) => typeof route.query[key] === 'string' && route.query[key])
      .map((key) => [key, route.query[key]]),
  )
const drawer = computed(() => {
  if (!['leads', 'deals', 'tasks'].includes(route.query.drill_kind)) return null
  try {
    const bucket = JSON.parse(route.query.drill_bucket || '{}')
    if (!bucket || Array.isArray(bucket) || typeof bucket !== 'object')
      return null
    return {
      kind: route.query.drill_kind,
      bucket,
      title:
        typeof route.query.drill_title === 'string'
          ? route.query.drill_title
          : __('Report records'),
    }
  } catch {
    return null
  }
})
const drawerKey = computed(() => JSON.stringify(drawer.value))
function percent(value) {
  return value == null ? '—' : `${value}%`
}
function money(value) {
  return value == null
    ? '—'
    : `${report.value.currency} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
async function loadReport(filters) {
  const current = ++epoch
  loading.value = true
  error.value = ''
  applied.value = { ...filters }
  try {
    const data = await call('crm.api.sales_reports.get_report', {
      filters: { ...filters },
    })
    if (current !== epoch) return
    report.value = data
    Object.assign(
      form,
      Object.fromEntries(keys.map((key) => [key, data.filters[key] || ''])),
    )
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
function apply() {
  const query = Object.fromEntries(
    keys.filter((key) => form[key]).map((key) => [key, form[key]]),
  )
  if (JSON.stringify(query) === JSON.stringify(queryFilters()))
    loadReport(query)
  else router.replace({ query })
}
function drill(kind, bucket, title) {
  const query = Object.fromEntries(
    Object.entries(report.value.filters).filter(([, value]) => value),
  )
  router.replace({
    query: {
      ...query,
      drill_kind: kind,
      drill_bucket: JSON.stringify(bucket),
      drill_title: title,
    },
  })
}
function closeRecords() {
  router.replace({ query: queryFilters() })
}
watch(
  () => route.query,
  () => {
    const filters = queryFilters(),
      key = JSON.stringify(filters)
    if (key === lastKey) return
    lastKey = key
    Object.assign(
      form,
      Object.fromEntries(keys.map((field) => [field, filters[field] || ''])),
    )
    loadReport(filters)
  },
  { immediate: true, deep: true },
)
onBeforeUnmount(() => {
  epoch++
})
</script>
<style scoped>
.sales-report :deep(.report-button) {
  @apply min-h-11 max-w-full rounded border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm text-ink-gray-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50;
}
.report-input {
  @apply block min-h-11 w-full min-w-0 rounded border border-outline-gray-2 bg-surface-base px-3 py-2 text-base;
}
.report-stat {
  @apply min-h-11 rounded border border-outline-gray-2 bg-surface-base p-3 text-left flex flex-col gap-2;
}
.report-stat strong {
  @apply text-xl;
}
.report-section {
  @apply min-w-0 space-y-3 rounded border border-outline-gray-2 bg-surface-base p-4;
}
.report-row {
  @apply flex flex-col gap-3 border-t border-outline-gray-2 py-3;
}
.sales-report :deep(input),
.sales-report :deep([role='combobox']) {
  min-height: 44px;
}
</style>
