<template>
  <div
    ref="scroller"
    class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-surface-base px-4 pt-4 text-ink-gray-9"
    @scroll="remember"
  >
    <header class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-xl font-semibold">{{ __('Carga de trabajo') }}</h1>
        <p v-if="data.as_of && !loading" class="text-xs text-ink-gray-5">
          {{ __('Consultado') }}: {{ asOfText }} · {{ data.timezone }}
          <span v-if="refreshing" role="status">
            · {{ __('Actualizando…') }}</span
          >
        </p>
      </div>
      <div v-if="!loadError" class="flex flex-wrap items-end gap-2">
        <label class="text-xs text-ink-gray-6"
          >{{ __('Pipeline') }}
          <select
            class="wl-control"
            :value="state.pipeline"
            :disabled="moving || loading"
            @change="navigate({ pipeline: $event.target.value })"
          >
            <option value="">{{ __('Todos los permitidos') }}</option>
            <option
              v-for="p in data.pipelines || []"
              :key="p.name"
              :value="p.name"
            >
              {{ p.label }}
            </option>
          </select>
        </label>
        <label class="text-xs text-ink-gray-6"
          >{{ __('Empresa') }}
          <select
            class="wl-control"
            :value="state.company"
            :disabled="moving || loading"
            @change="navigate({ company: $event.target.value })"
          >
            <option value="">{{ __('Todas las permitidas') }}</option>
            <option
              v-for="company in companies"
              :key="company"
              :value="company"
            >
              {{ company }}
            </option>
          </select>
        </label>
        <button
          type="button"
          class="wl-btn"
          :disabled="loading || moving || refreshing"
          @click="refresh"
        >
          {{ __('Actualizar') }}
        </button>
      </div>
    </header>

    <template v-if="loading">
      <p role="status" aria-live="polite" class="sr-only">
        {{ __('Cargando el alcance seleccionado…') }}
      </p>
      <div
        class="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5"
        aria-hidden="true"
      >
        <div
          v-for="n in 5"
          :key="n"
          class="h-16 animate-pulse rounded-lg bg-surface-gray-2"
        />
      </div>
      <WorkloadPeople class="mb-6" loading />
      <div class="space-y-2" aria-hidden="true">
        <div
          v-for="n in 5"
          :key="n"
          class="h-11 animate-pulse rounded-md bg-surface-gray-2"
        />
      </div>
    </template>

    <div v-else-if="loadError" role="alert" class="wl-notice">
      <p>{{ errorMessage(loadError) }}</p>
      <button
        type="button"
        class="wl-btn mt-2"
        :disabled="loading"
        @click="load()"
      >
        {{ __('Reintentar') }}
      </button>
    </div>

    <template v-else>
      <section
        class="mb-5 grid grid-cols-2 gap-2 md:grid-cols-5"
        :aria-label="__('Resumen')"
      >
        <button
          v-for="metric in metrics"
          :key="metric.key"
          type="button"
          class="flex min-h-16 flex-col items-start justify-between rounded-lg border px-3 py-2 text-left hover:bg-surface-gray-2 disabled:opacity-60"
          :class="
            metric.active
              ? 'border-outline-gray-4 bg-surface-gray-2'
              : 'border-outline-gray-2 bg-surface-base'
          "
          :aria-pressed="metric.active"
          :disabled="moving"
          @click="openQueue(null, metric.bucket, metric.kind)"
        >
          <span class="text-xs text-ink-gray-6">{{ metric.label }}</span>
          <strong
            class="text-lg font-semibold tabular-nums"
            :class="metric.tone"
            >{{ metric.value }}</strong
          >
        </button>
      </section>

      <WorkloadPeople
        class="mb-6"
        :agents="agents"
        :unassigned="data.unassigned"
        :cap="cap"
        :due-today="dueToday"
        :total-agents="data.total_agents || 0"
        :has-more="!!data.has_more"
        :agent-offset="state.agentOffset"
        :active-owner="state.owner"
        :active-bucket="state.bucket"
        :busy="moving"
        @open="openQueue"
        @page="
          (step) => navigate({ agentOffset: state.agentOffset + step * 25 })
        "
      />

      <section aria-labelledby="workload-queue-title" class="pb-4">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <h2
              id="workload-queue-title"
              class="truncate text-base font-semibold"
            >
              {{ __('Cola') }} · {{ ownerLabel }}
            </h2>
            <button
              v-if="state.owner !== null"
              type="button"
              class="rounded px-1.5 text-xs font-normal text-ink-gray-6 hover:bg-surface-gray-2"
              :disabled="moving"
              @click="openQueue(null, state.bucket, 'keep')"
            >
              {{ __('Todos los propietarios') }}
            </button>
          </div>
          <p class="text-xs tabular-nums text-ink-gray-6">
            {{ countText }} · {{ __('Página') }} {{ state.offset / 25 + 1 }}
          </p>
        </div>

        <div class="mb-3 flex flex-wrap gap-2">
          <div
            class="inline-flex rounded-md border border-outline-gray-2 p-0.5"
            role="group"
            :aria-label="__('Registros')"
          >
            <button
              v-for="kind in kinds"
              :key="kind.value"
              type="button"
              class="wl-seg"
              :class="state.kind === kind.value ? 'wl-seg-on' : ''"
              :aria-pressed="state.kind === kind.value"
              :disabled="moving"
              @click="
                navigate({
                  kind: kind.value,
                  bucket: kind.value === 'tasks' ? state.bucket : 'all',
                  offset: 0,
                })
              "
            >
              {{ kind.label }}
            </button>
          </div>
          <div
            class="inline-flex rounded-md border border-outline-gray-2 p-0.5"
            role="group"
            :aria-label="__('Vencimiento')"
          >
            <button
              v-for="bucket in buckets"
              :key="bucket.value"
              type="button"
              class="wl-seg"
              :class="state.bucket === bucket.value ? 'wl-seg-on' : ''"
              :aria-pressed="state.bucket === bucket.value"
              :disabled="moving"
              @click="openQueue(state.owner, bucket.value, 'keep')"
            >
              {{ bucket.label }}
            </button>
          </div>
        </div>

        <div
          v-if="moveError || results.length"
          class="mb-3 rounded-lg border p-3 text-sm"
          :class="
            moveError || failed.length
              ? 'border-outline-amber-2 bg-surface-amber-1 text-ink-amber-8'
              : 'border-outline-gray-2 bg-surface-gray-1 text-ink-gray-8'
          "
          :role="moveError || failed.length ? 'alert' : 'status'"
          aria-live="polite"
        >
          <p v-if="moveError">{{ moveError }}</p>
          <template v-else>
            <p class="font-medium">
              <span v-if="succeeded.length"
                >{{ succeeded.length }} {{ __('reasignados') }}.
                {{
                  __(
                    'Reasignado. Responsables de tareas vinculadas conservados.',
                  )
                }}</span
              >
              <span v-if="failed.length">
                {{ failed.length }}
                {{
                  __('sin mover; siguen seleccionados para que los revises.')
                }}</span
              >
            </p>
            <ul v-if="failed.length" class="mt-2 space-y-1">
              <li v-for="result in failed" :key="workItemKey(result)">
                <a
                  :href="workItemHref(result)"
                  class="font-medium hover:underline"
                  @click="openRecord"
                  >{{ result.name }}</a
                >: {{ result.error }}
              </li>
            </ul>
          </template>
          <button
            type="button"
            class="mt-2 text-xs text-ink-gray-6 hover:underline"
            @click="dismissResults"
          >
            {{ __('Ocultar') }}
          </button>
        </div>

        <WorkloadQueue
          :items="queue.items || []"
          :selected-keys="selectedKeys"
          :as-of="data.as_of || ''"
          :date-format="dateFormat"
          :owner-name="ownerName"
          :pipeline-name="pipelineName"
          :empty-text="emptyText"
          :error="convError ? errorMessage(convError, true) : ''"
          :loading="itemsLoading"
          :busy="moving"
          @toggle="toggle"
          @toggle-all="toggleAll"
          @open-record="openRecord"
          @retry="loadItems"
        />

        <div class="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            class="wl-btn"
            :disabled="!state.offset || itemsLoading || moving"
            @click="navigate({ offset: state.offset - 25 })"
          >
            {{ __('Anterior') }}
          </button>
          <button
            type="button"
            class="wl-btn"
            :disabled="!queue.has_more || itemsLoading || moving"
            @click="navigate({ offset: state.offset + 25 })"
          >
            {{ __('Siguiente') }}
          </button>
        </div>

        <details class="mt-5 text-sm text-ink-gray-6">
          <summary class="cursor-pointer text-ink-gray-7">
            {{ __('Cómo se calcula') }} · {{ __('Capacidad orientativa') }}:
            {{
              cap
                ? `${cap} ${__('leads + deals abiertos por persona')}`
                : __('Sin límite orientativo configurado (0)')
            }}
          </summary>
          <div class="mt-2 space-y-2">
            <p>
              {{
                __(
                  data.definitions ||
                    'Los conteos y las filas usan tus permisos actuales.',
                )
              }}
            </p>
            <p>
              {{
                __(
                  'Se compara sólo la carga visible en el alcance seleccionado. No bloquea asignaciones ni cambia el reparto automático.',
                )
              }}
              · {{ data.capacity?.source || 'FCRM Settings' }}
            </p>
            <p v-if="data.capacity?.routing">
              {{ __(data.capacity.routing) }}
            </p>
            <p>
              {{
                __(
                  'Las tareas sin fecha no se consideran vencidas. Cambiar el propietario de un lead o deal conserva los responsables de sus tareas; reasigna esas tareas por separado si hace falta.',
                )
              }}
            </p>
            <div class="flex flex-wrap gap-4">
              <a
                class="underline"
                href="/app/fcrm-settings"
                target="_blank"
                rel="noopener"
                >{{
                  data.capacity?.can_configure
                    ? __('Configurar capacidad')
                    : __('Ver configuración de CRM')
                }}</a
              >
              <a
                class="underline"
                href="/app/assignment-rule"
                target="_blank"
                rel="noopener"
                >{{ __('Reglas nativas de asignación') }}</a
              >
            </div>
            <div v-if="marketing.state && marketing.state !== 'absent'">
              <p class="font-medium text-ink-gray-7">
                {{ __('Política opcional de Marketing') }} ·
                {{ __(marketing.state) }}
              </p>
              <template v-if="marketing.state === 'available'">
                <p>
                  {{ __('Reparto automático') }}:
                  {{ marketing.enabled ? __('Activo') : __('Inactivo') }} ·
                  {{ __('Deals') }}:
                  {{
                    marketing.deals_enabled ? __('Activos') : __('Inactivos')
                  }}
                  · {{ __('Capacidad flexible') }}:
                  {{ marketing.soft_cap || __('Sin límite') }} ·
                  {{ __('Preferencia por turno') }}:
                  {{ marketing.shift_aware ? __('Activa') : __('Inactiva') }}
                </p>
                <p>{{ __(marketing.policy) }}</p>
                <p>
                  {{ __('Grupo configurado') }}:
                  {{
                    marketing.pool?.join(', ') ||
                    __('Usuarios habilitados con rol Sales User')
                  }}
                </p>
                <a
                  class="underline"
                  href="/app/marketing-settings"
                  target="_blank"
                  rel="noopener"
                  >{{ __('Ver configuración de Marketing') }}</a
                >
              </template>
              <p v-else>
                {{
                  __(
                    'La política no se pudo verificar con tus permisos. No se interpreta como desactivada.',
                  )
                }}
              </p>
            </div>
          </div>
        </details>
      </section>

      <WorkloadBulkBar
        v-if="selected.length"
        v-model="target"
        :count="selected.length"
        :candidates="rankedCandidates"
        :moving="moving"
        @move="move"
        @clear="clearSelection"
      />
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import WorkloadPeople from '@/components/Workload/WorkloadPeople.vue'
import WorkloadQueue from '@/components/Workload/WorkloadQueue.vue'
import WorkloadBulkBar from '@/components/Workload/WorkloadBulkBar.vue'
import {
  countByOwner,
  decodeWorkloadQuery,
  encodeWorkloadQuery,
  formatSiteDate,
  rankCandidates,
  retainFailedSelection,
  safeWorkloadState,
  sameWorkloadQuery,
  takeDueToday,
  workItemHref,
  workItemKey,
} from '@/utils/workloadFormat'
import { workloadError } from '@/utils/workloadError'

const PAGE = 25
// Upper bound for the overview's due-today scan (pages of 25 tasks).
const TODAY_SCAN_PAGES = 8
const storageKey = 'crm.workload.queue.v2'

const route = useRoute()
const router = useRouter()
const basePath = route.path

let stored
try {
  stored = JSON.parse(sessionStorage.getItem(storageKey))
} catch {
  /* unavailable storage */
}
// The URL wins (shared link, Back/Forward); the session copy restores the
// last queue when the page is opened without a query (e.g. from the sidebar).
const fromUrl = decodeWorkloadQuery(route.query)
const state = ref(
  fromUrl
    ? { ...fromUrl, scroll: safeWorkloadState(stored).scroll }
    : safeWorkloadState(stored),
)
// Restore the scroll position only for the queue it was saved with.
const initialScroll =
  !fromUrl || sameWorkloadQuery(fromUrl, safeWorkloadState(stored))
    ? state.value.scroll
    : 0
if (!fromUrl && Object.keys(encodeWorkloadQuery(state.value)).length)
  router.replace({ query: encodeWorkloadQuery(state.value) })

const scroller = ref(null)
const data = ref({ agents: [] })
const queue = ref({ items: [], total: 0 })
const loading = ref(false)
const refreshing = ref(false)
const itemsLoading = ref(false)
const loadError = ref('')
const convError = ref('')
const moveError = ref('')
const selected = ref([])
const results = ref([])
const target = ref('')
const moving = ref(false)
const dueToday = ref({ state: 'idle', counts: {}, total: 0 })
let loadId = 0
let itemsId = 0
let scanId = 0

const kinds = [
  { value: 'leads', label: __('Leads') },
  { value: 'deals', label: __('Deals') },
  { value: 'tasks', label: __('Tareas') },
]
const buckets = [
  { value: 'all', label: __('Todo') },
  { value: 'overdue', label: __('Vencidas') },
  { value: 'today', label: __('Vencen hoy') },
]
const dateFormat = window.sysdefaults?.date_format || ''

const agents = computed(() => data.value.agents || [])
const cap = computed(() => Number(data.value.capacity?.cap) || 0)
const marketing = computed(() => data.value.capacity?.marketing || {})
const companies = computed(
  () =>
    data.value.companies || [
      ...new Set(
        (data.value.pipelines || []).map((p) => p.company).filter(Boolean),
      ),
    ],
)
const asOfText = computed(() => formatSiteDate(data.value.as_of, dateFormat))
const selectedKeys = computed(() => selected.value.map(workItemKey))
const succeeded = computed(() => results.value.filter((row) => row.ok))
const failed = computed(() => results.value.filter((row) => !row.ok))
const rankedCandidates = computed(() =>
  rankCandidates(data.value.candidates, agents.value),
)
const ownerLabel = computed(() =>
  state.value.owner === null
    ? __('Todos')
    : state.value.owner === ''
      ? __('Sin asignar')
      : ownerName(state.value.owner),
)
const metrics = computed(() => {
  const summary = data.value.summary || {}
  const { owner, kind, bucket } = state.value
  const all = owner === null
  const today =
    dueToday.value.state === 'ready' || dueToday.value.state === 'partial'
      ? `${dueToday.value.total}${dueToday.value.state === 'partial' ? '+' : ''}`
      : dueToday.value.state === 'loading'
        ? '…'
        : '—'
  return [
    {
      key: 'leads',
      label: __('Leads abiertos'),
      value: summary.open_leads || 0,
      kind: 'leads',
      bucket: 'all',
    },
    {
      key: 'deals',
      label: __('Deals abiertos'),
      value: summary.open_deals || 0,
      kind: 'deals',
      bucket: 'all',
    },
    {
      key: 'tasks',
      label: __('Tareas abiertas'),
      value: summary.open_tasks || 0,
      kind: 'tasks',
      bucket: 'all',
    },
    {
      key: 'overdue',
      label: __('Tareas vencidas'),
      value: summary.overdue_tasks || 0,
      kind: 'tasks',
      bucket: 'overdue',
      tone: summary.overdue_tasks ? 'text-ink-red-6' : '',
    },
    {
      key: 'today',
      label: __('Vencen hoy'),
      value: today,
      kind: 'tasks',
      bucket: 'today',
      tone: dueToday.value.total ? 'text-ink-amber-7' : '',
    },
  ].map((metric) => ({
    ...metric,
    active: all && metric.kind === kind && metric.bucket === bucket,
  }))
})
const countText = computed(() =>
  state.value.bucket === 'today'
    ? `${queue.value.items?.length || 0} ${__('vencen hoy en esta página')}`
    : `${queue.value.total || 0} ${__('registros en total')}`,
)
const emptyText = computed(() =>
  state.value.bucket === 'overdue'
    ? __('Sin tareas vencidas en esta cola. Buen trabajo.')
    : state.value.bucket === 'today'
      ? __('Nada vence hoy en esta cola.')
      : __('Sin conversaciones'),
)

const filters = () => ({
  pipeline: state.value.pipeline,
  company: state.value.company,
})
function ownerName(user) {
  if (!user) return __('Sin asignar')
  const row =
    agents.value.find((a) => a.user === user) ||
    (data.value.candidates || []).find((a) => a.user === user)
  return row?.full_name || user
}
function pipelineName(name) {
  return (
    (data.value.pipelines || []).find((p) => p.name === name)?.label || name
  )
}
function errorMessage(kind, conversations = false) {
  if (kind === 'permission')
    return conversations
      ? __(
          'No tienes permiso para consultar estas conversaciones. Contacta a tu administrador.',
        )
      : __(
          'La carga de trabajo requiere permiso de gerente (Sales Manager o System Manager).',
        )
  if (kind === 'session')
    return __('Tu sesión expiró. Vuelve a iniciar sesión y reintenta.')
  if (kind === 'unavailable')
    return __(
      'El servicio no está disponible. Reintenta o consulta con tu administrador si continúa.',
    )
  return conversations
    ? __(
        'No se pudieron cargar las conversaciones. Revisa tu conexión y reintenta.',
      )
    : __(
        'No se pudo cargar la carga de trabajo. Revisa tu conexión y reintenta.',
      )
}
function remember() {
  if (loading.value || itemsLoading.value) return
  if (scroller.value) state.value.scroll = Math.round(scroller.value.scrollTop)
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(state.value))
  } catch {
    /* unavailable storage */
  }
}

// quiet: keep the current numbers on screen (refresh, after a reassignment).
async function load({ quiet = false } = {}) {
  const id = ++loadId
  if (quiet) refreshing.value = true
  else loading.value = true
  try {
    const value = await call('crm.api.workload.get_workload', {
      filters: filters(),
      offset: state.value.agentOffset,
    })
    if (id !== loadId) return
    data.value = value
    loadError.value = ''
    scanDueToday()
  } catch (error) {
    if (id === loadId) loadError.value = workloadError(error)
  } finally {
    if (id === loadId) {
      loading.value = false
      refreshing.value = false
    }
  }
}

// Due-today counts per person. get_work_items orders open tasks by due date,
// so the rows right after the overdue ones (summary.overdue_tasks) are today's.
async function scanDueToday() {
  const id = ++scanId
  const summary = data.value.summary || {}
  if (!summary.open_tasks) {
    dueToday.value = { state: 'ready', counts: {}, total: 0 }
    return
  }
  dueToday.value = { state: 'loading', counts: {}, total: 0 }
  const start = Number(summary.overdue_tasks) || 0
  const rows = []
  let done = false
  try {
    for (let page = 0; page < TODAY_SCAN_PAGES && !done; page++) {
      const value = await call('crm.api.workload.get_work_items', {
        filters: filters(),
        kind: 'tasks',
        owner: null,
        overdue: false,
        offset: start + page * PAGE,
      })
      if (id !== scanId) return
      const taken = takeDueToday(value.items, data.value.as_of)
      rows.push(...taken.items)
      done = taken.done || !value.has_more
    }
    dueToday.value = {
      state: done ? 'ready' : 'partial',
      counts: countByOwner(rows),
      total: rows.length,
    }
  } catch {
    if (id === scanId) dueToday.value = { state: 'error', counts: {}, total: 0 }
  }
}

async function fetchItems() {
  const base = {
    filters: filters(),
    kind: state.value.kind,
    owner: state.value.owner,
  }
  if (state.value.bucket !== 'today')
    return call('crm.api.workload.get_work_items', {
      ...base,
      overdue: state.value.bucket === 'overdue',
      offset: state.value.offset,
    })
  // Skip this queue's overdue tasks, then keep the rows due on the site's day.
  const overdue = await call('crm.api.workload.get_work_items', {
    ...base,
    overdue: true,
    offset: 0,
  })
  const value = await call('crm.api.workload.get_work_items', {
    ...base,
    overdue: false,
    offset: (Number(overdue.total) || 0) + state.value.offset,
  })
  const taken = takeDueToday(value.items, data.value.as_of)
  return {
    items: taken.items,
    total: null,
    has_more: !taken.done && !!value.has_more,
  }
}

async function loadItems() {
  const id = ++itemsId
  itemsLoading.value = true
  try {
    const value = await fetchItems()
    if (id !== itemsId) return
    queue.value = value
    convError.value = ''
  } catch (error) {
    if (id === itemsId) convError.value = workloadError(error)
  } finally {
    if (id === itemsId) itemsLoading.value = false
  }
}

async function refresh() {
  const scroll = scroller.value?.scrollTop ?? state.value.scroll
  await Promise.all([load({ quiet: true }), loadItems()])
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = scroll
  remember()
}

// Apply a new state: reload only what changed. Scope and queue changes clear
// the selection (its commands belong to the previous rows).
function apply(next) {
  const prev = state.value
  const scope = prev.pipeline !== next.pipeline || prev.company !== next.company
  const people = prev.agentOffset !== next.agentOffset
  const queueChanged = ['owner', 'kind', 'bucket', 'offset'].some(
    (key) => prev[key] !== next[key],
  )
  state.value = { ...next, scroll: prev.scroll }
  if (scope || queueChanged) selected.value = []
  remember()
  if (scope) {
    target.value = ''
    Promise.all([load(), loadItems()])
  } else {
    if (people) load()
    if (queueChanged) loadItems()
  }
}

function navigate(patch) {
  if (moving.value) return
  const merged = { ...state.value, ...patch }
  if ('pipeline' in patch || 'company' in patch) {
    merged.offset = 0
    merged.agentOffset = 0
  }
  const next = safeWorkloadState(merged)
  if (sameWorkloadQuery(next, state.value)) return
  apply(next)
  router.push({ query: encodeWorkloadQuery(next) })
}

// kind: explicit kind, 'keep' to stay on the current one, or undefined to pick
// a sensible default for the bucket (tasks for due buckets, else leads/deals).
function openQueue(owner, bucket = 'all', kind) {
  let nextKind = kind
  if (bucket !== 'all') nextKind = 'tasks'
  else if (kind === 'keep') nextKind = state.value.kind
  else if (!kind)
    nextKind = state.value.kind === 'tasks' ? 'deals' : state.value.kind
  navigate({ owner, bucket, kind: nextKind, offset: 0 })
}

watch(
  () => route.query,
  (query) => {
    if (route.path !== basePath) return
    const next = decodeWorkloadQuery(query) || safeWorkloadState(null)
    if (!sameWorkloadQuery(next, state.value)) apply(next)
  },
)

function toggle(row) {
  const key = workItemKey(row)
  selected.value = selected.value.some((item) => workItemKey(item) === key)
    ? selected.value.filter((item) => workItemKey(item) !== key)
    : [...selected.value, command(row)]
}
function toggleAll(on) {
  const rows = queue.value.items || []
  const keys = new Set(rows.map(workItemKey))
  const others = selected.value.filter((item) => !keys.has(workItemKey(item)))
  selected.value = on ? [...others, ...rows.map(command)] : others
}
function command(row) {
  return {
    doctype: row.doctype,
    name: row.name,
    modified: row.modified,
    owner: row.owner || '',
  }
}
function clearSelection() {
  selected.value = []
  results.value = []
  moveError.value = ''
  loadItems()
}
function dismissResults() {
  results.value = []
  moveError.value = ''
}
async function move() {
  if (moving.value || !selected.value.length || !target.value) return
  moving.value = true
  moveError.value = ''
  try {
    const response = await call('crm.api.workload.reassign_bulk', {
      items: selected.value,
      target: target.value,
      filters: filters(),
    })
    results.value = response.results
    selected.value = retainFailedSelection(selected.value, response.results)
    await refresh()
  } catch {
    moveError.value = __(
      'No se pudo confirmar la reasignación. Conservamos tu selección; revisa los registros antes de reintentar.',
    )
  } finally {
    moving.value = false
  }
}
function openRecord(event) {
  if (!mayLeave()) {
    event.preventDefault()
    return
  }
  remember()
}
function mayLeave() {
  if (!moving.value) return true
  moveError.value = __(
    'La reasignación sigue pendiente. Espera la respuesta; conservamos la selección y no asumimos que terminó.',
  )
  return false
}
onBeforeRouteLeave(mayLeave)
function beforeUnload(event) {
  if (!moving.value) return
  event.preventDefault()
  event.returnValue = ''
}
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload)
  remember()
  ++loadId
  ++itemsId
  ++scanId
})
load().then(async () => {
  if (!loadError.value) {
    await loadItems()
    await nextTick()
    if (scroller.value) scroller.value.scrollTop = initialScroll
  }
})
</script>
<style scoped>
.wl-btn {
  @apply min-h-9 rounded-md border border-outline-gray-2 bg-surface-base px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50;
}
.wl-control {
  @apply mt-1 block min-h-9 w-full max-w-full rounded-md border border-outline-gray-2 bg-surface-base px-2 text-sm text-ink-gray-8 sm:w-48;
}
.wl-seg {
  @apply min-h-8 rounded px-2.5 text-sm text-ink-gray-6 hover:text-ink-gray-8 disabled:opacity-50;
}
.wl-seg-on {
  @apply bg-surface-gray-3 font-medium text-ink-gray-9;
}
.wl-notice {
  @apply rounded-lg border border-outline-amber-2 bg-surface-amber-1 p-3 text-sm text-ink-amber-8;
}
</style>
