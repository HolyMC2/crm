<template>
  <ModuleLayout
    title="Garantías"
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
        {{ __('Garantías is not available') }}
      </h1>
      <p class="text-base text-ink-gray-7">{{ guard }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="__('Retry permissions')" @click="retryBoot" />
        <Button :label="__('Copy access request')" @click="copyRequest" />
        <Button :label="__('Back', null, 'Garantías')" @click="router.back()" />
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
        <Button
          v-if="boot?.capabilities?.create"
          variant="solid"
          icon-left="plus"
          :label="__('New case')"
          class="min-h-11 sm:min-h-8"
          @click="openCreate()"
        />
      </header>
      <p
        v-if="boot?.setup_note"
        role="status"
        class="mx-4 mb-3 rounded-md bg-surface-amber-1 px-3 py-2 text-sm text-ink-amber-8 sm:mx-6"
      >
        {{ boot.setup_note }}
      </p>
      <div class="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
        <FormControl
          class="w-full sm:hidden"
          type="select"
          :aria-label="__('List', null, 'Garantías')"
          :model-value="segment"
          :options="entries.map((e) => ({ label: e.label, value: e.value }))"
          @update:model-value="selectSegment"
        />
        <FormControl
          v-model="search"
          class="min-w-0 flex-1 sm:max-w-xs"
          type="search"
          :placeholder="__('Search customer, serial or document')"
          :aria-label="__('Search customer, serial or document')"
        />
        <FormControl
          type="select"
          class="w-40"
          :aria-label="__('Kind', null, 'Garantías')"
          :model-value="kind"
          :options="[
            { label: __('All kinds'), value: '' },
            ...KINDS.map((k) => ({
              label: kindLabel(k.value),
              value: k.value,
            })),
          ]"
          @update:model-value="(value) => update({ kind: value })"
        />
        <label class="flex min-h-11 items-center gap-2 text-sm text-ink-gray-8">
          <input
            type="checkbox"
            class="rounded"
            :checked="mine"
            @change="update({ mine: $event.target.checked ? '1' : '' })"
          />
          {{ __('Assigned to me') }}
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
          :label="__('Retry', null, 'Garantías')"
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
          {{ __('Loading cases…') }}
        </div>
        <div
          v-else-if="!rows.length"
          class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
        >
          <p class="text-lg font-semibold">{{ emptyTitle }}</p>
          <p class="mt-1 text-sm">{{ emptyBody }}</p>
          <Button
            v-if="segment === 'nuevas' && boot?.capabilities?.create"
            class="mt-4"
            :label="__('New case')"
            @click="openCreate()"
          />
        </div>
        <ul v-else class="divide-y divide-outline-gray-1">
          <li v-for="row in rows" :key="row.name">
            <RouterLink
              :to="{ ...recordRoute(row.name), query: { list: listPath } }"
              class="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:px-6"
            >
              <FeatherIcon
                name="shield"
                class="mt-0.5 h-4 w-4 shrink-0 text-ink-gray-5"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-ink-gray-9">
                  {{ row.customer_name }}
                </span>
                <span class="block truncate text-sm text-ink-gray-6">
                  {{
                    [row.name, row.item_name || row.serial_no, row.against_name]
                      .filter(Boolean)
                      .join(' · ')
                  }}
                </span>
                <span
                  v-if="row.complaint"
                  class="mt-0.5 block truncate text-sm text-ink-gray-8"
                  >{{ row.complaint }}</span
                >
                <span class="mt-1 flex flex-wrap gap-1">
                  <Badge theme="gray" :label="kindLabel(row.kind)" />
                  <Badge
                    v-if="segment === 'cerradas'"
                    :theme="stateTheme(row.state)"
                    :label="stateLabel(row.state)"
                  />
                  <Badge
                    v-else-if="row.due"
                    :theme="dueTheme(row.due)"
                    :label="dueLabel(row.due)"
                  />
                  <Badge
                    v-for="person in row.assignees"
                    :key="person.user"
                    theme="blue"
                    :label="person.full_name"
                  />
                </span>
              </span>
            </RouterLink>
          </li>
        </ul>
        <div v-if="hasMore" class="px-4 py-4 sm:px-6">
          <Button
            :label="__('Load more', null, 'Garantías')"
            :loading="loading"
            class="min-h-11 w-full sm:w-auto"
            @click="load(true)"
          />
        </div>
      </div>
    </template>
    <NewClaimDialog
      v-model="creating"
      :prefill="prefill"
      @created="onCreated"
    />
  </ModuleLayout>
</template>
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FeatherIcon, FormControl } from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import NewClaimDialog from '@/components/garantias/NewClaimDialog.vue'
import {
  CREATE_KEYS,
  KINDS,
  SEGMENTS,
  createPrefill,
  dueLabel,
  dueTheme,
  garantiasApi,
  garantiasBoot,
  kindLabel,
  loadGarantiasBoot,
  normalizeSegment,
  problemOf,
  recordRoute,
  safeReturn,
  segmentLabel,
  stateLabel,
  stateTheme,
} from '@/composables/useGarantias'

const route = useRoute()
const router = useRouter()
const boot = garantiasBoot
const rows = ref([])
const counts = ref({})
const countCap = ref(100)
const hasMore = ref(false)
const loading = ref(false)
const problem = ref(null)
const copied = ref('')
const scroller = ref(null)
const creating = ref(false)
const prefill = ref({})
const segment = computed(() => normalizeSegment(route.query.segment))
const kind = computed(() =>
  KINDS.some((k) => k.value === route.query.kind) ? route.query.kind : '',
)
const mine = computed(() => route.query.mine === '1')
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const listPath = computed(() => route.fullPath)
let ticket = 0
let searchTimer = 0

function countLabel(value) {
  const count = counts.value[value]
  if (count === undefined) return ''
  return count >= countCap.value ? ` (${countCap.value - 1}+)` : ` (${count})`
}
const entries = computed(() =>
  SEGMENTS.map((s) => ({
    ...s,
    label:
      segmentLabel(s.value) +
      (s.value === 'cerradas' ? '' : countLabel(s.value)),
  })),
)
const guard = computed(() =>
  boot.value && !boot.value.enabled
    ? boot.value.reason ||
      __('Ask your manager for access to warranty and return cases.')
    : '',
)
const subtitle = computed(
  () =>
    ({
      nuevas: __('Cases nobody has reviewed yet, oldest first.'),
      'en-revision': __('Cases being repaired or decided.'),
      'con-proveedor': __('Products sent to the supplier.'),
      cerradas: __('Resolved and cancelled cases.'),
    })[segment.value],
)
const emptyTitle = computed(() =>
  search.value ? __('No cases match') : __('Nothing here', null, 'Garantías'),
)
const emptyBody = computed(() =>
  search.value
    ? __('Try another customer, serial number or document.')
    : segment.value === 'nuevas'
      ? __(
          'When a customer comes back with a product, open a case here or from Taller.',
        )
      : __('Cases move here as they progress.'),
)

async function load(more = false) {
  const current = ++ticket
  loading.value = true
  problem.value = null
  try {
    const page = await garantiasApi('queue', {
      segment: segment.value,
      kind: kind.value,
      mine: mine.value ? 1 : 0,
      q: search.value.trim(),
      start: more ? rows.value.length : 0,
      page_length: 30,
    })
    if (current !== ticket) return
    rows.value = more ? [...rows.value, ...page.rows] : page.rows
    hasMore.value = page.has_more
    counts.value = page.counts || {}
    countCap.value = page.count_cap || 100
    if (!more) restoreScroll()
  } catch (error) {
    if (current === ticket) problem.value = problemOf(error)
  } finally {
    if (current === ticket) loading.value = false
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

/** «Nuevo caso», or a hand-off from Taller/Ventas with the document prefilled. */
function openCreate(values = {}) {
  prefill.value = values
  creating.value = true
}
// A hand-off (Taller order, POS sale) brings its way back; the new case keeps it.
let handoffReturn = null
function onCreated(name) {
  const query = handoffReturn ? { ...handoffReturn } : { list: route.fullPath }
  handoffReturn = null
  router.push({ ...recordRoute(name), query })
}
function createFromQuery() {
  if (route.query.create !== '1' || !boot.value?.capabilities?.create) return
  const values = createPrefill(route.query)
  const back = safeReturn(route.query.return_to)
  handoffReturn = back
    ? {
        return_to: back,
        ...(typeof route.query.return_label === 'string'
          ? { return_label: route.query.return_label.slice(0, 40) }
          : {}),
      }
    : null
  const query = { ...route.query }
  for (const key of ['create', 'return_to', 'return_label', ...CREATE_KEYS])
    delete query[key]
  router.replace({ query })
  openCreate(values)
}

const scrollKey = () => `muelle:garantias:scroll:${route.fullPath}`
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

async function retryBoot() {
  await loadGarantiasBoot({ refresh: true })
  if (boot.value?.enabled) load()
}
async function copyRequest() {
  const text = __(
    'I need access to Garantías: read permission for Warranty Claim in my company so I can follow warranty and return cases.',
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
  () => [
    route.query.segment,
    route.query.q,
    route.query.kind,
    route.query.mine,
  ],
  () => {
    if (route.name === 'Garantias' && boot.value?.enabled) load()
  },
)
onMounted(async () => {
  await loadGarantiasBoot()
  if (!boot.value?.enabled) return
  createFromQuery()
  load()
})
</script>
