<template>
  <ModuleLayout
    title="Cobranza"
    :entries="entries"
    :active-key="segment"
    @select="selectSegment"
  >
    <section
      v-if="guard"
      role="alert"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
    >
      <h1 class="text-xl font-semibold">
        {{ __('Cobranza is not available') }}
      </h1>
      <p class="text-base text-ink-gray-7">{{ guard }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="__('Retry permissions')" @click="retryBoot" />
        <Button :label="__('Copy access request')" @click="copyRequest" />
        <Button :label="__('Back', null, CTX)" @click="router.back()" />
      </div>
      <p v-if="copied" role="status" class="text-sm text-ink-gray-6">
        {{ copied }}
      </p>
    </section>
    <template v-else>
      <header
        class="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-6"
      >
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-xl font-semibold text-ink-gray-9">
            {{ segmentLabel(segment) }}
          </h1>
          <p class="text-sm text-ink-gray-6">{{ subtitle }}</p>
        </div>
      </header>
      <dl
        v-if="stats"
        class="grid grid-cols-3 gap-2 px-4 pb-3 sm:max-w-xl sm:px-6"
        :aria-label="__('Totals')"
      >
        <div class="rounded-lg bg-surface-gray-1 p-2">
          <dt class="text-xs text-ink-gray-6">{{ __('To collect') }}</dt>
          <dd class="font-semibold tabular-nums">
            {{ money(stats.outstanding, stats.currency) }}
          </dd>
        </div>
        <div class="rounded-lg bg-surface-gray-1 p-2">
          <dt class="text-xs text-ink-gray-6">
            {{ __('Overdue', null, CTX) }}
          </dt>
          <dd class="font-semibold tabular-nums text-ink-red-7">
            {{ money(stats.overdue, stats.currency) }}
          </dd>
        </div>
        <div class="rounded-lg bg-surface-gray-1 p-2">
          <dt class="text-xs text-ink-gray-6">{{ __('Collected today') }}</dt>
          <dd class="font-semibold tabular-nums">
            {{
              stats.collected_today === null
                ? '—'
                : money(stats.collected_today, stats.currency)
            }}
          </dd>
        </div>
      </dl>
      <div class="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
        <FormControl
          class="w-full sm:hidden"
          type="select"
          :aria-label="__('List', null, CTX)"
          :model-value="segment"
          :options="entries.map((e) => ({ label: e.label, value: e.value }))"
          @update:model-value="selectSegment"
        />
        <FormControl
          v-if="companies.length > 1"
          class="w-full sm:w-56"
          type="select"
          :aria-label="__('Company')"
          :model-value="company"
          :options="[
            { label: __('All companies'), value: '' },
            ...companies.map((c) => ({ label: c, value: c })),
          ]"
          @update:model-value="(value) => update({ company: value })"
        />
        <FormControl
          v-model="search"
          class="min-w-0 flex-1 sm:max-w-xs"
          type="search"
          :placeholder="__('Search customer or invoice')"
          :aria-label="__('Search customer or invoice')"
        />
      </div>
      <p
        v-if="capped"
        class="mx-4 mb-2 text-sm text-ink-gray-6 sm:mx-6"
        role="status"
      >
        {{
          __(
            'Showing the most recent invoices only. Search a customer to see all of theirs.',
          )
        }}
      </p>
      <div
        v-if="problem"
        role="alert"
        class="mx-4 mb-3 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        <Button class="ml-2" :label="__('Retry', null, CTX)" @click="load()" />
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto pb-6">
        <div
          v-if="loading && !rows.length"
          role="status"
          class="px-6 py-8 text-sm text-ink-gray-6"
        >
          {{ __('Loading what customers owe…') }}
        </div>
        <div
          v-else-if="!rows.length"
          class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
        >
          <p class="text-lg font-semibold">{{ emptyTitle }}</p>
          <p class="mt-1 text-sm">{{ emptyBody }}</p>
        </div>
        <ul v-else class="divide-y divide-outline-gray-1">
          <li v-for="row in rows" :key="`${row.customer}:${row.company}`">
            <RouterLink
              :to="{
                name: 'CobranzaCliente',
                params: { customer: row.customer },
                query: { company: row.company, list: listPath },
              }"
              class="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:px-6"
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-ink-gray-9">
                  {{ row.customer_name }}
                </span>
                <span class="block truncate text-sm text-ink-gray-6">
                  <span :class="toneClass(agingTone(row))">{{
                    agingLabel(row, today)
                  }}</span>
                  ·
                  {{
                    row.invoices === 1
                      ? __('1 invoice')
                      : __('{0} invoices', [row.invoices])
                  }}
                  <template v-if="companies.length > 1">
                    · {{ row.company }}</template
                  >
                </span>
                <span class="mt-1 flex flex-wrap gap-1">
                  <Badge
                    v-if="promiseChip(row.promise, row.currency)"
                    :theme="promiseChip(row.promise, row.currency).theme"
                    :label="promiseChip(row.promise, row.currency).label"
                  />
                  <Badge
                    v-if="reminderChip(row.last_reminder)"
                    :theme="reminderChip(row.last_reminder).theme"
                    :label="reminderChip(row.last_reminder).label"
                  />
                </span>
              </span>
              <span class="shrink-0 text-right">
                <span
                  class="block text-sm font-medium tabular-nums text-ink-gray-9"
                  >{{ money(row.outstanding, row.currency) }}</span
                >
                <span
                  v-if="
                    row.overdue_amount > 0 &&
                    row.overdue_amount < row.outstanding
                  "
                  class="block text-xs tabular-nums text-ink-red-7"
                  >{{
                    __('{0} overdue', [money(row.overdue_amount, row.currency)])
                  }}</span
                >
              </span>
            </RouterLink>
          </li>
        </ul>
        <div v-if="hasMore" class="px-4 py-4 sm:px-6">
          <Button
            :label="__('Load more', null, CTX)"
            :loading="loading"
            class="min-h-11 w-full sm:w-auto"
            @click="load(true)"
          />
        </div>
        <nav
          :aria-label="__('Other collection documents')"
          class="flex flex-col gap-1 px-4 pt-4 text-sm sm:px-6"
        >
          <a
            class="min-h-11 py-2 text-ink-blue-link underline"
            href="/app/query-report/Accounts Receivable"
            >{{ __('Receivables report') }}</a
          >
          <a
            class="min-h-11 py-2 text-ink-blue-link underline"
            href="/app/dunning"
            >{{ __('All reminder letters') }}</a
          >
        </nav>
      </div>
    </template>
  </ModuleLayout>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FormControl } from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import {
  CTX,
  SEGMENTS,
  agingLabel,
  agingTone,
  cobranzaApi,
  cobranzaBoot,
  loadCobranzaBoot,
  money,
  normalizeSegment,
  problemOf,
  promiseChip,
  reminderChip,
  segmentLabel,
} from '@/composables/useCobranza'

const route = useRoute()
const router = useRouter()
const boot = cobranzaBoot
const rows = ref([])
const counts = ref({})
const stats = ref(null)
const capped = ref(false)
const hasMore = ref(false)
const loading = ref(false)
const problem = ref(null)
const copied = ref('')
const today = ref('')
const segment = computed(() => normalizeSegment(route.query.segment))
const company = computed(() =>
  typeof route.query.company === 'string' ? route.query.company : '',
)
const companies = computed(() => boot.value?.companies || [])
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const listPath = computed(() => route.fullPath)
let ticket = 0
let searchTimer = 0

const entries = computed(() =>
  SEGMENTS.map((s) => ({
    ...s,
    label:
      counts.value[s.value] !== undefined
        ? `${segmentLabel(s.value)} (${counts.value[s.value]})`
        : segmentLabel(s.value),
  })),
)
const guard = computed(() =>
  boot.value && !boot.value.enabled
    ? boot.value.reason ||
      __('Ask your manager for permission to read sales invoices.')
    : '',
)
const subtitle = computed(
  () =>
    ({
      vencidas: __('Customers with invoices past their due date.'),
      hoy: __('Invoices due today or in the next 7 days.'),
      promesas: __('Customers who promised to pay; broken promises first.'),
      todas: __('Everything customers owe, largest balance first.'),
    })[segment.value],
)
const emptyTitle = computed(() =>
  search.value ? __('No customers match') : __('Nothing to collect here'),
)
const emptyBody = computed(() =>
  search.value
    ? __('Try another customer name or invoice number.')
    : segment.value === 'promesas'
      ? __('When a customer promises a payment date, it shows up here.')
      : __('Customers with a pending balance show up here.'),
)

function toneClass(tone) {
  return (
    { red: 'text-ink-red-7', orange: 'text-ink-amber-7' }[tone] ||
    'text-ink-gray-6'
  )
}

async function load(more = false) {
  const mine = ++ticket
  loading.value = true
  problem.value = null
  try {
    const page = await cobranzaApi('get_queue', {
      segment: segment.value,
      company: company.value,
      search: search.value.trim(),
      start: more ? rows.value.length : 0,
      page_length: 30,
    })
    if (mine !== ticket) return
    rows.value = more ? [...rows.value, ...page.rows] : page.rows
    hasMore.value = page.has_more
    counts.value = page.counts || {}
    stats.value = page.stats
    capped.value = page.capped
    today.value = page.today
  } catch (error) {
    if (mine === ticket) problem.value = problemOf(error)
  } finally {
    if (mine === ticket) loading.value = false
  }
}

function update(query) {
  const next = { ...route.query, ...query }
  for (const key of Object.keys(next)) if (!next[key]) delete next[key]
  router.replace({ query: next })
}
function selectSegment(value) {
  update({ segment: normalizeSegment(value) })
}

async function retryBoot() {
  await loadCobranzaBoot({ refresh: true })
  if (boot.value?.enabled) load()
}
async function copyRequest() {
  const text = __(
    'I need access to Cobranza: read permission for Sales Invoice so I can follow what customers owe.',
  )
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied. Share it with your manager.')
  } catch {
    copied.value = text
  }
}

watch(search, (value) => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => update({ q: value.trim() }), 250)
})
watch(
  () => [route.query.segment, route.query.q, route.query.company],
  () => {
    if (route.name === 'Cobranza' && boot.value?.enabled) load()
  },
)
onMounted(async () => {
  await loadCobranzaBoot()
  if (boot.value?.enabled) load()
})
</script>
