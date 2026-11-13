<template>
  <div class="relative flex h-full flex-col overflow-hidden">
    <!-- Phone (Shell D4): the one prospects list. Title in the shell bar;
         the search pill opens the kind and source filters and the prospects
         opened lately (ui/SearchPanel, as in Tratos). -->
    <SearchPanel
      v-if="isPhone"
      v-model:open="searchOpen"
      :query="q"
      placeholder="Buscar nombre, teléfono o correo"
      label="Buscar prospectos"
      @update:query="onPanelQuery"
    >
      <template v-if="activeChips.length" #active>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="chip in activeChips"
            :key="chip.key"
            type="button"
            :class="chipClass(true)"
            :aria-label="`Quitar filtro ${chip.label}`"
            @click="chip.clear"
          >
            {{ chip.label }}
            <span class="lucide-x size-3 flex-none" aria-hidden="true" />
          </button>
        </div>
      </template>
      <RecentPicks
        v-if="!q"
        :picks="recent.picks.value"
        @pick="openRecent"
        @clear="recent.clear()"
      />
      <ChipGroup
        v-if="inquiriesEnabled"
        label="Tipo"
        :options="kindOptions"
        :model-value="kind"
        testid="prospects-kind"
        @update:model-value="setKind"
      />
      <ChipGroup
        v-if="sources.length > 1 || source"
        label="Origen"
        :options="sourceOptions"
        :model-value="source"
        testid="prospects-source"
        @update:model-value="setSource"
      />
    </SearchPanel>
    <!-- Desktop: the shell's list header (Compras): the title with its count,
         one filled button, the kinds as the tab row beside the search, the
         sources as chips under it. -->
    <header v-else class="px-4 pb-3 pt-5 sm:px-6" data-prospectos-encabezado>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div class="min-w-0 flex-1 basis-56">
          <h1
            class="title-face truncate text-3xl font-semibold leading-tight text-ink-gray-9"
          >
            Prospectos<span
              v-if="total !== null"
              class="num ml-2 font-normal text-ink-gray-5"
              data-testid="prospects-total"
              >{{ total }}</span
            >
          </h1>
          <p class="truncate text-sm text-ink-gray-6">
            Quién espera respuesta, del más reciente al más antiguo.
          </p>
        </div>
        <div class="flex flex-none items-center gap-2">
          <div
            class="flex items-center gap-0.5 rounded-full bg-surface-gray-2 p-0.5"
          >
            <Dropdown :options="moreMenu" align="end">
              <button
                type="button"
                class="press flex size-9 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-3 hover:text-ink-gray-9"
                aria-label="Más opciones"
                title="Más opciones"
                data-testid="prospects-more"
              >
                <span class="lucide-ellipsis size-5" aria-hidden="true" />
              </button>
            </Dropdown>
          </div>
          <button
            v-if="inquiriesEnabled"
            type="button"
            :class="['press', BTN.tonal]"
            data-testid="prospects-new-inquiry"
            @click="
              router.push({
                path: '/inquiries',
                query: { capture: '1', list: listPath },
              })
            "
          >
            <span class="lucide-message-square size-4" aria-hidden="true" />
            Registrar consulta
          </button>
          <button
            type="button"
            :class="['press', BTN.filled]"
            data-testid="prospects-new"
            @click="showLeadModal = true"
          >
            <span class="lucide-plus size-4" aria-hidden="true" />
            Nuevo prospecto
          </button>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div v-if="inquiriesEnabled" class="w-fit max-w-full">
          <Segmented
            :model-value="kind"
            :options="kindOptions"
            label="Tipo"
            fit="content"
            data-testid="prospects-kind"
            @update:model-value="setKind"
          />
        </div>
        <label
          class="ml-auto flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-gray-2 px-3.5 focus-within:ring-2 focus-within:ring-outline-gray-4 sm:max-w-xs"
        >
          <span
            :class="[
              loading && q
                ? 'lucide-loader-circle animate-spin'
                : 'lucide-search',
              'size-4 flex-none text-ink-gray-5',
            ]"
            aria-hidden="true"
          />
          <input
            v-model="q"
            type="search"
            enterkeyhint="search"
            class="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-0"
            placeholder="Buscar nombre, teléfono o correo"
            aria-label="Buscar prospectos"
            data-list-search
            @input="searchSoon"
          />
        </label>
      </div>
      <div
        v-if="sources.length > 1 || source"
        class="mt-3 flex flex-wrap gap-1.5"
        role="group"
        aria-label="Origen"
        data-testid="prospects-source"
      >
        <button
          v-for="chip in sourceOptions"
          :key="chip.value"
          type="button"
          :class="chipClass(source === chip.value)"
          :aria-pressed="source === chip.value"
          @click="setSource(source === chip.value ? '' : chip.value)"
        >
          {{ chip.label }}
          <span class="num font-normal">{{ chip.count }}</span>
        </button>
      </div>
    </header>

    <div
      ref="scroller"
      class="flex-1 overflow-auto"
      :class="isPhone ? 'pb-24' : 'pb-6'"
      data-testid="prospects-list"
    >
      <!-- A failed read keeps what is on screen and says what to do. -->
      <div
        v-if="error"
        class="mx-4 my-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-6 bg-surface-red-1 px-3 py-2 text-sm text-ink-red-7 sm:mx-6"
        role="alert"
        data-testid="prospects-error"
      >
        <span class="min-w-0 flex-1"
          ><strong>No se pudo cargar la lista.</strong> {{ errorText }}</span
        >
        <button
          type="button"
          class="press min-h-11 rounded-full px-3 font-medium text-ink-gray-9 hover:bg-surface-red-2 sm:min-h-8"
          @click="retry"
        >
          Reintentar
        </button>
      </div>
      <div
        v-if="loading && !rows.length"
        class="px-4 py-3 text-sm text-ink-gray-6 sm:px-6"
        role="status"
      >
        Cargando prospectos…
      </div>
      <div
        v-else-if="!rows.length && !error"
        class="px-4 py-10 text-center text-sm text-ink-gray-6"
      >
        <p class="font-medium text-ink-gray-8">
          {{
            q || kind || source
              ? 'Ningún prospecto coincide con estos filtros.'
              : 'No hay prospectos esperando.'
          }}
        </p>
        <button
          v-if="q || kind || source"
          type="button"
          :class="['press mt-3', BTN.tonal]"
          @click="clearFilters"
        >
          Quitar filtros
        </button>
      </div>
      <!-- Where the list has room it reads as a table: one header, a column
           per fact (useTableWidth: the list's own width, not the window). -->
      <template v-else-if="table">
        <div
          class="flex items-center border-b border-outline-gray-1 text-sm text-ink-gray-6"
          data-testid="prospects-columns"
        >
          <label
            class="flex w-10 flex-none cursor-pointer items-center justify-end"
            :aria-label="allSelected ? 'Quitar selección' : 'Seleccionar todos'"
          >
            <input
              type="checkbox"
              class="h-5 w-5 rounded-4"
              :checked="allSelected"
              :indeterminate.prop="selected.size > 0 && !allSelected"
              :disabled="!leadRows.length"
              @change="toggleAll"
            />
          </label>
          <span
            class="prospectos-fila min-w-0 flex-1 py-2 pl-2 pr-4 sm:pr-6"
            :class="{ 'con-puntaje': hasScore }"
            aria-hidden="true"
          >
            <span>Nombre</span>
            <span>Origen</span>
            <span>Estado</span>
            <span v-if="hasScore" class="text-right">Puntaje</span>
            <span>Seguimiento</span>
            <span class="text-right">Esperando</span>
          </span>
        </div>
        <ul class="divide-y divide-outline-gray-1">
          <li
            v-for="row in rows"
            :key="rowKey(row)"
            class="flex items-start"
            :class="selected.has(row.name) ? 'bg-surface-blue-1' : ''"
            :data-fresh="live.fresh.value.has(rowKey(row)) ? '' : undefined"
          >
            <label
              v-if="row.kind === 'lead'"
              class="flex min-h-14 w-10 flex-none cursor-pointer items-center justify-end"
              :aria-label="`Seleccionar ${prospectName(row)}`"
            >
              <input
                type="checkbox"
                class="h-5 w-5 rounded-4"
                :checked="selected.has(row.name)"
                @change="toggle(row)"
              />
            </label>
            <span v-else class="w-10 flex-none" />
            <RouterLink
              :to="prospectRoute(row, { list: listPath })"
              class="prospectos-fila min-h-14 min-w-0 flex-1 py-2 pl-2 pr-4 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:pr-6"
              :class="{ 'con-puntaje': hasScore }"
              data-testid="prospect-row"
              @click="touchRecent(row)"
            >
              <span class="min-w-0">
                <span
                  class="block truncate text-base font-medium text-ink-gray-9"
                  :title="prospectName(row)"
                  >{{ prospectName(row) }}</span
                >
                <span class="block truncate text-sm text-ink-gray-6">{{
                  secondLine(row)
                }}</span>
              </span>
              <span class="break-words text-sm text-ink-gray-8">{{
                sourceWord(row)
              }}</span>
              <span class="break-words text-sm text-ink-gray-8">{{
                rowStatus(row)
              }}</span>
              <span v-if="hasScore" class="text-right">
                <!-- The breakdown opens in place: the capture handler keeps
                     the row's link from following (the popover stops the
                     click from reaching the link's own handler). -->
                <span
                  v-if="scores[row.name]?.grade"
                  class="inline-flex"
                  @click.capture.prevent
                >
                  <ScoreExplainPopover
                    doctype="CRM Lead"
                    :name="row.name"
                    :score="scores[row.name].score"
                    :grade="scores[row.name].grade"
                    variant="quiet"
                  >
                    <template #trigger>
                      {{ scores[row.name].score ?? '' }}
                      <span class="text-xs font-semibold text-ink-gray-6">{{
                        scores[row.name].grade
                      }}</span>
                    </template>
                  </ScoreExplainPopover>
                </span>
                <span v-else class="num text-sm text-ink-gray-7">{{
                  scores[row.name]?.score ?? ''
                }}</span>
              </span>
              <span
                class="text-sm"
                :class="
                  isOverdue(row)
                    ? 'font-medium text-ink-red-7'
                    : 'text-ink-gray-8'
                "
                >{{ followUp(row) }}</span
              >
              <span class="num text-right text-sm text-ink-gray-6">{{
                waitingLabel(row.modified)
              }}</span>
            </RouterLink>
          </li>
        </ul>
      </template>
      <div v-else>
        <ListRow
          v-for="row in rows"
          :key="rowKey(row)"
          :data-fresh="live.fresh.value.has(rowKey(row)) ? '' : undefined"
          :avatar="avatarName(row)"
          :title="prospectName(row)"
          :subtitle="phoneLine(row)"
          :meta="rowMeta(row)"
          :meta-tone="isOverdue(row) ? 'danger' : ''"
          :to="prospectRoute(row, { list: listPath })"
          data-testid="prospect-row"
          @click="touchRecent(row)"
        />
      </div>
      <button
        v-if="hasMore && rows.length"
        type="button"
        class="flex min-h-12 w-full items-center justify-center text-base-medium text-ink-gray-8 hover:bg-surface-gray-1"
        :disabled="loading"
        data-testid="prospects-load-more"
        @click="loadMore"
      >
        {{ loading ? 'Cargando…' : 'Cargar más' }}
      </button>
    </div>
    <PowerBulkBar
      v-if="table && selected.size"
      :count="selected.size"
      :summary="
        selected.size === 1
          ? '1 prospecto seleccionado'
          : `${selected.size} prospectos seleccionados`
      "
      label="Prospectos seleccionados"
      @clear="selected = new Set()"
    >
      <button
        type="button"
        :class="['press', BTN.filled]"
        :disabled="converting"
        data-testid="prospects-convert"
        @click="convertSelected"
      >
        <span class="lucide-briefcase size-4" aria-hidden="true" />
        {{ selected.size === 1 ? 'Convertir en trato' : 'Convertir en tratos' }}
      </button>
    </PowerBulkBar>
    <Fab v-if="isPhone" label="Nuevo prospecto" @click="createNew" />
    <BottomSheet v-model:open="createOpen" title="Nuevo" flush>
      <ListRow
        icon="lucide-user-plus"
        title="Prospecto"
        subtitle="Alguien interesado en comprar"
        @click="newLead"
      />
      <ListRow
        icon="lucide-message-square"
        title="Consulta"
        subtitle="Una pregunta que alguien dejó"
        :to="{ path: '/inquiries', query: { capture: '1', list: listPath } }"
        @click="createOpen = false"
      />
    </BottomSheet>
    <LeadModal v-if="showLeadModal" v-model="showLeadModal" />
    <ConvertToDealModal
      v-if="converting"
      :key="converting.name"
      v-model="convertOpen"
      :lead="converting"
      @pending="convertPending = $event"
      @converted="onConverted"
    />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { formatDue, statusLabel } from '@/utils/display'
import { Dropdown, call, toast } from 'frappe-ui'
import { BottomSheet, Fab, ListRow, Segmented } from '@/components/ui'
import ChipGroup from '@/components/ui/ChipGroup.vue'
import RecentPicks from '@/components/ui/RecentPicks.vue'
import SearchPanel from '@/components/ui/SearchPanel.vue'
import { chipClass } from '@/components/ui/chipClass'
import PowerBulkBar from '@/components/power/PowerBulkBar.vue'
import { useRecentPicks } from '@/composables/useRecentPicks'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { useTableWidth } from '@/composables/useTableWidth'
import { useLiveList } from '@/composables/liveList'
import { formatPhone } from '@/composables/crmFormat'
import { ADDON_APP, hasApp } from '@/utils/crmCapabilities'
import {
  KIND_CHIPS,
  KIND_LABELS,
  isOverdue,
  nameIsContact,
  prospectArgs,
  prospectName,
  prospectRoute,
  sourceWord,
  waitingLabel,
} from '@/utils/prospects'

const PAGE = 30
// The most rows crm.api.prospects reads at once.
const LIVE_MAX = 100
// The header's buttons: one filled, one tonal (Compras).
const BTN = Object.freeze({
  filled:
    'inline-flex h-10 items-center gap-2 rounded-full bg-surface-gray-10 px-4 text-sm font-medium text-ink-base hover:bg-surface-gray-9 disabled:opacity-50',
  tonal:
    'inline-flex h-10 items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-3 disabled:opacity-50',
})
// Initials only for a real name: «PN» for «Prospecto sin nombre», or digits
// from a phone, read as a person who is not there — show the silhouette.
function avatarName(row) {
  return nameIsContact(row) || /sin (nombre|título)$/.test(prospectName(row))
    ? ''
    : prospectName(row)
}
const route = useRoute()
const router = useRouter()
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const kind = ref(
  ['lead', 'inquiry'].includes(route.query.tipo) ? route.query.tipo : '',
)
const source = ref(
  typeof route.query.origen === 'string' ? route.query.origen : '',
)
const rows = ref([])
const sources = ref([])
const counts = ref({ lead: 0, inquiry: 0 })
const start = ref(0)
const hasMore = ref(false)
const loading = ref(false)
const loaded = ref(false)
const error = ref(null)
// Opens on «Nuevo prospecto» only; it carries the field layout and the text
// editor (bundle budget, SPEC §4).
const LeadModal = defineAsyncComponent(
  () => import('@/components/Modals/LeadModal.vue'),
)
const ConvertToDealModal = defineAsyncComponent(
  () => import('@/components/Modals/ConvertToDealModal.vue'),
)
// Only where the shop scores its leads (doco_marketing).
const ScoreExplainPopover = defineAsyncComponent(
  () => import('@/components/doco/ScoreExplainPopover.vue'),
)
const showLeadModal = ref(false)
const createOpen = ref(false)
// The upstream leads list keeps what this one does not: the stage filters,
// the board, Excel and delete (as Tratos' «Vista clásica»).
const moreMenu = [
  {
    label: 'Vista clásica (todos los filtros)',
    onClick: () =>
      router.push({ path: '/leads/view', query: { classic: '1' } }),
  },
]
const inquiriesEnabled = ref(false)

const scroller = ref(null)
const wide = useTableWidth(scroller)
const table = computed(() => !isPhone.value && wide.value)
// The list's own address: an inquiry's back arrow returns to it.
const listPath = computed(() => route.fullPath || '/prospectos')

// The kinds with their counts; there is only one kind without Consultas.
const kindOptions = computed(() =>
  KIND_CHIPS.map((chip) => ({
    value: chip.value,
    label: chip.label,
    count: chip.value
      ? counts.value[chip.value] || 0
      : counts.value.lead + counts.value.inquiry,
  })),
)
const sourceOptions = computed(() =>
  sources.value.map((s) => ({ value: s.key, label: s.label, count: s.count })),
)
// How many the list holds with the filters on (the search too: the server
// counts within it).
const total = computed(() => {
  if (!loaded.value) return null
  if (source.value)
    return sources.value.find((s) => s.key === source.value)?.count ?? null
  if (kind.value) return counts.value[kind.value] || 0
  return counts.value.lead + counts.value.inquiry
})
// Closed search: the kind and source that narrow the list, each with its ×.
const activeChips = computed(() => {
  const out = []
  const kindChip = kind.value && KIND_CHIPS.find((c) => c.value === kind.value)
  if (kindChip)
    out.push({ key: 'kind', label: kindChip.label, clear: () => setKind('') })
  const sourceChip =
    source.value && sources.value.find((s) => s.key === source.value)
  if (source.value)
    out.push({
      key: 'source',
      label: sourceChip?.label || source.value,
      clear: () => setSource(''),
    })
  return out
})
const searchOpen = ref(false)
function onPanelQuery(text) {
  q.value = text
  searchSoon()
}
// The prospects opened lately on this device, as bubbles in the panel.
const recent = useRecentPicks('muelle:prospectos-recent')
function touchRecent(row) {
  recent.touch({ name: row.name, doctype: row.kind, label: prospectName(row) })
  searchOpen.value = false
}
function openRecent(pick) {
  searchOpen.value = false
  router.push(
    prospectRoute(
      { name: pick.name, kind: pick.doctype },
      { list: listPath.value },
    ),
  )
}
// How to reach them, unless the name already is that.
function reach(row) {
  if (nameIsContact(row)) return ''
  return row.phone ? formatPhone(row.phone) : row.email
}
// Phone line 2: how to reach them and where they came from.
function phoneLine(row) {
  return [row.kind === 'inquiry' && 'Consulta', reach(row), sourceWord(row)]
    .filter(Boolean)
    .join(' · ')
}
// Table line 2: what it is (an inquiry, a company) and how to reach them.
function secondLine(row) {
  return [row.kind === 'inquiry' ? KIND_LABELS.inquiry : row.detail, reach(row)]
    .filter(Boolean)
    .join(' · ')
}
function rowStatus(row) {
  return row.status ? statusLabel(row.status, row.kind) : ''
}
function followUp(row) {
  return row.next_action_at
    ? formatDue(row.next_action_at).label
    : 'Sin seguimiento'
}
// Trailing meta: the due follow-up, else how long they have waited.
function rowMeta(row) {
  if (row.next_action_at) return formatDue(row.next_action_at).label
  return waitingLabel(row.modified)
}
function createNew() {
  if (inquiriesEnabled.value) createOpen.value = true
  else showLeadModal.value = true
}
function newLead() {
  createOpen.value = false
  showLeadModal.value = true
}

const errorText = computed(
  () =>
    error.value?.messages?.[0] ||
    error.value?.message ||
    'Revisa tu conexión e inténtalo de nuevo.',
)
// The score column shows where the shop scores its leads (doco_marketing's
// lead_score and score_grade): read for the leads on screen, after the rows.
const scores = ref({})
const hasScore = computed(() =>
  rows.value.some((row) => scores.value[row.name]?.score != null),
)
let scoresSeq = 0
async function loadScores() {
  if (!hasApp(ADDON_APP) || isPhone.value) return
  const names = leadRows.value.map((row) => row.name)
  if (!names.length) return
  const mine = ++scoresSeq
  try {
    const found = await call('frappe.client.get_list', {
      doctype: 'CRM Lead',
      fields: ['name', 'lead_score', 'score_grade'],
      filters: { name: ['in', names] },
      limit_page_length: names.length,
    })
    if (mine !== scoresSeq) return
    const next = {}
    for (const row of found || [])
      next[row.name] = { score: row.lead_score, grade: row.score_grade }
    scores.value = next
  } catch {
    // A site without scores: the column stays away.
  }
}

let seq = 0
let lastLoad = [0, {}]
// `quiet` (a live refresh): the rows already shown are read again in place,
// and a failed read keeps them. A failed read never empties the list either:
// it says so above the rows, and «Reintentar» asks the same thing again.
async function load(at = 0, { append = false, quiet = false } = {}) {
  const mine = ++seq
  if (!quiet) lastLoad = [at, { append }]
  loading.value = !quiet
  try {
    const page = await call(
      'crm.api.prospects.list_prospects',
      prospectArgs({
        kind: kind.value,
        source: source.value,
        q: q.value,
        start: at,
        pageLength: quiet
          ? Math.min(LIVE_MAX, Math.max(PAGE, rows.value.length))
          : PAGE,
      }),
    )
    if (mine !== seq) return
    rows.value = append
      ? [...rows.value, ...(page.rows || [])]
      : page.rows || []
    sources.value = page.sources || []
    inquiriesEnabled.value = !!page.inquiries_enabled
    counts.value = page.counts || { lead: 0, inquiry: 0 }
    hasMore.value = !!page.has_more
    loaded.value = true
    error.value = null
    if (!quiet) start.value = at
    pruneSelection()
    loadScores()
    // A link to Consultas where the shop has none: show every prospect.
    if (kind.value === 'inquiry' && !inquiriesEnabled.value) setKind('')
  } catch (e) {
    if (mine === seq && !quiet) error.value = e
  } finally {
    if (mine === seq) loading.value = false
  }
}
function loadMore() {
  load(start.value + PAGE, { append: true })
}
function retry() {
  load(...lastLoad)
}

// Filters live in the URL, so the way back from a lead keeps them.
function syncQuery() {
  const query = {}
  if (q.value.trim()) query.q = q.value.trim()
  if (kind.value) query.tipo = kind.value
  if (source.value) query.origen = source.value
  router.replace({ query })
}
let timer = null
function searchSoon() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    syncQuery()
    load(0)
  }, 250)
}
function setKind(value) {
  kind.value = value || ''
  syncQuery()
  load(0)
}
function setSource(value) {
  source.value = value || ''
  syncQuery()
  load(0)
}
function clearFilters() {
  q.value = ''
  kind.value = ''
  source.value = ''
  syncQuery()
  load(0)
}

// Selection (desktop table): leads only, since an inquiry converts in
// Consultas. It holds only rows on screen, so a filter never hides a pick.
const selected = ref(new Set())
const leadRows = computed(() => rows.value.filter((r) => r.kind === 'lead'))
const allSelected = computed(
  () =>
    leadRows.value.length > 0 &&
    leadRows.value.every((row) => selected.value.has(row.name)),
)
function toggle(row) {
  const next = new Set(selected.value)
  if (next.has(row.name)) next.delete(row.name)
  else next.add(row.name)
  selected.value = next
}
function toggleAll() {
  selected.value = allSelected.value
    ? new Set()
    : new Set(leadRows.value.map((row) => row.name))
}
function pruneSelection() {
  if (!selected.value.size) return
  const shown = new Set(leadRows.value.map((row) => row.name))
  const kept = [...selected.value].filter((name) => shown.has(name))
  if (kept.length !== selected.value.size) selected.value = new Set(kept)
}

// Converting several: each prospect is reviewed in its own form (who they
// are, which company), one after another; a converted one leaves the
// selection, closing the form stops the walk and keeps the rest.
const converting = ref(null)
const convertOpen = ref(false)
const convertPending = ref(false)
let convertedCount = 0
function convertNext() {
  const name = [...selected.value][0]
  const row = rows.value.find((r) => r.name === name)
  if (!row) {
    converting.value = null
    return
  }
  converting.value = { ...row, lead_name: row.title }
  convertOpen.value = true
}
function convertSelected() {
  if (convertPending.value || !selected.value.size) return
  convertedCount = 0
  convertNext()
}
// A refused conversion keeps its form open: the form says why, keeps what
// the worker filled in and offers to try again.
function onConverted() {
  const next = new Set(selected.value)
  next.delete(converting.value?.name)
  selected.value = next
  convertedCount += 1
  convertOpen.value = false
  if (selected.value.size) setTimeout(convertNext, 0)
}
// The walk ends when the last form closes, converted or not: one toast for
// what was converted, and the list read again from the top.
watch(convertOpen, (open) => {
  if (open || convertPending.value) return
  setTimeout(() => {
    if (convertOpen.value) return // the next lead's form is already open
    converting.value = null
    if (!convertedCount) return
    toast.success(
      convertedCount === 1
        ? 'Se creó 1 trato.'
        : `Se crearon ${convertedCount} tratos.`,
    )
    convertedCount = 0
    load(0)
  }, 0)
})

load(0)

// A lead or inquiry that comes in, or one a teammate works, shows without a
// reload; a new one is marked for a moment. The server reads at most
// LIVE_MAX rows at once: a list grown past that by «Cargar más» is left as
// it is.
const rowKey = (row) => `${row.kind}:${row.name}`
const live = useLiveList(['CRM Lead', 'CRM Inquiry'], async () => {
  if (rows.value.length > LIVE_MAX) return
  const before = rows.value.map(rowKey)
  await load(0, { quiet: true })
  live.mark(before, rows.value.map(rowKey))
})
</script>
<style scoped>
/* The table's columns: name with its second line, source, status, (score),
   follow-up, waiting time. Scoped, not Tailwind arbitrary values. */
.prospectos-fila {
  display: grid;
  grid-template-columns:
    minmax(0, 2.4fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.3fr)
    6.5rem;
  column-gap: 1rem;
  align-items: center;
}
.prospectos-fila.con-puntaje {
  grid-template-columns:
    minmax(0, 2.4fr) minmax(0, 1fr) minmax(0, 1fr) 4.5rem minmax(0, 1.3fr)
    6.5rem;
}
</style>
