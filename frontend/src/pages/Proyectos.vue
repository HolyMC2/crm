<template>
  <!-- Proyectos (Shell SPEC §7 DE7): the projects in one scope, a queue of
       named groups of pendientes with their progress and their end day. -->
  <ModuleLayout
    title="Proyectos"
    :entries="entries"
    :active-key="scope"
    @select="selectScope"
  >
    <section
      v-if="guard"
      role="alert"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
    >
      <h1 class="text-xl font-semibold">
        {{ __('Proyectos is not available') }}
      </h1>
      <p class="text-base text-ink-gray-7">{{ guard }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="__('Retry permissions')" @click="retryBoot" />
        <Button :label="__('Back', null, 'Proyectos')" @click="router.back()" />
      </div>
    </section>
    <div
      v-else
      class="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
      data-proyectos
    >
      <AppBar
        v-if="phone"
        v-model:search="search"
        v-model:search-open="searchOpen"
        :context="__('Proyectos')"
        :title="scopeLabel(scope)"
        :count="countOf(scope)"
        :scopes="phoneEntries"
        :scope="scope"
        :scope-title="__('Choose a list')"
        :loading="loading && rows.length > 0"
        searchable
        :search-label="__('Search projects')"
        @update:scope="selectScope"
      />
      <header
        v-else
        class="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-6"
      >
        <div class="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <h1
            class="title-face flex items-baseline gap-2 text-2xl font-semibold text-ink-gray-9 [overflow-wrap:break-word] [text-wrap:balance]"
          >
            {{ scopeLabel(scope) }}
            <span
              v-if="countOf(scope)"
              class="num text-lg font-medium text-ink-gray-5"
              >{{ countOf(scope) }}</span
            >
          </h1>
          <p class="text-sm text-ink-gray-6 [text-wrap:pretty]">
            {{ scopeDescription(scope) }}
          </p>
        </div>
        <FormControl
          v-model="search"
          type="search"
          class="w-56"
          :placeholder="__('Search projects')"
          :aria-label="__('Search projects')"
        />
        <Button
          v-if="canCreate"
          variant="solid"
          :label="__('New project')"
          class="min-h-11 sm:min-h-8"
          @click="createOpen = true"
        />
      </header>
      <div
        v-if="problem"
        role="alert"
        class="mx-4 mb-3 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        <Button class="ml-2" :label="__('Retry')" @click="load()" />
      </div>
      <EmptyState
        v-else-if="!loading && !rows.length"
        :title="emptyTitle"
        :message="emptyMessage"
        :action="canCreate && !search.trim() ? __('New project') : ''"
        @action="createOpen = true"
      />
      <ul
        v-else
        class="mx-auto w-full max-w-3xl divide-y divide-outline-gray-1 pb-28 sm:pb-10"
        :aria-busy="loading"
        data-proyectos-list
      >
        <li
          v-for="row in rows"
          :key="row.name"
          :data-fresh="live.fresh.value.has(row.name) ? '' : undefined"
        >
          <ListRow
            :title="row.project_name"
            :subtitle="dueLine(row)"
            :subtitle-tone="rowTone(row)"
            :meta="metaOf(row)"
            :meta-tone="row.late ? 'danger' : ''"
            icon="lucide-folder-kanban"
            :to="proyectoRoute(row.name, listQuery)"
            :data-proyecto-row="row.name"
          />
        </li>
      </ul>
      <Fab
        v-if="phone && canCreate"
        :label="__('New project')"
        @click="createOpen = true"
      />
    </div>
    <ProyectoSheet v-model="createOpen" :today="today" @saved="afterCreate" />
  </ModuleLayout>
</template>
<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, FormControl } from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import { AppBar, EmptyState, Fab, ListRow } from '@/components/ui'
import { isMobile as phone } from '@/composables/breakpoint'
import { useLiveList } from '@/composables/liveList'
import { loadShell, shellBoot } from '@/composables/muelleShell'
import {
  SCOPES,
  dueLine,
  metaOf,
  normalizeScope,
  proyectoError,
  proyectoRoute,
  proyectosApi,
  rowTone,
  scopeDescription,
  scopeLabel,
} from '@/composables/useProyectos'

// The sheet mounts on its first open.
const ProyectoSheet = defineAsyncComponent(
  () => import('@/components/proyectos/ProyectoSheet.vue'),
)

const route = useRoute(),
  router = useRouter()
const boot = computed(() => shellBoot.value?.modules?.proyectos || null)
const guard = computed(() =>
  boot.value && !boot.value.enabled
    ? boot.value.reason || __('Ask your manager for access to projects.')
    : '',
)
const canCreate = computed(() => Boolean(boot.value?.capabilities?.create))
// The URL is the state: the scope and the search.
const scope = computed(() => normalizeScope(route.query.list))
const listQuery = computed(() =>
  scope.value === 'open' ? {} : { list: scope.value },
)
const search = ref(String(route.query.q || '')),
  searchOpen = ref(Boolean(route.query.q))
const rows = ref([]),
  counts = ref({}),
  today = ref(''),
  loading = ref(false),
  problem = ref(null),
  createOpen = ref(false)

function countOf(key) {
  const count = counts.value[key]
  if (!count || !count.value) return undefined
  return count.capped ? `${count.value}+` : String(count.value)
}
const entries = computed(() =>
  SCOPES.map((value) => ({
    value,
    label: scopeLabel(value),
    icon: 'folder',
    count: countOf(value),
  })),
)
const phoneEntries = computed(() =>
  SCOPES.map((value) => ({
    value,
    label: scopeLabel(value),
    icon: 'lucide-folder-kanban',
    count: countOf(value),
  })),
)
const emptyTitle = computed(() =>
  search.value.trim()
    ? __('No project matches')
    : {
        open: __('No projects under way'),
        hold: __('No projects on hold'),
        done: __('No finished projects'),
        all: __('No projects yet'),
      }[scope.value],
)
const emptyMessage = computed(() =>
  search.value.trim()
    ? __('Try another word, or look in another list.')
    : canCreate.value
      ? __(
          'A project groups the pendientes of one job: a store opening, a campaign, a big repair.',
        )
      : __('Projects your team creates show here.'),
)

let generation = 0,
  timer
// `quiet` (a live refresh): the rows stay on screen, and a failed read keeps them.
async function load({ quiet = false } = {}) {
  const current = ++generation
  loading.value = !quiet
  if (!quiet) problem.value = null
  try {
    const answer = await proyectosApi('lista', {
      scope: scope.value,
      search: search.value.trim(),
    })
    if (current !== generation) return
    rows.value = answer?.rows || []
    counts.value = answer?.counts || {}
    today.value = answer?.today || ''
    problem.value = null
  } catch (error) {
    if (current !== generation || quiet) return
    rows.value = []
    problem.value = proyectoError(error)
  } finally {
    if (current === generation) loading.value = false
  }
}
function selectScope(value) {
  const next = normalizeScope(value)
  router.push({
    name: 'Proyectos',
    query: {
      ...(next === 'open' ? {} : { list: next }),
      ...(search.value.trim() ? { q: search.value.trim() } : {}),
    },
  })
}
async function retryBoot() {
  await loadShell({ refresh: true })
  if (boot.value?.enabled) load()
}
function afterCreate(project) {
  router.push(proyectoRoute(project.name, listQuery.value))
}
watch(scope, () => load())
watch(search, (value) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    const q = value.trim()
    if (q !== String(route.query.q || ''))
      router.replace({
        name: 'Proyectos',
        query: { ...listQuery.value, ...(q ? { q } : {}) },
      })
    load()
  }, 250)
})
onMounted(() => {
  if (!guard.value) load()
})
// A teammate's project, or a pendiente that moves its progress, shows
// without a reload; a new project is marked for a moment.
const live = useLiveList(
  () => (guard.value ? '' : ['Project', 'ToDo']),
  async () => {
    const before = rows.value.map((row) => row.name)
    await load({ quiet: true })
    live.mark(
      before,
      rows.value.map((row) => row.name),
    )
  },
)
</script>
