<!--
  Leads list — FCRM redesign (handoff §5.2). Dense pro-tool table with Stage/Score/
  Source filters + live search + bulk select + New Lead modal. New page (upstream
  Leads.vue left untouched for rebase-cleanliness); data via createListResource.
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-white">
    <!-- toolbar -->
    <div class="flex min-h-[52px] flex-none flex-wrap items-center justify-between gap-y-1.5 border-b border-outline-gray-1 px-5 py-1.5">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Leads') }}</span>
        <span class="rounded-full bg-surface-gray-2 px-[9px] py-0.5 text-[11.5px] font-semibold text-ink-gray-6">
          {{ count }}
        </span>
        <div class="mx-1 h-[18px] w-px bg-outline-gray-2" />
        <div class="flex overflow-hidden rounded-lg border border-outline-gray-2">
          <button
            v-for="(v, i) in views"
            :key="v.key"
            class="inline-flex items-center gap-1 px-[11px] py-[5px] text-[12px]"
            :class="[i ? 'border-l border-outline-gray-2' : '', v.key === view ? 'bg-surface-gray-3 text-ink-gray-9 font-semibold' : 'bg-surface-white text-ink-gray-6']"
            @click="selectView(v)"
          >
            {{ v.label }}
          </button>
        </div>
        <div class="mx-1 h-[18px] w-px bg-outline-gray-2" />
        <FilterPopover :label="__('Stage')" :options="stageOptions" :selected="statusF" @update:selected="statusF = $event" />
        <FilterPopover :label="__('Score')" :options="scoreOptions" :selected="gradeF" @update:selected="gradeF = $event" />
        <FilterPopover :label="__('Source')" :options="sourceOptions" :selected="sourceF" @update:selected="sourceF = $event" />
      </div>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1.5 rounded-lg border border-outline-gray-2 px-2.5 py-1.5">
          <LucideSearch class="h-3.5 w-3.5 text-ink-gray-4" />
          <input
            :value="search"
            @input="onSearch($event.target.value)"
            :placeholder="__('Buscar leads…')"
            class="w-[140px] border-0 bg-transparent text-[12px] text-ink-gray-9 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
          />
        </div>
        <Dropdown :options="viewMenu">
          <button class="rounded-lg border border-outline-gray-2 px-3 py-[7px] text-[12px] font-medium text-ink-gray-7">
            {{ __('Vistas') }} ⌄
          </button>
        </Dropdown>
        <ColumnPicker
          v-if="view === 'list'"
          :columns="LEAD_COLUMNS"
          :selected="visibleCols"
          @update:selected="setCols"
          @reset="resetCols"
        />
        <button
          class="rounded-lg border border-outline-gray-2 px-3 py-[7px] text-[12px] font-medium text-ink-gray-7"
          :title="__('Exportar a Excel')"
          @click="exportLeads"
        >
          ⭳ {{ __('Export') }}
        </button>
        <button
          class="rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold text-white"
          style="background: var(--brand)"
          @click="showLeadModal = true"
        >
          + {{ __('New Lead') }}
        </button>
      </div>
    </div>

    <!-- active filter chips -->
    <div v-if="chips.length" class="flex flex-none flex-wrap items-center gap-2 border-b border-outline-gray-1 px-5 py-2">
      <span
        v-for="c in chips"
        :key="c.key"
        class="inline-flex items-center gap-1.5 rounded-[7px] border border-outline-green-2 bg-surface-green-2 px-2 py-1 text-[11.5px] font-medium text-ink-green-3"
      >
        {{ c.label }}
        <button class="text-[13px] leading-none" @click="removeChip(c)">×</button>
      </span>
      <button class="text-[11.5px] text-ink-gray-5" @click="clearAll">{{ __('Limpiar todo') }}</button>
    </div>

    <!-- bulk bar -->
    <div v-if="selectedRows.length" class="flex flex-none items-center gap-3 border-b border-outline-gray-1 bg-surface-gray-1 px-5 py-2">
      <span class="text-[12.5px] font-semibold text-ink-gray-8">{{ selectedRows.length }} {{ __('seleccionados') }}</span>
      <button class="rounded-md px-2.5 py-1 text-[12px] font-medium text-ink-blue-link hover:bg-surface-gray-2" @click="bulkConvert">
        {{ __('Convertir a tratos') }}
      </button>
      <button class="rounded-md px-2.5 py-1 text-[12px] font-medium text-ink-red-4 hover:bg-surface-red-1" @click="bulkDelete">
        {{ __('Eliminar') }}
      </button>
      <button class="text-[12px] text-ink-gray-5" @click="selectedRows = []">{{ __('Deseleccionar') }}</button>
    </div>

    <!-- list view -->
    <template v-if="view === 'list'">
    <!-- table header -->
    <div
      class="grid flex-none items-center border-b border-outline-gray-1 bg-surface-gray-1 px-5 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-gray-4"
      :style="`grid-template-columns:${GRID};height:34px`"
    >
      <input v-if="!isMobile" type="checkbox" class="cb-token" :checked="allSelected" @change="toggleAll" />
      <button class="text-left uppercase" @click="sortBy('lead_name')">{{ __('Contacto') }}{{ sortArrow('lead_name') }}</button>
      <button v-if="col('score')" class="text-left uppercase" :style="'color:var(--brand)'" @click="sortBy('lead_score')">{{ __('Score') }}{{ sortArrow('lead_score') }}</button>
      <div v-if="col('stage')">{{ __('Stage') }}</div>
      <div v-if="col('source')">{{ __('Source') }}</div>
      <button v-if="col('modified')" class="text-left uppercase" @click="sortBy('modified')">{{ __('Última act.') }}{{ sortArrow('modified') }}</button>
      <div v-if="col('owner')">{{ __('Owner') }}</div>
      <div />
    </div>

    <!-- rows -->
    <div class="scb min-h-0 flex-1 overflow-y-auto">
      <div v-if="leads.loading && !rows.length" class="py-10 text-center text-xs text-ink-gray-4">{{ __('Cargando…') }}</div>
      <div v-else-if="!rows.length" class="py-10 text-center text-xs text-ink-gray-4">{{ __('Sin leads') }}</div>

      <div
        v-for="r in rows"
        :key="r.name"
        class="grid cursor-pointer items-center border-b border-outline-gray-1 px-5 hover:bg-surface-gray-2"
        :style="`grid-template-columns:${GRID};min-height:50px`"
        @click="openLead(r.name)"
      >
        <input v-if="!isMobile" type="checkbox" class="cb-token" :checked="selectedRows.includes(r.name)" @click.stop="toggleRow(r.name)" />
        <div class="flex items-center gap-2">
          <span
            class="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-semibold"
            :style="`background:${avatarColor(label(r))[0]};color:${avatarColor(label(r))[1]}`"
          >
            {{ initials(label(r)) }}
          </span>
          <div class="min-w-0">
            <div class="truncate text-[13px] font-semibold text-ink-gray-9">{{ label(r) }}</div>
            <div class="truncate text-[11px] text-ink-gray-4">{{ r.organization || r.mobile_no || '—' }}</div>
          </div>
        </div>
        <div v-if="col('score')">
          <div class="mb-[3px] flex items-center justify-between" style="width: 62px">
            <span class="text-[12.5px] font-bold" :style="`color:${gradeColor(r.score_grade)}`">{{ r.lead_score ?? '—' }}</span>
            <ScoreExplainPopover
              v-if="r.score_grade"
              doctype="CRM Lead"
              :name="r.name"
              :score="r.lead_score"
              :grade="r.score_grade"
              variant="chip"
            />
          </div>
          <div class="h-1 rounded-sm bg-surface-gray-3" style="width: 62px">
            <div class="h-full rounded-sm" :style="`width:${Math.min(100, r.lead_score || 0)}%;background:${gradeColor(r.score_grade)}`" />
          </div>
        </div>
        <div v-if="col('stage')">
          <span
            v-if="r.status"
            class="rounded-md px-2 py-[3px] text-[11.5px] font-semibold"
            :style="statusChip(r.status)"
          >
            {{ r.status }}
          </span>
        </div>
        <div v-if="col('source')" class="flex items-center gap-1.5 text-[12px] text-ink-gray-6">
          <span v-if="r.source" class="h-[7px] w-[7px] flex-none rounded-full" :style="`background:${sourceDot(r.source)}`" />
          <span class="truncate">{{ r.source || '—' }}</span>
        </div>
        <div v-if="col('modified')" class="text-[12px] text-ink-gray-5">{{ timeAgo(r.modified) }}</div>
        <div v-if="col('owner')">
          <span
            v-if="r.lead_owner"
            class="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[10px] font-semibold"
            :style="`background:${avatarColor(r.lead_owner)[0]};color:${avatarColor(r.lead_owner)[1]}`"
            :title="r.lead_owner"
          >
            {{ initials(ownerName(r.lead_owner)) }}
          </span>
        </div>
        <Dropdown :options="rowMenu(r)" @click.stop>
          <button class="text-[14px] text-ink-gray-4" @click.stop>···</button>
        </Dropdown>
      </div>

      <div v-if="leads.hasNextPage" class="py-3 text-center">
        <button class="rounded-lg border border-outline-gray-2 px-4 py-1.5 text-[12px] font-medium text-ink-gray-7" @click="leads.next()">
          {{ __('Cargar más') }}
        </button>
      </div>
    </div>
    </template>

    <!-- board view -->
    <BoardView
      v-else-if="view === 'board'"
      :rows="rows"
      :groups="stageOptions"
      :counts="groupCounts"
      group-field="status"
      @card-click="(r) => openLead(r.name)"
      @change="onBoardChange"
    >
      <template #card="{ row }">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="truncate text-[12.5px] font-semibold text-ink-gray-9">{{ label(row) }}</div>
            <div class="truncate text-[11px] text-ink-gray-4">{{ row.organization || row.mobile_no || '—' }}</div>
          </div>
          <ScoreExplainPopover
            v-if="row.score_grade"
            doctype="CRM Lead"
            :name="row.name"
            :score="row.lead_score"
            :grade="row.score_grade"
            variant="card"
          />
        </div>
      </template>
    </BoardView>

    <!-- funnel view -->
    <FunnelView v-else-if="view === 'funnel'" :groups="stageOptions" :counts="groupCounts" />

    <LeadModal v-if="showLeadModal" v-model="showLeadModal" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { isMobile } from '@/composables/breakpoint'
import { Dropdown, createListResource, call as frappeCall, toast } from 'frappe-ui'
import { confirmDialog, inputDialog } from '@/utils/dialogs'
import LucideSearch from '~icons/lucide/search'
import { statusesStore } from '@/stores/statuses'
import { usersStore } from '@/stores/users'
import LeadModal from '@/components/Modals/LeadModal.vue'
import FilterPopover from '@/components/doco/leads/FilterPopover.vue'
import { userScopedKey } from '@/utils/storageKeys'
import ScoreExplainPopover from '@/components/doco/ScoreExplainPopover.vue'
import ColumnPicker from '@/components/doco/ColumnPicker.vue'
import BoardView from '@/components/doco/BoardView.vue'
import FunnelView from '@/components/doco/FunnelView.vue'
import { GRADE_COLORS, avatarColor, initials, timeAgo, CHANNEL_META } from '@/composables/crmFormat'

const router = useRouter()

// ── column config (per-browser show/hide) ─────────────────────────────────────
// contact is fixed (1fr); checkbox + row-menu are structural. The rest toggle.
const LEAD_COLUMNS = [
  { key: 'contact', label: __('Contacto'), fixed: true },
  { key: 'score', label: __('Score') },
  { key: 'stage', label: __('Stage') },
  { key: 'source', label: __('Source') },
  { key: 'modified', label: __('Última act.') },
  { key: 'owner', label: __('Owner') },
]
const COL_WIDTH = { score: '96px', stage: '130px', source: '120px', modified: '110px', owner: '50px' }
const DEFAULT_COLS = ['score', 'stage', 'source', 'modified', 'owner']
const COLS_KEY = userScopedKey('doco_leads_columns')
const visibleCols = ref(loadCols())
function loadCols() {
  try {
    const s = JSON.parse(window.localStorage.getItem(COLS_KEY) || 'null')
    const f = Array.isArray(s) ? s.filter((k) => k in COL_WIDTH) : []
    return f.length ? f : [...DEFAULT_COLS]
  } catch {
    return [...DEFAULT_COLS]
  }
}
function setCols(next) {
  visibleCols.value = next
  window.localStorage.setItem(COLS_KEY, JSON.stringify(next))
}
function resetCols() {
  setCols([...DEFAULT_COLS])
}
function col(key) {
  // phone: contact + score only — the full column set side-scrolled (07-25)
  if (isMobile.value) return key === 'contact' || key === 'score'
  return key === 'contact' || visibleCols.value.includes(key)
}
const GRID = computed(() => {
  if (isMobile.value) return '1fr 70px 26px' // contact + score + menu (no bulk-select)
  const parts = ['28px', '1fr'] // checkbox + contact (always)
  for (const key of ['score', 'stage', 'source', 'modified', 'owner']) if (col(key)) parts.push(COL_WIDTH[key])
  parts.push('26px') // row menu
  return parts.join(' ')
})
const { getLeadStatus } = statusesStore()
const { getUser } = usersStore()

const showLeadModal = ref(false)
const statusF = ref([])
const gradeF = ref([])
const sourceF = ref([])
const search = ref('')
const sort = ref({ field: 'lead_score', dir: 'desc' })
const selectedRows = ref([])
const view = ref('list')
const groupCounts = ref({})

const leads = createListResource({
  doctype: 'CRM Lead',
  fields: [
    'name', 'lead_name', 'first_name', 'last_name', 'organization', 'mobile_no',
    'status', 'source', 'lead_owner', 'lead_score', 'score_grade', 'modified',
  ],
  orderBy: 'lead_score desc',
  pageLength: 50,
})
const rows = computed(() => leads.data || [])
// loaded-row count (not the grand total); '+' signals more pages exist
const count = computed(() => `${leads.data?.length ?? 0}${leads.hasNextPage ? '+' : ''}`)

// free-text search across all common text fields (was lead_name-only → phone/email
// searches returned nothing). OR'd via or_filters (same as upstream ViewControls).
const SEARCH_FIELDS = ['lead_name', 'first_name', 'last_name', 'email', 'mobile_no', 'phone', 'organization']
function buildFilters() {
  const f = {}
  if (statusF.value.length) f.status = ['in', statusF.value]
  if (gradeF.value.length) f.score_grade = ['in', gradeF.value]
  if (sourceF.value.length) f.source = ['in', sourceF.value]
  return f
}
function searchOrFilters() {
  const q = search.value.trim()
  if (!q) return {}
  const pat = `%${q}%`
  const orf = {}
  for (const fld of SEARCH_FIELDS) orf[fld] = ['LIKE', pat]
  return orf
}
function applyFilters() {
  leads.filters = buildFilters()
  leads.orFilters = searchOrFilters()
  leads.orderBy = `${sort.value.field} ${sort.value.dir}`
  leads.reload()
  if (view.value !== 'list') loadCounts()
}

// Accurate per-status counts for the board headers + funnel (independent of the
// paginated table). One aggregate query honouring the active filters/search.
async function loadCounts() {
  try {
    const data = await frappeCall('frappe.client.get_list', {
      doctype: 'CRM Lead',
      filters: buildFilters(),
      or_filters: searchOrFilters(),
      fields: ['status', 'count(name) as count'],
      group_by: 'status',
      limit_page_length: 0,
    })
    const map = {}
    for (const r of data || []) map[r.status || ''] = { count: r.count }
    groupCounts.value = map
  } catch (e) {
    /* counts are best-effort */
  }
}

// 1-click view switch: List/Board/Funnel swap the body in place (toolbar stays);
// Cal is a genuinely separate page so it still routes.
function selectView(v) {
  if (v.to) {
    router.push(v.to)
    return
  }
  view.value = v.key
  if (v.key === 'board' && leads.pageLength < 200) {
    leads.pageLength = 200
    leads.reload()
  }
  if (v.key !== 'list') loadCounts()
}

async function onBoardChange(row, status) {
  try {
    await frappeCall('frappe.client.set_value', {
      doctype: 'CRM Lead',
      name: row.name,
      fieldname: 'status',
      value: status,
    })
    row.status = status
    toast.success(__('Stage actualizado'))
    loadCounts()
  } catch (e) {
    toast.error(e.messages?.[0] || __('No se pudo cambiar el stage'))
  }
}

// ── export (reuse Frappe's server export of ALL matching rows) ────────────────
function exportLeads() {
  const fields = JSON.stringify([
    'name', 'lead_name', 'status', 'source', 'lead_owner', 'lead_score', 'score_grade', 'mobile_no', 'organization', 'creation',
  ])
  const filters = JSON.stringify(buildFilters())
  const orFilters = JSON.stringify(searchOrFilters())
  const order_by = `${sort.value.field} ${sort.value.dir}`
  const url =
    `/api/method/frappe.desk.reportview.export_query?file_format_type=Excel&title=CRM Lead&doctype=CRM Lead` +
    `&fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(filters)}&or_filters=${encodeURIComponent(orFilters)}` +
    `&order_by=${encodeURIComponent(order_by)}&page_length=100000&start=0&view=Report&with_comment_count=0`
  window.location.href = url
}

// ── saved views (named filter presets, per-browser) ───────────────────────────
const VIEWS_KEY = userScopedKey('doco_leads_saved_views')
const savedViews = ref(loadViews())
function loadViews() {
  try {
    return JSON.parse(window.localStorage.getItem(VIEWS_KEY) || '[]')
  } catch {
    return []
  }
}
function persistViews() {
  window.localStorage.setItem(VIEWS_KEY, JSON.stringify(savedViews.value))
}
function saveCurrentView() {
  inputDialog({
    title: __('Guardar vista'),
    message: __('Nombre de la vista'),
    placeholder: __('Ej. Leads calientes'),
    confirmLabel: __('Guardar'),
    theme: 'green',
    required: true,
    onConfirm: (label) => {
      savedViews.value = savedViews.value.filter((v) => v.label !== label)
      savedViews.value.push({
        label,
        status: [...statusF.value],
        grade: [...gradeF.value],
        source: [...sourceF.value],
        search: search.value,
        sort: { ...sort.value },
      })
      persistViews()
      toast.success(__('Vista guardada'))
    },
  })
}
function applyView(v) {
  statusF.value = [...(v.status || [])]
  gradeF.value = [...(v.grade || [])]
  sourceF.value = [...(v.source || [])]
  search.value = v.search || ''
  if (v.sort) sort.value = { ...v.sort }
  applyFilters()
}
function deleteView(label) {
  savedViews.value = savedViews.value.filter((v) => v.label !== label)
  persistViews()
}
const viewMenu = computed(() => [
  ...savedViews.value.map((v) => ({ label: v.label, onClick: () => applyView(v) })),
  ...(savedViews.value.length ? [{ label: '—', onClick: () => {} }] : []),
  { label: '＋ ' + __('Guardar vista actual'), onClick: saveCurrentView },
])
watch([statusF, gradeF, sourceF], applyFilters, { deep: true })
let _t = null
function onSearch(v) {
  search.value = v
  clearTimeout(_t)
  _t = setTimeout(applyFilters, 300)
}
function sortBy(field) {
  const dir = sort.value.field === field && sort.value.dir === 'desc' ? 'asc' : 'desc'
  sort.value = { field, dir }
  applyFilters()
}
function sortArrow(field) {
  if (sort.value.field !== field) return ''
  return sort.value.dir === 'desc' ? ' ↓' : ' ↑'
}
onMounted(applyFilters)

// ── filter options ───────────────────────────────────────────────────────────
const leadStatuses = createListResource({
  doctype: 'CRM Lead Status',
  fields: ['name', 'color'],
  orderBy: 'position asc',
  pageLength: 50,
  auto: true,
})
const stageOptions = computed(() =>
  (leadStatuses.data || []).map((s) => ({ value: s.name, label: s.name, color: s.color })),
)
const scoreOptions = [
  { value: 'A', label: 'A · 80+', color: GRADE_COLORS.A[0] },
  { value: 'B', label: 'B · 60+', color: GRADE_COLORS.B[0] },
  { value: 'C', label: 'C · 40+', color: GRADE_COLORS.C[0] },
  { value: 'D', label: 'D · <40', color: GRADE_COLORS.D[0] },
]
const sources = createListResource({
  doctype: 'CRM Lead Source',
  fields: ['name'],
  pageLength: 50,
  auto: true,
})
const sourceOptions = computed(() => (sources.data || []).map((s) => ({ value: s.name, label: s.name })))

// ── chips ────────────────────────────────────────────────────────────────────
const chips = computed(() => {
  const out = []
  for (const v of statusF.value) out.push({ key: `st:${v}`, type: 'status', value: v, label: v })
  for (const v of gradeF.value) out.push({ key: `gr:${v}`, type: 'grade', value: v, label: `Score ${v}` })
  for (const v of sourceF.value) out.push({ key: `sr:${v}`, type: 'source', value: v, label: v })
  return out
})
function removeChip(c) {
  const ref_ = { status: statusF, grade: gradeF, source: sourceF }[c.type]
  ref_.value = ref_.value.filter((x) => x !== c.value)
}
function clearAll() {
  statusF.value = []
  gradeF.value = []
  sourceF.value = []
}

// ── view helpers ─────────────────────────────────────────────────────────────
const views = [
  { key: 'list', label: '≡ List' },
  { key: 'board', label: '⊞ Board' },
  { key: 'funnel', label: '∿ Funnel' },
  { key: 'cal', label: '📅 Cal', to: '/calendar' },
]
function label(r) {
  return r.lead_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.mobile_no || r.name
}
function gradeColor(g) {
  return GRADE_COLORS[g]?.[0] || '#9aa2ae'
}
function statusChip(status) {
  const c = getLeadStatus(status)?.color || '#5b6472'
  return `color:${c};background:${c}1a`
}
function sourceDot(source) {
  const key = String(source || '').toLowerCase()
  for (const k of Object.keys(CHANNEL_META)) if (key.includes(k) || key.includes(CHANNEL_META[k][0].toLowerCase())) return CHANNEL_META[k][1]
  return '#9aa2ae'
}
function ownerName(email) {
  return getUser(email)?.full_name || email
}

// ── selection + rows ─────────────────────────────────────────────────────────
const allSelected = computed(() => rows.value.length > 0 && selectedRows.value.length === rows.value.length)
function toggleAll() {
  selectedRows.value = allSelected.value ? [] : rows.value.map((r) => r.name)
}
function toggleRow(name) {
  selectedRows.value = selectedRows.value.includes(name)
    ? selectedRows.value.filter((n) => n !== name)
    : [...selectedRows.value, name]
}
function openLead(name) {
  router.push(`/leads/${name}`)
}
function rowMenu(r) {
  return [
    { label: __('Abrir'), onClick: () => openLead(r.name) },
    { label: __('Convertir a trato'), onClick: () => convertLead(r.name) },
    { label: __('Eliminar'), onClick: () => deleteLead(r.name) },
  ]
}
async function convertLead(name) {
  // upstream convert: lead → deal, then open it in the inbox
  const deal = await frappeCall('crm.fcrm.doctype.crm_lead.crm_lead.convert_to_deal', { lead: name })
  toast.success(__('Convertido a trato'))
  leads.reload()
  if (deal) router.push({ path: '/inbox', query: { deal } })
}
function deleteLead(name) {
  confirmDialog({
    title: __('Eliminar lead'),
    message: __('¿Eliminar este lead?'),
    confirmLabel: __('Eliminar'),
    onConfirm: async () => {
      await frappeCall('frappe.client.delete', { doctype: 'CRM Lead', name })
      toast.success(__('Lead eliminado'))
      leads.reload()
    },
  })
}
function bulkDelete() {
  confirmDialog({
    title: __('Eliminar leads'),
    message: __('¿Eliminar {0} leads?', [selectedRows.value.length]),
    confirmLabel: __('Eliminar'),
    onConfirm: async () => {
      const results = await Promise.allSettled(
        selectedRows.value.map((name) => frappeCall('frappe.client.delete', { doctype: 'CRM Lead', name })),
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      failed ? toast.error(__('{0} fallaron', [failed])) : toast.success(__('Leads eliminados'))
      selectedRows.value = []
      leads.reload()
    },
  })
}
function bulkConvert() {
  confirmDialog({
    title: __('Convertir a tratos'),
    message: __('¿Convertir {0} leads a tratos?', [selectedRows.value.length]),
    confirmLabel: __('Convertir'),
    theme: 'blue',
    onConfirm: async () => {
      const results = await Promise.allSettled(
        selectedRows.value.map((name) => frappeCall('crm.fcrm.doctype.crm_lead.crm_lead.convert_to_deal', { lead: name })),
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      failed ? toast.error(__('{0} fallaron', [failed])) : toast.success(__('Convertidos a tratos'))
      selectedRows.value = []
      leads.reload()
    },
  })
}
</script>
