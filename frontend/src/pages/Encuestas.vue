<template>
  <ModuleLayout
    title="Encuestas"
    :entries="entries"
    :active-key="view"
    @select="selectView"
  >
    <section
      v-if="guard"
      role="alert"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
    >
      <h1 class="text-xl font-semibold">
        {{ __('Encuestas is not available') }}
      </h1>
      <p class="text-base text-ink-gray-7">{{ guard }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="__('Retry permissions')" @click="retryBoot" />
        <Button :label="__('Copy access request')" @click="copyRequest" />
        <Button :label="__('Back', null, 'Encuestas')" @click="router.back()" />
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
            {{ viewLabel(view) }}
          </h1>
          <p class="text-sm text-ink-gray-6">{{ subtitle }}</p>
        </div>
        <Button
          v-if="boot?.capabilities?.setup"
          icon-left="settings"
          :label="__('Survey settings')"
          class="min-h-11 sm:min-h-8"
          @click="setupOpen = true"
        />
      </header>

      <div
        v-if="notice"
        role="status"
        class="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-md bg-surface-amber-1 px-3 py-2 text-sm text-ink-amber-8 sm:mx-6"
      >
        <span class="min-w-0 flex-1">{{ notice.reason }}</span>
        <Button
          v-if="notice.action === 'setup'"
          variant="solid"
          :label="__('Turn on the survey')"
          class="min-h-11 sm:min-h-8"
          @click="setupOpen = true"
        />
        <Button
          v-else-if="notice.action === 'request'"
          :label="__('Copy request for the owner')"
          class="min-h-11 sm:min-h-8"
          @click="copyOwnerRequest"
        />
      </div>
      <p
        v-if="copied"
        role="status"
        class="mx-4 mb-3 text-sm text-ink-gray-6 sm:mx-6"
      >
        {{ copied }}
      </p>

      <section
        class="mx-4 mb-3 grid grid-cols-3 gap-2 sm:mx-6 sm:grid-cols-4"
        :aria-label="__('Would they recommend you?')"
      >
        <div
          class="col-span-3 rounded-lg border border-outline-gray-2 p-3 sm:col-span-1"
        >
          <p class="text-sm text-ink-gray-6">{{ __('Recommendation') }}</p>
          <p
            class="text-3xl font-semibold text-ink-gray-9"
            data-testid="encuestas-score"
          >
            {{ recommendationText(summary) }}
          </p>
          <p class="text-xs text-ink-gray-6">
            {{
              summary?.few && summary?.answers
                ? __('Still few answers')
                : __('% happy minus % unhappy')
            }}
          </p>
        </div>
        <button
          v-for="b in BUCKETS"
          :key="b.value"
          type="button"
          class="min-h-11 rounded-lg border border-outline-gray-2 p-3 text-left hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
          @click="update({ view: 'todas', bucket: b.value })"
        >
          <p class="text-sm text-ink-gray-6">
            {{ bucketName(b.value) }}
            <span class="block text-xs">{{ b.range }}</span>
          </p>
          <p class="text-2xl font-semibold text-ink-gray-9">
            {{ summary ? summary[b.value] : '—' }}
          </p>
        </button>
      </section>

      <div class="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
        <FormControl
          class="min-h-11 w-full sm:hidden"
          type="select"
          :aria-label="__('List', null, 'Encuestas')"
          :model-value="view"
          :options="entries.map((e) => ({ label: e.label, value: e.value }))"
          @update:model-value="selectView"
        />
        <FormControl
          v-model="search"
          class="min-w-0 flex-1 sm:max-w-xs [&_input]:min-h-11 sm:[&_input]:min-h-0"
          type="search"
          :placeholder="__('Search customer, sale or comment')"
          :aria-label="__('Search customer, sale or comment')"
        />
        <FormControl
          type="select"
          class="min-h-11 w-40 sm:min-h-0"
          :aria-label="__('Period', null, 'Encuestas')"
          :model-value="String(period)"
          :options="
            PERIODS.map((d) => ({ label: periodLabel(d), value: String(d) }))
          "
          @update:model-value="(value) => update({ periodo: value })"
        />
        <FormControl
          v-if="view === 'todas'"
          type="select"
          class="min-h-11 w-44 sm:min-h-0"
          :aria-label="__('Answer', null, 'Encuestas')"
          :model-value="bucket"
          :options="[
            { label: __('Every answer'), value: '' },
            ...BUCKETS.map((b) => ({
              label: bucketLabel(b.value),
              value: b.value,
            })),
          ]"
          @update:model-value="(value) => update({ bucket: value })"
        />
        <label
          v-if="view === 'seguimiento'"
          class="flex min-h-11 items-center gap-2 text-sm text-ink-gray-8"
        >
          <input
            type="checkbox"
            class="rounded"
            :checked="mine"
            @change="update({ mine: $event.target.checked ? '1' : '' })"
          />
          {{ __('Mine', null, 'Encuestas') }}
        </label>
      </div>
      <div
        v-if="problem"
        role="alert"
        class="mx-4 mb-3 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        <Button
          class="ml-2"
          :label="__('Retry', null, 'Encuestas')"
          @click="load()"
        />
      </div>
      <div
        ref="scroller"
        class="min-h-0 flex-1 overflow-y-auto pb-6"
        @scroll.passive="rememberScroll"
      >
        <div
          v-if="loading && !rows.length"
          role="status"
          class="px-6 py-8 text-sm text-ink-gray-6"
        >
          {{ __('Loading answers…') }}
        </div>
        <div
          v-else-if="!rows.length"
          class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
        >
          <p class="text-lg font-semibold">{{ emptyTitle }}</p>
          <p class="mt-1 text-sm">{{ emptyBody }}</p>
          <Button
            v-if="view !== 'todas' && !search"
            class="mt-4"
            :label="__('See all answers')"
            @click="update({ view: 'todas', bucket: '' })"
          />
        </div>
        <ul v-else class="divide-y divide-outline-gray-1">
          <li v-for="row in rows" :key="row.name">
            <RouterLink
              :to="{ ...recordRoute(row.name), query: { list: listPath } }"
              class="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:px-6"
            >
              <span
                class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                :class="SCORE_CLASS[row.bucket]"
                :aria-label="scoreLabel(row.score)"
                >{{ row.score }}</span
              >
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-ink-gray-9">
                  {{ row.customer_name }}
                </span>
                <span class="block truncate text-sm text-ink-gray-6">
                  {{
                    [row.sale, when(row.creation)].filter(Boolean).join(' · ')
                  }}
                </span>
                <span
                  v-if="row.comment"
                  class="mt-0.5 block truncate text-sm text-ink-gray-8"
                  >{{ row.comment }}</span
                >
                <span class="mt-1 flex flex-wrap gap-1">
                  <Badge
                    :theme="bucketTheme(row.bucket)"
                    :label="bucketLabel(row.bucket)"
                  />
                  <Badge
                    v-if="row.bucket === 'detractor' || row.follow_up_status"
                    :theme="followUpTheme(row.follow_up_status)"
                    :label="followUpLabel(row.follow_up_status)"
                  />
                </span>
              </span>
            </RouterLink>
          </li>
        </ul>
        <div v-if="hasMore" class="px-4 py-4 sm:px-6">
          <Button
            :label="__('Load more', null, 'Encuestas')"
            :loading="loading"
            class="min-h-11 w-full sm:w-auto"
            @click="load(true)"
          />
        </div>
      </div>
    </template>
    <SetupDialog v-model="setupOpen" @saved="onSetupSaved" />
  </ModuleLayout>
</template>
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FormControl } from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import SetupDialog from '@/components/encuestas/SetupDialog.vue'
import {
  BUCKETS,
  PERIODS,
  VIEWS,
  askNotice,
  bucketLabel,
  bucketName,
  bucketTheme,
  encuestasApi,
  encuestasBoot,
  followUpLabel,
  followUpTheme,
  loadEncuestasBoot,
  normalizeBucket,
  normalizePeriod,
  normalizeView,
  periodLabel,
  problemOf,
  recommendationText,
  recordRoute,
  scoreLabel,
  viewLabel,
} from '@/composables/useEncuestas'

// Score chip colors from the shared palette (tokens only).
const SCORE_CLASS = {
  detractor: 'bg-surface-red-2 text-ink-red-8',
  passive: 'bg-surface-amber-2 text-ink-amber-8',
  promoter: 'bg-surface-green-2 text-ink-green-8',
}

const route = useRoute()
const router = useRouter()
const boot = encuestasBoot
const rows = ref([])
const counts = ref({})
const countCap = ref(100)
const hasMore = ref(false)
const loading = ref(false)
const problem = ref(null)
const copied = ref('')
const scroller = ref(null)
const summary = ref(null)
const setupOpen = ref(false)
const view = computed(() => normalizeView(route.query.view))
const bucket = computed(() => normalizeBucket(route.query.bucket))
const period = computed(() => normalizePeriod(route.query.periodo))
const mine = computed(() => route.query.mine === '1')
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const listPath = computed(() => route.fullPath)
const notice = computed(() =>
  askNotice(boot.value?.ask, boot.value?.capabilities),
)
let ticket = 0
let searchTimer = 0

function countLabel(value) {
  const count = counts.value[value]
  if (count === undefined) return ''
  return count > countCap.value ? ` (${countCap.value}+)` : ` (${count})`
}
const entries = computed(() =>
  VIEWS.map((v) => ({
    ...v,
    label:
      viewLabel(v.value) + (v.value === 'todas' ? '' : countLabel(v.value)),
  })),
)
const guard = computed(() =>
  boot.value && !boot.value.enabled
    ? boot.value.reason ||
      __('Ask the owner for access to what customers answered.')
    : '',
)
const subtitle = computed(
  () =>
    ({
      atender: __(
        'Customers who answered 0 to 6, longest waiting first. Call them before they go elsewhere.',
      ),
      seguimiento: __('Someone is already talking to these customers.'),
      todas: __('Every answer, newest first.'),
    })[view.value],
)
const emptyTitle = computed(() =>
  search.value
    ? __('No answers match')
    : view.value === 'atender'
      ? __('Nobody is waiting')
      : __('Nothing here', null, 'Encuestas'),
)
const emptyBody = computed(() =>
  search.value
    ? __('Try another customer, sale or word.')
    : view.value === 'atender'
      ? __('Unhappy customers show up here as soon as they answer.')
      : __('Answers arrive a few days after each sale, once customers reply.'),
)

function when(value) {
  if (!value) return ''
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(date)
}

async function load(more = false) {
  const current = ++ticket
  loading.value = true
  problem.value = null
  try {
    const page = await encuestasApi('queue', {
      view: view.value,
      bucket_name: bucket.value || null,
      mine: mine.value ? 1 : 0,
      q: search.value.trim(),
      start: more ? rows.value.length : 0,
      page_length: 30,
    })
    if (current !== ticket) return
    rows.value = more ? [...rows.value, ...page.rows] : page.rows
    hasMore.value = page.more
    counts.value = page.counts || {}
    countCap.value = page.count_cap || 100
    if (!more) restoreScroll()
  } catch (error) {
    if (current === ticket) problem.value = problemOf(error)
  } finally {
    if (current === ticket) loading.value = false
  }
}
async function loadSummary() {
  try {
    summary.value = await encuestasApi('summary', { days: period.value })
  } catch {
    summary.value = null
  }
}

function update(query) {
  const next = { ...route.query, ...query }
  for (const key of Object.keys(next)) if (!next[key]) delete next[key]
  router.replace({ query: next })
}
function selectView(value) {
  update({ view: normalizeView(value), bucket: '', mine: '' })
}

const scrollKey = () => `muelle:encuestas:scroll:${route.fullPath}`
function rememberScroll() {
  try {
    sessionStorage.setItem(scrollKey(), String(scroller.value?.scrollTop || 0))
  } catch {
    /* convenience only */
  }
}
function restoreScroll() {
  nextTick(() => {
    try {
      const top = Number(sessionStorage.getItem(scrollKey()) || 0)
      if (scroller.value && top) scroller.value.scrollTop = top
    } catch {
      /* convenience only */
    }
  })
}

async function onSetupSaved() {
  await loadEncuestasBoot({ refresh: true })
}
async function retryBoot() {
  await loadEncuestasBoot({ refresh: true })
  if (boot.value?.enabled) {
    load()
    loadSummary()
  }
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied. Share it with your manager.')
  } catch {
    copied.value = text
  }
}
function copyRequest() {
  return copyText(
    __(
      'I need access to Encuestas: read permission for Quality Feedback in my company so I can follow up on unhappy customers.',
    ),
  )
}
function copyOwnerRequest() {
  return copyText(
    __(
      'Please turn on the survey in Encuestas (Muelle) so customers are asked after they buy: {0}',
      [notice.value?.reason || ''],
    ),
  )
}

watch(search, (value) => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => update({ q: value.trim() }), 250)
})
watch(
  () => [route.query.view, route.query.q, route.query.bucket, route.query.mine],
  () => {
    if (route.name === 'Encuestas' && boot.value?.enabled) load()
  },
)
watch(
  () => route.query.periodo,
  () => {
    if (route.name === 'Encuestas' && boot.value?.enabled) loadSummary()
  },
)
onMounted(async () => {
  await loadEncuestasBoot()
  if (!boot.value?.enabled) return
  load()
  loadSummary()
})
</script>
