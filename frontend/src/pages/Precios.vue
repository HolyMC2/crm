<template>
  <div
    ref="scroller"
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-precios
  >
    <!-- Phone: the page's own bar (route meta.ownPhoneHeader). The title is
         the view and opens the others; the search opens the filters. -->
    <AppBar
      v-if="phone"
      :back="backTarget.to || true"
      :back-label="`Volver a ${backName}`"
      :context="phoneContext"
      :title="phoneTitle"
      :count="boot?.enabled ? total : undefined"
      :scopes="mode.kind === 'view' ? viewScopes : []"
      :scope="view"
      scope-title="Precios"
      :loading="loading && !!rowCodes.length"
      searchable
      :search="search"
      :search-open="searchOpen"
      search-label="Buscar producto, código o marca"
      :selecting="seleccion.active"
      :selected-count="seleccion.count"
      @back="onBarBack"
      @update:scope="setView"
      @update:search="(value) => (search = value)"
      @update:search-open="(value) => (searchOpen = value)"
      @select-all="seleccion.allOnPage(rowCodes)"
      @clear-selection="seleccion.clear()"
    >
      <template #actions>
        <AccionesMenu
          v-if="ready"
          phone
          :groups="actionGroups"
          subtitle="Precios"
          @pick="onAction"
        />
      </template>
      <template #selection-actions>
        <button
          v-for="action in selectionActions"
          :key="action.key"
          type="button"
          class="press flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 active:bg-surface-gray-2"
          :aria-label="action.label"
          :title="action.label"
          @click="onAction({ key: action.key })"
        >
          <span :class="[action.icon, 'size-6']" aria-hidden="true" />
        </button>
      </template>
      <template v-if="ready" #search-panel>
        <PreciosFiltros
          :lists="listNames"
          :list="activeList"
          :all-lists="allLists"
          :supplier="supplier"
          :supplier-shown="mode.kind !== 'source'"
          :group="group"
          @update:list="setList"
          @update:all-lists="(value) => (allLists = value)"
          @update:supplier="(value) => (supplier = value)"
          @update:group="(value) => (group = value)"
        />
      </template>
      <template v-if="activeChips.length" #active>
        <div class="flex flex-wrap gap-1.5" data-precios-activos>
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
    <header v-else class="px-6 pb-2 pt-6">
      <button
        type="button"
        class="mb-1 inline-flex min-h-8 items-center gap-1 text-sm text-ink-gray-6 hover:text-ink-gray-9"
        @click="goBack"
      >
        <span class="lucide-arrow-left size-4" aria-hidden="true" />
        {{ backName }}
      </button>
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h1 class="title-face text-3xl font-semibold text-ink-gray-9">
            {{ desktopTitle }}
          </h1>
          <p class="text-sm text-ink-gray-6">
            Lo que te costó cada producto contra lo que lo vendes. Cambia muchos
            precios a la vez o confirma que siguen igual.
          </p>
        </div>
        <AccionesMenu
          v-if="ready"
          :groups="actionGroups"
          subtitle="Precios"
          @pick="onAction"
        />
      </div>
    </header>

    <EmptyState
      v-if="bootState"
      class="mx-auto my-8 max-w-md"
      :state="bootState.state"
      :title="bootState.title"
      :message="bootState.message"
      :action="bootState.action"
      @action="bootState.run"
    />

    <template v-else>
      <!-- Desktop: the search, the views and the filters in one row. -->
      <div v-if="!phone" class="space-y-2 px-6 pb-3">
        <label class="relative flex max-w-xl items-center">
          <span
            class="lucide-search pointer-events-none absolute left-3.5 size-4 text-ink-gray-5"
            aria-hidden="true"
          />
          <input
            v-model="search"
            type="search"
            autocomplete="off"
            class="h-11 w-full rounded-full border-0 bg-surface-gray-2 pl-10 pr-10 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-2 focus:ring-outline-gray-3"
            placeholder="Buscar producto, código o marca"
            aria-label="Buscar producto, código o marca"
            data-precios-buscar
          />
          <span
            v-if="loading && search"
            class="lucide-loader-circle absolute right-3.5 size-4 animate-spin text-ink-gray-5 motion-reduce:animate-none"
            aria-hidden="true"
          />
        </label>
        <FilterChips
          class="-mx-4"
          :model-value="mode.kind === 'view' ? view : ''"
          :chips="mode.kind === 'view' ? viewChips : []"
          :deselectable="false"
          label="Vistas"
          filters-label="Filtros"
          :filters-count="filtersCount"
          @update:model-value="setView"
          @clear-filters="clearFilters"
        >
          <template #filters>
            <PreciosFiltros
              :lists="listNames"
              :list="activeList"
              :all-lists="allLists"
              :supplier="supplier"
              :supplier-shown="mode.kind !== 'source'"
              :group="group"
              @update:list="setList"
              @update:all-lists="(value) => (allLists = value)"
              @update:supplier="(value) => (supplier = value)"
              @update:group="(value) => (group = value)"
            />
          </template>
        </FilterChips>
      </div>

      <div class="flex-1 space-y-3 px-4 pb-4 pt-2 sm:px-6">
        <!-- Where these products come from, with the way to it. -->
        <section
          v-if="mode.kind !== 'view'"
          class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-8 bg-surface-gray-1 px-3 py-2 text-sm text-ink-gray-8"
          data-precios-origen
        >
          <span
            class="lucide-receipt size-4 flex-none text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">{{ originLine }}</span>
          <RouterLink
            v-if="sourceRoute"
            :to="sourceRoute"
            class="press inline-flex min-h-9 items-center font-medium text-ink-gray-9 underline-offset-2 hover:underline"
          >
            Abrir {{ sourceName(mode.doctype).toLowerCase() }}
          </RouterLink>
          <button
            type="button"
            class="press inline-flex min-h-9 items-center font-medium text-ink-gray-9 underline-offset-2 hover:underline"
            @click="leaveOrigin"
          >
            Ver todos los precios
          </button>
        </section>

        <p
          v-if="boot && !boot.can_write"
          class="rounded-6 bg-surface-gray-1 p-3 text-sm text-ink-gray-7"
          data-precios-solo-ver
        >
          Puedes ver precios y costos. Para cambiarlos pide al encargado permiso
          de precios; mientras, «Exportar» te deja llevarte la lista.
        </p>

        <p
          v-if="notice"
          role="status"
          class="flex items-start gap-2 rounded-6 p-3 text-sm"
          :class="
            notice.tone === 'warning'
              ? 'bg-surface-amber-1 text-ink-amber-8'
              : 'bg-surface-gray-1 text-ink-gray-8'
          "
          data-precios-aviso
        >
          <span class="min-w-0 flex-1">
            {{ notice.text }}
            <span
              v-for="(line, index) in notice.lines || []"
              :key="index"
              class="block"
              >{{ line }}</span
            >
          </span>
          <button
            v-if="notice.undo"
            type="button"
            class="press -my-1 min-h-9 flex-none px-2 font-medium underline"
            @click="notice.undo"
          >
            {{ notice.undoLabel || 'Deshacer' }}
          </button>
          <button
            type="button"
            class="press -my-1 flex size-9 flex-none items-center justify-center rounded-full"
            aria-label="Cerrar aviso"
            @click="notice = null"
          >
            <span class="lucide-x size-4" aria-hidden="true" />
          </button>
        </p>

        <p
          v-if="unknown.length"
          role="status"
          class="rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        >
          No encontré {{ unknown.slice(0, 5).join(', ')
          }}<template v-if="unknown.length > 5">
            y {{ unknown.length - 5 }} más</template
          >. Revisa el código o búscalo por nombre.
        </p>

        <p
          v-if="loadProblem"
          role="alert"
          class="flex flex-wrap items-center gap-2 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <span class="min-w-0 flex-1">{{ loadProblem }}</span>
          <button
            type="button"
            class="press min-h-9 px-2 font-medium underline"
            @click="load()"
          >
            Volver a intentar
          </button>
        </p>

        <!-- Desktop selection: what the chosen products can do together. -->
        <div
          v-if="!phone && seleccion.active"
          class="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-8 border border-outline-gray-2 bg-surface-base px-3 py-2 shadow-sm"
          data-precios-seleccion
        >
          <p class="min-w-0 flex-1 text-base font-medium text-ink-gray-9">
            {{
              seleccion.count === 1
                ? '1 producto'
                : `${seleccion.count} productos`
            }}
          </p>
          <button
            v-for="action in selectionActions"
            :key="action.key"
            type="button"
            class="press inline-flex min-h-9 items-center gap-1.5 rounded-6 bg-surface-gray-2 px-3 text-sm font-medium text-ink-gray-9"
            @click="onAction({ key: action.key })"
          >
            <span :class="[action.icon, 'size-4']" aria-hidden="true" />
            {{ action.label }}
          </button>
          <button
            type="button"
            class="press inline-flex min-h-9 items-center rounded-6 px-3 text-sm text-ink-gray-7 hover:bg-surface-gray-2"
            @click="seleccion.allOnPage(rowCodes)"
          >
            Todos los de la página
          </button>
          <button
            type="button"
            class="press inline-flex min-h-9 items-center rounded-6 px-3 text-sm text-ink-gray-7 hover:bg-surface-gray-2"
            @click="seleccion.clear()"
          >
            Quitar selección
          </button>
        </div>

        <ul
          v-if="loading && !rowCodes.length"
          class="grid gap-3 lg:grid-cols-2"
          aria-hidden="true"
        >
          <li
            v-for="n in 4"
            :key="n"
            class="h-44 animate-pulse rounded-8 bg-surface-gray-2 motion-reduce:animate-none"
          />
        </ul>
        <EmptyState
          v-else-if="!rowCodes.length && !loadProblem"
          class="mx-auto max-w-md py-6"
          :title="emptyText.title"
          :message="emptyText.message"
          :action="emptyText.action"
          @action="emptyText.run"
        />
        <div
          v-else
          class="grid items-start gap-3 lg:grid-cols-2"
          data-precios-filas
        >
          <PrecioRow
            v-for="row in shownRows"
            :key="row.item_code"
            :row="row"
            :lists="rowLists"
            :currency="currency"
            :drafts="drafts"
            :acks="acks"
            :kept="keep.has(row.item_code)"
            :selecting="seleccion.active"
            :selected="seleccion.isSelected(row.item_code)"
            :rounding="rounding"
            :result="results.get(row.item_code) || null"
            @draft="onDraft"
            @keep="onKeep"
            @ack="onAck"
            @history="openHistory"
            @select="(code) => seleccion.toggle(code)"
            @discard="discard"
          />
        </div>
        <div v-if="more" class="flex justify-center pt-1">
          <button
            type="button"
            class="press inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-gray-2 px-5 text-base font-medium text-ink-gray-9 disabled:opacity-60"
            :disabled="loading"
            data-precios-mas
            @click="load({ append: true })"
          >
            <span
              v-if="loading"
              class="lucide-loader-circle size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Cargar más ({{ total - rowCodes.length }})
          </button>
        </div>
      </div>

      <!-- What is pending, at the thumb, until it is saved or discarded. -->
      <div
        v-if="pendingCount"
        class="sticky bottom-0 z-10 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-outline-gray-1 bg-surface-base px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6"
        data-precios-pendientes
      >
        <!-- Below ~400 px the count takes its own line above the buttons. -->
        <p class="min-w-0 flex-1 basis-28 text-sm text-ink-gray-8">
          <span class="block font-medium text-ink-gray-9">{{
            pendingText
          }}</span>
          <span v-if="missingAcks" class="block text-ink-amber-8">
            {{
              missingAcks === 1 ? '1 pide tu OK' : `${missingAcks} piden tu OK`
            }}
          </span>
        </p>
        <button
          type="button"
          class="press ml-auto min-h-11 flex-none rounded-6 px-3 text-sm font-medium"
          :class="
            confirmDiscard
              ? 'bg-surface-red-1 text-ink-red-7'
              : 'text-ink-gray-7 hover:bg-surface-gray-2'
          "
          @click="discardAll"
          @blur="confirmDiscard = false"
        >
          {{ confirmDiscard ? 'Descartar todo' : 'Descartar' }}
        </button>
        <button
          type="button"
          class="press inline-flex min-h-11 flex-none items-center rounded-6 bg-[var(--muelle-accent)] px-4 text-base font-medium text-[var(--muelle-accent-ink)]"
          data-precios-revisar
          @click="openReview"
        >
          Revisar y guardar
        </button>
      </div>
    </template>

    <input
      ref="fileInput"
      type="file"
      accept=".csv,text/csv"
      class="hidden"
      aria-hidden="true"
      tabindex="-1"
      @change="onFile"
    />

    <HistorySheet
      v-if="historyMounted"
      v-model:open="historyOpen"
      :item="historyItem"
      :list="activeList"
      :lists="listNames"
      :currency="currency"
    />
    <BulkSheet
      v-if="bulkMounted"
      v-model:open="bulkOpen"
      :rows="bulkRows"
      :selection="seleccion.count > 0"
      :lists="listNames"
      :list="activeList"
      :currency="currency"
      :cost-visible="!!boot?.cost_visible"
      :rounding="rounding"
      @update:rounding="setRounding"
      @apply="onBulk"
    />
    <ReviewSheet
      v-if="reviewMounted"
      v-model:open="reviewOpen"
      :entries="review.entries"
      :kept="keptEntries"
      :blocked="review.blocked"
      :currency="currency"
      :saving="saving"
      :problem="saveProblem"
      :outcome="outcome"
      :labels-to="labelsTo"
      :return-label="returnLabel"
      @ack="onAck"
      @save="save"
      @show-failed="showFailed"
      @back="goBack"
    />
  </div>
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
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import { AppBar, EmptyState, FilterChips, chipClass } from '@/components/ui'
import AccionesMenu from '@/components/documentos/AccionesMenu.vue'
import PrecioRow from '@/components/precios/PrecioRow.vue'
import PreciosFiltros from '@/components/precios/PreciosFiltros.vue'
import { useSeleccion } from '@/components/masivo/useSeleccion'
import { isMobile as phone } from '@/composables/breakpoint'
import { shellBoot } from '@/composables/muelleShell'
import { documentRoute } from '@/documentos/registry'
import { formatDate } from '@/utils/display'
import { etiquetasHref } from '@/composables/useEtiquetas'
import {
  outcomeUnknown,
  problemOf,
  safeReturn,
} from '@/composables/useProductos'
import {
  VIEWS,
  draftKey,
  importDrafts,
  parseCsv,
  pendingLine,
  preciosApi,
  requestId,
  reviewEntries,
  savePayload,
  sourceName,
  startFrom,
  toCsv,
  viewLabel,
} from '@/composables/usePrecios'

const HistorySheet = defineAsyncComponent(
  () => import('@/components/precios/HistorySheet.vue'),
)
const BulkSheet = defineAsyncComponent(
  () => import('@/components/precios/BulkSheet.vue'),
)
const ReviewSheet = defineAsyncComponent(
  () => import('@/components/precios/ReviewSheet.vue'),
)

const route = useRoute()
const router = useRouter()
const DRAFT_KEY = 'muelle:precios:borrador'
const ROUNDING_KEY = 'muelle:precios:redondeo'
const MAX_FETCH_PAGES = 20
const MAX_IMPORT = 300

// ── boot ──────────────────────────────────────────────────────────────
const boot = ref(null)
const bootProblem = ref('')
const listNames = computed(() =>
  (boot.value?.price_lists || []).map((list) => list.name),
)
const activeList = ref('')
const currency = computed(
  () =>
    boot.value?.price_lists?.find((list) => list.name === activeList.value)
      ?.currency || 'MXN',
)
const ready = computed(() =>
  Boolean(boot.value?.enabled && listNames.value.length),
)

const bootState = computed(() => {
  if (bootProblem.value)
    return {
      state: 'error',
      title: 'No pude abrir Precios',
      message: bootProblem.value,
      action: 'Volver a intentar',
      run: start,
    }
  if (!boot.value) return { state: 'loading', title: 'Abriendo Precios…' }
  if (!boot.value.enabled)
    return {
      state: 'denied',
      title: 'No puedes ver precios',
      message: boot.value.reason,
      action: 'Volver a Productos',
      run: () => router.push({ name: 'Productos' }),
    }
  if (!listNames.value.length)
    return {
      state: 'empty',
      title: 'No hay listas de precios de venta',
      message:
        boot.value.price_setup?.reason ||
        'Pide al encargado que configure la lista de precios de tu tienda.',
      action: 'Volver a Productos',
      run: () => router.push({ name: 'Productos' }),
    }
  return null
})

// ── where the page starts and goes back to ────────────────────────────
const mode = ref({ kind: 'view' })
const sourceInfo = ref(null)
const returnTarget = computed(() => safeReturn(route.query.return_to))
const backTarget = computed(() => {
  const target = returnTarget.value
  if (target?.startsWith('/crm/')) return { to: target.slice('/crm'.length) }
  if (target) return { href: target }
  return { to: { name: 'Productos' } }
})
const returnLabel = computed(() => {
  const label = String(route.query.return_label || '').trim()
  if (label) return label
  return mode.value.kind === 'source' && returnTarget.value
    ? sourceName(mode.value.doctype)
    : ''
})
const backName = computed(() => returnLabel.value || 'Productos')
// The bar's arrow follows a route itself; a Desk page needs a full load.
function onBarBack(event) {
  if (!backTarget.value.href) return
  event?.preventDefault?.()
  window.location.assign(backTarget.value.href)
}
function goBack() {
  const target = backTarget.value
  if (target.href) window.location.assign(target.href)
  else router.push(target.to)
}

const sourceRoute = computed(() =>
  mode.value.kind === 'source'
    ? documentRoute(mode.value.doctype, mode.value.name, {
        boot: shellBoot.value,
      })
    : null,
)
const originLine = computed(() => {
  if (mode.value.kind === 'codes') {
    const n = mode.value.codes.length
    const what = n === 1 ? '1 producto' : `${n} productos`
    return mode.value.title
      ? `${mode.value.title}: ${what}`
      : `${what} elegidos`
  }
  const info = sourceInfo.value
  const bits = [sourceName(mode.value.doctype)]
  if (info?.party) bits[0] = `${bits[0]} de ${info.party}`
  if (info?.date) bits.push(formatDate(info.date))
  if (info?.products !== undefined)
    bits.push(info.products === 1 ? '1 producto' : `${info.products} productos`)
  if (info?.docstatus === 0) bits.push('borrador')
  return bits.join(' · ')
})
const phoneContext = computed(() =>
  mode.value.kind === 'view' ? 'Precios' : 'Productos',
)
const phoneTitle = computed(() =>
  mode.value.kind === 'view' ? viewLabel(view.value) || 'Precios' : 'Precios',
)
const desktopTitle = computed(() =>
  mode.value.kind === 'source'
    ? `Precios de ${sourceName(mode.value.doctype).toLowerCase()}`
    : 'Precios',
)

// ── views and filters ─────────────────────────────────────────────────
const view = ref('')
const counts = ref({})
const search = ref('')
const searchOpen = ref(false)
const supplier = ref('')
const group = ref('')
const allLists = ref(false)

const shownViews = computed(() =>
  VIEWS.filter((entry) => (boot.value?.views || []).includes(entry.value)),
)
const viewChips = computed(() =>
  shownViews.value.map((entry) => ({
    value: entry.value,
    label: entry.label,
    count: counts.value[entry.value] ?? undefined,
  })),
)
const viewScopes = viewChips
const filtersCount = computed(
  () =>
    [supplier.value, group.value].filter(Boolean).length +
    (activeList.value && activeList.value !== boot.value?.default_price_list
      ? 1
      : 0),
)
const activeChips = computed(() => {
  const chips = []
  if (activeList.value && activeList.value !== boot.value?.default_price_list)
    chips.push({
      key: 'lista',
      label: activeList.value,
      remove: () => setList(boot.value.default_price_list),
    })
  if (supplier.value)
    chips.push({
      key: 'proveedor',
      label: supplier.value,
      remove: () => (supplier.value = ''),
    })
  if (group.value)
    chips.push({
      key: 'grupo',
      label: group.value,
      remove: () => (group.value = ''),
    })
  return chips
})
function clearFilters() {
  supplier.value = ''
  group.value = ''
  if (boot.value?.default_price_list) setList(boot.value.default_price_list)
}
function setView(value) {
  if (!value || value === view.value) return
  view.value = value
  router.replace({ query: { ...route.query, vista: value } })
  load()
}
function setList(name) {
  if (!name || name === activeList.value) return
  activeList.value = name
  router.replace({
    query: {
      ...route.query,
      lista: name === boot.value?.default_price_list ? undefined : name,
    },
  })
  load()
  loadCounts()
}
function leaveOrigin() {
  const query = { ...route.query }
  for (const key of ['desde', 'codigos', 'return_to', 'return_label'])
    delete query[key]
  mode.value = { kind: 'view' }
  sourceInfo.value = null
  router.replace({ query })
  load()
  loadCounts()
}
const rowLists = computed(() =>
  allLists.value
    ? [
        activeList.value,
        ...listNames.value.filter((name) => name !== activeList.value),
      ]
    : [activeList.value],
)

// ── rows ──────────────────────────────────────────────────────────────
// Every product the page has read stays known (code → row), so a draft on a
// product that left the view still reviews and saves.
const known = reactive(new Map())
const rowCodes = ref([])
const shownRows = computed(() =>
  rowCodes.value.map((code) => known.get(code)).filter(Boolean),
)
const total = ref(0)
const more = ref(false)
const loading = ref(false)
const loadProblem = ref('')
const unknown = ref([])
let ticket = 0

function remember(rows) {
  for (const row of rows || []) known.set(row.item_code, row)
}
function scopeArgs() {
  const args = {
    price_list: activeList.value,
    search: search.value.trim(),
    group: group.value,
    supplier: supplier.value,
  }
  if (mode.value.kind === 'source')
    return { ...args, doctype: mode.value.doctype, name: mode.value.name }
  if (mode.value.kind === 'codes')
    return { ...args, items: JSON.stringify(mode.value.codes) }
  return { ...args, view: view.value }
}

async function load({ append = false } = {}) {
  const mine = ++ticket
  loading.value = true
  loadProblem.value = ''
  try {
    const answer = await preciosApi('rows', {
      ...scopeArgs(),
      start: append ? rowCodes.value.length : 0,
    })
    if (mine !== ticket) return
    remember(answer?.rows)
    const codes = (answer?.rows || []).map((row) => row.item_code)
    rowCodes.value = append
      ? [...new Set([...rowCodes.value, ...codes])]
      : codes
    total.value = answer?.total || 0
    more.value = Boolean(answer?.more)
    unknown.value = answer?.unknown || []
    if (answer?.source) sourceInfo.value = answer.source
    if (!append) seleccion.prune?.(codes)
  } catch (error) {
    if (mine === ticket) loadProblem.value = problemOf(error).detail
  } finally {
    if (mine === ticket) loading.value = false
  }
}

/** Every page of a scope (or of some codes), for export, import and refresh. */
async function fetchAll(args) {
  const rows = []
  let start = 0
  for (let page = 0; page < MAX_FETCH_PAGES; page++) {
    const answer = await preciosApi('rows', { ...args, start })
    rows.push(...(answer?.rows || []))
    if (!answer?.more || !answer?.rows?.length)
      return { rows, unknown: answer?.unknown || [] }
    start += answer.rows.length
  }
  return { rows, unknown: [] }
}
function fetchCodes(codes) {
  return fetchAll({
    price_list: activeList.value,
    items: JSON.stringify(codes),
  })
}

async function loadCounts() {
  if (!activeList.value) return
  try {
    counts.value =
      (await preciosApi('counts', { price_list: activeList.value })) || {}
  } catch {
    // The chips just go without their numbers.
  }
}

const reload = useDebounceFn(() => load(), 250)
watch(search, reload)
watch([supplier, group], () => load())

const emptyText = computed(() => {
  const filtered = search.value.trim() || supplier.value || group.value
  if (filtered)
    return {
      title: 'Nada con esa búsqueda',
      message: 'Quita un filtro o busca con otras palabras.',
      action: 'Quitar filtros',
      run: () => {
        search.value = ''
        clearFilters()
      },
    }
  if (mode.value.kind === 'source')
    return {
      title: 'Sin productos que revisar',
      message: 'Este documento no tiene productos que puedas ver.',
      action: 'Ver todos los precios',
      run: leaveOrigin,
    }
  const views = {
    costo: {
      title: 'Ningún costo cambió',
      message: 'Lo que compraste desde que pusiste los precios costó lo mismo.',
    },
    'sin-precio': {
      title: 'Todo tiene precio',
      message:
        'Lo que tienes en existencia o compraste ya tiene precio en esta lista.',
    },
    recientes: {
      title: 'Nadie cambió precios esta semana',
      message: 'Los precios cambiados en los últimos 7 días aparecen aquí.',
    },
  }
  return {
    ...(views[view.value] || { title: 'Sin productos', message: '' }),
    action: view.value === 'todos' ? '' : 'Ver todos',
    run: () => setView('todos'),
  }
})

// ── drafts, «Sigue igual» and their OKs ────────────────────────────────
const drafts = reactive(new Map())
const acks = reactive(new Set())
const keep = reactive(new Set())
const results = reactive(new Map())
const notice = ref(null)
const rounding = ref('centavos')

function forgetResult(code) {
  results.delete(code)
}
function onDraft({ code, list, value }) {
  const key = draftKey(code, list)
  const text = String(value ?? '').trim()
  if (text) drafts.set(key, { code, list, value: text })
  else drafts.delete(key)
  acks.delete(key)
  keep.delete(code)
  forgetResult(code)
}
function onKeep({ code, value }) {
  if (value) {
    keep.add(code)
    for (const key of [...drafts.keys()])
      if (key.startsWith(`${code}|`)) drafts.delete(key)
  } else keep.delete(code)
  forgetResult(code)
}
function onAck({ key, value }) {
  if (value) acks.add(key)
  else acks.delete(key)
}
function discard(code) {
  for (const key of [...drafts.keys()])
    if (key.startsWith(`${code}|`)) {
      drafts.delete(key)
      acks.delete(key)
    }
  keep.delete(code)
  forgetResult(code)
}
const confirmDiscard = ref(false)
// A small delete is two taps in place: «Descartar», then «Descartar todo».
function discardAll() {
  if (!confirmDiscard.value) {
    confirmDiscard.value = true
    return
  }
  confirmDiscard.value = false
  drafts.clear()
  acks.clear()
  keep.clear()
}

const review = computed(() => reviewEntries(drafts, known, acks))
const keptEntries = computed(() =>
  [...keep]
    .filter(
      (code) => !review.value.entries.some((entry) => entry.code === code),
    )
    .map((code) => ({ code, name: known.get(code)?.item_name || code })),
)
const pendingCount = computed(
  () => review.value.entries.length + keptEntries.value.length,
)
const pendingText = computed(() =>
  pendingLine(review.value.entries.length, keptEntries.value.length),
)
const missingAcks = computed(
  () =>
    review.value.entries.filter((entry) => entry.needsAck && !entry.acked)
      .length,
)

// The drafts survive a trip to a product or a reload (this tab only).
watch(
  () => [
    drafts.size,
    keep.size,
    acks.size,
    [...drafts.values()].map((d) => d.value).join(),
  ],
  () => {
    try {
      if (drafts.size || keep.size)
        sessionStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            drafts: [...drafts.values()],
            keep: [...keep],
            acks: [...acks],
          }),
        )
      else sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      // Private mode: the drafts are just not kept.
    }
  },
)
async function restoreDrafts() {
  let saved
  try {
    saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null')
  } catch {
    return
  }
  const entries = saved?.drafts || []
  const kept = saved?.keep || []
  if (!entries.length && !kept.length) return
  const codes = [...new Set([...entries.map((draft) => draft.code), ...kept])]
  try {
    remember((await fetchCodes(codes)).rows)
  } catch {
    return
  }
  for (const draft of entries)
    if (known.has(draft.code))
      drafts.set(draftKey(draft.code, draft.list), draft)
  for (const code of kept) if (known.has(code)) keep.add(code)
  for (const key of saved.acks || []) if (drafts.has(key)) acks.add(key)
  const n = drafts.size + keep.size
  if (n)
    notice.value = {
      text:
        n === 1
          ? 'Recuperé 1 cambio sin guardar.'
          : `Recuperé ${n} cambios sin guardar.`,
      undo: () => {
        drafts.clear()
        acks.clear()
        keep.clear()
        notice.value = null
      },
      undoLabel: 'Descartarlos',
    }
}
function beforeUnload(event) {
  if (drafts.size || keep.size) event.preventDefault()
}

// ── selection and bulk rules ──────────────────────────────────────────
const seleccion = useSeleccion({
  max: 200,
  onLimit: (max) =>
    (notice.value = {
      tone: 'warning',
      text: `Elige hasta ${max} productos a la vez.`,
    }),
})
const selectedRows = computed(() =>
  seleccion.names.map((code) => known.get(code)).filter(Boolean),
)
const bulkOpen = ref(false)
const bulkMounted = ref(false)
const bulkRows = computed(() =>
  seleccion.count ? selectedRows.value : shownRows.value,
)
function openBulk() {
  bulkMounted.value = true
  bulkOpen.value = true
}
function onBulk(changes) {
  for (const change of changes)
    onDraft({
      code: change.code,
      list: change.list,
      value: String(change.price),
    })
  seleccion.clear()
  notice.value = {
    text:
      changes.length === 1
        ? 'Puse 1 precio nuevo. Revísalo y guarda.'
        : `Puse ${changes.length} precios nuevos. Revísalos y guarda.`,
    undo: () => {
      for (const change of changes)
        onDraft({ code: change.code, list: change.list, value: '' })
      notice.value = null
    },
  }
}
const keepable = (row) =>
  !!row &&
  Object.values(row.prices || {}).some(
    (cell) => cell.can_write && cell.rate !== null && cell.rate !== undefined,
  )
function keepRows(rows) {
  const marked = rows.filter(
    (row) =>
      keepable(row) &&
      ![...drafts.values()].some((draft) => draft.code === row.item_code),
  )
  for (const row of marked) onKeep({ code: row.item_code, value: true })
  seleccion.clear()
  notice.value = {
    text:
      marked.length === 1
        ? '1 producto sigue igual.'
        : `${marked.length} productos siguen igual.`,
    lines:
      rows.length > marked.length
        ? [
            'Los que tienen un precio escrito o no tienen precio se quedan como están.',
          ]
        : [],
  }
}
function setRounding(value) {
  rounding.value = value
  try {
    localStorage.setItem(ROUNDING_KEY, value)
  } catch {
    // Just not remembered.
  }
}

// ── actions (the bolt) ────────────────────────────────────────────────
const exporting = ref(false)
const fileInput = ref(null)
const canWrite = computed(() => Boolean(boot.value?.can_write))
const actionGroups = computed(() => [
  {
    key: 'precios',
    title: 'Precios',
    items: [
      {
        key: 'ajustar',
        label: 'Ajustar precios',
        icon: 'lucide-percent',
        hint: seleccion.count
          ? 'A los productos elegidos'
          : 'A los productos que ves, con una regla',
        reason: 'Necesitas permiso de precios',
        allowed: canWrite.value && shownRows.value.length > 0,
      },
      {
        key: 'siguen-igual',
        label: 'Todos siguen igual',
        icon: 'lucide-check',
        hint: 'Confirma el precio de los que ves',
        reason: 'Necesitas permiso de precios',
        allowed: canWrite.value && shownRows.value.length > 0,
      },
      {
        key: 'seleccionar',
        label: 'Seleccionar varios',
        icon: 'lucide-square-check-big',
        hint: 'Para ajustarlos o confirmarlos juntos',
        allowed: shownRows.value.length > 0,
      },
    ],
  },
  {
    key: 'archivo',
    title: 'Hoja de cálculo',
    items: [
      {
        key: 'exportar',
        label: exporting.value ? 'Exportando…' : 'Exportar CSV',
        icon: 'lucide-download',
        hint: 'Los productos de esta vista con su costo y precios',
        allowed: !exporting.value,
      },
      {
        key: 'importar',
        label: 'Importar CSV',
        icon: 'lucide-upload',
        hint: 'Columnas «codigo» y una por lista; los revisas antes de guardar',
        reason: 'Necesitas permiso de precios',
        allowed: canWrite.value,
      },
    ],
  },
])
const selectionActions = computed(() =>
  [
    canWrite.value && {
      key: 'ajustar',
      label: 'Ajustar precios',
      icon: 'lucide-percent',
    },
    canWrite.value && {
      key: 'siguen-igual',
      label: 'Siguen igual',
      icon: 'lucide-check',
    },
    { key: 'etiquetas', label: 'Etiquetas', icon: 'lucide-tag' },
  ].filter(Boolean),
)
function onAction({ key }) {
  if (key === 'ajustar') openBulk()
  else if (key === 'siguen-igual')
    keepRows(seleccion.count ? selectedRows.value : shownRows.value)
  else if (key === 'seleccionar') seleccion.start()
  else if (key === 'exportar') exportCsv()
  else if (key === 'importar') fileInput.value?.click()
  else if (key === 'etiquetas') router.push(etiquetasHref(seleccion.names))
}

function download(text, name) {
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function exportCsv() {
  if (exporting.value) return
  exporting.value = true
  try {
    const { rows } = seleccion.count
      ? { rows: selectedRows.value }
      : await fetchAll(scopeArgs())
    const lists = [
      activeList.value,
      ...listNames.value.filter((name) => name !== activeList.value),
    ]
    const slug =
      (mode.value.kind === 'view' ? view.value : 'seleccion') || 'precios'
    download(
      toCsv(rows, lists),
      `precios-${slug}-${boot.value?.today || 'hoy'}.csv`,
    )
    notice.value = {
      text:
        rows.length === 1
          ? 'Exporté 1 producto.'
          : `Exporté ${rows.length} productos.`,
      lines: [
        'Cambia los precios en la hoja y usa «Importar CSV» para revisarlos aquí.',
      ],
    }
  } catch (error) {
    notice.value = {
      tone: 'warning',
      text: `No pude exportar: ${problemOf(error).detail}`,
    }
  } finally {
    exporting.value = false
  }
}
async function onFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  let text
  try {
    text = await file.text()
  } catch {
    notice.value = {
      tone: 'warning',
      text: 'No pude leer el archivo. Guárdalo como CSV y vuelve a intentar.',
    }
    return
  }
  const parsed = parseCsv(text, listNames.value)
  if (!parsed.rows.length) {
    notice.value = {
      tone: 'warning',
      text: 'El archivo no trae precios que pueda usar.',
      lines: parsed.problems.slice(0, 3),
    }
    return
  }
  const lines = parsed.rows.slice(0, MAX_IMPORT)
  const codes = lines.map((line) => line.code)
  loading.value = true
  try {
    const fetched = await fetchCodes(codes)
    remember(fetched.rows)
    const result = importDrafts({ rows: lines }, known)
    for (const draft of result.drafts) onDraft(draft)
    const changed = [...new Set(result.drafts.map((draft) => draft.code))]
    mode.value = {
      kind: 'codes',
      codes: changed.length ? changed : codes,
      title: 'Del archivo',
    }
    await load()
    const notes = []
    if (result.same)
      notes.push(
        result.same === 1
          ? '1 precio ya era igual.'
          : `${result.same} precios ya eran iguales.`,
      )
    const missing = [...new Set([...fetched.unknown, ...result.missing])]
    if (missing.length)
      notes.push(
        `No encontré ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` y ${missing.length - 5} más` : ''}.`,
      )
    if (parsed.rows.length > MAX_IMPORT)
      notes.push(
        `Usé las primeras ${MAX_IMPORT} filas; importa el resto después.`,
      )
    notes.push(...parsed.problems.slice(0, 3))
    notice.value = {
      tone: missing.length || parsed.problems.length ? 'warning' : '',
      text:
        result.drafts.length === 1
          ? '1 precio nuevo del archivo. Revísalo y guarda.'
          : `${result.drafts.length} precios nuevos del archivo. Revísalos y guarda.`,
      lines: notes,
    }
  } catch (error) {
    notice.value = {
      tone: 'warning',
      text: `No pude importar: ${problemOf(error).detail}`,
    }
  } finally {
    loading.value = false
  }
}

// ── history ───────────────────────────────────────────────────────────
const historyOpen = ref(false)
const historyMounted = ref(false)
const historyItem = ref('')
function openHistory(code) {
  historyItem.value = code
  historyMounted.value = true
  historyOpen.value = true
}

// ── review and save ───────────────────────────────────────────────────
const reviewOpen = ref(false)
const reviewMounted = ref(false)
const saving = ref(false)
const saveProblem = ref(null)
const outcome = ref(null)
let pending = null // { id, body }: a lost answer retries with the same id

function openReview() {
  outcome.value = null
  saveProblem.value = null
  reviewMounted.value = true
  reviewOpen.value = true
}
const labelsTo = computed(() => {
  const codes = (outcome.value?.results || [])
    .filter((entry) => entry.ok && !entry.kept)
    .map((entry) => entry.item)
  return codes.length ? etiquetasHref(codes) : ''
})

async function save() {
  const payload = savePayload(drafts, known, acks, keep)
  if (!payload.changes.length && !payload.keep.length) return
  const body = {
    changes: JSON.stringify(payload.changes),
    keep: JSON.stringify(payload.keep),
  }
  const key = `${body.changes}\n${body.keep}`
  if (!pending || pending.key !== key) pending = { id: requestId(), key }
  saving.value = true
  saveProblem.value = null
  try {
    const answer = await preciosApi('save', { request_id: pending.id, ...body })
    pending = null
    const done = []
    for (const entry of answer?.results || []) {
      results.set(entry.item, entry)
      if (entry.ok) {
        for (const draftKeyName of [...drafts.keys()])
          if (draftKeyName.startsWith(`${entry.item}|`)) {
            drafts.delete(draftKeyName)
            acks.delete(draftKeyName)
          }
        keep.delete(entry.item)
        done.push(entry.item)
      } else if (entry.prices && known.has(entry.item)) {
        // Refused: its prices as they are now, so the draft compares to them.
        known.set(entry.item, {
          ...known.get(entry.item),
          prices: entry.prices,
        })
      }
    }
    outcome.value = answer
    if (done.length) {
      try {
        remember((await fetchCodes(done)).rows)
      } catch {
        // The saved note shows; the numbers refresh on the next load.
      }
    }
    loadCounts()
  } catch (error) {
    if (!outcomeUnknown(error)) pending = null
    saveProblem.value = problemOf(error)
  } finally {
    saving.value = false
  }
}
async function showFailed() {
  reviewOpen.value = false
  const first = (outcome.value?.results || []).find((entry) => !entry.ok)
  if (!first) return
  if (!rowCodes.value.includes(first.item))
    rowCodes.value = [first.item, ...rowCodes.value]
  await nextTick()
  scroller.value
    ?.querySelector(`[data-precio-row="${CSS.escape(first.item)}"]`)
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

// ── start ─────────────────────────────────────────────────────────────
const scroller = ref(null)
async function start() {
  boot.value = null
  bootProblem.value = ''
  try {
    boot.value = await preciosApi('bootstrap')
  } catch (error) {
    bootProblem.value = problemOf(error).detail
    return
  }
  if (!ready.value) return
  const wanted = String(route.query.lista || '')
  activeList.value = listNames.value.includes(wanted)
    ? wanted
    : boot.value.default_price_list || listNames.value[0]
  const from = startFrom(route.query)
  const views = boot.value.views || []
  view.value = views.includes(from.view) ? from.view : views[0] || 'todos'
  mode.value =
    from.kind === 'source'
      ? { kind: 'source', doctype: from.doctype, name: from.name }
      : from.kind === 'codes'
        ? { kind: 'codes', codes: from.codes }
        : { kind: 'view' }
  try {
    rounding.value = localStorage.getItem(ROUNDING_KEY) || 'centavos'
  } catch {
    rounding.value = 'centavos'
  }
  await Promise.all([load(), loadCounts(), restoreDrafts()])
}
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  start()
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
</script>
