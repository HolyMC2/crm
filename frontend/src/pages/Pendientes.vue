<template>
  <ModuleLayout
    title="Pendientes"
    :entries="entries"
    :active-key="state.segment"
    @select="selectSegment"
  >
    <section
      v-if="guard"
      role="alert"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
    >
      <h1 class="text-xl font-semibold">
        {{ __('Pendientes is not available') }}
      </h1>
      <p class="text-base text-ink-gray-7">{{ guard }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="__('Retry permissions')" @click="retryBoot" />
        <Button :label="__('Copy access request')" @click="copyRequest" />
        <Button :label="__('Back')" @click="router.back()" />
      </div>
      <p v-if="copied" role="status" class="text-sm text-ink-gray-6">
        {{ copied }}
      </p>
    </section>
    <div v-else class="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <!-- Phone: the list is the app bar's title (a sheet picks another), search
           is an icon, the bell is in the bar; create is the FAB (Google Tasks). -->
      <AppBar
        v-if="phone"
        v-model:search="search"
        v-model:search-open="searchOpen"
        :context="__('Pendientes')"
        :title="segmentLabel(state.segment)"
        :scopes="phoneEntries"
        :scope="state.segment"
        :scope-title="__('Choose a list')"
        searchable
        :search-label="__('Search pendientes')"
        @update:scope="selectSegment"
      />
      <header
        v-else
        class="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-6"
      >
        <!-- The title owns its row on phones (basis-full) so the buttons can
             never squeeze it down to one letter; it wraps between words. -->
        <div class="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <h1
            class="text-xl font-semibold text-ink-gray-9 [overflow-wrap:break-word] [text-wrap:balance]"
          >
            {{ segmentLabel(state.segment) }}
          </h1>
          <p class="text-sm text-ink-gray-6 [text-wrap:pretty]">
            {{ subtitle }}
          </p>
        </div>
        <template v-if="!approvals">
          <Button
            v-if="boot?.capabilities?.create_crm"
            :variant="boot?.capabilities?.create ? 'subtle' : 'solid'"
            icon-left="briefcase"
            :label="__('New sales task')"
            class="min-h-11 sm:min-h-8"
            @click="newSalesTask"
          />
          <Button
            v-if="boot?.capabilities?.create"
            variant="solid"
            icon-left="plus"
            :label="__('New pendiente')"
            class="min-h-11 sm:min-h-8"
            @click="openCreate()"
          />
        </template>
      </header>
      <FilterChips
        v-if="phone && !approvals"
        class="py-2"
        :label="__('Filters')"
        :model-value="state.source === 'all' ? '' : state.source"
        :chips="sourceChips"
        :filters-count="state.priority || state.from || state.to ? 1 : 0"
        @update:model-value="(value) => update({ source: value || 'all' })"
        @clear-filters="update({ priority: '', from: '', to: '' })"
      >
        <template #filters>
          <fieldset class="space-y-1">
            <legend class="pb-1 text-base font-semibold text-ink-gray-9">
              {{ __('Priority') }}
            </legend>
            <label
              v-for="option in priorityOptions"
              :key="option.value"
              class="flex min-h-11 items-center gap-3 text-base text-ink-gray-8"
            >
              <input
                type="radio"
                name="pendientes-priority"
                class="size-5"
                :value="option.value"
                :checked="state.priority === option.value"
                @change="update({ priority: option.value })"
              />
              {{ option.label }}
            </label>
          </fieldset>
          <button
            v-if="state.from || state.to"
            type="button"
            class="mt-3 flex min-h-11 items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-base"
            @click="update({ from: '', to: '' })"
          >
            {{ rangeLabel }} <span aria-hidden="true">×</span
            ><span class="sr-only">{{ __('Remove date range') }}</span>
          </button>
        </template>
      </FilterChips>
      <div
        v-else-if="!phone"
        class="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6"
      >
        <FormControl
          v-model="search"
          data-list-search
          class="min-w-0 flex-1 sm:max-w-xs [&_input]:min-h-11 sm:[&_input]:min-h-0"
          type="search"
          :placeholder="__('Search pendientes')"
          :aria-label="__('Search pendientes')"
        />
        <FormControl
          v-if="
            boot?.sources?.['CRM Task'] &&
            state.segment !== 'team' &&
            !approvals
          "
          class="h-11 sm:h-auto"
          type="select"
          :aria-label="__('Task source')"
          :model-value="state.source"
          :options="[
            { label: __('All sources'), value: 'all' },
            { label: __('Pendientes'), value: 'ToDo' },
            { label: __('Sales tasks'), value: 'CRM Task' },
          ]"
          @update:model-value="(value) => update({ source: value })"
        />
        <FormControl
          v-if="!approvals"
          class="h-11 sm:h-auto"
          type="select"
          :aria-label="__('Priority')"
          :model-value="state.priority"
          :options="priorityOptions"
          @update:model-value="(value) => update({ priority: value })"
        />
        <button
          v-if="state.from || state.to"
          class="flex min-h-11 items-center gap-1 rounded-full bg-surface-gray-2 px-3 text-sm sm:min-h-8"
          @click="update({ from: '', to: '' })"
        >
          {{ rangeLabel }} <span aria-hidden="true">×</span
          ><span class="sr-only">{{ __('Remove date range') }}</span>
        </button>
      </div>
      <div
        v-if="problem"
        role="alert"
        class="mx-4 mb-3 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        <Button class="ml-2" :label="__('Retry')" @click="load()" />
      </div>
      <div
        ref="scroller"
        class="min-h-0 flex-1 overflow-y-auto pb-24 sm:pb-6"
        @scroll.passive="rememberScroll"
      >
        <!-- «Por aprobar» / «Esperando respuesta»: the owners' rows (useAprobaciones). -->
        <ApprovalList
          v-if="approvals"
          :state="state"
          :restore="restoreScroll"
          @loaded="approvalLoaded"
          @segment="selectSegment"
        />
        <div
          v-else-if="loading && !loaded"
          role="status"
          class="px-6 py-8 text-sm text-ink-gray-6"
        >
          {{ __('Loading pendientes…') }}
        </div>
        <template v-else-if="state.segment === 'mine'">
          <div
            v-if="allClear"
            class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
          >
            <p class="text-lg font-semibold">{{ __('You are up to date') }}</p>
            <p class="mt-1 text-sm">
              {{
                __(
                  'Nothing is due. Plan the next follow-up so it does not slip.',
                )
              }}
            </p>
            <Button
              v-if="boot?.capabilities?.create && !phone"
              class="mt-4"
              :label="__('New pendiente')"
              @click="openCreate()"
            />
            <Button
              v-else-if="boot?.capabilities?.create_crm && !phone"
              class="mt-4"
              :label="__('New sales task')"
              @click="newSalesTask"
            />
          </div>
          <section
            v-for="group in shownGroups"
            v-else
            :key="group"
            :aria-labelledby="`pendientes-${group}`"
            :class="
              phone
                ? 'mx-3 mt-3 overflow-hidden rounded-2xl bg-surface-gray-1'
                : ''
            "
          >
            <h2
              :id="`pendientes-${group}`"
              class="sticky top-0 z-10 flex items-center gap-2 border-b border-outline-gray-1 px-4 py-2 text-sm font-semibold sm:px-6"
              :class="[
                phone ? 'bg-surface-gray-1 py-3 text-base' : 'bg-surface-base',
              ]"
            >
              {{ segmentLabel(group) }}
              <span
                v-if="countText(sections[group]?.count)"
                class="rounded-full bg-surface-gray-2 px-2 text-xs text-ink-gray-7"
                >{{ countText(sections[group]?.count) }}</span
              >
            </h2>
            <p
              v-if="!sections[group]?.rows?.length"
              class="px-4 py-2 text-sm text-ink-gray-5 sm:px-6"
            >
              {{ emptyText(group) }}
            </p>
            <PendienteRow
              v-for="row in sections[group]?.rows || []"
              :key="row.doctype + row.name"
              :data-scroll-key="row.doctype + row.name"
              :row="row"
              :today="today"
              :query="returnQuery"
              :busy="busy.has(row.doctype + row.name)"
              @complete="quickComplete"
              @complete-next="openComplete"
              @reschedule="reschedule"
            />
            <div v-if="sections[group]?.has_more" class="px-4 py-2 sm:px-6">
              <Button :label="__('See all')" @click="selectSegment(group)" />
            </div>
          </section>
          <!-- Done work folds into one collapsed card under the open groups
               (Google Tasks «Completed (n)»); it is not a list of its own. -->
          <section
            v-if="doneCount"
            class="mt-3"
            :class="
              phone
                ? 'mx-3 overflow-hidden rounded-2xl bg-surface-gray-1'
                : 'border-t border-outline-gray-1'
            "
          >
            <button
              type="button"
              class="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-base font-semibold text-ink-gray-8 sm:px-6"
              :aria-expanded="String(doneOpen)"
              aria-controls="pendientes-done"
              @click="toggleDone"
            >
              {{ __('Completed ({0})', [doneCount]) }}
              <span
                class="lucide-chevron-down size-5 transition-transform"
                :class="doneOpen ? 'rotate-180' : ''"
                aria-hidden="true"
              />
            </button>
            <div v-if="doneOpen" id="pendientes-done">
              <PendienteRow
                v-for="row in doneRows"
                :key="row.doctype + row.name"
                :row="row"
                :today="today"
                :query="returnQuery"
                :busy="busy.has(row.doctype + row.name)"
                @complete="undo"
              />
              <div class="px-4 py-2 sm:px-6">
                <Button
                  variant="ghost"
                  class="min-h-11 sm:min-h-8"
                  :label="__('See all')"
                  @click="selectSegment('done')"
                />
              </div>
            </div>
          </section>
        </template>
        <template v-else>
          <p
            v-if="!rows.length"
            class="mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-gray-6"
          >
            {{ emptyText(state.segment) }}
          </p>
          <PendienteRow
            v-for="row in rows"
            :key="row.doctype + row.name"
            :data-scroll-key="row.doctype + row.name"
            :row="row"
            :today="today"
            :query="returnQuery"
            :show-assignee="state.segment === 'team'"
            :busy="busy.has(row.doctype + row.name)"
            @complete="quickComplete"
            @complete-next="openComplete"
            @reschedule="reschedule"
          />
          <div v-if="hasMore" class="px-4 py-3 sm:px-6">
            <Button
              :label="__('Load more')"
              :loading="loading"
              @click="load(rows.length)"
            />
          </div>
        </template>
      </div>
      <Fab
        v-if="phone && !approvals && canCreate"
        :label="__('New pendiente')"
        @click="fabCreate"
      />
    </div>
    <CompleteDialog
      v-model="completeOpen"
      :row="selected"
      :today="today"
      :with-next="true"
      @done="afterComplete"
      @reload="reloadAfterConflict"
    />
    <CreateDialog
      v-model="createOpen"
      :today="today"
      :reference="createReference"
      :sales-task="Boolean(boot?.capabilities?.create_crm)"
      @created="afterCreate"
      @sales-task="salesFromCreate"
    />
    <DoctypeModals v-if="nativeEditor" />
  </ModuleLayout>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { Button, FormControl, toast } from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import { AppBar, Fab, FilterChips } from '@/components/ui'
import { isMobile as phone } from '@/composables/breakpoint'
import { useListKeys } from '@/composables/pageKeys'
import PendienteRow from '@/components/pendientes/PendienteRow.vue'
import ApprovalList from '@/components/pendientes/ApprovalList.vue'
import CompleteDialog from '@/components/pendientes/CompleteDialog.vue'
import CreateDialog from '@/components/pendientes/CreateDialog.vue'
import { loadShell, shellBoot } from '@/composables/muelleShell'
import {
  aprobacionesApi,
  countText as approvalCountText,
} from '@/composables/useAprobaciones'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { safeIntendedRoute } from '@/utils/shellRoutes'
import { formatDay } from '@/utils/contactos'
import {
  captureScroll,
  readScroll,
  scrollTarget,
  sessionStore,
  settleScroll,
  writeScroll,
} from '@/utils/listScroll'
import {
  GROUPS,
  canCreateOn,
  countText,
  isApprovalSegment,
  parseQuery,
  pendienteError,
  pendienteRoute,
  pendientesApi,
  queueArgs,
  requestId,
  segmentEntries,
  segmentLabel,
  toQuery,
} from '@/composables/usePendientes'

// CRM's own wired CRM Task editor, loaded only for workers who create sales tasks.
const DoctypeModals = defineAsyncComponent(
  () => import('@/components/Modals/DoctypeModals.vue'),
)
const { showModal } = useDoctypeModal()
const route = useRoute(),
  router = useRouter()
const state = computed(() => parseQuery(route.query))
const boot = computed(() => shellBoot.value?.modules?.pendientes || null)
const today = computed(() => boot.value?.today || '')
const approvalCounts = ref(null)
const entries = computed(() =>
  segmentEntries({
    team: Boolean(boot.value?.capabilities?.team),
    // A link to either list always opens it; the pills follow the capability.
    approve:
      Boolean(boot.value?.capabilities?.approve) ||
      state.value.segment === 'approve',
    waiting:
      Boolean(boot.value?.capabilities?.waiting) ||
      state.value.segment === 'waiting',
  }).map((entry) => {
    // «Por aprobar · 4»: what waits on me (capped counts read «99+»).
    const count = approvalCountText(approvalCounts.value?.[entry.value])
    return count ? { ...entry, label: `${entry.label} · ${count}` } : entry
  }),
)
const approvals = computed(() => isApprovalSegment(state.value.segment))
// On a phone «Hechos» is the «Completados (n)» card, not a list in the picker
// (a «See all» link from that card still opens it).
const phoneEntries = computed(() =>
  entries.value.filter(
    (entry) => entry.value !== 'done' || state.value.segment === 'done',
  ),
)
const searchOpen = ref(Boolean(state.value.q))
const priorityOptions = computed(() => [
  { label: __('Any priority'), value: '' },
  { label: __('High'), value: 'High' },
  { label: __('Medium'), value: 'Medium' },
  { label: __('Low'), value: 'Low' },
])
// Source chips only where sources mix (both lists readable, not the team list).
const sourceChips = computed(() =>
  boot.value?.sources?.['CRM Task'] && state.value.segment !== 'team'
    ? [
        { value: 'ToDo', label: __('Pendientes') },
        { value: 'CRM Task', label: __('Sales tasks') },
      ]
    : [],
)
const canCreate = computed(() =>
  Boolean(
    boot.value?.capabilities?.create || boot.value?.capabilities?.create_crm,
  ),
)
const doneCount = ref(0),
  doneOpen = ref(false),
  doneRows = ref([])
// Phone: only groups with work show (an empty «Para hoy» card is noise).
const shownGroups = computed(() =>
  phone.value
    ? GROUPS.filter((group) => sections[group]?.rows?.length)
    : GROUPS,
)
const guard = ref(''),
  copied = ref(''),
  problem = ref(null),
  loading = ref(false),
  loaded = ref(false),
  sections = reactive({}),
  rows = ref([]),
  hasMore = ref(false),
  busy = reactive(new Set()),
  scroller = ref(null),
  search = ref(state.value.q)
const completeOpen = ref(false),
  selected = ref(null),
  createOpen = ref(false),
  createReference = ref(null),
  nativeEditor = ref(false)
// Keyboard standard: search, j/k rows, Enter opens, c creates (a pendiente,
// or a sales task for a seller without pendientes).
useListKeys({
  page: 'pendientes',
  search: true,
  rows: true,
  open: true,
  create: () =>
    boot.value?.capabilities?.create ? openCreate() : newSalesTask(),
  when: {
    create: () =>
      Boolean(
        boot.value?.capabilities?.create ||
          boot.value?.capabilities?.create_crm,
      ),
  },
})
// Records return to exactly this list (segment, search and filters).
const returnQuery = computed(() => ({
  list: new URLSearchParams(toQuery(state.value)).toString(),
}))
const allClear = computed(
  () =>
    loaded.value &&
    !state.value.q &&
    GROUPS.every((group) => !sections[group]?.rows?.length),
)
const subtitle = computed(
  () =>
    ({
      team: __('Open sales tasks of everyone you can see'),
      done: __('Closed and cancelled work, newest first'),
      approve: __('Everything waiting for your OK, oldest first'),
      waiting: __('What you asked for and is still waiting for an answer'),
    })[state.value.segment] ||
    __('Your follow-ups from Contactos, Ventas and other records in one list'),
)
const rangeLabel = computed(() =>
  [state.value.from, state.value.to]
    .map((day) => (day ? formatDay(day) : '…'))
    .join(' – '),
)

function emptyText(group) {
  return (
    {
      overdue: __('Nothing overdue.'),
      today: __('Nothing else due today.'),
      upcoming: __('Nothing planned yet.'),
      undated: __('Everything has a date.'),
      team: __('The sales team has no open tasks you can see.'),
      done: __('Nothing completed yet.'),
    }[group] || __('No pendientes with these filters.')
  )
}

function update(patch) {
  router.replace({
    name: 'Pendientes',
    query: toQuery({ ...state.value, ...patch }),
  })
}
function selectSegment(segment) {
  router.push({
    name: 'Pendientes',
    query: toQuery({ ...state.value, segment }),
  })
}
let searchTimer
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => update({ q: value.trim() }), 200)
})

let generation = 0
async function load(start = 0) {
  // Approval lists load their own rows (ApprovalList).
  if (guard.value || approvals.value) return
  const current = ++generation
  loading.value = true
  problem.value = null
  try {
    const response = await pendientesApi('queue', queueArgs(state.value, start))
    if (current !== generation) return
    if (response.sections) {
      for (const group of GROUPS) sections[group] = response.sections[group]
      doneCount.value = response.done?.value || 0
      if (doneOpen.value) loadDone()
    } else {
      rows.value = start ? [...rows.value, ...response.rows] : response.rows
      hasMore.value = response.has_more
    }
    loaded.value = true
    if (!start) restoreScroll()
  } catch (error) {
    if (current === generation) problem.value = pendienteError(error)
  } finally {
    if (current === generation) loading.value = false
  }
}

// Back from a record (phone back gesture, browser back or «Back to
// Pendientes») returns to the same row. The position is saved when leaving and
// while scrolling, and restored only once the sections have rendered and the
// phone header has settled (utils/listScroll).
// Keyed by the list's normalized state, so «Back to Pendientes» (rebuilt from
// the record's `list` query) and browser back find the same entry.
const scrollKey = () => `muelle:pendientes:scroll:${returnQuery.value.list}`
let stopRestore = null
let leaving = false
// «Por aprobar» / «Esperando respuesta» load their own rows (ApprovalList): they
// are on screen once it says so, not when this page's own list has loaded.
const approvalReady = ref(false)
function rememberScroll() {
  // Not mid-restore (clamped in-between positions), nor while the rows are off
  // screen: a collapsed list would save the top and lose the place.
  const ready = approvals.value ? approvalReady.value : loaded.value
  if (leaving || stopRestore || !ready || !scroller.value) return
  writeScroll(sessionStore(), scrollKey(), captureScroll(scroller.value))
}
// Resolves once the list holds the place again (or there is none to restore),
// so the approval list moves its focus only after it (ApprovalList `restore`).
async function restoreScroll() {
  const saved = readScroll(sessionStore(), scrollKey())
  if (!saved?.top) return
  await nextTick()
  const el = scroller.value
  if (!el) return
  stopRestore?.()
  await new Promise((resolve) => {
    let stop = null,
      finished = false
    stop = settleScroll(el, () => scrollTarget(el, saved), {
      onDone: () => {
        finished = true
        if (stopRestore === stop) stopRestore = null
        rememberScroll()
        resolve()
      },
    })
    // Without frames (no rAF) nothing settles: nothing to wait for.
    if (finished || !globalThis.requestAnimationFrame) return resolve()
    stopRestore = stop
  })
}
onBeforeRouteLeave(() => {
  stopRestore?.()
  rememberScroll()
})
onBeforeUnmount(() => {
  // the route has already changed here: never save under the next page's key
  leaving = true
  stopRestore?.()
})

function replaceRow(updated) {
  const key = updated.doctype + updated.name
  for (const list of [
    rows.value,
    ...GROUPS.map((g) => sections[g]?.rows || []),
  ]) {
    const index = list.findIndex((row) => row.doctype + row.name === key)
    if (index >= 0) list[index] = { ...list[index], ...updated }
  }
}

async function quickComplete(row) {
  const key = row.doctype + row.name
  if (busy.has(key) || row.status !== 'Open') return
  busy.add(key)
  replaceRow({ ...row, status: 'Closed' })
  try {
    const response = await pendientesApi('complete', {
      doctype: row.doctype,
      name: String(row.name),
      modified: row.modified,
      request_id: requestId(),
    })
    toast.success(__('Pendiente completed'), {
      duration: 8000,
      action: { label: __('Undo'), onClick: () => undo(response.row) },
    })
    load()
  } catch (error) {
    replaceRow(row)
    const reason = pendienteError(error)
    toast.error(`${reason.title}. ${reason.detail}`, {
      action:
        reason.kind === 'conflict'
          ? { label: __('Refresh'), onClick: () => load() }
          : undefined,
    })
  } finally {
    busy.delete(key)
  }
}
async function undo(row) {
  try {
    await pendientesApi('reopen', {
      doctype: row.doctype,
      name: String(row.name),
      modified: row.modified,
      request_id: requestId(),
    })
    toast.success(__('Pendiente reopened'))
  } catch (error) {
    const reason = pendienteError(error)
    toast.error(`${reason.title}. ${reason.detail}`)
  }
  load()
}
async function reschedule(row, date) {
  const key = row.doctype + row.name
  busy.add(key)
  try {
    await pendientesApi('reschedule', {
      doctype: row.doctype,
      name: String(row.name),
      modified: row.modified,
      date,
      request_id: requestId(),
    })
    toast.success(__('Moved to {0}', [formatDay(date)]))
    load()
  } catch (error) {
    const reason = pendienteError(error)
    toast.error(`${reason.title}. ${reason.detail}`, {
      action: { label: __('Refresh'), onClick: () => load() },
    })
  } finally {
    busy.delete(key)
  }
}
async function loadDone() {
  try {
    const response = await pendientesApi(
      'queue',
      queueArgs({ ...state.value, segment: 'done' }, 0),
    )
    doneRows.value = (response.rows || []).slice(0, 10)
  } catch (error) {
    problem.value = pendienteError(error)
  }
}
function toggleDone() {
  doneOpen.value = !doneOpen.value
  if (doneOpen.value) loadDone()
}
function fabCreate() {
  if (boot.value?.capabilities?.create) openCreate()
  else newSalesTask()
}
function salesFromCreate() {
  createOpen.value = false
  newSalesTask()
}
function openComplete(row) {
  selected.value = row
  completeOpen.value = true
}
function afterComplete(response) {
  toast.success(
    response.created
      ? __('Done. Next pendiente scheduled.')
      : __('Pendiente completed'),
  )
  load()
}

// Contextual creation: /crm/pendientes?create=1&reference_type=…&return_to=…
function openCreate(reference = null) {
  createReference.value = reference
  createOpen.value = true
}
// A sales task with assignee, activity and time: CRM's native create form.
function newSalesTask() {
  nativeEditor.value = true
  showModal({
    doctype: 'CRM Task',
    title: __('Task'),
    defaults: {
      status: 'Todo',
      priority: 'Medium',
      assigned_to: boot.value?.user,
      due_date: today.value ? `${today.value} 09:00:00` : undefined,
    },
    callbacks: { afterInsert: () => load() },
  })
}
function afterCreate(row) {
  const target = route.query.return_to
  if (typeof target === 'string' && target.startsWith('/crm/')) {
    const safe = safeIntendedRoute(target)
    const separator = safe.includes('?') ? '&' : '?'
    router.replace(
      safe.replace(/^\/crm/, '') +
        `${separator}done=${encodeURIComponent(`${row.doctype}:${row.name}`)}`,
    )
    return
  }
  toast.success(__('Pendiente saved'), {
    action: {
      label: __('Open'),
      onClick: () => router.push(pendienteRoute(row, returnQuery.value)),
    },
  })
  if (route.query.create) update({})
  load()
}

async function handoffs() {
  const query = route.query
  if (typeof query.pendiente === 'string' && query.pendiente) {
    try {
      const found = await pendientesApi('locate', { name: query.pendiente })
      router.replace(pendienteRoute(found, returnQuery.value))
    } catch (error) {
      problem.value = pendienteError(error)
      update({})
    }
    return true
  }
  const reference =
    typeof query.reference_type === 'string' && query.reference_name
      ? {
          reference_type: query.reference_type,
          reference_name: String(query.reference_name),
          reference_label: String(query.reference_label || ''),
        }
      : null
  if (query.create === '1' && canCreateOn(reference, boot.value))
    openCreate(reference)
  return false
}

async function start() {
  guard.value = ''
  try {
    const shell = await loadShell()
    if (!shell?.modules?.pendientes?.enabled) {
      guard.value =
        shell?.modules?.pendientes?.reason ||
        __('Ask your manager for permission to read your pendientes.')
      return
    }
  } catch (error) {
    guard.value = pendienteError(error).detail
    return
  }
  if (await handoffs()) return
  load()
  loadApprovalCounts()
}
// The pills' counts, re-read whenever an approval list reloads (after a decision).
async function loadApprovalCounts() {
  const capabilities = boot.value?.capabilities || {}
  if (!capabilities.approve && !capabilities.waiting) return
  try {
    approvalCounts.value = await aprobacionesApi('counts')
  } catch {
    approvalCounts.value = null
  }
}
// The approval list has its rows on screen (it restores the place itself through
// `restore` before moving the focus); from now on scrolling saves the place.
function approvalLoaded() {
  approvalReady.value = true
  loadApprovalCounts()
}
async function retryBoot() {
  await loadShell({ refresh: true }).catch(() => {})
  start()
}
async function copyRequest() {
  const text = __(
    'I need access to Pendientes: permission to read my ToDo (and Sales tasks, if I sell). Please review my user.',
  )
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied. Share it with your manager.')
  } catch {
    copied.value = text
  }
}

watch(
  () => [
    state.value.segment,
    state.value.q,
    state.value.source,
    state.value.priority,
    state.value.from,
    state.value.to,
  ],
  () => {
    if (search.value.trim() !== state.value.q) search.value = state.value.q
    loaded.value = false
    rows.value = []
    if (boot.value?.enabled) load()
  },
)
// Another approval list (segment, kind, search): its rows are not on screen yet.
watch(
  () => [state.value.segment, state.value.kind, state.value.q],
  () => (approvalReady.value = false),
)
onMounted(start)
function reloadAfterConflict() {
  completeOpen.value = false
  load()
}
</script>
