<template>
  <!-- One document list (Shell SPEC §6 DD1/DD2): a curated profile's list
       (/documentos/facturas) or the generic floor for any readable doctype
       (/documentos/tipo/:doctype). Chip row + «Filtros», search in the bar,
       rows on ListRow; the URL keeps the filters and session memory the scroll. -->
  <div
    ref="root"
    class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden"
  >
    <AppBar
      v-model:search="search"
      v-model:search-open="searchOpen"
      :back="backTo"
      :back-label="`Volver a ${moduleLabel}`"
      :context="view ? title : moduleLabel"
      :title="view ? view.label : title"
      :picker="!!profile"
      :picker-open="vistasOpen"
      scope-title="Vistas"
      :loading="loading && rows.length > 0"
      :bell="phone"
      searchable
      :search-label="`Buscar en ${title.toLowerCase()}`"
      :search-input-attrs="{ 'data-list-search': '' }"
      :selecting="sel.active"
      :selected-count="sel.count"
      @start-select="sel.start()"
      @select-all="sel.allOnPage(rowNames)"
      @clear-selection="sel.clear()"
      @pick="openVistas"
    >
      <!-- Every list-wide action behind the bolt: the profile's own kinds of
           new document and shortcuts, then sort, views and select. -->
      <template v-if="profile" #actions>
        <AccionesMenu
          :groups="acciones"
          :phone="phone"
          :subtitle="view ? view.label : title"
          @pick="runAccion"
        />
      </template>
      <!-- Phone: search opens the status chips and the filters under it
           (ui/AppBar #search-panel); closed, what is on shows as chips. -->
      <template v-if="phone && profile" #search-panel>
        <FilterChips
          inline
          :model-value="chipValue"
          :chips="chips"
          :deselectable="false"
          label="Estado"
          :filters-count="filtersCount"
          @update:model-value="setChip"
          @clear-filters="clearFilters"
        >
          <template v-if="profile.filterFields?.length || state.scope" #filters>
            <div class="space-y-3" data-documentos-filters>
              <button
                v-if="state.scope"
                type="button"
                :class="chipClass(true)"
                @click="clearScope"
              >
                <span class="lucide-link size-3.5" aria-hidden="true" />
                {{ state.scopeLabel || 'Un documento' }}
                <span class="lucide-x size-3" aria-hidden="true" />
              </button>
              <template
                v-for="field in profile.filterFields || []"
                :key="field.fieldname"
              >
                <div v-if="field.kind === 'link'">
                  <p class="mb-1.5 text-xs font-medium text-ink-gray-6">
                    {{ field.label }}
                  </p>
                  <FilterLink
                    :model-value="state.filters[field.fieldname] || ''"
                    :doctype="field.doctype"
                    :label="field.label"
                    @update:model-value="setFilter(field.fieldname, $event)"
                  />
                </div>
                <ChipGroup
                  v-else
                  :label="field.label"
                  :options="filterOptions(field)"
                  :model-value="state.filters[field.fieldname] || ''"
                  @update:model-value="setFilter(field.fieldname, $event)"
                />
              </template>
            </div>
          </template>
        </FilterChips>
      </template>
      <template v-if="phone && profile && activeChips.length" #active>
        <div class="flex flex-wrap gap-1.5" data-documentos-active>
          <button
            v-for="chip in activeChips"
            :key="chip.key"
            type="button"
            :class="chipClass(true)"
            :aria-label="`Quitar filtro ${chip.label}`"
            @click="chip.remove()"
          >
            {{ chip.label }}
            <span class="lucide-x size-3 flex-none" aria-hidden="true" />
          </button>
        </div>
      </template>
    </AppBar>
    <div v-if="profile" class="mx-auto w-full flex-none py-2" :class="width">
      <FilterChips
        v-if="!phone"
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
            <FilterLink
              v-if="field.kind === 'link'"
              :model-value="state.filters[field.fieldname] || ''"
              :doctype="field.doctype"
              :label="field.label"
              @update:model-value="setFilter(field.fieldname, $event)"
            />
            <ListRow
              v-for="option in field.kind === 'link'
                ? []
                : [
                    { value: '', label: field.allLabel || 'Todos' },
                    ...filterOptions(field),
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
      <div class="mx-auto w-full" :class="width">
        <EmptyState
          v-if="missing"
          title="Esta lista no existe"
          message="El enlace es de una lista que no está en Documentos."
          action="Ir a Documentos"
          @action="router.push(backTo)"
        />
        <EmptyState
          v-else-if="error"
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
            v-for="(row, index) in shown"
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
            :selected="
              sel.active
                ? sel.isSelected(row.name)
                : pane && row.name === route.params.name
            "
            :data-row-key="row.name"
            :data-row-current="row.name === route.params.name ? '' : undefined"
            data-key-row
            data-testid="documentos-row"
            :style="phone ? '-webkit-touch-callout: none' : undefined"
            v-on="sel.press(row.name, index)"
            @click.capture="sel.onRowClick($event, row.name, index, rowNames)"
          >
            <template v-if="sel.active" #leading>
              <span
                role="checkbox"
                :aria-checked="sel.isSelected(row.name) ? 'true' : 'false'"
                :aria-label="row.view.title"
                class="flex size-10 flex-none items-center justify-center rounded-full"
                :class="
                  sel.isSelected(row.name)
                    ? 'bg-surface-gray-10 text-ink-base'
                    : 'border-2 border-outline-gray-4'
                "
                data-testid="documentos-row-check"
              >
                <span
                  v-if="sel.isSelected(row.name)"
                  class="lucide-check size-5"
                  aria-hidden="true"
                />
              </span>
            </template>
            <template v-if="showChip(row.view)" #trailing>
              <StatusChip
                :status="row.view.status"
                :label="row.view.statusLabel || ''"
                :tone="row.view.tone"
              />
            </template>
          </ListRow>
          <button
            v-if="hasMore"
            type="button"
            class="flex min-h-12 w-full items-center justify-center text-base-medium text-ink-gray-8"
            :disabled="loading"
            data-testid="documentos-more"
            @click="load({ append: true })"
          >
            {{ loading ? 'Cargando…' : 'Cargar más' }}
          </button>
        </template>
      </div>
    </div>
    <Fab
      v-if="createTo && !sel.active"
      :label="newLabel"
      :extended="!pane"
      :to="createTo"
      data-testid="documentos-new"
    />
    <!-- Shell D12: the selection's actions (mounted on the first selection). -->
    <BulkBar
      v-if="bulkUsed"
      v-show="sel.active"
      :doctype="doctype"
      :nombres="sel.names"
      :total="rows.length"
      :singular="kindLabel(doctype) || 'documento'"
      :plural="title"
      :curate="profile?.printFormats || null"
      @done="onBulkDone"
      @clear="sel.clear()"
    />
    <VistasSheet
      v-if="vistasUsed"
      v-model:open="vistasOpen"
      :doctype="doctype"
      :list-title="title"
      :query="currentQuery"
      :profile="profile"
      :saved="vistas"
      @apply="applyView"
      @changed="vistas = $event"
    />
  </div>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AppBar,
  EmptyState,
  Fab,
  FilterChips,
  ListRow,
  StatusChip,
} from '@/components/ui'
import { isMobile } from '@/composables/breakpoint'
// «Nueva orden», «Nuevo pago» (D3)
import { feminineNoun } from '@/utils/display'
import { shellBoot } from '@/composables/muelleShell'
import { useListKeys } from '@/composables/pageKeys'
import { docApi, errorText } from '@/documentos/api'
import AccionesMenu from '@/components/documentos/AccionesMenu.vue'
import FilterLink from '@/components/documentos/FilterLink.vue'
import ChipGroup from '@/components/ui/ChipGroup.vue'
import { chipClass } from '@/components/ui/chipClass'
import {
  chipCountFilters,
  filterOptions,
  listFilters,
  readListQuery,
  recallScroll,
  rememberScroll,
  writeListQuery,
} from '@/documentos/listState'
import { loadProfile } from '@/documentos/profiles'
import { activeView } from '@/documentos/vistas'
import { listActionsFor } from '@/documentos/acciones'
import { createListCache } from '@/utils/listCache'
import { documentRoute, floorRoute, profileBySlug } from '@/documentos/registry'
import { kindLabel, statusLabel } from '@/utils/display'
import { toast } from 'frappe-ui'
import { useSeleccion } from '@/components/masivo/useSeleccion'

const BulkBar = defineAsyncComponent(
  () => import('@/components/masivo/BulkBar.vue'),
)
const VistasSheet = defineAsyncComponent(
  () => import('@/components/documentos/VistasSheet.vue'),
)

const props = defineProps({
  // Left pane of the desktop split: rows keep the list's query, the open one is lit.
  pane: { type: Boolean, default: false },
})

const PAGE = 30
const root = ref(null)
const width = computed(() => (props.pane ? '' : 'max-w-3xl'))
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
// An unknown slug (an old or mistyped link): say so instead of asking the server for ''.
const missing = computed(() => !doctype.value)
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
const rows = ref([])
const counts = ref({})
const hasMore = ref(false)
const loading = ref(false)
const error = ref('')
const denied = ref(false)
const scroller = ref(null)

// Selection mode (Shell D12): «Seleccionar», a long press or shift-click pick
// rows; BulkBar acts on them. At most 100 at a time.
const sel = useSeleccion({
  max: 100,
  onLimit: (max) => toast.error(`Puedes elegir hasta ${max} a la vez.`),
})
const bulkUsed = ref(false)
watch(
  () => sel.active,
  (on) => {
    if (on) bulkUsed.value = true
  },
)
const rowNames = computed(() => rows.value.map((r) => r.name))
watch(rowNames, (names) => sel.prune(names))
function onBulkDone() {
  load({ count: rows.value.length })
  loadCounts()
}

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
// Closed phone search: the status (when not the list's default) and each
// filter, with its ×.
const activeChips = computed(() => {
  const out = []
  const fallback = profile.value?.defaultChip ?? ''
  if (chipValue.value !== fallback) {
    const chip = chips.value.find((c) => c.value === chipValue.value)
    if (chip)
      out.push({
        key: 'chip',
        label: chip.label,
        remove: () => setChip(fallback),
      })
  }
  for (const field of profile.value?.filterFields || []) {
    const value = state.value.filters[field.fieldname]
    if (!value) continue
    const option =
      field.kind === 'link'
        ? null
        : filterOptions(field).find((o) => o.value === value)
    out.push({
      key: field.fieldname,
      label: option?.label || value,
      remove: () => setFilter(field.fieldname, ''),
    })
  }
  if (state.value.scope)
    out.push({
      key: 'scope',
      label: state.value.scopeLabel || 'Un documento',
      remove: clearScope,
    })
  return out
})
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
  // The line speaks Spanish («Pagada · hoy»): compare the worded state.
  const words = view.statusLabel || statusLabel(view.status)
  const line = String(view.subtitle || '').toLowerCase()
  return ![words, view.status].some(
    (w) => w && line.includes(String(w).toLowerCase()),
  )
}

function recordTo(row) {
  const to =
    documentRoute(doctype.value, row.name, { hint: row.fields }) ||
    floorRoute(doctype.value, row.name)
  // A richer page (Compra orden, Gasto factura) goes back to this very list,
  // filters and all, through its `list` query (D3).
  if (!/^\/(documentos|inventario)\//.test(to.path))
    return { ...to, query: { ...(to.query || {}), list: route.fullPath } }
  // In the split the list lives in the URL's query: keep it on every record.
  return props.pane && !to.query ? { ...to, query: route.query } : to
}

// The one primary action: a new document, when this worker may create one.
const canCreate = computed(() => {
  const modules = shellBoot.value?.modules
  if (!modules) return false
  return ['documentos', 'inventario'].some((key) =>
    (modules[key]?.capabilities?.create || []).includes(doctype.value),
  )
})
const createTo = computed(() => {
  // A profile may keep creation elsewhere (tickets are rung up in the POS).
  if (!canCreate.value || profile.value?.creatable === false) return null
  const path = entry.value
    ? `${base.value}/${entry.value.slug}/nuevo`
    : `${floorRoute(doctype.value).path}/nuevo`
  return { path }
})
const newLabel = computed(() => {
  const word = (kindLabel(doctype.value) || 'documento').toLowerCase()
  return `${feminineNoun(word) ? 'Nueva' : 'Nuevo'} ${word}`
})

useListKeys({
  page: 'documentos',
  root,
  search: true,
  rows: true,
  open: true,
  create: () => (createTo.value ? router.push(createTo.value) : false),
  when: { create: () => !!createTo.value },
})

// The list's last answer paints at once on a visit or a filter change; a
// search is not kept.
const listCache = createListCache('documentos', () =>
  state.value.search
    ? null
    : [
        doctype.value,
        route.params.slug || '',
        state.value.chip,
        state.value.sort,
        state.value.filters,
        state.value.scope,
      ],
)
function showPage(page) {
  rows.value = page.rows || []
  hasMore.value = !!page.has_more
  serverLabel.value = page.label || ''
}

let seq = 0
async function load({ append = false, count = 0 } = {}) {
  if (!profile.value) return
  const mine = ++seq
  const listAt = append ? null : listCache.key()
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
    if (append) {
      rows.value = [...rows.value, ...page.rows]
      hasMore.value = !!page.has_more
      serverLabel.value = page.label || ''
    } else {
      showPage(page)
      listCache.save(listAt, page)
    }
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

// «Vistas» (the title opens them): the list's query saved under a name.
const vistas = ref(null)
const vistasOpen = ref(false)
const vistasUsed = ref(false)
const currentQuery = computed(() =>
  writeListQuery(state.value, {
    defaultChip: profile.value?.defaultChip ?? '',
  }),
)
const view = computed(() => activeView(vistas.value?.views, currentQuery.value))
function openVistas() {
  vistasUsed.value = true
  vistasOpen.value = true
}
async function loadVistas() {
  const asked = doctype.value
  try {
    const out = await docApi('views', { doctype: asked })
    if (asked === doctype.value) vistas.value = out
  } catch {
    // Without them the list works; the sheet asks again and says why.
    vistas.value = null
  }
}
function applyView(query) {
  vistasOpen.value = false
  state.value = readListQuery(query || {})
  search.value = state.value.search
  searchOpen.value = !!state.value.search
  apply()
}

// The bolt («Acciones»): documentos/acciones.js for this list, as it is now.
const acciones = computed(() =>
  listActionsFor(profile.value, {
    createTo: createTo.value,
    modules: shellBoot.value?.modules || {},
    sort: state.value.sort || '',
    rows: rows.value.length,
    hasFilters: hasFilters.value,
    vistas: true,
    saved: vistas.value?.views?.length || 0,
  }),
)
const ACCIONES = {
  ordenar: (value) => setSort(value),
  vistas: () => openVistas(),
  seleccionar: () => sel.start(),
  limpiar: () => clearAll(),
}
function runAccion({ key, value }) {
  ACCIONES[key]?.(value)
}

function apply({ counts: withCounts = true } = {}) {
  const query = currentQuery.value
  router.replace({ query })
  scroller.value?.scrollTo?.({ top: 0 })
  listCache.paint(showPage)
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
  sel.clear()
  denied.value = false
  error.value = ''
  rows.value = []
  vistas.value = null
  if (missing.value) return
  loadVistas()
  state.value = readListQuery(route.query)
  search.value = state.value.search
  profile.value = await loadProfile({
    doctype: doctype.value,
    entry: entry.value,
  })
  const saved = recallScroll(route.fullPath)
  // The last answer shows while the read runs, already at the saved place.
  const painted = listCache.paint(showPage)
  if (painted && saved) restoreScroll(saved.top)
  loadCounts()
  await load({ count: saved?.count || 0 })
  if (saved && !painted) restoreScroll(saved.top)
}
async function restoreScroll(top) {
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = top
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
