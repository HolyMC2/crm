<!--
  Deals list — doco redesign, mirror of LeadsView for CRM Deal. Dense table +
  Status/Source/Owner filters + live search + List/Board/Funnel (inline, 1-click)
  + bulk select + New Deal modal. "Vista clásica" jumps to the upstream
  /deals/view (full filters on every field / group-by). New page; upstream
  Deals.vue untouched for rebase-cleanliness. Data via createListResource.
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-base">
    <!-- toolbar -->
    <div class="flex min-h-[52px] flex-none flex-wrap items-center justify-between gap-y-1.5 border-b border-outline-gray-1 px-5 py-1.5">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Tratos') }}</span>
        <span class="rounded-full px-[9px] py-0.5 text-[11.5px] font-semibold text-ink-gray-6" style="background: #f1f2f4">
          {{ count }}
        </span>
        <div class="mx-1 h-[18px] w-px" style="background: #e4e7ec" />
        <div class="flex overflow-hidden rounded-lg border border-outline-gray-2">
          <button
            v-for="(v, i) in views"
            :key="v.key"
            class="inline-flex items-center gap-1 px-[11px] py-[5px] text-[12px]"
            :class="i ? 'border-l border-outline-gray-2' : ''"
            :style="v.key === view ? 'background:#1c2230;color:#fff;font-weight:600' : 'background:#fff;color:#5b6472'"
            :aria-pressed="v.key === view"
            @click="selectView(v)"
          >
            {{ v.label }}
          </button>
        </div>
        <div class="mx-1 h-[18px] w-px" style="background: #e4e7ec" />
        <FilterPopover :label="__('Stage')" :options="stageOptions" :selected="statusF" @update:selected="statusF = $event" />
        <FilterPopover :label="__('Source')" :options="sourceOptions" :selected="sourceF" @update:selected="sourceF = $event" />
        <FilterPopover :label="__('Owner')" :options="ownerOptions" :selected="ownerF" @update:selected="ownerF = $event" />
      </div>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1.5 rounded-lg border border-outline-gray-2 px-2.5 py-1.5 focus-within:border-outline-gray-4 focus-within:ring-1 focus-within:ring-outline-gray-3">
          <LucideSearch class="h-3.5 w-3.5 text-ink-gray-4" />
          <input
            :value="search"
            :aria-label="__('Buscar tratos')"
            @input="onSearch($event.target.value)"
            :placeholder="__('Buscar tratos…')"
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
          :columns="availableColumns"
          :selected="visibleCols"
          @update:selected="setCols"
          @reset="resetCols"
        />
        <button
          class="rounded-lg border border-outline-gray-2 px-3 py-[7px] text-[12px] font-medium text-ink-gray-7"
          :title="__('Exportar a Excel')"
          @click="exportDeals"
        >
          ⭳ {{ __('Export') }}
        </button>
        <button
          class="rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold text-white"
          style="background: var(--brand)"
          @click="showDealModal = true"
        >
          + {{ __('New Deal') }}
        </button>
      </div>
    </div>

    <!-- active filter chips -->
    <div v-if="chips.length" class="flex flex-none flex-wrap items-center gap-2 border-b border-outline-gray-1 px-5 py-2">
      <span
        v-for="c in chips"
        :key="c.key"
        class="inline-flex items-center gap-1.5 rounded-[7px] border px-2 py-1 text-[11.5px] font-medium"
        style="color: var(--brand); background: var(--brand-soft); border-color: #c7ecd5"
      >
        {{ c.label }}
        <button class="text-[13px] leading-none" :aria-label="__('Quitar filtro') + ' ' + c.label" @click="removeChip(c)">×</button>
      </span>
      <button class="text-[11.5px] text-ink-gray-5" @click="clearAll">{{ __('Limpiar todo') }}</button>
    </div>

    <!-- bulk bar -->
    <div v-if="selectedRows.length" class="flex flex-none items-center gap-3 border-b border-outline-gray-1 bg-surface-gray-1 px-5 py-2">
      <span class="text-[12.5px] font-semibold text-ink-gray-8">{{ selectedRows.length }} {{ __('seleccionados') }}</span>
      <button class="rounded-md px-2.5 py-1 text-[12px] font-medium text-ink-red-8 hover:bg-surface-red-1" @click="bulkDelete">
        {{ __('Eliminar') }}
      </button>
      <button class="text-[12px] text-ink-gray-5" @click="selectedRows = []">{{ __('Deseleccionar') }}</button>
    </div>

    <!-- list view. Header + rows share ONE scroller so the wider column set (cliente,
         teléfono, equipo, RO…) side-scrolls with its header attached instead of
         squeezing every cell to nothing on a narrow laptop. -->
    <template v-if="view === 'list'">
    <div class="scb min-h-0 flex-1 overflow-auto">
      <div :style="isMobile ? '' : `min-width:${MIN_W}px`">
      <!-- table header -->
      <div
        class="sticky top-0 z-[5] grid items-center border-b border-outline-gray-1 bg-surface-gray-1 px-5 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-gray-4"
        :style="`grid-template-columns:${GRID};height:34px`"
      >
        <input v-if="!isMobile" type="checkbox" class="cb-token" :checked="allSelected" :aria-label="__('Seleccionar todo')" @change="toggleAll" />
        <button class="text-left uppercase" @click="sortBy('organization')">{{ __('Trato') }}{{ sortArrow('organization') }}</button>
        <div v-if="col('customer')">{{ __('Cliente') }}</div>
        <button v-if="col('phone')" class="text-left uppercase" @click="sortBy('mobile_no')">{{ __('Teléfono') }}{{ sortArrow('mobile_no') }}</button>
        <div v-if="col('device')">{{ __('Equipo') }}</div>
        <div v-if="col('repair_type')">{{ __('Reparación') }}</div>
        <div v-if="col('ro')">{{ __('RO') }}</div>
        <button v-if="col('value')" class="text-left uppercase" @click="sortBy('deal_value')">{{ __('Valor') }}{{ sortArrow('deal_value') }}</button>
        <div v-if="col('stage')">{{ __('Stage') }}</div>
        <div v-if="col('source')">{{ __('Source') }}</div>
        <button v-if="col('modified')" class="text-left uppercase" @click="sortBy('modified')">{{ __('Última act.') }}{{ sortArrow('modified') }}</button>
        <div v-if="col('owner')">{{ __('Owner') }}</div>
        <div />
      </div>

      <!-- rows -->
      <div v-if="deals.loading && !rows.length" class="py-10 text-center text-xs text-ink-gray-4">{{ __('Cargando…') }}</div>
      <div v-else-if="!rows.length" class="py-10 text-center text-xs text-ink-gray-4">{{ __('Sin tratos') }}</div>

      <div
        v-for="r in rows"
        :key="r.name"
        role="button"
        tabindex="0"
        class="grid cursor-pointer items-center border-b border-outline-gray-1 px-5 hover:bg-surface-gray-1"
        :style="`grid-template-columns:${GRID};min-height:50px`"
        @click="openDeal(r.name)"
        @keydown.enter="openDeal(r.name)"
      >
        <input v-if="!isMobile" type="checkbox" class="cb-token" :checked="selectedRows.includes(r.name)" :aria-label="__('Seleccionar') + ' ' + label(r)" @click.stop="toggleRow(r.name)" />
        <div class="flex items-center gap-2">
          <span
            class="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-semibold"
            :style="`background:${avatarColor(label(r))[0]};color:${avatarColor(label(r))[1]}`"
          >
            {{ initials(label(r)) }}
          </span>
          <div class="min-w-0">
            <div class="truncate text-[13px] font-semibold text-ink-gray-9">{{ label(r) }}</div>
            <!-- second line = the customer, so the identity is visible even with the
                 Cliente column hidden (and on phones, where only 2 columns fit) -->
            <div class="truncate text-[11px] text-ink-gray-4">{{ customerOf(r) || formatPhone(phoneOf(r)) }}</div>
          </div>
        </div>
        <div v-if="col('customer')" class="truncate text-[12.5px] text-ink-gray-8">{{ customerOf(r) || '—' }}</div>
        <div v-if="col('phone')" class="truncate text-[12px] text-ink-gray-6">{{ formatPhone(phoneOf(r)) }}</div>
        <div v-if="col('device')" class="truncate text-[12px] text-ink-gray-6" :title="deviceOf(r) || ''">{{ deviceOf(r) || '—' }}</div>
        <div v-if="col('repair_type')" class="truncate text-[12px] text-ink-gray-6" :title="repairTypeOf(r) || ''">
          {{ repairTypeOf(r) || '—' }}
        </div>
        <div v-if="col('ro')" class="min-w-0">
          <div v-if="extra(r).repair_order" class="flex items-center gap-1.5">
            <span class="truncate text-[11.5px] font-medium text-ink-gray-7">{{ extra(r).repair_order }}</span>
            <span
              v-if="extra(r).repair_status"
              class="flex-none rounded px-1.5 py-px text-[10.5px] font-semibold"
              :style="repairChip(extra(r).repair_status)"
            >
              {{ extra(r).repair_status }}
            </span>
            <span v-if="extra(r).repair_count > 1" class="flex-none text-[10px] text-ink-gray-4">+{{ extra(r).repair_count - 1 }}</span>
          </div>
          <span v-else class="text-[12px] text-ink-gray-4">—</span>
        </div>
        <div v-if="col('value')" class="text-[12.5px] font-semibold text-ink-gray-8">{{ formatMXN(r.deal_value) }}</div>
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
            v-if="r.deal_owner"
            class="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[10px] font-semibold"
            :style="`background:${avatarColor(r.deal_owner)[0]};color:${avatarColor(r.deal_owner)[1]}`"
            :title="r.deal_owner"
          >
            {{ initials(ownerName(r.deal_owner)) }}
          </span>
        </div>
        <Dropdown :options="rowMenu(r)" @click.stop>
          <button class="text-[14px] text-ink-gray-4" :aria-label="__('Más acciones')" @click.stop>···</button>
        </Dropdown>
      </div>

      <div v-if="deals.hasNextPage" class="py-3 text-center">
        <button class="rounded-lg border border-outline-gray-2 px-4 py-1.5 text-[12px] font-medium text-ink-gray-7" @click="deals.next()">
          {{ __('Cargar más') }}
        </button>
      </div>
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
      :format-value="formatMXN"
      @card-click="(r) => openDeal(r.name)"
      @change="onBoardChange"
    >
      <template #card="{ row }">
        <div class="min-w-0">
          <div class="truncate text-[12.5px] font-semibold text-ink-gray-9">{{ label(row) }}</div>
          <div class="mt-0.5 flex items-center justify-between gap-2">
            <span class="truncate text-[11px] text-ink-gray-4">{{ row.lead_name || row.mobile_no || '—' }}</span>
            <span class="flex-none text-[11px] font-semibold text-ink-gray-7">{{ formatMXN(row.deal_value) }}</span>
          </div>
        </div>
      </template>
    </BoardView>

    <!-- funnel view -->
    <FunnelView v-else-if="view === 'funnel'" :groups="stageOptions" :counts="groupCounts" />

    <DealModal v-if="showDealModal" v-model="showDealModal" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Dropdown, createListResource, call as frappeCall, toast } from 'frappe-ui'
import { confirmDialog, createDialog, inputDialog } from '@/utils/dialogs'
import LucideSearch from '~icons/lucide/search'
import { statusesStore } from '@/stores/statuses'
import { usersStore } from '@/stores/users'
import DealModal from '@/components/Modals/DealModal.vue'
import FilterPopover from '@/components/doco/leads/FilterPopover.vue'
import { userScopedKey } from '@/utils/storageKeys'
import ColumnPicker from '@/components/doco/ColumnPicker.vue'
import BoardView from '@/components/doco/BoardView.vue'
import FunnelView from '@/components/doco/FunnelView.vue'
import { isMobile } from '@/composables/breakpoint'
import { hasTaller } from '@/composables/inbox'
import { avatarColor, initials, timeAgo, formatPhone, CHANNEL_META } from '@/composables/crmFormat'
import { money } from '@/utils/numberFormat'

const router = useRouter()

// ── column config (per-browser show/hide) ─────────────────────────────────────
// trato (contact) is fixed (1fr); checkbox + row-menu are structural. The rest toggle.
// Marco 2026-08-13: the list was unusable — no customer name, no phone, nothing about
// the repair. Identity and repair data don't live on the deal row (identity is on the
// linked Contact, the repair is a taller Repair Order), so those columns are fed by one
// batched enrichment call per page (api.deals.get_deal_display).
const DEAL_COLUMNS = [
  { key: 'contact', label: __('Trato'), fixed: true },
  { key: 'customer', label: __('Cliente') },
  { key: 'phone', label: __('Teléfono') },
  { key: 'device', label: __('Equipo') },
  { key: 'repair_type', label: __('Reparación') },
  { key: 'ro', label: __('RO') },
  { key: 'value', label: __('Valor') },
  { key: 'stage', label: __('Stage') },
  { key: 'source', label: __('Source') },
  { key: 'modified', label: __('Última act.') },
  { key: 'owner', label: __('Owner') },
]
const COL_ORDER = ['customer', 'phone', 'device', 'repair_type', 'ro', 'value', 'stage', 'source', 'modified', 'owner']
const COL_WIDTH = {
  customer: '150px',
  phone: '130px',
  device: '140px',
  repair_type: '130px',
  ro: '150px',
  value: '110px',
  stage: '125px',
  source: '110px',
  modified: '100px',
  owner: '50px',
}
const DEFAULT_COLS = ['customer', 'phone', 'device', 'ro', 'stage', 'value', 'modified', 'owner']
// v2: the column set changed shape (cliente/teléfono/equipo/RO added) — a new key so
// everyone lands on the new defaults once instead of keeping a stale 5-column pref.
const COLS_KEY = userScopedKey('doco_deals_columns_v2')
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
// Repair columns only exist where taller does (mumu has no Repair Order) — never
// render three permanently-empty columns on a retail tenant.
const REPAIR_COLS = ['device', 'repair_type', 'ro']
const availableColumns = computed(() =>
  DEAL_COLUMNS.filter((c) => hasTaller.value || !REPAIR_COLS.includes(c.key)),
)
function col(key) {
  // phone: contact + stage only — full column set side-scrolled (07-25)
  if (isMobile.value) return key === 'contact' || key === 'stage'
  if (!hasTaller.value && REPAIR_COLS.includes(key)) return false
  return key === 'contact' || visibleCols.value.includes(key)
}
// Width the grid needs before it starts squeezing cells — drives the side-scroll.
const MIN_W = computed(() => {
  let w = 28 + 180 + 26 // checkbox + contact min + row menu
  for (const key of COL_ORDER) if (col(key)) w += parseInt(COL_WIDTH[key], 10)
  return w + 40 // px-5 gutters
})
const GRID = computed(() => {
  if (isMobile.value) return '1fr 112px 26px' // contact + stage + menu
  const parts = ['28px', 'minmax(180px,1fr)'] // checkbox + contact (always)
  for (const key of COL_ORDER) if (col(key)) parts.push(COL_WIDTH[key])
  parts.push('26px') // row menu
  return parts.join(' ')
})
const { getDealStatus } = statusesStore()
const { getUser, users: usersList } = usersStore()

const showDealModal = ref(false)
const statusF = ref([])
const sourceF = ref([])
const ownerF = ref([])
const search = ref('')
const sort = ref({ field: 'modified', dir: 'desc' })
const selectedRows = ref([])
const view = ref('list')
const groupCounts = ref({})

const deals = createListResource({
  doctype: 'CRM Deal',
  fields: [
    'name', 'organization', 'lead_name', 'mobile_no', 'email',
    'status', 'source', 'deal_owner', 'deal_value', 'currency', 'modified',
  ],
  orderBy: 'modified desc',
  pageLength: 50,
  onSuccess: () => loadDisplay(),
})
const rows = computed(() => deals.data || [])

// ── display enrichment (cliente / teléfono / equipo / RO) ─────────────────────
// Not on the deal row: identity lives on the linked Contact and the repair is a
// taller Repair Order. One batched call per loaded page fills them; the table
// renders immediately and fills in when it lands (never blocks the list).
const display = ref({})
async function loadDisplay() {
  const names = (deals.data || []).map((d) => d.name).filter((n) => !(n in display.value))
  if (!names.length) return
  try {
    const data = await frappeCall('doco_marketing.api.deals.get_deal_display', { names: JSON.stringify(names) })
    display.value = { ...display.value, ...(data || {}) }
  } catch (e) {
    /* enrichment is additive — a failure leaves the base columns intact */
  }
}
function extra(r) {
  return display.value[r.name] || {}
}
function customerOf(r) {
  return extra(r).customer_name || r.lead_name || ''
}
function phoneOf(r) {
  return extra(r).mobile_no || r.mobile_no || ''
}
function deviceOf(r) {
  return extra(r).device || ''
}
function repairTypeOf(r) {
  return extra(r).repair_type || ''
}
// Repair-order status hue: delivered/cancelled read as done, waiting states amber,
// in-shop states blue. Keeps the column scannable without a legend.
const REPAIR_CHIP = {
  Recibido: '#2563eb',
  'En Trabajo': '#2563eb',
  'Esperando Cliente': '#d97706',
  'Esperando Pieza': '#d97706',
  'Listo para Entregar': '#16a34a',
  Entregado: '#6b7280',
  Cancelado: '#dc2626',
}
function repairChip(status) {
  const c = REPAIR_CHIP[status] || '#5b6472'
  return `color:${c};background:${c}1a`
}
const count = computed(() => `${deals.data?.length ?? 0}${deals.hasNextPage ? '+' : ''}`)

const SEARCH_FIELDS = ['organization', 'lead_name', 'email', 'mobile_no']
function buildFilters() {
  const f = {}
  if (statusF.value.length) f.status = ['in', statusF.value]
  if (sourceF.value.length) f.source = ['in', sourceF.value]
  if (ownerF.value.length) f.deal_owner = ['in', ownerF.value]
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
  deals.filters = buildFilters()
  deals.orFilters = searchOrFilters()
  deals.orderBy = `${sort.value.field} ${sort.value.dir}`
  deals.reload()
  if (view.value !== 'list') loadCounts()
}

// accurate per-status counts (+ summed value) for board headers + funnel
async function loadCounts() {
  try {
    const data = await frappeCall('frappe.client.get_list', {
      doctype: 'CRM Deal',
      filters: buildFilters(),
      or_filters: searchOrFilters(),
      fields: ['status', 'count(name) as count', 'sum(deal_value) as value'],
      group_by: 'status',
      limit_page_length: 0,
    })
    const map = {}
    for (const r of data || []) map[r.status || ''] = { count: r.count, value: r.value }
    groupCounts.value = map
  } catch (e) {
    /* counts are best-effort */
  }
}

function selectView(v) {
  if (v.to) {
    router.push(v.to)
    return
  }
  view.value = v.key
  if (v.key === 'board' && deals.pageLength < 200) {
    deals.pageLength = 200
    deals.reload()
  }
  if (v.key !== 'list') loadCounts()
}

async function onBoardChange(row, status) {
  try {
    await frappeCall('frappe.client.set_value', {
      doctype: 'CRM Deal',
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

function exportDeals() {
  const fields = JSON.stringify([
    'name', 'organization', 'lead_name', 'status', 'source', 'deal_owner', 'deal_value', 'mobile_no', 'creation',
    // repair columns exist only where taller is installed — asking for them on a
    // retail tenant would fail the whole export
    ...(hasTaller.value ? ['repair_device', 'repair_type'] : []),
  ])
  const filters = JSON.stringify(buildFilters())
  const orFilters = JSON.stringify(searchOrFilters())
  const order_by = `${sort.value.field} ${sort.value.dir}`
  const url =
    `/api/method/frappe.desk.reportview.export_query?file_format_type=Excel&title=CRM Deal&doctype=CRM Deal` +
    `&fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(filters)}&or_filters=${encodeURIComponent(orFilters)}` +
    `&order_by=${encodeURIComponent(order_by)}&page_length=100000&start=0&view=Report&with_comment_count=0`
  window.location.href = url
}

// ── saved views (per-browser) + classic quick action ──────────────────────────
const VIEWS_KEY = userScopedKey('doco_deals_saved_views')
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
    placeholder: __('Ej. Tratos activos'),
    confirmLabel: __('Guardar'),
    theme: 'green',
    required: true,
    onConfirm: (label) => {
      savedViews.value = savedViews.value.filter((v) => v.label !== label)
      savedViews.value.push({
        label,
        status: [...statusF.value],
        source: [...sourceF.value],
        owner: [...ownerF.value],
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
  sourceF.value = [...(v.source || [])]
  ownerF.value = [...(v.owner || [])]
  search.value = v.search || ''
  if (v.sort) sort.value = { ...v.sort }
  applyFilters()
}
function deleteView(label) {
  savedViews.value = savedViews.value.filter((v) => v.label !== label)
  persistViews()
}
function removeViewPicker() {
  createDialog({
    title: __('Eliminar vista'),
    message: __('Elige la vista guardada que quieres borrar (solo de este navegador).'),
    actions: savedViews.value.map((v) => ({
      label: '🗑 ' + v.label,
      variant: 'subtle',
      theme: 'red',
      onClick: (close) => {
        deleteView(v.label)
        toast.success(__('Vista eliminada'))
        close()
      },
    })),
  })
}
const viewMenu = computed(() => [
  { label: '↗ ' + __('Vista clásica (todos los filtros)'), onClick: () => router.push('/deals/view') },
  { label: '—', onClick: () => {} },
  ...savedViews.value.map((v) => ({ label: v.label, onClick: () => applyView(v) })),
  ...(savedViews.value.length ? [{ label: '—', onClick: () => {} }] : []),
  { label: '＋ ' + __('Guardar vista actual'), onClick: saveCurrentView },
  ...(savedViews.value.length ? [{ label: '🗑 ' + __('Eliminar vista…'), onClick: removeViewPicker }] : []),
])

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
applyFilters()

// ── filter options ────────────────────────────────────────────────────────────
const dealStatuses = createListResource({
  doctype: 'CRM Deal Status',
  fields: ['name', 'color'],
  orderBy: 'position asc',
  pageLength: 50,
  auto: true,
})
const stageOptions = computed(() =>
  (dealStatuses.data || []).map((s) => ({ value: s.name, label: s.name, color: s.color })),
)
const sources = createListResource({
  doctype: 'CRM Lead Source',
  fields: ['name'],
  pageLength: 50,
  auto: true,
})
const sourceOptions = computed(() => (sources.data || []).map((s) => ({ value: s.name, label: s.name })))
const ownerOptions = computed(() =>
  (usersList.data?.crmUsers || [])
    .filter((u) => u.enabled)
    .map((u) => ({ value: u.name, label: u.full_name?.trim() || u.name })),
)

// ── chips ──────────────────────────────────────────────────────────────────────
const chips = computed(() => {
  const out = []
  for (const v of statusF.value) out.push({ key: `st:${v}`, type: 'status', value: v, label: v })
  for (const v of sourceF.value) out.push({ key: `sr:${v}`, type: 'source', value: v, label: v })
  for (const v of ownerF.value) out.push({ key: `ow:${v}`, type: 'owner', value: v, label: ownerName(v) })
  return out
})
function removeChip(c) {
  const ref_ = { status: statusF, source: sourceF, owner: ownerF }[c.type]
  ref_.value = ref_.value.filter((x) => x !== c.value)
}
function clearAll() {
  statusF.value = []
  sourceF.value = []
  ownerF.value = []
}
watch([statusF, sourceF, ownerF], applyFilters, { deep: true })

// ── view helpers ────────────────────────────────────────────────────────────────
const views = [
  { key: 'list', label: '≡ List' },
  { key: 'board', label: '⊞ Board' },
  { key: 'funnel', label: '∿ Funnel' },
  { key: 'cal', label: '📅 Cal', to: '/calendar' },
]
function label(r) {
  return r.organization || r.lead_name || r.name
}
function statusChip(status) {
  const c = getDealStatus(status)?.color || '#5b6472'
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
function formatMXN(v) {
  if (v == null || v === '') return '—'
  const n = Number(v) || 0
  if (!n) return '—'
  return money(n) // tenant currency (window.sysdefaults.currency), not hard-coded MX$
}

// ── selection + rows ─────────────────────────────────────────────────────────────
const allSelected = computed(() => rows.value.length > 0 && selectedRows.value.length === rows.value.length)
function toggleAll() {
  selectedRows.value = allSelected.value ? [] : rows.value.map((r) => r.name)
}
function toggleRow(name) {
  selectedRows.value = selectedRows.value.includes(name)
    ? selectedRows.value.filter((n) => n !== name)
    : [...selectedRows.value, name]
}
function openDeal(name) {
  router.push(`/deal/${name}`)
}
function rowMenu(r) {
  return [
    { label: __('Abrir'), onClick: () => openDeal(r.name) },
    { label: __('Vista clásica'), onClick: () => router.push(`/deals/${r.name}`) },
    { label: __('Eliminar'), onClick: () => deleteDeal(r.name) },
  ]
}
function deleteDeal(name) {
  confirmDialog({
    title: __('Eliminar trato'),
    message: __('¿Eliminar este trato?'),
    confirmLabel: __('Eliminar'),
    onConfirm: async () => {
      await frappeCall('frappe.client.delete', { doctype: 'CRM Deal', name })
      toast.success(__('Trato eliminado'))
      deals.reload()
    },
  })
}
function bulkDelete() {
  confirmDialog({
    title: __('Eliminar tratos'),
    message: __('¿Eliminar {0} tratos?', [selectedRows.value.length]),
    confirmLabel: __('Eliminar'),
    onConfirm: async () => {
      const results = await Promise.allSettled(
        selectedRows.value.map((name) => frappeCall('frappe.client.delete', { doctype: 'CRM Deal', name })),
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      failed ? toast.error(__('{0} fallaron', [failed])) : toast.success(__('Tratos eliminados'))
      selectedRows.value = []
      deals.reload()
    },
  })
}
</script>
