<template>
  <div
    class="reports-page min-h-0 min-w-0 w-full flex-1 overflow-y-auto bg-surface-gray-1 text-ink-gray-9"
  >
    <div class="mx-auto w-full max-w-screen-2xl space-y-4 p-3 sm:p-5">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold">{{ __('Reports') }}</h1>
          <p class="mt-1 text-sm text-ink-gray-6">
            {{ __('Results, bottlenecks and the next conversation.') }}
          </p>
        </div>
        <nav
          v-if="addonAvailable"
          :aria-label="__('Report area')"
          class="flex rounded-lg bg-surface-gray-2 p-1"
        >
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="min-h-11 rounded-md px-4 text-sm font-medium"
            :class="
              marketing === (tab.key === 'marketing')
                ? 'bg-surface-base text-ink-gray-9'
                : 'text-ink-gray-6'
            "
            :aria-pressed="marketing === (tab.key === 'marketing')"
            @click="selectTab(tab.key)"
          >
            {{ tab.label }}
          </button>
        </nav>
      </header>
      <form
        class="grid min-w-0 gap-3 rounded-lg border border-outline-gray-2 bg-surface-base p-3 sm:grid-cols-2 lg:grid-cols-4"
        @submit.prevent
      >
        <label class="min-w-0 text-sm text-ink-gray-6"
          >{{ __('Period') }}
          <select
            v-model="draft.preset"
            :aria-label="__('Period')"
            class="report-control mt-1"
            @change="changePreset"
          >
            <option
              v-for="option in periods"
              :key="option.key"
              :value="option.key"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <div class="min-w-0">
          <Link
            v-model="draft.owner"
            doctype="User"
            :hide-me="true"
            :label="__('Owner')"
            :placeholder="__('All owners')"
          />
        </div>
        <div class="min-w-0">
          <Link
            v-model="draft.pipeline"
            doctype="CRM Pipeline"
            :label="__('Sales pipeline')"
            :placeholder="__('All pipelines')"
          />
        </div>
        <label class="min-w-0 text-sm text-ink-gray-6"
          >{{ __('Sales company')
          }}<input
            v-model="draft.company"
            maxlength="140"
            class="report-control mt-1"
            :placeholder="__('All companies')"
        /></label>
        <div
          v-if="draft.preset === 'custom'"
          class="grid min-w-0 grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2"
        >
          <label class="min-w-0 text-sm text-ink-gray-6"
            >{{ __('Created from')
            }}<input
              v-model="draft.from_date"
              class="report-control mt-1"
              type="date"
              :aria-label="__('Created from')"
          /></label>
          <label class="min-w-0 text-sm text-ink-gray-6"
            >{{ __('Created through')
            }}<input
              v-model="draft.to_date"
              class="report-control mt-1"
              type="date"
              :aria-label="__('Created through')"
          /></label>
        </div>
        <p
          v-if="invalidRange"
          role="alert"
          class="text-sm text-ink-gray-7 sm:col-span-2 lg:col-span-4"
        >
          {{ __('Choose valid dates with the start on or before the end.') }}
        </p>
      </form>
      <ReportRecords
        v-if="drawer"
        :key="JSON.stringify(drawer)"
        :filters="filters"
        :bucket="drawer.bucket || {}"
        :kind="drawer.kind || ''"
        :drill="drawer.doctype ? drawer : null"
        :title="drawer.title"
        :return-to="route.fullPath"
        @close="closeRecords"
      />
      <div v-show="!drawer" class="space-y-5">
        <SalesReport
          :filters="filters"
          :overview-only="marketing"
          @drill="drill"
        />
        <KeepAlive>
          <MarketingReports
            v-if="marketing && addonAvailable"
            :filters="filters"
            @drill="drill"
          />
        </KeepAlive>
      </div>
    </div>
  </div>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  reactive,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { addonAvailable } from '@/utils/crmCapabilities'
import Link from '@/components/Controls/Link.vue'
import SalesReport from '@/components/Reports/SalesReport.vue'
import ReportRecords from '@/components/Reports/ReportRecords.vue'
import {
  periodRange,
  readReportQuery,
  reportApiFilters,
  reportFilterQuery,
  readReportDrill,
  reportDrillQuery,
  validReportDate,
} from '@/components/Reports/reportFilters'
const MarketingReports = defineAsyncComponent(
  () => import('@/components/Reports/MarketingReports.vue'),
)
const route = useRoute(),
  router = useRouter()
const tabs = [
  { key: 'sales', label: __('Sales') },
  { key: 'marketing', label: __('Marketing') },
]
const periods = [
  { key: 'today', label: __('Hoy') },
  { key: '7d', label: __('7 días') },
  { key: '30d', label: __('30 días') },
  { key: 'month', label: __('Este mes') },
  { key: 'last-month', label: __('Mes anterior') },
  { key: 'custom', label: __('Custom range') },
]
const marketing = computed(
  () => addonAvailable.value && route.query.tab === 'marketing',
)
const state = computed(() => readReportQuery(route.query))
const filters = computed(() => reportApiFilters(state.value))
const draft = reactive({ ...state.value })
const invalidRange = computed(
  () =>
    !validReportDate(draft.from_date) ||
    !validReportDate(draft.to_date) ||
    draft.from_date > draft.to_date,
)
const drawer = computed(() => readReportDrill(route.query))
let timer
watch(
  () => route.query,
  () => {
    clearTimeout(timer)
    Object.assign(draft, state.value)
  },
  { deep: true },
)
watch(
  draft,
  () => {
    clearTimeout(timer)
    if (
      invalidRange.value ||
      JSON.stringify(draft) === JSON.stringify(state.value)
    )
      return
    timer = setTimeout(
      () => router.push({ query: reportFilterQuery(route.query, draft) }),
      350,
    )
  },
  { deep: true },
)
function changePreset() {
  if (draft.preset !== 'custom') Object.assign(draft, periodRange(draft.preset))
}
function selectTab(tab) {
  clearTimeout(timer)
  const query = invalidRange.value
    ? { ...route.query }
    : reportFilterQuery(route.query, draft)
  router.push({ query: { ...query, tab } })
}
function drill({ kind, bucket, title, drill: server }) {
  if (server) {
    // Marketing numbers: the server's exact {doctype, filters} for that count.
    router.push({
      query: {
        ...reportFilterQuery(route.query, state.value),
        ...reportDrillQuery({ drill: server, title }),
      },
    })
    return
  }
  router.push({
    query: {
      ...reportFilterQuery(route.query, state.value),
      drill_kind: kind,
      drill_bucket: JSON.stringify(bucket),
      drill_title: title,
    },
  })
}
function closeRecords() {
  router.push({ query: reportFilterQuery(route.query, state.value) })
}
onMounted(() => {
  if (!route.query.from_date || !route.query.to_date || !route.query.period) {
    // Freeze relative presets into explicit dates so copying this URL preserves the cohort.
    router.replace({
      query: { ...route.query, period: state.value.preset, ...filters.value },
    })
  }
})
onBeforeUnmount(() => clearTimeout(timer))
</script>
<style scoped>
.report-control {
  @apply block min-h-11 w-full min-w-0 max-w-full rounded-md border border-outline-gray-2 bg-surface-gray-1 px-3 py-2 text-base text-ink-gray-8;
}
.reports-page :deep(input),
.reports-page :deep([role='combobox']) {
  min-height: 44px;
  max-width: 100%;
}
</style>
