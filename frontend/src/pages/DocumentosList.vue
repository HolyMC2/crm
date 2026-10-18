<template>
  <!-- One document list (Shell SPEC §6 DD1/DD2): a curated profile's list
       (/documentos/facturas) or the generic floor for any readable doctype
       (/documentos/tipo/:doctype). Chip row + «Filtros», search in the bar,
       rows on ListRow; the URL keeps the filters and session memory the scroll. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      v-model:search="search"
      v-model:search-open="searchOpen"
      :back="backTo"
      :back-label="`Volver a ${moduleLabel}`"
      :context="moduleLabel"
      :title="title"
      :loading="loading && rows.length > 0"
      :bell="phone"
      searchable
      :search-label="`Buscar en ${title.toLowerCase()}`"
      :search-input-attrs="{ 'data-list-search': '' }"
    >
      <template #actions>
        <button
          type="button"
          class="flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          aria-label="Ordenar"
          data-testid="documentos-sort"
          @click="sortOpen = true"
        >
          <span class="lucide-arrow-down-up size-6" aria-hidden="true" />
        </button>
      </template>
    </AppBar>
    <div v-if="profile" class="mx-auto w-full max-w-3xl flex-none py-2">
      <FilterChips
        :model-value="chipValue"
        :chips="chips"
        :deselectable="false"
        label="Estado"
        :filters-count="filtersCount"
        @update:model-value="setChip"
        @clear-filters="clearFilters"
      >
        <template v-if="profile.filterFields?.length || state.scope" #filters>
          <div v-if="state.scope" class="pb-3">
            <p class="pb-1 text-sm text-ink-gray-6">Relacionados con</p>
            <ListRow
              icon="lucide-link"
              :title="state.scopeLabel || 'Un documento'"
              subtitle="Toca para quitar este filtro"
              @click="clearScope"
            />
          </div>
          <div
            v-for="field in profile.filterFields || []"
            :key="field.fieldname"
            class="pb-3"
          >
            <p class="pb-1 text-sm text-ink-gray-6">{{ field.label }}</p>
            <ListRow
              v-for="option in [
                { value: '', label: 'Todos' },
                ...field.options,
              ]"
              :key="option.value || 'all'"
              :title="option.label"
              :selected="
                (state.filters[field.fieldname] || '') === option.value
              "
              @click="setFilter(field.fieldname, option.value)"
            />
          </div>
        </template>
      </FilterChips>
      <p
        v-if="state.scope"
        class="flex items-center gap-2 px-4 pt-2 text-sm text-ink-gray-7"
        data-testid="documentos-scope"
      >
        <span class="lucide-link size-4 flex-none" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate">
          Relacionados con {{ state.scopeLabel || 'un documento' }}
        </span>
        <button
          type="button"
          class="min-h-11 flex-none px-2 font-medium text-ink-gray-8"
          @click="clearScope"
        >
          Quitar
        </button>
      </p>
    </div>
    <div
      ref="scroller"
      class="min-h-0 flex-1 overflow-y-auto pb-24"
      data-testid="documentos-list"
      @scroll.passive="onScroll"
    >
      <div class="mx-auto w-full max-w-3xl">
        <EmptyState
          v-if="error"
          state="error"
          title="No se pudo cargar la lista"
          :message="error"
          action="Reintentar"
          @action="load()"
        />
        <EmptyState
          v-else-if="denied"
          state="denied"
          title="No puedes ver estos documentos"
          message="Pide al dueño o al encargado que revise tu usuario."
        />
        <EmptyState
          v-else-if="!profile || (loading && !rows.length)"
          state="loading"
          title="Cargando…"
        />
        <EmptyState
          v-else-if="!rows.length"
          :title="emptyTitle"
          :message="emptyMessage"
          :action="hasFilters ? 'Quitar filtros' : ''"
          @action="clearAll"
        />
        <template v-else>
          <ListRow
            v-for="row in shown"
            :key="row.name"
            :title="row.view.title"
            :subtitle="row.view.subtitle"
            :subtitle-tone="row.view.subtitleTone"
            :meta="row.view.meta"
            :meta-tone="row.view.metaTone"
            :avatar="row.view.avatar"
            :icon="
              row.view.avatar === undefined ? row.view.icon || entryIcon : ''
            "
            :to="recordTo(row)"
            :data-row-key="row.name"
            data-testid="documentos-row"
          >
            <template v-if="showChip(row.view)" #trailing>
              <StatusChip :status="row.view.status" :tone="row.view.tone" />
            </template>
          </ListRow>
          <button
            v-if="hasMore"
            type="button"
            class="flex min-h-12 w-full items-center justify-center text-base font-medium text-ink-gray-8"
            :disabled="loading"
            data-testid="documentos-more"
            @click="load({ append: true })"
          >
            {{ loading ? 'Cargando…' : 'Cargar más' }}
          </button>
        </template>
      </div>
    </div>
    <BottomSheet v-model:open="sortOpen" title="Ordenar" flush>
      <ListRow
        v-for="option in profile?.sorts || []"
        :key="option.value || 'default'"
        :title="option.label"
        :selected="(state.sort || '') === option.value"
        @click="setSort(option.value)"
      />
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  FilterChips,
  ListRow,
  StatusChip,
} from '@/components/ui'
import { isMobile } from '@/composables/breakpoint'
import { docApi, errorText } from '@/documentos/api'
import {
  chipCountFilters,
  listFilters,
  readListQuery,
  recallScroll,
  rememberScroll,
  writeListQuery,
} from '@/documentos/listState'
import { loadProfile } from '@/documentos/profiles'
import { documentRoute, floorRoute, profileBySlug } from '@/documentos/registry'

const PAGE = 30
const route = useRoute()
const router = useRouter()
const phone = isMobile

// /documentos/:slug, /inventario/:slug or the floor /documentos/tipo/:doctype.
const base = computed(() =>
  route.path.startsWith('/inventario') ? '/inventario' : '/documentos',
)
const entry = computed(() =>
  route.params.slug ? profileBySlug(route.params.slug, base.value) : null,
)
const doctype = computed(
  () => entry.value?.doctype || String(route.params.doctype || ''),
)
const moduleLabel = computed(() =>
  base.value === '/inventario' ? 'Inventario' : 'Documentos',
)
const backTo = computed(() => ({ path: base.value }))

const profile = ref(null)
const serverLabel = ref('')
const title = computed(
  () => entry.value?.label || serverLabel.value || 'Documentos',
)
const entryIcon = computed(() => entry.value?.icon || 'lucide-file-text')

const state = ref(readListQuery(route.query))
const search = ref(state.value.search)
const searchOpen = ref(!!state.value.search)
const sortOpen = ref(false)
const rows = ref([])
const counts = ref({})
const hasMore = ref(false)
const loading = ref(false)
const error = ref('')
const denied = ref(false)
const scroller = ref(null)

const chipValue = computed(
  () => state.value.chip ?? profile.value?.defaultChip ?? '',
)
const chips = computed(() =>
  (profile.value?.chips || []).map((chip) => ({
    value: chip.value,
    label: chip.label,
    count: counts.value[chip.value || 'todos'],
  })),
)
const filtersCount = computed(
  () =>
    Object.values(state.value.filters).filter(Boolean).length +
    (state.value.scope ? 1 : 0),
)
const hasFilters = computed(
  () =>
    filtersCount.value > 0 ||
    !!state.value.search ||
    chipValue.value !== (profile.value?.defaultChip ?? ''),
)
const shown = computed(() =>
  rows.value.map((row) => ({
    ...row,
    view: profile.value.row(row, { doctype: doctype.value }),
  })),
)
const emptyTitle = computed(() =>
  hasFilters.value
    ? 'Ningún documento coincide con estos filtros'
    : `No hay ${title.value.toLowerCase()} todavía`,
)
const emptyMessage = computed(() =>
  hasFilters.value ? 'Prueba con otro filtro o quita los que tienes.' : '',
)

// A chip only when it changes what the worker does: never on the generic
// «Registrada», and only when the row's own line does not already say it.
function showChip(view) {
  if (!view.status || view.tone === 'neutral') return false
  return !view.subtitle
    ?.toLowerCase()
    .includes(String(view.status).toLowerCase())
}

function recordTo(row) {
  return (
    documentRoute(doctype.value, row.name, { hint: row.fields }) ||
    floorRoute(doctype.value, row.name)
  )
}

let seq = 0
async function load({ append = false, count = 0 } = {}) {
  if (!profile.value) return
  const mine = ++seq
  loading.value = true
  error.value = ''
  try {
    const page = await docApi('rows', {
      doctype: doctype.value,
      filters: listFilters(profile.value, state.value),
      search: state.value.search,
      order_by: state.value.sort,
      start: append ? rows.value.length : 0,
      limit: Math.max(PAGE, count),
      fields: profile.value.fields,
    })
    if (mine !== seq) return
    rows.value = append ? [...rows.value, ...page.rows] : page.rows
    hasMore.value = !!page.has_more
    serverLabel.value = page.label || ''
    denied.value = false
  } catch (e) {
    if (mine !== seq) return
    if (
      e?.exc_type === 'PermissionError' ||
      /permission|permiso/i.test(e?.message || '')
    )
      denied.value = true
    else error.value = errorText(e)
  } finally {
    if (mine === seq) loading.value = false
  }
}

async function loadCounts() {
  if (!profile.value?.chips?.length) return
  try {
    counts.value = await docApi('counts', {
      doctype: doctype.value,
      chips: chipCountFilters(profile.value, state.value),
      search: state.value.search,
    })
  } catch {
    counts.value = {}
  }
}

function apply({ counts: withCounts = true } = {}) {
  const query = writeListQuery(state.value, {
    defaultChip: profile.value?.defaultChip ?? '',
  })
  router.replace({ query })
  scroller.value?.scrollTo?.({ top: 0 })
  load()
  if (withCounts) loadCounts()
}

function setChip(value) {
  state.value = { ...state.value, chip: value }
  apply({ counts: false })
}
function setFilter(fieldname, value) {
  state.value = {
    ...state.value,
    filters: { ...state.value.filters, [fieldname]: value },
  }
  apply()
}
function setSort(value) {
  sortOpen.value = false
  state.value = { ...state.value, sort: value }
  apply({ counts: false })
}
function clearScope() {
  state.value = { ...state.value, scope: null, scopeLabel: '' }
  apply()
}
function clearFilters() {
  state.value = { ...state.value, filters: {}, scope: null, scopeLabel: '' }
  apply()
}
function clearAll() {
  search.value = ''
  searchOpen.value = false
  state.value = {
    chip: null,
    search: '',
    sort: '',
    filters: {},
    scope: null,
    scopeLabel: '',
  }
  apply()
}

let timer = null
watch(search, (value) => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if ((value || '') === state.value.search) return
    state.value = { ...state.value, search: value || '' }
    apply()
  }, 250)
})

// Scroll memory per list URL: the way back from a record lands on the same row.
let scrollTimer = null
function onScroll() {
  clearTimeout(scrollTimer)
  scrollTimer = setTimeout(() => {
    if (scroller.value)
      rememberScroll(
        route.fullPath,
        scroller.value.scrollTop,
        rows.value.length,
      )
  }, 120)
}

async function open() {
  denied.value = false
  error.value = ''
  rows.value = []
  state.value = readListQuery(route.query)
  search.value = state.value.search
  profile.value = await loadProfile({
    doctype: doctype.value,
    entry: entry.value,
  })
  const saved = recallScroll(route.fullPath)
  await load({ count: saved?.count || 0 })
  loadCounts()
  if (saved) {
    await nextTick()
    if (scroller.value) scroller.value.scrollTop = saved.top
  }
}

watch(
  () => [route.params.slug, route.params.doctype, base.value],
  () => {
    if (route.params.slug || route.params.doctype) open()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  clearTimeout(timer)
  clearTimeout(scrollTimer)
})
</script>
