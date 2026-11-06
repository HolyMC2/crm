<template>
  <!-- One project (Shell SPEC §7 DE7): its state and progress, then its
       pendientes as a lista, a tablero (the Pendientes board) or a
       cronograma. The rows are Pendientes rows: a tap opens the pendiente,
       back returns here. -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-proyecto
  >
    <AppBar
      v-if="phone"
      :back="backTarget"
      :back-label="backLabel"
      :context="__('Proyectos')"
      :title="project?.project_name || __('Project')"
    >
      <template v-if="project?.can_write" #actions>
        <button
          type="button"
          class="flex size-12 items-center justify-center rounded-full text-ink-gray-7"
          :aria-label="__('Edit project')"
          :title="__('Edit project')"
          data-proyecto-edit
          @click="editOpen = true"
        >
          <span class="lucide-pencil size-6" aria-hidden="true" />
        </button>
      </template>
    </AppBar>
    <div
      class="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10 sm:pt-6"
    >
      <RouterLink
        v-if="!phone"
        :to="backTarget"
        class="inline-flex min-h-11 items-center gap-1 rounded-6 text-sm text-ink-gray-6 hover:text-ink-gray-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:min-h-8"
      >
        <span class="lucide-arrow-left size-4" aria-hidden="true" />{{
          backLabel
        }}
      </RouterLink>
      <EmptyState
        v-if="problem"
        state="error"
        :title="problem.title"
        :message="problem.detail"
        reload
        @action="load"
      />
      <template v-else-if="project">
        <header class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <h1
              v-if="!phone"
              class="title-face text-2xl font-semibold text-ink-gray-9 [overflow-wrap:break-word]"
            >
              {{ project.project_name }}
            </h1>
            <div
              class="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-gray-6"
            >
              <StatusChip
                :label="statusLabel(project.status)"
                :tone="statusTone(project.status)"
              />
              <span v-if="spanText(project)">{{ spanText(project) }}</span>
              <span v-if="project.late" class="text-ink-red-7">{{
                __('Past its end date')
              }}</span>
            </div>
          </div>
          <Button
            v-if="!phone && project.can_write"
            :label="__('Edit project')"
            class="min-h-11 sm:min-h-8"
            @click="editOpen = true"
          />
          <Button
            v-if="!phone && canCreate"
            variant="solid"
            :label="__('New pendiente')"
            class="min-h-11 sm:min-h-8"
            @click="openCreate"
          />
        </header>
        <!-- Progress: done over total, the overdue figure in red when there is one. -->
        <div class="mt-4 space-y-1" data-proyecto-progress>
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="text-ink-gray-7">{{ progressText(project) }}</span>
            <span class="num text-ink-gray-6">{{ percentOf(project) }} %</span>
          </div>
          <div
            class="h-2 overflow-hidden rounded-full bg-surface-gray-2"
            role="progressbar"
            :aria-valuenow="percentOf(project)"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="progressText(project)"
          >
            <div
              class="h-full rounded-full bg-[var(--muelle-accent)] transition-[width] motion-reduce:transition-none"
              :style="{ width: `${percentOf(project)}%` }"
            />
          </div>
          <p v-if="project.overdue" class="num text-sm text-ink-red-7">
            {{ __('{0} overdue', [project.overdue]) }}
          </p>
        </div>
        <p
          v-if="project.notes"
          class="mt-3 whitespace-pre-line text-sm text-ink-gray-7 [text-wrap:pretty]"
        >
          {{ project.notes }}
        </p>
        <Segmented
          class="mt-4"
          :fit="phone ? 'content' : 'equal'"
          :label="__('View', null, 'Proyecto')"
          :model-value="view"
          :options="viewOptions"
          @update:model-value="selectView"
        />
        <EmptyState
          v-if="!rows.length && !loading"
          :title="
            closed
              ? __('This project ended with no pendientes')
              : __('No pendientes in this project yet')
          "
          :message="
            closed
              ? __('A finished or cancelled project takes no new pendientes.')
              : __(
                  'Add the first one: it shows here, in the board and in the timeline.',
                )
          "
          :action="canCreate ? __('New pendiente') : ''"
          @action="openCreate"
        />
        <PendientesBoard
          v-else-if="view === 'board'"
          class="mt-3 !px-0"
          :rows="rows"
          :today="today"
          :query="returnQuery"
          show-assignee
          movable-all
          :busy="busy"
          @move="moveTo"
        />
        <Cronograma
          v-else-if="view === 'gantt'"
          class="mt-3"
          :rows="rows"
          :project="project"
          :today="today"
          :query="returnQuery"
        />
        <div v-else class="mt-3" :aria-busy="loading" data-proyecto-list>
          <section
            v-for="section in sections"
            :key="section.key"
            class="mb-4"
            :data-proyecto-section="section.key"
          >
            <h2
              class="flex items-baseline gap-2 px-1 pb-1 text-sm font-semibold text-ink-gray-8"
            >
              {{ section.label }}
              <span class="num font-medium text-ink-gray-5">{{
                section.rows.length
              }}</span>
            </h2>
            <ul class="divide-y divide-outline-gray-1">
              <li v-for="row in section.rows" :key="row.doctype + row.name">
                <PendienteRow
                  :row="row"
                  :today="today"
                  :query="returnQuery"
                  show-assignee
                  :busy="busy.has(row.doctype + row.name)"
                  @complete="complete"
                  @star="star"
                  @reschedule="reschedule"
                />
              </li>
            </ul>
          </section>
        </div>
      </template>
      <EmptyState v-else state="loading" />
    </div>
    <Fab
      v-if="phone && project && canCreate"
      :label="__('New pendiente')"
      @click="openCreate"
    />
    <CreateDialog
      v-model="createOpen"
      :today="today"
      :prefill="prefill"
      @created="load"
    />
    <ProyectoSheet
      v-model="editOpen"
      :project="project"
      :today="today"
      @saved="afterEdit"
    />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import { AppBar, EmptyState, Fab, Segmented, StatusChip } from '@/components/ui'
import PendienteRow from '@/components/pendientes/PendienteRow.vue'
import { isMobile as phone } from '@/composables/breakpoint'
import { shellBoot } from '@/composables/muelleShell'
import {
  pendienteError,
  pendientesApi,
  stateLabel,
} from '@/composables/usePendientes'
import {
  VIEWS,
  normalizeScope,
  normalizeView,
  percentOf,
  isClosed,
  progressText,
  proyectoError,
  proyectosApi,
  sectionsOf,
  spanText,
  statusLabel,
  statusTone,
  viewLabel,
} from '@/composables/useProyectos'
import { requestId } from '@/utils/contactos'

// The board, the timeline and the sheets load with their first view.
const PendientesBoard = defineAsyncComponent(
  () => import('@/components/pendientes/PendientesBoard.vue'),
)
const Cronograma = defineAsyncComponent(
  () => import('@/components/proyectos/Cronograma.vue'),
)
const CreateDialog = defineAsyncComponent(
  () => import('@/components/pendientes/CreateDialog.vue'),
)
const ProyectoSheet = defineAsyncComponent(
  () => import('@/components/proyectos/ProyectoSheet.vue'),
)

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute(),
  router = useRouter()
const boot = computed(() => shellBoot.value?.modules?.proyectos || null)
const project = ref(null),
  rows = ref([]),
  today = ref(''),
  loading = ref(false),
  problem = ref(null),
  createOpen = ref(false),
  editOpen = ref(false),
  pendientesAllowed = ref(false)
const busy = ref(new Set())
const closed = computed(() => isClosed(project.value))
const canCreate = computed(
  () =>
    pendientesAllowed.value &&
    Boolean(boot.value?.capabilities?.pendientes) &&
    !closed.value,
)
const view = computed(() => normalizeView(route.query.view))
const viewOptions = VIEWS.map((value) => ({ value, label: viewLabel(value) }))
const sections = computed(() => sectionsOf(rows.value, today.value))
// Up goes to the list it came from; a pendiente opened from here comes back here.
const listScope = computed(() => normalizeScope(route.query.list))
const backTarget = computed(() => ({
  name: 'Proyectos',
  query: listScope.value === 'open' ? {} : { list: listScope.value },
}))
const backLabel = computed(() => __('Back to Proyectos'))
const returnQuery = computed(() => ({
  return_to: `/crm/proyectos/${encodeURIComponent(props.name)}`,
  return_label: String(project.value?.project_name || 'Proyectos').slice(0, 40),
}))
const prefill = computed(() =>
  project.value
    ? {
        project: project.value.name,
        project_name: project.value.project_name,
      }
    : null,
)

let generation = 0
async function load() {
  const current = ++generation
  loading.value = true
  problem.value = null
  try {
    const answer = await proyectosApi('proyecto', { name: props.name })
    if (current !== generation) return
    project.value = answer?.project || null
    rows.value = answer?.rows || []
    today.value = answer?.today || ''
    pendientesAllowed.value = Boolean(answer?.capabilities?.pendientes)
  } catch (error) {
    if (current !== generation) return
    problem.value = proyectoError(error)
  } finally {
    if (current === generation) loading.value = false
  }
}
function selectView(value) {
  const next = normalizeView(value)
  router.replace({
    query: { ...route.query, view: next === 'list' ? undefined : next },
  })
}
function openCreate() {
  createOpen.value = true
}
function afterEdit(saved) {
  if (saved) project.value = saved
  load()
}

// Row actions write through the Pendientes API, like the Pendientes page.
async function change(row, values, done) {
  const key = row.doctype + row.name
  if (busy.value.has(key)) return
  busy.value.add(key)
  try {
    await pendientesApi('update', {
      doctype: row.doctype,
      name: String(row.name),
      modified: row.modified,
      values,
      request_id: requestId(),
    })
    if (done) toast.success(done)
  } catch (error) {
    const reason = pendienteError(error)
    toast.error(`${reason.title}. ${reason.detail}`)
  } finally {
    busy.value.delete(key)
    load()
  }
}
function moveTo(row, next) {
  change(row, { state: next }, __('Moved to {0}', [stateLabel(next)]))
}
function complete(row) {
  if (row.status !== 'Open') return
  change(row, { state: 'done' }, __('Done', null, 'Pendiente'))
}
function star(row) {
  change(row, { priority: row.priority === 'High' ? 'Medium' : 'High' })
}
function reschedule(row, day) {
  change(row, { date: day }, __('Rescheduled'))
}
watch(() => props.name, load)
onMounted(load)
</script>
