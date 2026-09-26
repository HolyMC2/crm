<template>
  <div
    ref="scroller"
    class="min-h-0 flex-1 overflow-y-auto bg-surface-base p-4 text-ink-gray-9"
    @scroll="remember"
  >
    <header class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">{{ __('Carga de trabajo') }}</h1>
      <button class="action" :disabled="loading || moving" @click="refresh">
        {{ __('Actualizar') }}
      </button>
    </header>
    <p v-if="loading" role="status" aria-live="polite">
      {{ __('Cargando el alcance seleccionado…') }}
    </p>
    <div v-else-if="loadError" role="alert" class="notice">
      <p>{{ errorMessage(loadError) }}</p>
      <button class="action mt-2" :disabled="loading" @click="load">
        {{ __('Reintentar') }}
      </button>
    </div>
    <template v-else>
      <div class="mb-4 flex flex-wrap gap-3">
        <label
          >{{ __('Pipeline') }}
          <select
            v-model="state.pipeline"
            class="control"
            :disabled="moving"
            @change="changeScope"
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
        <label
          >{{ __('Empresa') }}
          <select
            v-model="state.company"
            class="control"
            :disabled="moving"
            @change="changeScope"
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
      </div>
      <p class="mb-2 text-sm text-ink-gray-6">
        {{
          __(
            data.definitions ||
              'Los conteos y las filas usan tus permisos actuales.',
          )
        }}
      </p>
      <p v-if="data.as_of" class="mb-4 text-xs text-ink-gray-6">
        {{ __('Consultado') }}: {{ data.as_of }} · {{ data.timezone }}
      </p>
      <section class="mb-4 rounded-lg border border-outline-gray-2 p-3">
        <h2 class="font-semibold">{{ __('Capacidad orientativa') }}</h2>
        <p>
          {{
            cap
              ? `${cap} ${__('leads + deals abiertos por persona')}`
              : __('Sin límite orientativo configurado (0)')
          }}
          · {{ data.capacity?.source || 'FCRM Settings' }}
        </p>
        <p class="text-sm text-ink-gray-6">
          {{
            __(
              'Se compara sólo la carga visible en el alcance seleccionado. No bloquea asignaciones ni cambia el reparto automático.',
            )
          }}
        </p>
        <p v-if="data.capacity?.routing" class="mt-2 text-sm text-ink-gray-6">
          {{ __(data.capacity.routing) }}
        </p>
        <div class="mt-2 flex flex-wrap gap-4 text-sm underline">
          <a href="/app/fcrm-settings" target="_blank" rel="noopener">{{
            data.capacity?.can_configure
              ? __('Configurar capacidad')
              : __('Ver configuración de CRM')
          }}</a>
          <a href="/app/assignment-rule" target="_blank" rel="noopener">{{
            __('Reglas nativas de asignación')
          }}</a>
        </div>
        <details
          v-if="marketing.state && marketing.state !== 'absent'"
          class="mt-3 text-sm"
        >
          <summary>
            {{ __('Política opcional de Marketing') }} · {{ marketing.state }}
          </summary>
          <template v-if="marketing.state === 'available'">
            <p>
              {{ __('Reparto automático') }}:
              {{ marketing.enabled ? __('Activo') : __('Inactivo') }} ·
              {{ __('Deals') }}:
              {{ marketing.deals_enabled ? __('Activos') : __('Inactivos') }} ·
              {{ __('Capacidad flexible') }}:
              {{ marketing.soft_cap || __('Sin límite') }}
            </p>
            <p>
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
        </details>
      </section>
      <section class="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <button class="metric" @click="openQueue(null, 'leads')">
          {{ __('Leads abiertos') }}
          <strong>{{ data.summary?.open_leads || 0 }}</strong>
        </button>
        <button class="metric" @click="openQueue(null, 'deals')">
          {{ __('Deals abiertos') }}
          <strong>{{ data.summary?.open_deals || 0 }}</strong>
        </button>
        <button class="metric" @click="openQueue(null, 'tasks')">
          {{ __('Tareas abiertas') }}
          <strong>{{ data.summary?.open_tasks || 0 }}</strong>
        </button>
        <button class="metric" @click="openQueue(null, 'tasks', true)">
          {{ __('Tareas vencidas') }}
          <strong>{{ data.summary?.overdue_tasks || 0 }}</strong>
        </button>
      </section>
      <div class="mb-4 flex flex-wrap gap-2">
        <button
          v-for="kind in kinds"
          :key="kind.value"
          class="action"
          @click="openQueue('', kind.value)"
        >
          {{ __('Sin asignar') }} · {{ kind.label }}:
          {{ data.unassigned?.[`open_${kind.value}`] || 0 }}
        </button>
      </div>
      <section class="mb-5">
        <h2 class="mb-2 font-semibold">
          {{ __('Personas') }} · {{ data.total_agents || 0 }}
        </h2>
        <p v-if="loading">{{ __('Cargando…') }}</p>
        <p v-else-if="!agents.length">{{ __('Nadie en la rotación') }}</p>
        <div class="grid gap-2 md:grid-cols-2">
          <div
            v-for="agent in agents"
            :key="agent.user"
            class="rounded-lg border border-outline-gray-2 p-3"
          >
            <button
              class="min-h-11 text-left font-semibold underline"
              :aria-expanded="state.owner === agent.user"
              @click="openQueue(agent.user, state.kind)"
            >
              {{ agent.full_name }}
            </button>
            <p class="text-sm">
              {{ agent.open_total }} {{ __('leads + deals abiertos') }} ·
              {{ agent.open_tasks || 0 }} {{ __('tareas') }}
            </p>
            <div
              v-if="cap"
              class="my-2 h-1.5 overflow-hidden rounded bg-surface-gray-3"
            >
              <div
                class="h-full"
                :class="barToken(agent.open_total, cap)"
                :style="{ width: `${barWidth(agent.open_total, cap)}%` }"
              />
            </div>
            <p v-if="agent.at_capacity" class="text-sm text-ink-amber-7">
              {{ __('Capacidad orientativa alcanzada en este alcance') }}
            </p>
            <p class="text-xs text-ink-gray-6">{{ __(agent.reason || '') }}</p>
            <p
              class="text-xs text-ink-gray-6"
              :title="__(agent.shift_reason || '')"
            >
              {{ __('Turno') }}: {{ shiftLabel(agent.shift) }}
            </p>
            <button
              class="mt-1 min-h-11 text-sm underline"
              @click="openQueue(agent.user, 'tasks', true)"
            >
              {{ __('Tareas vencidas') }}: {{ agent.overdue_tasks || 0 }}
            </button>
          </div>
        </div>
        <div class="mt-2 flex gap-2">
          <button
            class="action"
            :disabled="!state.agentOffset || loading || moving"
            @click="agentPage(-25)"
          >
            {{ __('Personas anteriores') }}
          </button>
          <button
            class="action"
            :disabled="!data.has_more || loading || moving"
            @click="agentPage(25)"
          >
            {{ __('Más personas') }}
          </button>
        </div>
      </section>
      <section class="rounded-lg border border-outline-gray-2 p-3">
        <h2 class="font-semibold">{{ __('Cola') }} · {{ ownerLabel }}</h2>
        <div class="my-3 flex flex-wrap items-end gap-3">
          <label
            >{{ __('Registros')
            }}<select
              v-model="state.kind"
              class="control"
              :disabled="moving"
              @change="changeKind"
            >
              <option
                v-for="kind in kinds"
                :key="kind.value"
                :value="kind.value"
              >
                {{ kind.label }}
              </option>
            </select></label
          >
          <label
            v-if="state.kind === 'tasks'"
            class="flex min-h-11 items-center gap-2"
            ><input
              v-model="state.overdue"
              type="checkbox"
              :disabled="moving"
              @change="changeKind"
            />{{ __('Sólo con fecha vencida') }}</label
          >
          <button
            class="action"
            :disabled="moving"
            @click="openQueue(null, state.kind)"
          >
            {{ __('Todos los propietarios') }}
          </button>
        </div>
        <p class="mb-2 text-sm text-ink-gray-6">
          {{
            __(
              'Las tareas sin fecha no se consideran vencidas. Cambiar el propietario de un lead o deal conserva los responsables de sus tareas; reasigna esas tareas por separado si hace falta.',
            )
          }}
        </p>
        <div v-if="convError" role="alert" class="notice">
          <p>{{ errorMessage(convError, true) }}</p>
          <button class="action mt-2" @click="loadItems">
            {{ __('Reintentar') }}
          </button>
        </div>
        <p v-else-if="itemsLoading">{{ __('Cargando conversaciones…') }}</p>
        <template v-else>
          <p class="mb-2 text-sm">
            {{ queue.total || 0 }} {{ __('registros en total') }} ·
            {{ __('Página') }} {{ state.offset / 25 + 1 }}
          </p>
          <p v-if="!queue.items?.length">{{ __('Sin conversaciones') }}</p>
          <div
            v-for="row in queue.items || []"
            :key="workItemKey(row)"
            class="flex items-start gap-3 border-t border-outline-gray-1 py-3"
          >
            <input
              class="mt-3 size-5"
              type="checkbox"
              :aria-label="__('Seleccionar') + ' ' + (row.label || row.name)"
              :checked="
                selected.some((item) => workItemKey(item) === workItemKey(row))
              "
              :disabled="moving"
              @change="toggle(row)"
            />
            <div class="min-w-0 flex-1">
              <a
                :href="workItemHref(row)"
                class="inline-block min-h-11 break-words py-2 font-medium underline"
                @click="openRecord"
                >{{ row.label || row.name }}</a
              >
              <p class="text-xs text-ink-gray-6">
                {{ row.name }} · {{ row.status }} ·
                {{ row.owner || __('Sin asignar')
                }}<span v-if="row.due_date"> · {{ row.due_date }}</span>
              </p>
            </div>
          </div>
        </template>
        <div class="mt-3 flex gap-2">
          <button
            class="action"
            :disabled="!state.offset || itemsLoading || moving"
            @click="queuePage(-25)"
          >
            {{ __('Anterior') }}</button
          ><button
            class="action"
            :disabled="!queue.has_more || itemsLoading || moving"
            @click="queuePage(25)"
          >
            {{ __('Siguiente') }}
          </button>
        </div>
        <div class="mt-4 border-t border-outline-gray-2 pt-3">
          <p>{{ selected.length }} {{ __('seleccionados') }}</p>
          <label
            >{{ __('Reasignar a')
            }}<select v-model="target" class="control" :disabled="moving">
              <option value="">{{ __('Elige una persona habilitada') }}</option>
              <option
                v-for="agent in data.candidates || []"
                :key="agent.user"
                :value="agent.user"
              >
                {{ agent.full_name
                }}{{
                  agent.at_capacity
                    ? ' · ' + __('Capacidad orientativa alcanzada')
                    : ''
                }}
              </option>
            </select></label
          >
          <p class="my-2 text-xs text-ink-gray-6">
            {{
              __(
                'Se comprobarán los permisos actuales de la persona para cada registro. La capacidad y el turno no son bloqueos de asignación manual.',
              )
            }}
          </p>
          <button
            class="action"
            :disabled="moving || !selected.length || !target"
            @click="move"
          >
            {{ moving ? __('Reasignando…') : __('Reasignar selección') }}
          </button>
          <button
            v-if="selected.length"
            class="action ml-2"
            :disabled="moving"
            @click="clearSelection"
          >
            {{ __('Limpiar selección y recargar') }}
          </button>
          <div v-if="moveError" role="alert" class="notice mt-2">
            {{ moveError }}
          </div>
          <ul v-if="results.length" class="mt-3 space-y-2" aria-live="polite">
            <li
              v-for="result in results"
              :key="workItemKey(result)"
              :class="result.ok ? 'text-ink-green-7' : 'text-ink-red-7'"
            >
              {{ result.name }}:
              {{
                result.ok
                  ? __(
                      'Reasignado. Responsables de tareas vinculadas conservados.',
                    )
                  : result.error
              }}
            </li>
          </ul>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { call } from 'frappe-ui'
import { onBeforeRouteLeave } from 'vue-router'
import {
  barToken,
  barWidth,
  retainFailedSelection,
  safeWorkloadState,
  workItemHref,
  workItemKey,
} from '@/utils/workloadFormat'
import { workloadError } from '@/utils/workloadError'

const storageKey = 'crm.workload.queue.v2'
let stored
try {
  stored = JSON.parse(sessionStorage.getItem(storageKey))
} catch {
  /* unavailable storage */
}
const state = ref(safeWorkloadState(stored))
const initialScroll = state.value.scroll
const scroller = ref(null)
const data = ref({ agents: [] })
const queue = ref({ items: [], total: 0 })
const loading = ref(false)
const itemsLoading = ref(false)
const loadError = ref('')
const convError = ref('')
const moveError = ref('')
const selected = ref([])
const results = ref([])
const target = ref('')
const moving = ref(false)
let loadId = 0
let itemsId = 0
const kinds = [
  { value: 'leads', label: __('Leads') },
  { value: 'deals', label: __('Deals') },
  { value: 'tasks', label: __('Tareas') },
]
const agents = computed(() => data.value.agents || [])
const cap = computed(() => data.value.capacity?.cap || 0)
const marketing = computed(() => data.value.capacity?.marketing || {})
const companies = computed(
  () =>
    data.value.companies || [
      ...new Set(
        (data.value.pipelines || []).map((p) => p.company).filter(Boolean),
      ),
    ],
)
const ownerLabel = computed(() =>
  state.value.owner === null
    ? __('Todos')
    : state.value.owner === ''
      ? __('Sin asignar')
      : (data.value.candidates || []).find((a) => a.user === state.value.owner)
          ?.full_name || state.value.owner,
)
const filters = () => ({
  pipeline: state.value.pipeline,
  company: state.value.company,
})
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
function shiftLabel(value) {
  return value === 'on_shift'
    ? __('En turno')
    : value === 'off_shift'
      ? __('Fuera de turno')
      : __('Desconocido')
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
async function load() {
  const id = ++loadId
  loading.value = true
  try {
    const value = await call('crm.api.workload.get_workload', {
      filters: filters(),
      offset: state.value.agentOffset,
    })
    if (id !== loadId) return
    data.value = value
    loadError.value = ''
  } catch (error) {
    if (id === loadId) loadError.value = workloadError(error)
  } finally {
    if (id === loadId) loading.value = false
  }
}
async function loadItems() {
  const id = ++itemsId
  itemsLoading.value = true
  try {
    const value = await call('crm.api.workload.get_work_items', {
      filters: filters(),
      kind: state.value.kind,
      owner: state.value.owner,
      overdue: state.value.overdue,
      offset: state.value.offset,
    })
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
  await Promise.all([load(), loadItems()])
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = scroll
  remember()
}
function openQueue(owner, kind, overdue = false) {
  if (moving.value) return
  Object.assign(state.value, { owner, kind, overdue, offset: 0 })
  selected.value = []
  remember()
  loadItems()
}
function changeScope() {
  state.value.offset = 0
  state.value.agentOffset = 0
  selected.value = []
  target.value = ''
  refresh()
}
function changeKind() {
  state.value.offset = 0
  if (state.value.kind !== 'tasks') state.value.overdue = false
  selected.value = []
  remember()
  loadItems()
}
function queuePage(delta) {
  state.value.offset += delta
  selected.value = []
  remember()
  loadItems()
}
function agentPage(delta) {
  state.value.agentOffset += delta
  remember()
  load()
}
function toggle(row) {
  const key = workItemKey(row)
  selected.value = selected.value.some((item) => workItemKey(item) === key)
    ? selected.value.filter((item) => workItemKey(item) !== key)
    : [
        ...selected.value,
        {
          doctype: row.doctype,
          name: row.name,
          modified: row.modified,
          owner: row.owner || '',
        },
      ]
}
function clearSelection() {
  selected.value = []
  results.value = []
  moveError.value = ''
  loadItems()
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
.action {
  @apply min-h-11 rounded-lg border border-outline-gray-2 px-3 py-2 text-sm font-medium disabled:opacity-50;
}
.control {
  @apply mt-1 block min-h-11 max-w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm;
}
.metric {
  @apply flex min-h-16 flex-col items-start rounded-lg border border-outline-gray-2 p-3 text-left text-sm;
}
.metric strong {
  @apply text-xl;
}
.notice {
  @apply rounded-lg border border-outline-amber-4 bg-surface-amber-1 p-3 text-sm text-ink-amber-7;
}
</style>
